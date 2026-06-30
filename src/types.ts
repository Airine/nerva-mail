export interface Env {
  DB: D1Database;
  BLOBS?: R2Bucket;
  MAILBOX: DurableObjectNamespace;
  ADMIN_TOKEN?: string;
  BLOB_PROVIDER?: "disabled" | "r2" | string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  RELAY_ORIGIN?: string;
  ALLOW_DID_KEY_TEST_FIXTURES?: string;
}

export interface AgentRecord {
  did: string;
  agentId: string;
  mailboxId: string;
  displayName?: string | undefined;
  publicKeyJwk: JsonWebKey;
  serviceEndpoint?: string | undefined;
  createdAt?: number | undefined;
  updatedAt?: number | undefined;
}

export interface MessageRecord {
  messageId: string;
  type: string;
  senderDid: string;
  recipientDids: string[];
  thread?: string | undefined;
  bodyObjectKey: string;
  postageCredits: number;
  rawJson: string;
  createdAt: number;
  expiresAt?: number | undefined;
}

export type DeliveryState = "available" | "claimed" | "acked" | "rejected" | "expired";

export interface DeliveryRecord {
  deliveryId: string;
  mailboxId: string;
  messageId: string;
  recipientDid: string;
  senderDid: string;
  deliveryState: DeliveryState;
  cursor: string;
  priorityScore: number;
  postageCredits: number;
  claimedBy?: string | undefined;
  leaseUntil?: number | undefined;
  ackedAt?: number | undefined;
  receivedAt: number;
}

export interface CreditAccount {
  did: string;
  balance: number;
  held: number;
  llmTokenQuota: number;
}

export interface LoginChallengeRecord {
  code: string;
  nonce: string;
  did: string;
  agentId?: string | undefined;
  createdAt: number;
  expiresAt: number;
  completedAt?: number | undefined;
  consumedAt?: number | undefined;
}

export interface WebSessionRecord {
  sessionId: string;
  tokenHash: string;
  did: string;
  agentId?: string | undefined;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number | undefined;
}

export interface BlobUrlRequest {
  cid: string;
  mediaType?: string | undefined;
  size?: number | undefined;
  expiresIn?: number | undefined;
}

export interface BlobUrlResponse {
  method: "PUT" | "GET";
  key: string;
  url: string;
  expiresIn: number;
}

export interface Repository {
  upsertAgent(agent: AgentRecord): Promise<void>;
  getAgent(did: string): Promise<AgentRecord | null>;
  getAgentByAgentId?(agentId: string): Promise<AgentRecord | null>;
  createMessage(message: MessageRecord): Promise<void>;
  getMessage(messageId: string): Promise<MessageRecord | null>;
  createDelivery(delivery: DeliveryRecord): Promise<void>;
  getDelivery(mailboxId: string, messageId: string): Promise<DeliveryRecord | null>;
  updateDelivery(delivery: DeliveryRecord): Promise<void>;
  recordBlobUpload?(record: { ownerDid: string; cid: string; key: string; size?: number | undefined; mediaType?: string | undefined; createdAt: number }): Promise<void>;
  getCreditAccount(did: string): Promise<CreditAccount>;
  addCredits(did: string, amount: number, reason?: string): Promise<CreditAccount>;
  holdPostage(senderDid: string, messageId: string, amount: number): Promise<void>;
  settlePostage(senderDid: string, recipientDid: string, messageId: string, amount: number): Promise<void>;
  refundPostage(senderDid: string, messageId: string, amount: number): Promise<void>;
  convertCreditsToLlmQuota(did: string, amount: number): Promise<CreditAccount>;
  createLoginChallenge(challenge: LoginChallengeRecord): Promise<void>;
  getLoginChallenge(code: string): Promise<LoginChallengeRecord | null>;
  markLoginChallengeCompleted(code: string, completedAt: number): Promise<void>;
  consumeLoginChallenge(code: string, consumedAt: number): Promise<void>;
  createWebSession(session: WebSessionRecord): Promise<void>;
  getWebSessionByTokenHash(tokenHash: string): Promise<WebSessionRecord | null>;
  revokeWebSession(tokenHash: string, revokedAt: number): Promise<void>;
  listAgentsForDid(did: string): Promise<AgentRecord[]>;
}

export interface MailboxGateway {
  enqueue(delivery: DeliveryRecord): Promise<{ cursor: string }>;
  sync(mailboxId: string, cursor: string): Promise<{ cursor: string; messages: DeliveryRecord[] }>;
  claim(mailboxId: string, messageId: string, agentId: string, leaseSeconds: number, now: number): Promise<{ status: "claimed"; leaseUntil: string }>;
  ack(mailboxId: string, messageId: string, state: "acked" | "rejected", now: number): Promise<{ status: "acked" | "rejected" }>;
}

export interface BlobGateway {
  putMessage(key: string, body: string): Promise<void>;
  createUploadUrl(request: BlobUrlRequest): Promise<BlobUrlResponse>;
  createDownloadUrl(key: string): Promise<BlobUrlResponse>;
}

export interface Services {
  repository: Repository;
  mailbox: MailboxGateway;
  blob: BlobGateway;
  clock: () => number;
}

export interface TestServices extends Services {
  env: Env;
}

export interface SignedIdentity {
  did: string;
  keyId: string;
}
