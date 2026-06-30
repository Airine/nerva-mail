import { AuthError, requireAdmin, requireSignedIdentity } from "./auth";
import { DisabledBlobGateway, R2BlobGateway } from "./blob";
import { DurableObjectMailboxGateway } from "./mailbox-gateway";
import { MailboxObject } from "./mailbox-object";
import { D1Repository } from "./repository";
import type { AgentRecord, DeliveryRecord, Env, MessageRecord, Services, WebSessionRecord } from "./types";
import { ownerConsoleHtml } from "./ui-app";
import { base64UrlEncode, messageIdFor, sha256Hex, stableJson } from "./utils/crypto";

export { MailboxObject };

const UI_SESSION_COOKIE = "ltmail_session";
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const UI_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export default {
  fetch(request: Request, env: Env, _ctx?: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  }
};

export async function handleRequest(request: Request, env: Env, overrides?: Services): Promise<Response> {
  const services = overrides ?? createServices(env);
  const url = new URL(request.url);
  const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();

  try {
    if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "/app")) {
      return html(request.method === "HEAD" ? null : ownerConsoleHtml(relayOrigin(env)));
    }

    if (request.method === "GET" && url.pathname === "/.well-known/ltmail") {
      const blobsEnabled = blobUploadsEnabled(env);
      return json({
        protocol: "ltmail/0.1",
        relay: relayOrigin(env),
        didMethods: ["did:web", "did:key"],
        features: [
          "signed-requests",
          "e2ee-reserved",
          ...(blobsEnabled ? ["s3-blobs"] : ["blob-uploads-disabled"]),
          "cursor-sync",
          "credits"
        ],
        maxMessageSize: 262144,
        maxAttachmentSize: blobsEnabled ? 1073741824 : 0
      });
    }

    if (request.method === "GET" && url.pathname === "/v0/health") {
      return json({ status: "ok", service: "lingtai-agent-mail", now: services.clock() });
    }

    if (url.pathname.startsWith("/v0/ui/")) {
      return await handleUiRoute(request, env, services, url, bodyText);
    }

    if (request.method === "POST" && url.pathname === "/v0/agents/register") {
      const body = parseJson<{ agent?: AgentRecord }>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock(), body.agent);
      const agentInput = body.agent;
      validateAgent(agentInput);
      if (auth.did !== agentInput.did) return json({ error: "did_mismatch" }, 403);
      const agent = sanitizeAgent(agentInput, services.clock());
      await services.repository.upsertAgent(agent);
      return json({ status: "registered", agent }, 201);
    }

    if (request.method === "GET" && url.pathname.startsWith("/v0/agents/")) {
      const id = decodeURIComponent(url.pathname.slice("/v0/agents/".length));
      const agent = await services.repository.getAgent(id) ?? await services.repository.getAgentByAgentId?.(id);
      return agent ? json(agent) : json({ error: "agent_not_found" }, 404);
    }

    if (request.method === "POST" && url.pathname === "/v0/messages") {
      const body = parseJson<Record<string, unknown>>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      return await sendMessage(body, auth.did, services);
    }

    const syncMatch = url.pathname.match(/^\/v0\/mailboxes\/(.+)\/sync$/);
    if (request.method === "GET" && syncMatch?.[1]) {
      const mailboxId = decodeURIComponent(syncMatch[1]);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (auth.did !== mailboxId) return json({ error: "mailbox_forbidden" }, 403);
      return json(await services.mailbox.sync(mailboxId, url.searchParams.get("cursor") ?? "0"));
    }

    const claimMatch = url.pathname.match(/^\/v0\/mailboxes\/(.+)\/claim$/);
    if (request.method === "POST" && claimMatch?.[1]) {
      const mailboxId = decodeURIComponent(claimMatch[1]);
      const body = parseJson<{ messageId: string; agentId: string; leaseSeconds?: number }>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (auth.did !== mailboxId || body.agentId !== auth.did) return json({ error: "mailbox_forbidden" }, 403);
      return json(await services.mailbox.claim(mailboxId, body.messageId, body.agentId, body.leaseSeconds ?? 300, services.clock()));
    }

    const ackMatch = url.pathname.match(/^\/v0\/messages\/(.+)\/ack$/);
    if (request.method === "POST" && ackMatch?.[1]) {
      const messageId = decodeURIComponent(ackMatch[1]);
      const body = parseJson<{ mailboxId: string; state?: "acked" | "rejected" }>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (auth.did !== body.mailboxId) return json({ error: "mailbox_forbidden" }, 403);
      const result = await services.mailbox.ack(body.mailboxId, messageId, body.state ?? "acked", services.clock());
      const delivery = await services.repository.getDelivery(body.mailboxId, messageId);
      const message = await services.repository.getMessage(messageId);
      if (delivery && message && message.postageCredits > 0) {
        if (result.status === "acked") {
          await services.repository.settlePostage(message.senderDid, delivery.recipientDid, messageId, message.postageCredits);
        } else {
          await services.repository.refundPostage(message.senderDid, messageId, message.postageCredits);
        }
      }
      return json(result);
    }

    if (request.method === "POST" && url.pathname === "/v0/blobs/upload-url") {
      const body = parseJson<{ cid: string; mediaType?: string; size?: number }>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (!blobUploadsEnabled(env)) return json({ error: "blob_uploads_disabled" }, 501);
      const result = await services.blob.createUploadUrl(body);
      const blobRecord: { ownerDid: string; cid: string; key: string; size?: number; mediaType?: string; createdAt: number } = {
        ownerDid: auth.did,
        cid: body.cid,
        key: result.key,
        createdAt: services.clock()
      };
      if (body.mediaType !== undefined) blobRecord.mediaType = body.mediaType;
      if (body.size !== undefined) blobRecord.size = body.size;
      await services.repository.recordBlobUpload?.(blobRecord);
      return json(result);
    }

    if (request.method === "POST" && url.pathname === "/v0/blobs/download-url") {
      const body = parseJson<{ key: string }>(bodyText);
      await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (!blobUploadsEnabled(env)) return json({ error: "blob_uploads_disabled" }, 501);
      return json(await services.blob.createDownloadUrl(body.key));
    }

    const creditsMatch = url.pathname.match(/^\/v0\/credits\/(.+)$/);
    if (request.method === "GET" && creditsMatch?.[1]) {
      const did = decodeURIComponent(creditsMatch[1]);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      if (auth.did !== did) return json({ error: "credits_forbidden" }, 403);
      return json(await services.repository.getCreditAccount(did));
    }

    if (request.method === "POST" && url.pathname === "/v0/credits/admin-topup") {
      requireAdmin(request, env);
      const body = parseJson<{ did: string; amount: number; reason?: string }>(bodyText);
      return json(await services.repository.addCredits(body.did, body.amount, body.reason ?? "admin_topup"));
    }

    if (request.method === "POST" && url.pathname === "/v0/credits/convert-llm-quota") {
      const body = parseJson<{ amount: number }>(bodyText);
      const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
      return json(await services.repository.convertCreditsToLlmQuota(auth.did, body.amount));
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleUiRoute(request: Request, env: Env, services: Services, url: URL, bodyText: string): Promise<Response> {
  if (request.method !== "GET") {
    requireSameOriginIfPresent(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v0/ui/login/challenge") {
    const body = parseJson<{ did?: string; agentId?: string }>(bodyText);
    const did = body.did?.trim();
    if (!did) throw new HttpError("did_required", 400);
    const now = services.clock();
    const challenge = {
      code: await uniqueLoginCode(services),
      nonce: randomToken(18),
      did,
      agentId: body.agentId?.trim() || undefined,
      createdAt: now,
      expiresAt: now + LOGIN_CHALLENGE_TTL_MS
    };
    await services.repository.createLoginChallenge(challenge);
    return json({
      code: challenge.code,
      nonce: challenge.nonce,
      did: challenge.did,
      agentId: challenge.agentId,
      relay: relayOrigin(env),
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      command: `ltmail auth login --relay ${relayOrigin(env)} --did ${challenge.did} --key-file ./agent.private.jwk --code ${challenge.code} --nonce ${challenge.nonce}`
    }, 201);
  }

  if (request.method === "POST" && url.pathname === "/v0/ui/login/cli-complete") {
    const body = parseJson<{ code?: string; nonce?: string }>(bodyText);
    const challenge = await getUsableChallenge(services, body.code, services.clock());
    if (!body.nonce || body.nonce !== challenge.nonce) throw new HttpError("challenge_nonce_mismatch", 400);
    const auth = await requireSignedIdentity(request, env, services.repository, bodyText, services.clock());
    if (auth.did !== challenge.did) throw new HttpError("challenge_did_mismatch", 403);
    await services.repository.markLoginChallengeCompleted(challenge.code, services.clock());
    return json({ status: "signed", did: auth.did, agentId: challenge.agentId });
  }

  if (request.method === "POST" && url.pathname === "/v0/ui/login/complete") {
    const body = parseJson<{ code?: string }>(bodyText);
    const challenge = await getUsableChallenge(services, body.code, services.clock());
    if (!challenge.completedAt) throw new HttpError("challenge_not_signed", 409);
    const agent = await services.repository.getAgent(challenge.did);
    const token = randomToken(32);
    const now = services.clock();
    const session: WebSessionRecord = {
      sessionId: crypto.randomUUID(),
      tokenHash: await sha256Hex(token),
      did: challenge.did,
      agentId: challenge.agentId ?? agent?.agentId,
      createdAt: now,
      expiresAt: now + UI_SESSION_TTL_MS
    };
    await services.repository.createWebSession(session);
    await services.repository.consumeLoginChallenge(challenge.code, now);
    const response = json(sessionBody(session));
    response.headers.set("Set-Cookie", sessionCookie(token, Math.floor(UI_SESSION_TTL_MS / 1000)));
    return response;
  }

  if (request.method === "POST" && url.pathname === "/v0/ui/logout") {
    const token = readSessionToken(request);
    if (token) {
      await services.repository.revokeWebSession(await sha256Hex(token), services.clock());
    }
    const response = json({ status: "logged_out" });
    response.headers.set("Set-Cookie", expiredSessionCookie());
    return response;
  }

  if (request.method === "GET" && url.pathname === "/v0/ui/session") {
    const session = await requireUiSession(request, services);
    return json(sessionBody(session));
  }

  if (request.method === "GET" && url.pathname === "/v0/ui/mailboxes") {
    const session = await requireUiSession(request, services);
    const agents = await services.repository.listAgentsForDid(session.did);
    const credits = await services.repository.getCreditAccount(session.did);
    return json({
      did: session.did,
      agentId: session.agentId,
      credits,
      mailboxes: agents.map((agent) => ({
        did: agent.did,
        agentId: agent.agentId,
        mailboxId: agent.mailboxId,
        displayName: agent.displayName
      }))
    });
  }

  const mailboxMessagesMatch = url.pathname.match(/^\/v0\/ui\/mailboxes\/(.+)\/messages$/);
  if (request.method === "GET" && mailboxMessagesMatch?.[1]) {
    const session = await requireUiSession(request, services);
    const mailboxId = decodeURIComponent(mailboxMessagesMatch[1]);
    requireMailboxOwner(session, mailboxId);
    const synced = await services.mailbox.sync(mailboxId, url.searchParams.get("cursor") ?? "0");
    const messages = await hydrateDeliveries(synced.messages, services);
    return json({ cursor: synced.cursor, messages });
  }

  const uiClaimMatch = url.pathname.match(/^\/v0\/ui\/mailboxes\/(.+)\/claim$/);
  if (request.method === "POST" && uiClaimMatch?.[1]) {
    const session = await requireUiSession(request, services);
    const mailboxId = decodeURIComponent(uiClaimMatch[1]);
    requireMailboxOwner(session, mailboxId);
    const body = parseJson<{ messageId?: string; leaseSeconds?: number }>(bodyText);
    if (!body.messageId) throw new HttpError("message_id_required", 400);
    return json(await services.mailbox.claim(mailboxId, body.messageId, session.agentId ?? session.did, body.leaseSeconds ?? 300, services.clock()));
  }

  const uiAckMatch = url.pathname.match(/^\/v0\/ui\/messages\/(.+)\/ack$/);
  if (request.method === "POST" && uiAckMatch?.[1]) {
    const session = await requireUiSession(request, services);
    const messageId = decodeURIComponent(uiAckMatch[1]);
    const body = parseJson<{ mailboxId?: string; state?: "acked" | "rejected" }>(bodyText);
    const mailboxId = body.mailboxId ?? session.did;
    requireMailboxOwner(session, mailboxId);
    const result = await services.mailbox.ack(mailboxId, messageId, body.state ?? "acked", services.clock());
    const delivery = await services.repository.getDelivery(mailboxId, messageId);
    const message = await services.repository.getMessage(messageId);
    if (delivery && message && message.postageCredits > 0) {
      if (result.status === "acked") {
        await services.repository.settlePostage(message.senderDid, delivery.recipientDid, messageId, message.postageCredits);
      } else {
        await services.repository.refundPostage(message.senderDid, messageId, message.postageCredits);
      }
    }
    return json(result);
  }

  if (request.method === "POST" && url.pathname === "/v0/ui/messages") {
    const session = await requireUiSession(request, services);
    const body = parseJson<Record<string, unknown>>(bodyText);
    if (typeof body.from === "string" && body.from !== session.did) throw new HttpError("sender_mismatch", 403);
    return sendMessage({ ...body, from: session.did, type: body.type ?? "task.request" }, session.did, services);
  }

  const uiMessageMatch = url.pathname.match(/^\/v0\/ui\/messages\/(.+)$/);
  if (request.method === "GET" && uiMessageMatch?.[1]) {
    const session = await requireUiSession(request, services);
    const mailboxId = url.searchParams.get("mailboxId") ?? session.did;
    requireMailboxOwner(session, mailboxId);
    const messageId = decodeURIComponent(uiMessageMatch[1]);
    const delivery = await services.repository.getDelivery(mailboxId, messageId);
    const message = await services.repository.getMessage(messageId);
    if (!delivery || !message) throw new HttpError("message_not_found", 404);
    return json(await hydrateDelivery(delivery, services));
  }

  return json({ error: "not_found" }, 404);
}

function createServices(env: Env): Services {
  return {
    repository: new D1Repository(env.DB),
    mailbox: new DurableObjectMailboxGateway(env),
    blob: blobUploadsEnabled(env) ? new R2BlobGateway(env) : new DisabledBlobGateway(),
    clock: () => Date.now()
  };
}

async function sendMessage(body: Record<string, unknown>, senderDid: string, services: Services): Promise<Response> {
  const type = stringField(body, "type");
  const from = stringField(body, "from");
  const to = arrayField(body, "to");
  if (from !== senderDid) return json({ error: "sender_mismatch" }, 403);

  const postageCredits = Number((body.postage as { creditAmount?: number } | undefined)?.creditAmount ?? 0);
  if (!Number.isFinite(postageCredits) || postageCredits < 0) {
    return json({ error: "invalid_postage" }, 400);
  }

  const createdAt = Date.parse(String(body.createdAt ?? "")) || services.clock();
  const messageId = await messageIdFor({ ...body, id: undefined });
  const rawJson = stableJson({ ...body, id: messageId, version: "ltmail/0.1" });
  const bodyObjectKey = `messages/${messageId.replace("sha256:", "")}.json`;
  const message: MessageRecord = {
    messageId,
    type,
    senderDid,
    recipientDids: to,
    thread: typeof body.thread === "string" ? body.thread : undefined,
    bodyObjectKey,
    postageCredits,
    rawJson,
    createdAt,
    expiresAt: typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : undefined
  };

  await services.repository.holdPostage(senderDid, messageId, postageCredits);
  await services.blob.putMessage(bodyObjectKey, rawJson);
  await services.repository.createMessage(message);

  const deliveries = [];
  for (const recipientDid of to) {
    const delivery: DeliveryRecord = {
      deliveryId: await messageIdFor({ messageId, recipientDid }),
      mailboxId: recipientDid,
      messageId,
      recipientDid,
      senderDid,
      deliveryState: "available",
      cursor: "0",
      priorityScore: priorityScore(postageCredits),
      postageCredits,
      receivedAt: services.clock()
    };
    await services.repository.createDelivery(delivery);
    const { cursor } = await services.mailbox.enqueue(delivery);
    deliveries.push({ mailboxId: recipientDid, cursor });
  }

  return json({ status: "accepted", messageId, deliveries }, 202);
}

async function uniqueLoginCode(services: Services): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomLoginCode();
    if (!await services.repository.getLoginChallenge(code)) return code;
  }
  throw new HttpError("login_code_generation_failed", 500);
}

function randomLoginCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const digits = [...bytes].map((byte) => String(byte % 10)).join("");
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function getUsableChallenge(services: Services, code: string | undefined, now: number) {
  if (!code) throw new HttpError("challenge_code_required", 400);
  const challenge = await services.repository.getLoginChallenge(code);
  if (!challenge) throw new HttpError("challenge_not_found", 404);
  if (challenge.expiresAt <= now) throw new HttpError("challenge_expired", 400);
  if (challenge.consumedAt) throw new HttpError("challenge_consumed", 400);
  return challenge;
}

async function requireUiSession(request: Request, services: Services): Promise<WebSessionRecord> {
  const token = readSessionToken(request);
  if (!token) throw new HttpError("session_required", 401);
  const session = await services.repository.getWebSessionByTokenHash(await sha256Hex(token));
  if (!session || session.revokedAt || session.expiresAt <= services.clock()) {
    throw new HttpError("session_invalid", 401);
  }
  return session;
}

function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === UI_SESSION_COOKIE) {
      return rest.join("=") || null;
    }
  }
  return null;
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${UI_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function expiredSessionCookie(): string {
  return `${UI_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function sessionBody(session: WebSessionRecord) {
  return {
    did: session.did,
    agentId: session.agentId,
    expiresAt: new Date(session.expiresAt).toISOString()
  };
}

function requireMailboxOwner(session: WebSessionRecord, mailboxId: string): void {
  if (session.did !== mailboxId) throw new HttpError("mailbox_forbidden", 403);
}

async function hydrateDeliveries(deliveries: DeliveryRecord[], services: Services) {
  const hydrated = [];
  for (const delivery of deliveries) {
    hydrated.push(await hydrateDelivery(delivery, services));
  }
  return hydrated;
}

async function hydrateDelivery(delivery: DeliveryRecord, services: Services) {
  const message = await services.repository.getMessage(delivery.messageId);
  return {
    ...delivery,
    message: message ? {
      ...message,
      raw: parseStoredJson(message.rawJson)
    } : null
  };
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function requireSameOriginIfPresent(request: Request, env: Env): void {
  const origin = request.headers.get("Origin");
  if (origin && origin !== relayOrigin(env)) {
    throw new HttpError("origin_forbidden", 403);
  }
}

function sanitizeAgent(agent: AgentRecord, now: number): AgentRecord {
  return {
    did: agent.did,
    agentId: agent.agentId,
    mailboxId: agent.mailboxId || agent.did,
    displayName: agent.displayName,
    publicKeyJwk: agent.publicKeyJwk,
    serviceEndpoint: agent.serviceEndpoint,
    createdAt: agent.createdAt ?? now,
    updatedAt: now
  };
}

function validateAgent(agent: AgentRecord | undefined): asserts agent is AgentRecord {
  if (!agent?.did || !agent.agentId || !agent.publicKeyJwk) {
    throw new HttpError("invalid_agent", 400);
  }
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(`invalid_${key}`, 400);
  }
  return value;
}

function arrayField(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new HttpError(`invalid_${key}`, 400);
  }
  return value as string[];
}

function parseJson<T>(bodyText: string): T {
  try {
    return (bodyText ? JSON.parse(bodyText) : {}) as T;
  } catch {
    throw new HttpError("invalid_json", 400);
  }
}

function priorityScore(postageCredits: number): number {
  return Math.round(100 + Math.log1p(postageCredits) * 10);
}

function relayOrigin(env: Env): string {
  return env.RELAY_ORIGIN ?? "https://mail.nervafs.xyz";
}

function blobUploadsEnabled(env: Env): boolean {
  return env.BLOB_PROVIDER === "r2" || Boolean(env.BLOBS);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function html(body: string | null): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof Error) {
    const explicitStatus = (error as { status?: unknown }).status;
    const status = typeof explicitStatus === "number"
      ? explicitStatus
      : error.message === "insufficient_credits" ? 402 : 400;
    return json({ error: error.message }, status);
  }
  return json({ error: "internal_error" }, 500);
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
