import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const did = "did:key:cli-smoke";
const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

const tmp = await mkdtemp(join(tmpdir(), "nmail-cli-"));
const keyFile = join(tmp, "agent.private.jwk");
const configFile = join(tmp, "config.json");
await writeFile(keyFile, JSON.stringify(privateKeyJwk), "utf8");

let verified = false;
const bossDid = "did:key:boss";
const bossAddress = "boss-agent@nervafs.xyz";
const bossAddressDid = "did:web:mail.nervafs.xyz:agents:boss-agent";
const inboundMessageId = "sha256:inbound";
const acceptedMessages = [];
const claimRequests = [];
let acked = false;
const inboundRaw = {
  id: inboundMessageId,
  version: "nmail/0.1",
  type: "task.request",
  from: bossDid,
  to: [did],
  thread: "nthread:cli-smoke",
  body: { goal: "Report CLI mailbox status", channel: "nerva-mail" },
  postage: { creditAmount: 0 },
  attachments: []
};
const inboundDelivery = {
  deliveryId: "delivery:cli-smoke",
  mailboxId: did,
  messageId: inboundMessageId,
  recipientDid: did,
  senderDid: bossDid,
  deliveryState: "available",
  cursor: "1",
  priorityScore: 100,
  postageCredits: 0,
  receivedAt: 1_800_000_000_000,
  message: {
    messageId: inboundMessageId,
    type: "task.request",
    senderDid: bossDid,
    recipientDids: [did],
    thread: "nthread:cli-smoke",
    bodyObjectKey: "messages/inbound.json",
    postageCredits: 0,
    rawJson: JSON.stringify(inboundRaw),
    createdAt: 1_800_000_000_000,
    raw: inboundRaw
  }
};
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (
    request.method === "GET" &&
    url.pathname === "/v0/ui/login/challenge/123-456" &&
    url.searchParams.get("did") === did
  ) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: "123-456", nonce: "nonce-smoke", did, agentId: `${did}#default` }));
    return;
  }

  const timestamp = request.headers["x-nerva-timestamp"];
  const signature = request.headers["x-nerva-signature"];
  const receivedDid = request.headers["x-nerva-did"];
  const keyId = request.headers["x-nerva-key-id"];

  const signed = await verifySignedRequest(request.method, url.pathname, bodyText, {
    receivedDid,
    keyId,
    timestamp,
    signature
  });
  if (!signed) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "bad_signature" }));
    return;
  }

  if (request.method === "POST" && request.url === "/v0/ui/login/cli-complete") {
    verified = true;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "signed" }));
    return;
  }

  const mailboxMessagesMatch = url.pathname.match(/^\/v0\/mailboxes\/(.+)\/messages$/);
  if (request.method === "GET" && mailboxMessagesMatch?.[1] && decodeURIComponent(mailboxMessagesMatch[1]) === did) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ cursor: "1", messages: [inboundDelivery] }));
    return;
  }

  const mailboxSyncMatch = url.pathname.match(/^\/v0\/mailboxes\/(.+)\/sync$/);
  if (request.method === "GET" && mailboxSyncMatch?.[1] && decodeURIComponent(mailboxSyncMatch[1]) === did) {
    const { message, ...delivery } = inboundDelivery;
    void message;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ cursor: "1", messages: [delivery] }));
    return;
  }

  if (request.method === "GET" && url.pathname === `/v0/messages/${encodeURIComponent(inboundMessageId)}`) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(inboundDelivery));
    return;
  }

  const mailboxClaimMatch = url.pathname.match(/^\/v0\/mailboxes\/(.+)\/claim$/);
  if (request.method === "POST" && mailboxClaimMatch?.[1] && decodeURIComponent(mailboxClaimMatch[1]) === did) {
    const body = JSON.parse(bodyText);
    const claimOk = body.messageId === inboundMessageId && body.agentId === did;
    if (claimOk) claimRequests.push(body);
    response.writeHead(claimOk ? 200 : 400, { "Content-Type": "application/json" });
    response.end(JSON.stringify(claimOk ? { status: "claimed", leaseUntil: "2027-01-15T08:05:00.000Z" } : { error: "bad_claim" }));
    return;
  }

  if (request.method === "POST" && url.pathname === `/v0/messages/${encodeURIComponent(inboundMessageId)}/ack`) {
    const body = JSON.parse(bodyText);
    acked = body.mailboxId === did && body.state === "acked";
    response.writeHead(acked ? 200 : 400, { "Content-Type": "application/json" });
    response.end(JSON.stringify(acked ? { status: "acked" } : { error: "bad_ack" }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v0/messages") {
    const body = JSON.parse(bodyText);
    acceptedMessages.push(body);
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      status: "accepted",
      messageId: `sha256:sent-${acceptedMessages.length}`,
      deliveries: body.to.map((mailboxId, index) => ({ mailboxId, cursor: String(index + 1) }))
    }));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "not_found", path: request.url }));
});

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const relay = `http://127.0.0.1:${address.port}`;
  const env = { NMAIL_CONFIG: configFile };
  const generateEnv = { NMAIL_CONFIG: join(tmp, "generate-config.json") };
  const generatedDir = join(tmp, "generated");

  const hostedGenerated = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "generate",
    "--name",
    "hosted",
    "--out-dir",
    generatedDir
  ], generateEnv);
  if (hostedGenerated.code !== 0) {
    console.error(hostedGenerated.stderr || hostedGenerated.stdout);
    process.exit(hostedGenerated.code ?? 1);
  }
  const hostedResult = JSON.parse(hostedGenerated.stdout);
  if (
    hostedResult.method !== "web" ||
    hostedResult.productionReady !== true ||
    hostedResult.hostedByRelay !== true ||
    !hostedResult.did.startsWith("did:web:mail.nervafs.xyz:agents:hosted-") ||
    !hostedResult.address.startsWith("hosted-") ||
    !hostedResult.address.endsWith("@nervafs.xyz") ||
    hostedResult.didDocumentFile !== null ||
    hostedResult.publish.required !== false ||
    !hostedResult.didDocumentUrl.startsWith("https://mail.nervafs.xyz/agents/hosted-")
  ) {
    console.error(hostedGenerated.stdout);
    process.exit(1);
  }

  const generated = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "generate",
    "--domain",
    "agents.example.com",
    "--name",
    "researcher",
    "--out-dir",
    generatedDir
  ], generateEnv);
  if (generated.code !== 0) {
    console.error(generated.stderr || generated.stdout);
    process.exit(generated.code ?? 1);
  }
  const generatedResult = JSON.parse(generated.stdout);
  if (
    generatedResult.method !== "web" ||
    generatedResult.productionReady !== true ||
    generatedResult.hostedByRelay !== false ||
    !generatedResult.did.startsWith("did:web:agents.example.com:agents:researcher-") ||
    !generatedResult.didDocumentUrl.startsWith("https://agents.example.com/agents/researcher-") ||
    !generatedResult.didDocumentUrl.endsWith("/did.json") ||
    generatedResult.publish.required !== true
  ) {
    console.error(generated.stdout);
    process.exit(1);
  }
  const generatedPrivateKey = JSON.parse(await readFile(generatedResult.keyFile, "utf8"));
  const generatedAgent = JSON.parse(await readFile(generatedResult.agentFile, "utf8"));
  const generatedDidDocument = JSON.parse(await readFile(generatedResult.didDocumentFile, "utf8"));
  if (
    !generatedPrivateKey.d ||
    generatedAgent.publicKeyJwk.d ||
    generatedDidDocument.id !== generatedResult.did ||
    generatedDidDocument.verificationMethod?.[0]?.id !== generatedResult.agentId
  ) {
    console.error(JSON.stringify({ generatedAgent, generatedDidDocument }, null, 2));
    process.exit(1);
  }
  const generatedStatus = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "status",
    "--did",
    generatedResult.did
  ], generateEnv);
  if (generatedStatus.code !== 0 || !JSON.parse(generatedStatus.stdout).configured) {
    console.error(generatedStatus.stderr || generatedStatus.stdout);
    process.exit(generatedStatus.code ?? 1);
  }

  const hostedAddressStatus = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "status",
    "--did",
    hostedResult.address
  ], generateEnv);
  if (hostedAddressStatus.code !== 0 || JSON.parse(hostedAddressStatus.stdout).did !== hostedResult.did) {
    console.error(hostedAddressStatus.stderr || hostedAddressStatus.stdout);
    process.exit(hostedAddressStatus.code || 1);
  }

  const resolvedAddress = await run(process.execPath, [
    "bin/nmail.mjs",
    "address",
    "resolve",
    bossAddress
  ], env);
  if (resolvedAddress.code !== 0 || JSON.parse(resolvedAddress.stdout).did !== bossAddressDid) {
    console.error(resolvedAddress.stderr || resolvedAddress.stdout);
    process.exit(resolvedAddress.code || 1);
  }

  const configured = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "use-key",
    "--did",
    did,
    "--key-file",
    keyFile
  ], env);
  if (configured.code !== 0) {
    console.error(configured.stderr || configured.stdout);
    process.exit(configured.code ?? 1);
  }
  const status = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "status",
    "--did",
    `${did}#default`
  ], env);
  if (status.code !== 0 || !JSON.parse(status.stdout).configured) {
    console.error(status.stderr || status.stdout);
    process.exit(status.code ?? 1);
  }

  const result = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "login",
    "--relay",
    relay,
    "--code",
    "123-456"
  ], env);

  if (result.code !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.code ?? 1);
  }
  if (!verified) {
    console.error("CLI request was not verified by the smoke relay");
    process.exit(1);
  }

  const sendResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "send",
    "--relay",
    relay,
    "--to",
    bossAddress,
    "--goal",
    "Hello from CLI"
  ], env);
  if (sendResult.code !== 0) {
    console.error(sendResult.stderr || sendResult.stdout);
    process.exit(sendResult.code ?? 1);
  }
  const sent = JSON.parse(sendResult.stdout);
  if (
    sent.status !== "accepted" ||
    acceptedMessages.at(-1)?.to?.[0] !== bossAddress ||
    acceptedMessages.at(-1)?.body?.goal !== "Hello from CLI"
  ) {
    console.error(sendResult.stdout);
    process.exit(1);
  }

  const inboxResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "inbox",
    "--relay",
    relay
  ], env);
  if (inboxResult.code !== 0) {
    console.error(inboxResult.stderr || inboxResult.stdout);
    process.exit(inboxResult.code ?? 1);
  }
  const inbox = JSON.parse(inboxResult.stdout);
  if (inbox.messages?.[0]?.message?.raw?.body?.goal !== "Report CLI mailbox status") {
    console.error(inboxResult.stdout);
    process.exit(1);
  }

  const nextResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "next",
    "--relay",
    relay
  ], env);
  if (nextResult.code !== 0) {
    console.error(nextResult.stderr || nextResult.stdout);
    process.exit(nextResult.code ?? 1);
  }
  const next = JSON.parse(nextResult.stdout);
  if (
    next.status !== "next" ||
    next.message?.messageId !== inboundMessageId ||
    next.message?.message?.raw?.body?.goal !== "Report CLI mailbox status" ||
    next.claim !== null ||
    claimRequests.length !== 0
  ) {
    console.error(nextResult.stdout);
    process.exit(1);
  }

  const claimNextResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "next",
    "--claim",
    "--relay",
    relay
  ], env);
  if (claimNextResult.code !== 0) {
    console.error(claimNextResult.stderr || claimNextResult.stdout);
    process.exit(claimNextResult.code ?? 1);
  }
  const claimNext = JSON.parse(claimNextResult.stdout);
  if (
    claimNext.status !== "claimed" ||
    claimNext.message?.messageId !== inboundMessageId ||
    claimNext.claim?.status !== "claimed" ||
    claimRequests.length !== 1
  ) {
    console.error(claimNextResult.stdout);
    process.exit(1);
  }

  const readResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "read",
    inboundMessageId,
    "--relay",
    relay
  ], env);
  if (readResult.code !== 0 || JSON.parse(readResult.stdout).message?.raw?.thread !== "nthread:cli-smoke") {
    console.error(readResult.stderr || readResult.stdout);
    process.exit(readResult.code || 1);
  }

  const claimCountBeforeExplicitClaim = claimRequests.length;
  const claimResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "claim",
    inboundMessageId,
    "--relay",
    relay
  ], env);
  if (claimResult.code !== 0 || claimRequests.length !== claimCountBeforeExplicitClaim + 1) {
    console.error(claimResult.stderr || claimResult.stdout);
    process.exit(claimResult.code || 1);
  }

  const replyResult = await run(process.execPath, [
    "bin/nmail.mjs",
    "mail",
    "reply",
    inboundMessageId,
    "--relay",
    relay,
    "--text",
    "CLI mailbox is working",
    "--ack"
  ], env);
  if (replyResult.code !== 0) {
    console.error(replyResult.stderr || replyResult.stdout);
    process.exit(replyResult.code ?? 1);
  }
  const reply = JSON.parse(replyResult.stdout);
  const repliedMessage = acceptedMessages.at(-1);
  if (
    reply.status !== "replied" ||
    repliedMessage?.type !== "task.response" ||
    repliedMessage?.to?.[0] !== bossDid ||
    repliedMessage?.body?.result !== "CLI mailbox is working" ||
    !acked
  ) {
    console.error(replyResult.stdout);
    process.exit(1);
  }
} finally {
  server.close();
  await rm(tmp, { recursive: true, force: true });
}

async function run(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code] = await once(child, "exit");
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
}

async function verifySignedRequest(method, path, bodyText, headers) {
  if (
    headers.receivedDid !== did ||
    headers.keyId !== `${did}#default` ||
    typeof headers.timestamp !== "string" ||
    typeof headers.signature !== "string"
  ) {
    return false;
  }
  const payload = `${method}\n${path}\n${await sha256Hex(bodyText)}\n${headers.timestamp}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(headers.signature),
    new TextEncoder().encode(payload)
  );
}

function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}
