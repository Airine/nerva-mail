import type { DeliveryRecord, Env } from "./types";

export class MailboxObject {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        delivery_id TEXT PRIMARY KEY,
        mailbox_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        recipient_did TEXT NOT NULL,
        sender_did TEXT NOT NULL,
        delivery_state TEXT NOT NULL,
        cursor INTEGER NOT NULL,
        priority_score INTEGER NOT NULL,
        postage_credits INTEGER NOT NULL,
        claimed_by TEXT,
        lease_until INTEGER,
        acked_at INTEGER,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deliveries_cursor ON deliveries(cursor);
      CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/enqueue" && request.method === "POST") {
        return Response.json(await this.enqueue(await request.json() as DeliveryRecord));
      }
      if (url.pathname === "/sync" && request.method === "GET") {
        return Response.json(this.sync(url.searchParams.get("cursor") ?? "0"));
      }
      if (url.pathname === "/claim" && request.method === "POST") {
        const body = await request.json() as { messageId: string; agentId: string; leaseSeconds: number; now: number };
        return Response.json(await this.claim(body));
      }
      if (url.pathname === "/ack" && request.method === "POST") {
        const body = await request.json() as { messageId: string; state: "acked" | "rejected"; now: number };
        return Response.json(await this.ack(body));
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "mailbox_error" }, { status: 400 });
    }
  }

  private async enqueue(delivery: DeliveryRecord): Promise<{ cursor: string }> {
    const next = this.nextCursor();
    const cursor = String(next);
    this.state.storage.sql.exec(`
      INSERT OR IGNORE INTO deliveries (
        delivery_id, mailbox_id, message_id, recipient_did, sender_did, delivery_state, cursor,
        priority_score, postage_credits, claimed_by, lease_until, acked_at, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, delivery.deliveryId, delivery.mailboxId, delivery.messageId, delivery.recipientDid, delivery.senderDid,
      delivery.deliveryState, next, delivery.priorityScore, delivery.postageCredits, delivery.claimedBy ?? null,
      delivery.leaseUntil ?? null, delivery.ackedAt ?? null, delivery.receivedAt);
    await this.mirrorDelivery({ ...delivery, cursor });
    return { cursor };
  }

  private sync(cursor: string): { cursor: string; messages: DeliveryRecord[] } {
    const start = Number(cursor || "0");
    const rows = this.state.storage.sql.exec<DeliveryRow>(
      "SELECT * FROM deliveries WHERE cursor > ? ORDER BY cursor ASC",
      start
    ).toArray();
    const latest = this.nextCursor() - 1;
    return { cursor: String(latest), messages: rows.map(deliveryFromRow) };
  }

  private async claim(body: { messageId: string; agentId: string; leaseSeconds: number; now: number }): Promise<{ status: "claimed"; leaseUntil: string }> {
    const row = this.state.storage.sql.exec<DeliveryRow>(
      "SELECT * FROM deliveries WHERE message_id = ? LIMIT 1",
      body.messageId
    ).one();
    if (!row || (row.delivery_state !== "available" && !(row.delivery_state === "claimed" && Number(row.lease_until ?? 0) < body.now))) {
      throw new Error("delivery_not_available");
    }
    const leaseUntil = body.now + body.leaseSeconds * 1000;
    this.state.storage.sql.exec(
      "UPDATE deliveries SET delivery_state = 'claimed', claimed_by = ?, lease_until = ? WHERE delivery_id = ?",
      body.agentId,
      leaseUntil,
      row.delivery_id
    );
    await this.mirrorDelivery({ ...deliveryFromRow(row), deliveryState: "claimed", claimedBy: body.agentId, leaseUntil });
    return { status: "claimed", leaseUntil: new Date(leaseUntil).toISOString() };
  }

  private async ack(body: { messageId: string; state: "acked" | "rejected"; now: number }): Promise<{ status: "acked" | "rejected" }> {
    const row = this.state.storage.sql.exec<DeliveryRow>(
      "SELECT * FROM deliveries WHERE message_id = ? LIMIT 1",
      body.messageId
    ).one();
    if (!row) {
      throw new Error("delivery_not_found");
    }
    if (row.delivery_state === "acked" || row.delivery_state === "rejected") {
      return { status: body.state };
    }
    this.state.storage.sql.exec(
      "UPDATE deliveries SET delivery_state = ?, acked_at = ? WHERE delivery_id = ?",
      body.state,
      body.now,
      row.delivery_id
    );
    await this.mirrorDelivery({ ...deliveryFromRow(row), deliveryState: body.state, ackedAt: body.now });
    return { status: body.state };
  }

  private nextCursor(): number {
    const row = this.state.storage.sql.exec<{ value: number }>("SELECT COALESCE(MAX(cursor), 0) + 1 AS value FROM deliveries").one();
    return row?.value ?? 1;
  }

  private async mirrorDelivery(delivery: DeliveryRecord): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO deliveries (
        delivery_id, mailbox_id, message_id, recipient_did, sender_did, delivery_state, cursor,
        priority_score, postage_credits, claimed_by, lease_until, acked_at, received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(delivery_id) DO UPDATE SET
        delivery_state = excluded.delivery_state,
        cursor = excluded.cursor,
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
}

interface DeliveryRow {
  [key: string]: string | number | null;
  delivery_id: string;
  mailbox_id: string;
  message_id: string;
  recipient_did: string;
  sender_did: string;
  delivery_state: DeliveryRecord["deliveryState"];
  cursor: number;
  priority_score: number;
  postage_credits: number;
  claimed_by: string | null;
  lease_until: number | null;
  acked_at: number | null;
  received_at: number;
}

function deliveryFromRow(row: DeliveryRow): DeliveryRecord {
  return {
    deliveryId: row.delivery_id,
    mailboxId: row.mailbox_id,
    messageId: row.message_id,
    recipientDid: row.recipient_did,
    senderDid: row.sender_did,
    deliveryState: row.delivery_state,
    cursor: String(row.cursor),
    priorityScore: row.priority_score,
    postageCredits: row.postage_credits,
    claimedBy: row.claimed_by ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    ackedAt: row.acked_at ?? undefined,
    receivedAt: row.received_at
  };
}
