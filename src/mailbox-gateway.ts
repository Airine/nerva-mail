import type { DeliveryRecord, Env, MailboxGateway } from "./types";

export class DurableObjectMailboxGateway implements MailboxGateway {
  constructor(private readonly env: Env) {}

  async enqueue(delivery: DeliveryRecord): Promise<{ cursor: string }> {
    return this.fetchMailbox(delivery.mailboxId, "/enqueue", "POST", delivery);
  }

  async sync(mailboxId: string, cursor: string): Promise<{ cursor: string; messages: DeliveryRecord[] }> {
    return this.fetchMailbox(mailboxId, `/sync?cursor=${encodeURIComponent(cursor)}`, "GET");
  }

  async claim(mailboxId: string, messageId: string, agentId: string, leaseSeconds: number, now: number): Promise<{ status: "claimed"; leaseUntil: string }> {
    return this.fetchMailbox(mailboxId, "/claim", "POST", { messageId, agentId, leaseSeconds, now });
  }

  async ack(mailboxId: string, messageId: string, state: "acked" | "rejected", now: number): Promise<{ status: "acked" | "rejected" }> {
    return this.fetchMailbox(mailboxId, "/ack", "POST", { messageId, state, now });
  }

  private async fetchMailbox<T>(mailboxId: string, path: string, method: string, body?: unknown): Promise<T> {
    const id = this.env.MAILBOX.idFromName(mailboxId);
    const stub = this.env.MAILBOX.get(id);
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await stub.fetch(`https://mailbox.internal${path}`, init);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "mailbox_error" })) as { error?: string };
      throw new Error(error.error ?? "mailbox_error");
    }
    return response.json() as Promise<T>;
  }
}
