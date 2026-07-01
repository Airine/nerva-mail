import type {
  AgentRecord,
  ChannelBindingInput,
  ChannelBindingRecord,
  ChannelIdentityRecord,
  ChannelThreadRecord,
  CreditAccount,
  DeliveryRecord,
  LoginChallengeRecord,
  MessageRecord,
  Repository,
  WebSessionRecord
} from "./types";

export class D1Repository implements Repository {
  constructor(private readonly db: D1Database) {}

  async upsertAgent(agent: AgentRecord): Promise<void> {
    const now = agent.updatedAt ?? Date.now();
    await this.db.prepare(`
      INSERT INTO agents (did, agent_id, mailbox_id, display_name, public_key_jwk, service_endpoint, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(did) DO UPDATE SET
        agent_id = excluded.agent_id,
        mailbox_id = excluded.mailbox_id,
        display_name = excluded.display_name,
        public_key_jwk = excluded.public_key_jwk,
        service_endpoint = excluded.service_endpoint,
        updated_at = excluded.updated_at
    `).bind(
      agent.did,
      agent.agentId,
      agent.mailboxId,
      agent.displayName ?? null,
      JSON.stringify(agent.publicKeyJwk),
      agent.serviceEndpoint ?? null,
      agent.createdAt ?? now,
      now
    ).run();
    await this.ensureCreditAccount(agent.did);
  }

  async getAgent(did: string): Promise<AgentRecord | null> {
    const row = await this.db.prepare("SELECT * FROM agents WHERE did = ?").bind(did).first<AgentRow>();
    return row ? agentFromRow(row) : null;
  }

  async getAgentByAgentId(agentId: string): Promise<AgentRecord | null> {
    const row = await this.db.prepare("SELECT * FROM agents WHERE agent_id = ?").bind(agentId).first<AgentRow>();
    return row ? agentFromRow(row) : null;
  }

  async listAgentsForDid(did: string): Promise<AgentRecord[]> {
    const result = await this.db.prepare("SELECT * FROM agents WHERE did = ? OR mailbox_id = ? ORDER BY updated_at DESC")
      .bind(did, did)
      .all<AgentRow>();
    return (result.results ?? []).map(agentFromRow);
  }

  async upsertChannelIdentity(identity: ChannelIdentityRecord): Promise<void> {
    const now = identity.updatedAt ?? Date.now();
    await this.db.prepare(`
      INSERT INTO channel_identity (synthetic_did, transport, external_id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(synthetic_did) DO UPDATE SET
        transport = excluded.transport,
        external_id = excluded.external_id,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).bind(
      identity.syntheticDid,
      identity.transport,
      identity.externalId,
      identity.displayName ?? null,
      identity.createdAt ?? now,
      now
    ).run();
  }

  async getChannelIdentityBySyntheticDid(syntheticDid: string): Promise<ChannelIdentityRecord | null> {
    const row = await this.db.prepare("SELECT * FROM channel_identity WHERE synthetic_did = ?")
      .bind(syntheticDid)
      .first<ChannelIdentityRow>();
    return row ? channelIdentityFromRow(row) : null;
  }

  async getChannelIdentityByExternalId(transport: ChannelIdentityRecord["transport"], externalId: string): Promise<ChannelIdentityRecord | null> {
    const row = await this.db.prepare("SELECT * FROM channel_identity WHERE transport = ? AND external_id = ?")
      .bind(transport, externalId)
      .first<ChannelIdentityRow>();
    return row ? channelIdentityFromRow(row) : null;
  }

  async upsertChannelThread(thread: ChannelThreadRecord): Promise<void> {
    const now = thread.updatedAt ?? Date.now();
    await this.db.prepare(`
      INSERT INTO channel_thread (nmail_thread, transport, external_thread_id, agent_did, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(nmail_thread) DO UPDATE SET
        transport = excluded.transport,
        external_thread_id = excluded.external_thread_id,
        agent_did = excluded.agent_did,
        updated_at = excluded.updated_at
    `).bind(
      thread.nmailThread,
      thread.transport,
      thread.externalThreadId,
      thread.agentDid,
      thread.createdAt ?? now,
      now
    ).run();
  }

  async getChannelThreadByExternal(transport: ChannelThreadRecord["transport"], externalThreadId: string, agentDid: string): Promise<ChannelThreadRecord | null> {
    const row = await this.db.prepare("SELECT * FROM channel_thread WHERE transport = ? AND external_thread_id = ? AND agent_did = ?")
      .bind(transport, externalThreadId, agentDid)
      .first<ChannelThreadRow>();
    return row ? channelThreadFromRow(row) : null;
  }

  async getChannelThreadByNmailThread(nmailThread: string): Promise<ChannelThreadRecord | null> {
    const row = await this.db.prepare("SELECT * FROM channel_thread WHERE nmail_thread = ?")
      .bind(nmailThread)
      .first<ChannelThreadRow>();
    return row ? channelThreadFromRow(row) : null;
  }

  async createChannelBinding(input: ChannelBindingInput): Promise<ChannelBindingRecord> {
    const now = input.updatedAt ?? Date.now();
    const binding: ChannelBindingRecord = {
      id: crypto.randomUUID(),
      ownerDid: input.ownerDid,
      transport: input.transport,
      workspaceOrChat: input.workspaceOrChat,
      agentDid: input.agentDid,
      displayName: input.displayName,
      createdAt: input.createdAt ?? now,
      updatedAt: now
    };
    await this.db.prepare(`
      INSERT INTO channel_binding (id, owner_did, transport, workspace_or_chat, agent_did, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      binding.id,
      binding.ownerDid,
      binding.transport,
      binding.workspaceOrChat,
      binding.agentDid,
      binding.displayName ?? null,
      binding.createdAt,
      binding.updatedAt
    ).run();
    return binding;
  }

  async listChannelBindings(ownerDid: string): Promise<ChannelBindingRecord[]> {
    const result = await this.db.prepare("SELECT * FROM channel_binding WHERE owner_did = ? ORDER BY updated_at DESC")
      .bind(ownerDid)
      .all<ChannelBindingRow>();
    return (result.results ?? []).map(channelBindingFromRow);
  }

  async deleteChannelBinding(id: string, ownerDid: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM channel_binding WHERE id = ? AND owner_did = ?")
      .bind(id, ownerDid)
      .run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async createMessage(message: MessageRecord): Promise<void> {
    await this.db.prepare(`
      INSERT INTO messages (message_id, type, sender_did, recipient_dids, thread, body_object_key, postage_credits, raw_json, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      message.messageId,
      message.type,
      message.senderDid,
      JSON.stringify(message.recipientDids),
      message.thread ?? null,
      message.bodyObjectKey,
      message.postageCredits,
      message.rawJson,
      message.createdAt,
      message.expiresAt ?? null
    ).run();
  }

  async getMessage(messageId: string): Promise<MessageRecord | null> {
    const row = await this.db.prepare("SELECT * FROM messages WHERE message_id = ?").bind(messageId).first<MessageRow>();
    return row ? messageFromRow(row) : null;
  }

  async createDelivery(delivery: DeliveryRecord): Promise<void> {
    await this.upsertDelivery(delivery);
  }

  async getDelivery(mailboxId: string, messageId: string): Promise<DeliveryRecord | null> {
    const row = await this.db.prepare("SELECT * FROM deliveries WHERE mailbox_id = ? AND message_id = ?")
      .bind(mailboxId, messageId)
      .first<DeliveryRow>();
    return row ? deliveryFromRow(row) : null;
  }

  async updateDelivery(delivery: DeliveryRecord): Promise<void> {
    await this.upsertDelivery(delivery);
  }

  async recordBlobUpload(record: { ownerDid: string; cid: string; key: string; size?: number; mediaType?: string; createdAt: number }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO blob_uploads (id, owner_did, cid, object_key, size, media_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      record.ownerDid,
      record.cid,
      record.key,
      record.size ?? null,
      record.mediaType ?? null,
      record.createdAt
    ).run();
  }

  async getCreditAccount(did: string): Promise<CreditAccount> {
    await this.ensureCreditAccount(did);
    const row = await this.db.prepare("SELECT * FROM credit_accounts WHERE did = ?").bind(did).first<CreditRow>();
    if (!row) {
      return { did, balance: 0, held: 0, llmTokenQuota: 0 };
    }
    return creditFromRow(row);
  }

  async addCredits(did: string, amount: number, reason = "admin_topup"): Promise<CreditAccount> {
    await this.ensureCreditAccount(did);
    await this.db.prepare("UPDATE credit_accounts SET balance = balance + ?, updated_at = ? WHERE did = ?")
      .bind(amount, Date.now(), did)
      .run();
    await this.insertCreditEntry(did, amount, reason, "available");
    return this.getCreditAccount(did);
  }

  async holdPostage(senderDid: string, messageId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const account = await this.getCreditAccount(senderDid);
    if (account.balance < amount) {
      throw new Error("insufficient_credits");
    }
    await this.db.prepare("UPDATE credit_accounts SET balance = balance - ?, held = held + ?, updated_at = ? WHERE did = ?")
      .bind(amount, amount, Date.now(), senderDid)
      .run();
    await this.db.prepare(`
      INSERT INTO postage_holds (message_id, sender_did, amount, status, created_at, updated_at)
      VALUES (?, ?, ?, 'held', ?, ?)
    `).bind(messageId, senderDid, amount, Date.now(), Date.now()).run();
    await this.insertCreditEntry(senderDid, -amount, "postage_hold", "held", messageId);
  }

  async settlePostage(senderDid: string, recipientDid: string, messageId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const hold = await this.getHold(messageId, senderDid);
    if (!hold || hold.status !== "held") return;
    await this.db.prepare("UPDATE credit_accounts SET held = held - ?, updated_at = ? WHERE did = ?")
      .bind(amount, Date.now(), senderDid)
      .run();
    await this.db.prepare("UPDATE postage_holds SET status = 'settled', recipient_did = ?, updated_at = ? WHERE message_id = ? AND sender_did = ?")
      .bind(recipientDid, Date.now(), messageId, senderDid)
      .run();
    await this.addCredits(recipientDid, amount, "postage_settle");
  }

  async refundPostage(senderDid: string, messageId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const hold = await this.getHold(messageId, senderDid);
    if (!hold || hold.status !== "held") return;
    await this.db.prepare("UPDATE credit_accounts SET balance = balance + ?, held = held - ?, updated_at = ? WHERE did = ?")
      .bind(amount, amount, Date.now(), senderDid)
      .run();
    await this.db.prepare("UPDATE postage_holds SET status = 'refunded', updated_at = ? WHERE message_id = ? AND sender_did = ?")
      .bind(Date.now(), messageId, senderDid)
      .run();
    await this.insertCreditEntry(senderDid, amount, "postage_refund", "available", messageId);
  }

  async convertCreditsToLlmQuota(did: string, amount: number): Promise<CreditAccount> {
    const account = await this.getCreditAccount(did);
    if (account.balance < amount) {
      throw new Error("insufficient_credits");
    }
    await this.db.prepare("UPDATE credit_accounts SET balance = balance - ?, llm_token_quota = llm_token_quota + ?, updated_at = ? WHERE did = ?")
      .bind(amount, amount, Date.now(), did)
      .run();
    await this.insertCreditEntry(did, -amount, "llm_quota_conversion", "converted");
    return this.getCreditAccount(did);
  }

  async createLoginChallenge(challenge: LoginChallengeRecord): Promise<void> {
    await this.db.prepare(`
      INSERT INTO login_challenges (code, nonce, did, agent_id, created_at, expires_at, completed_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      challenge.code,
      challenge.nonce,
      challenge.did,
      challenge.agentId ?? null,
      challenge.createdAt,
      challenge.expiresAt,
      challenge.completedAt ?? null,
      challenge.consumedAt ?? null
    ).run();
  }

  async getLoginChallenge(code: string): Promise<LoginChallengeRecord | null> {
    const row = await this.db.prepare("SELECT * FROM login_challenges WHERE code = ?").bind(code).first<LoginChallengeRow>();
    return row ? loginChallengeFromRow(row) : null;
  }

  async markLoginChallengeCompleted(code: string, completedAt: number): Promise<void> {
    await this.db.prepare("UPDATE login_challenges SET completed_at = ? WHERE code = ?")
      .bind(completedAt, code)
      .run();
  }

  async consumeLoginChallenge(code: string, consumedAt: number): Promise<void> {
    await this.db.prepare("UPDATE login_challenges SET consumed_at = ? WHERE code = ?")
      .bind(consumedAt, code)
      .run();
  }

  async createWebSession(session: WebSessionRecord): Promise<void> {
    await this.db.prepare(`
      INSERT INTO web_sessions (session_id, token_hash, did, agent_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.sessionId,
      session.tokenHash,
      session.did,
      session.agentId ?? null,
      session.createdAt,
      session.expiresAt,
      session.revokedAt ?? null
    ).run();
  }

  async getWebSessionByTokenHash(tokenHash: string): Promise<WebSessionRecord | null> {
    const row = await this.db.prepare("SELECT * FROM web_sessions WHERE token_hash = ?").bind(tokenHash).first<WebSessionRow>();
    return row ? webSessionFromRow(row) : null;
  }

  async revokeWebSession(tokenHash: string, revokedAt: number): Promise<void> {
    await this.db.prepare("UPDATE web_sessions SET revoked_at = ? WHERE token_hash = ?")
      .bind(revokedAt, tokenHash)
      .run();
  }

  private async upsertDelivery(delivery: DeliveryRecord): Promise<void> {
    await this.db.prepare(`
      INSERT INTO deliveries (
        delivery_id, mailbox_id, message_id, recipient_did, sender_did, delivery_state, cursor,
        priority_score, postage_credits, claimed_by, lease_until, acked_at, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(delivery_id) DO UPDATE SET
        delivery_state = excluded.delivery_state,
        cursor = excluded.cursor,
        priority_score = excluded.priority_score,
        claimed_by = excluded.claimed_by,
        lease_until = excluded.lease_until,
        acked_at = excluded.acked_at
    `).bind(
      delivery.deliveryId,
      delivery.mailboxId,
      delivery.messageId,
      delivery.recipientDid,
      delivery.senderDid,
      delivery.deliveryState,
      delivery.cursor,
      delivery.priorityScore,
      delivery.postageCredits,
      delivery.claimedBy ?? null,
      delivery.leaseUntil ?? null,
      delivery.ackedAt ?? null,
      delivery.receivedAt
    ).run();
  }

  private async ensureCreditAccount(did: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO credit_accounts (did, balance, held, llm_token_quota, created_at, updated_at)
      VALUES (?, 0, 0, 0, ?, ?)
      ON CONFLICT(did) DO NOTHING
    `).bind(did, Date.now(), Date.now()).run();
  }

  private async insertCreditEntry(did: string, amount: number, reason: string, bucket: string, messageId?: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO credit_entries (id, did, amount, reason, bucket, message_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), did, amount, reason, bucket, messageId ?? null, Date.now()).run();
  }

  private async getHold(messageId: string, senderDid: string): Promise<{ status: string } | null> {
    return this.db.prepare("SELECT status FROM postage_holds WHERE message_id = ? AND sender_did = ?")
      .bind(messageId, senderDid)
      .first<{ status: string }>();
  }
}

interface AgentRow {
  did: string;
  agent_id: string;
  mailbox_id: string;
  display_name: string | null;
  public_key_jwk: string;
  service_endpoint: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  message_id: string;
  type: string;
  sender_did: string;
  recipient_dids: string;
  thread: string | null;
  body_object_key: string;
  postage_credits: number;
  raw_json: string;
  created_at: number;
  expires_at: number | null;
}

interface DeliveryRow {
  delivery_id: string;
  mailbox_id: string;
  message_id: string;
  recipient_did: string;
  sender_did: string;
  delivery_state: DeliveryRecord["deliveryState"];
  cursor: string;
  priority_score: number;
  postage_credits: number;
  claimed_by: string | null;
  lease_until: number | null;
  acked_at: number | null;
  received_at: number;
}

interface CreditRow {
  did: string;
  balance: number;
  held: number;
  llm_token_quota: number;
}

interface LoginChallengeRow {
  code: string;
  nonce: string;
  did: string;
  agent_id: string | null;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
  consumed_at: number | null;
}

interface WebSessionRow {
  session_id: string;
  token_hash: string;
  did: string;
  agent_id: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

interface ChannelIdentityRow {
  synthetic_did: string;
  transport: ChannelIdentityRecord["transport"];
  external_id: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
}

interface ChannelThreadRow {
  nmail_thread: string;
  transport: ChannelThreadRecord["transport"];
  external_thread_id: string;
  agent_did: string;
  created_at: number;
  updated_at: number;
}

interface ChannelBindingRow {
  id: string;
  owner_did: string;
  transport: ChannelBindingRecord["transport"];
  workspace_or_chat: string;
  agent_did: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
}

function agentFromRow(row: AgentRow): AgentRecord {
  return {
    did: row.did,
    agentId: row.agent_id,
    mailboxId: row.mailbox_id,
    displayName: row.display_name ?? undefined,
    publicKeyJwk: JSON.parse(row.public_key_jwk) as JsonWebKey,
    serviceEndpoint: row.service_endpoint ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function messageFromRow(row: MessageRow): MessageRecord {
  return {
    messageId: row.message_id,
    type: row.type,
    senderDid: row.sender_did,
    recipientDids: JSON.parse(row.recipient_dids) as string[],
    thread: row.thread ?? undefined,
    bodyObjectKey: row.body_object_key,
    postageCredits: row.postage_credits,
    rawJson: row.raw_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined
  };
}

function deliveryFromRow(row: DeliveryRow): DeliveryRecord {
  return {
    deliveryId: row.delivery_id,
    mailboxId: row.mailbox_id,
    messageId: row.message_id,
    recipientDid: row.recipient_did,
    senderDid: row.sender_did,
    deliveryState: row.delivery_state,
    cursor: row.cursor,
    priorityScore: row.priority_score,
    postageCredits: row.postage_credits,
    claimedBy: row.claimed_by ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    ackedAt: row.acked_at ?? undefined,
    receivedAt: row.received_at
  };
}

function creditFromRow(row: CreditRow): CreditAccount {
  return {
    did: row.did,
    balance: row.balance,
    held: row.held,
    llmTokenQuota: row.llm_token_quota
  };
}

function loginChallengeFromRow(row: LoginChallengeRow): LoginChallengeRecord {
  return {
    code: row.code,
    nonce: row.nonce,
    did: row.did,
    agentId: row.agent_id ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at ?? undefined,
    consumedAt: row.consumed_at ?? undefined
  };
}

function webSessionFromRow(row: WebSessionRow): WebSessionRecord {
  return {
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    did: row.did,
    agentId: row.agent_id ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined
  };
}

function channelIdentityFromRow(row: ChannelIdentityRow): ChannelIdentityRecord {
  return {
    syntheticDid: row.synthetic_did,
    transport: row.transport,
    externalId: row.external_id,
    displayName: row.display_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function channelThreadFromRow(row: ChannelThreadRow): ChannelThreadRecord {
  return {
    nmailThread: row.nmail_thread,
    transport: row.transport,
    externalThreadId: row.external_thread_id,
    agentDid: row.agent_did,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function channelBindingFromRow(row: ChannelBindingRow): ChannelBindingRecord {
  return {
    id: row.id,
    ownerDid: row.owner_did,
    transport: row.transport,
    workspaceOrChat: row.workspace_or_chat,
    agentDid: row.agent_did,
    displayName: row.display_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
