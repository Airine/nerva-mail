import type {
  AgentRecord,
  BlobUrlRequest,
  BlobUrlResponse,
  CreditAccount,
  DeliveryRecord,
  Env,
  LoginChallengeRecord,
  MailboxGateway,
  MessageRecord,
  Repository,
  TestServices,
  WebSessionRecord
} from "../../src/types";
import { base64UrlEncode, signingPayloadWithTimestamp, stableJson } from "../../src/utils/crypto";

export function createTestServices(): TestServices {
  const repository = new MemoryRepository();
  const mailbox = new MemoryMailboxGateway(repository);
  const blob = new MemoryBlobGateway();
  const env: Env = {
    DB: undefined as unknown as D1Database,
    MAILBOX: undefined as unknown as DurableObjectNamespace,
    ADMIN_TOKEN: "test-admin-token",
    BLOB_PROVIDER: "disabled",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "lingtai-mail-blobs",
    RELAY_ORIGIN: "https://mail.nervafs.xyz",
    ALLOW_DID_KEY_TEST_FIXTURES: "true"
  };

  return { env, repository, mailbox, blob, clock: () => 1_800_000_000_000 };
}

export async function generateDidKeyAgent(name: string): Promise<AgentRecord & { privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const did = `did:key:${name}`;
  return {
    did,
    agentId: `${did}#default`,
    mailboxId: did,
    displayName: name,
    publicKeyJwk,
    privateKey: keyPair.privateKey,
    serviceEndpoint: "https://mail.nervafs.xyz"
  };
}

export async function createSignedRequest(
  agent: AgentRecord & { privateKey: CryptoKey },
  url: string,
  options: { method: string; body?: unknown }
): Promise<Request> {
  const bodyText = options.body === undefined ? "" : stableJson(options.body);
  const parsed = new URL(url);
  const payload = await signingPayloadWithTimestamp(options.method, parsed.pathname, bodyText, "1800000000000");
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    agent.privateKey,
    new TextEncoder().encode(payload)
  );
  const init: RequestInit = {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      "X-LT-DID": agent.did,
      "X-LT-Key-Id": `${agent.did}#default`,
      "X-LT-Timestamp": "1800000000000",
      "X-LT-Signature": base64UrlEncode(new Uint8Array(signature))
    }
  };
  if (bodyText) {
    init.body = bodyText;
  }
  return new Request(url, init);
}

class MemoryRepository implements Repository {
  agents = new Map<string, AgentRecord>();
  messages = new Map<string, MessageRecord>();
  deliveries = new Map<string, DeliveryRecord>();
  credits = new Map<string, CreditAccount>();
  challenges = new Map<string, LoginChallengeRecord>();
  sessions = new Map<string, WebSessionRecord>();

  async upsertAgent(agent: AgentRecord): Promise<void> {
    this.agents.set(agent.did, agent);
    if (!this.credits.has(agent.did)) {
      this.credits.set(agent.did, { did: agent.did, balance: 0, held: 0, llmTokenQuota: 0 });
    }
  }

  async getAgent(did: string): Promise<AgentRecord | null> {
    return this.agents.get(did) ?? null;
  }

  async listAgentsForDid(did: string): Promise<AgentRecord[]> {
    return [...this.agents.values()].filter((agent) => agent.did === did || agent.mailboxId === did);
  }

  async createMessage(message: MessageRecord): Promise<void> {
    this.messages.set(message.messageId, message);
  }

  async getMessage(messageId: string): Promise<MessageRecord | null> {
    return this.messages.get(messageId) ?? null;
  }

  async createDelivery(delivery: DeliveryRecord): Promise<void> {
    this.deliveries.set(`${delivery.mailboxId}:${delivery.messageId}`, delivery);
  }

  async getDelivery(mailboxId: string, messageId: string): Promise<DeliveryRecord | null> {
    return this.deliveries.get(`${mailboxId}:${messageId}`) ?? null;
  }

  async updateDelivery(delivery: DeliveryRecord): Promise<void> {
    this.deliveries.set(`${delivery.mailboxId}:${delivery.messageId}`, delivery);
  }

  async getCreditAccount(did: string): Promise<CreditAccount> {
    const account = this.credits.get(did) ?? { did, balance: 0, held: 0, llmTokenQuota: 0 };
    this.credits.set(did, account);
    return { ...account };
  }

  async addCredits(did: string, amount: number): Promise<CreditAccount> {
    const account = await this.getCreditAccount(did);
    account.balance += amount;
    this.credits.set(did, account);
    return { ...account };
  }

  async holdPostage(senderDid: string, messageId: string, amount: number): Promise<void> {
    const account = await this.getCreditAccount(senderDid);
    if (account.balance < amount) {
      throw new Error("insufficient_credits");
    }
    account.balance -= amount;
    account.held += amount;
    this.credits.set(senderDid, account);
  }

  async settlePostage(senderDid: string, recipientDid: string, messageId: string, amount: number): Promise<void> {
    const sender = await this.getCreditAccount(senderDid);
    sender.held -= amount;
    this.credits.set(senderDid, sender);
    await this.addCredits(recipientDid, amount);
  }

  async refundPostage(senderDid: string, messageId: string, amount: number): Promise<void> {
    const account = await this.getCreditAccount(senderDid);
    account.held -= amount;
    account.balance += amount;
    this.credits.set(senderDid, account);
  }

  async convertCreditsToLlmQuota(did: string, amount: number): Promise<CreditAccount> {
    const account = await this.getCreditAccount(did);
    if (account.balance < amount) {
      throw new Error("insufficient_credits");
    }
    account.balance -= amount;
    account.llmTokenQuota += amount;
    this.credits.set(did, account);
    return { ...account };
  }

  async createLoginChallenge(challenge: LoginChallengeRecord): Promise<void> {
    this.challenges.set(challenge.code, { ...challenge });
  }

  async getLoginChallenge(code: string): Promise<LoginChallengeRecord | null> {
    const challenge = this.challenges.get(code);
    return challenge ? { ...challenge } : null;
  }

  async markLoginChallengeCompleted(code: string, completedAt: number): Promise<void> {
    const challenge = this.challenges.get(code);
    if (challenge) {
      challenge.completedAt = completedAt;
      this.challenges.set(code, challenge);
    }
  }

  async consumeLoginChallenge(code: string, consumedAt: number): Promise<void> {
    const challenge = this.challenges.get(code);
    if (challenge) {
      challenge.consumedAt = consumedAt;
      this.challenges.set(code, challenge);
    }
  }

  async createWebSession(session: WebSessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
  }

  async getWebSessionByTokenHash(tokenHash: string): Promise<WebSessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    return session ? { ...session } : null;
  }

  async revokeWebSession(tokenHash: string, revokedAt: number): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) {
      session.revokedAt = revokedAt;
      this.sessions.set(tokenHash, session);
    }
  }
}

class MemoryMailboxGateway implements MailboxGateway {
  private queues = new Map<string, DeliveryRecord[]>();

  constructor(private readonly repository: Repository) {}

  async enqueue(delivery: DeliveryRecord): Promise<{ cursor: string }> {
    const queue = this.queues.get(delivery.mailboxId) ?? [];
    const cursor = String(queue.length + 1);
    queue.push({ ...delivery, cursor });
    this.queues.set(delivery.mailboxId, queue);
    await this.repository.updateDelivery({ ...delivery, cursor });
    return { cursor };
  }

  async sync(mailboxId: string, cursor: string): Promise<{ cursor: string; messages: DeliveryRecord[] }> {
    const queue = this.queues.get(mailboxId) ?? [];
    const start = Number(cursor || "0");
    const messages = queue.filter((delivery) => Number(delivery.cursor) > start);
    return { cursor: String(queue.length), messages };
  }

  async claim(mailboxId: string, messageId: string, agentId: string, leaseSeconds: number, now: number) {
    const queue = this.queues.get(mailboxId) ?? [];
    const delivery = queue.find((entry) => entry.messageId === messageId);
    if (!delivery || delivery.deliveryState !== "available") {
      throw new Error("delivery_not_available");
    }
    delivery.deliveryState = "claimed";
    delivery.claimedBy = agentId;
    delivery.leaseUntil = now + leaseSeconds * 1000;
    await this.repository.updateDelivery(delivery);
    return { status: "claimed" as const, leaseUntil: new Date(delivery.leaseUntil).toISOString() };
  }

  async ack(mailboxId: string, messageId: string, state: "acked" | "rejected", now: number) {
    const queue = this.queues.get(mailboxId) ?? [];
    const delivery = queue.find((entry) => entry.messageId === messageId);
    if (!delivery) {
      throw new Error("delivery_not_found");
    }
    delivery.deliveryState = state;
    delivery.ackedAt = now;
    await this.repository.updateDelivery(delivery);
    return { status: state };
  }
}

class MemoryBlobGateway {
  async putMessage(key: string, body: string): Promise<void> {
    void key;
    void body;
  }

  async createUploadUrl(request: BlobUrlRequest): Promise<BlobUrlResponse> {
    const key = `sha256/${request.cid.replace(/^sha256:/, "").replaceAll(":", "/")}`;
    return {
      method: "PUT",
      key,
      url: `https://test-account.r2.cloudflarestorage.com/lingtai-mail-blobs/${key}`,
      expiresIn: 3600
    };
  }

  async createDownloadUrl(key: string): Promise<BlobUrlResponse> {
    return {
      method: "GET",
      key,
      url: `https://test-account.r2.cloudflarestorage.com/lingtai-mail-blobs/${key}`,
      expiresIn: 3600
    };
  }
}
