import { beforeEach, describe, expect, it } from "vitest";
import worker, { handleRequest } from "../src/index";
import type { AgentRecord, TestServices } from "../src/types";
import {
  createSignedRequest,
  createTestServices,
  generateDidKeyAgent
} from "./support/test-env";

describe("Nerva Mail Phase 1 hosted relay", () => {
  let services: TestServices;
  let sender: AgentRecord & { privateKey: CryptoKey };
  let recipient: AgentRecord & { privateKey: CryptoKey };

  beforeEach(async () => {
    services = createTestServices();
    sender = await generateDidKeyAgent("sender");
    recipient = await generateDidKeyAgent("recipient");
  });

  it("exposes public well-known metadata for mail.nervafs.xyz", async () => {
    const response = await handleRequest(
      new Request("https://mail.nervafs.xyz/.well-known/nmail"),
      services.env,
      services
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocol: "nmail/0.1",
      relay: "https://mail.nervafs.xyz",
      features: expect.arrayContaining(["e2ee-reserved", "blob-uploads-disabled", "cursor-sync", "credits"]),
      maxAttachmentSize: 0
    });
  });

  it("ignores the Cloudflare execution context in the default fetch export", async () => {
    const response = await worker.fetch(
      new Request("https://mail.nervafs.xyz/v0/health"),
      services.env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "nerva-mail"
    });
  });

  it("serves the Owner Console app shell", async () => {
    const response = await handleRequest(
      new Request("https://mail.nervafs.xyz/"),
      services.env,
      services
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("Nerva Mail 主控台");
    expect(html).toContain('<span id="activeDid">未登录</span>');
    expect(html).toContain("生成 Agent 登录 CODE");
    expect(html).toContain("把 CODE 告诉你的 Agent");
    expect(html).toContain("正在等待 Agent 签名");
    expect(html).toContain("立即检查");
    expect(html).toContain("发给你的 Agent");
    expect(html).toContain("Create Agent login code");
    expect(html).toContain("Tell your Agent the code.");
    expect(html).toContain("Waiting for Agent signature.");
    expect(html).toContain("npx --package github:Airine/nerva-mail#v0.1.0 nmail auth login");
    expect(html).not.toContain("--key-file");
    expect(html).not.toContain("nonce");
    expect(html).toContain("高级 Agent ID");
    expect(html).toContain("默认 DID#default");

    const headResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/", { method: "HEAD" }),
      services.env,
      services
    );

    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("Content-Type")).toContain("text/html");
    await expect(headResponse.text()).resolves.toBe("");
  });

  it("rejects signed endpoints when the signature is missing or invalid", async () => {
    const unsigned = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/agents/register", {
        method: "POST",
        body: JSON.stringify(sender)
      }),
      services.env,
      services
    );

    expect(unsigned.status).toBe(401);

    const signed = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/agents/register", {
      method: "POST",
      body: { agent: sender }
    });
    signed.headers.set("X-Nerva-Signature", "not-a-real-signature");

    const invalid = await handleRequest(signed, services.env, services);

    expect(invalid.status).toBe(401);
  });

  it("registers agents, sends a postage-backed task, syncs, claims, acks, and converts earned credits", async () => {
    await registerAgent(sender);
    await registerAgent(recipient);
    await adminTopup(sender.did, 100);

    const sendRequest = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/messages", {
      method: "POST",
      body: {
        type: "task.request",
        from: sender.did,
        to: [recipient.did],
        thread: "nthread:test",
        body: { goal: "Review this architecture proposal" },
        postage: { creditAmount: 25 },
        attachments: []
      }
    });
    const sendResponse = await handleRequest(sendRequest, services.env, services);
    expect(sendResponse.status).toBe(202);
    const sent = await sendResponse.json() as { messageId: string; deliveries: Array<{ mailboxId: string }> };
    expect(sent.messageId).toMatch(/^sha256:/);

    const senderCredits = await getCredits(sender);
    expect(senderCredits.balance).toBe(75);
    expect(senderCredits.held).toBe(25);

    const syncRequest = await createSignedRequest(
      recipient,
      `https://mail.nervafs.xyz/v0/mailboxes/${encodeURIComponent(recipient.did)}/sync?cursor=0`,
      { method: "GET" }
    );
    const syncResponse = await handleRequest(syncRequest, services.env, services);
    expect(syncResponse.status).toBe(200);
    const synced = await syncResponse.json() as { messages: Array<{ messageId: string; deliveryState: string }> };
    expect(synced.messages).toEqual([
      expect.objectContaining({ messageId: sent.messageId, deliveryState: "available" })
    ]);

    const claimRequest = await createSignedRequest(
      recipient,
      `https://mail.nervafs.xyz/v0/mailboxes/${encodeURIComponent(recipient.did)}/claim`,
      {
        method: "POST",
        body: { messageId: sent.messageId, agentId: recipient.did, leaseSeconds: 300 }
      }
    );
    const claimResponse = await handleRequest(claimRequest, services.env, services);
    expect(claimResponse.status).toBe(200);
    await expect(claimResponse.json()).resolves.toMatchObject({ status: "claimed" });

    const ackRequest = await createSignedRequest(
      recipient,
      `https://mail.nervafs.xyz/v0/messages/${sent.messageId}/ack`,
      {
        method: "POST",
        body: { mailboxId: recipient.did, state: "acked" }
      }
    );
    const ackResponse = await handleRequest(ackRequest, services.env, services);
    expect(ackResponse.status).toBe(200);
    await expect(ackResponse.json()).resolves.toMatchObject({ status: "acked" });

    const recipientCredits = await getCredits(recipient);
    expect(recipientCredits.balance).toBe(25);

    const convertRequest = await createSignedRequest(
      recipient,
      "https://mail.nervafs.xyz/v0/credits/convert-llm-quota",
      { method: "POST", body: { amount: 10 } }
    );
    const convertResponse = await handleRequest(convertRequest, services.env, services);
    expect(convertResponse.status).toBe(200);
    await expect(convertResponse.json()).resolves.toMatchObject({
      did: recipient.did,
      balance: 15,
      llmTokenQuota: 10
    });
  });

  it("completes CLI login and reads the owner mailbox through UI session APIs", async () => {
    await registerAgent(sender);
    await registerAgent(recipient);
    await adminTopup(sender.did, 100);

    const sendRequest = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/messages", {
      method: "POST",
      body: {
        type: "task.request",
        from: sender.did,
        to: [recipient.did],
        thread: "nthread:ui-login",
        body: { goal: "Summarize the relay deployment status" },
        postage: { creditAmount: 20 },
        attachments: []
      }
    });
    const sendResponse = await handleRequest(sendRequest, services.env, services);
    expect(sendResponse.status).toBe(202);
    const sent = await sendResponse.json() as { messageId: string };

    const cookie = await loginViaCli(recipient);

    const sessionResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/session", {
        headers: { Cookie: cookie }
      }),
      services.env,
      services
    );
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      did: recipient.did,
      agentId: recipient.agentId
    });

    const mailboxesResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/mailboxes", {
        headers: { Cookie: cookie }
      }),
      services.env,
      services
    );
    expect(mailboxesResponse.status).toBe(200);
    const mailboxes = await mailboxesResponse.json() as { mailboxes: Array<{ mailboxId: string; did: string }> };
    expect(mailboxes.mailboxes).toEqual([
      expect.objectContaining({ mailboxId: recipient.did, did: recipient.did })
    ]);

    const messagesResponse = await handleRequest(
      new Request(`https://mail.nervafs.xyz/v0/ui/mailboxes/${encodeURIComponent(recipient.did)}/messages?cursor=0`, {
        headers: { Cookie: cookie }
      }),
      services.env,
      services
    );
    expect(messagesResponse.status).toBe(200);
    const inbox = await messagesResponse.json() as {
      messages: Array<{ messageId: string; message: { type: string; raw: { body: { goal: string } } } }>;
    };
    expect(inbox.messages).toEqual([
      expect.objectContaining({
        messageId: sent.messageId,
        message: expect.objectContaining({
          type: "task.request",
          raw: expect.objectContaining({ body: { goal: "Summarize the relay deployment status" } })
        })
      })
    ]);

    const forbiddenResponse = await handleRequest(
      new Request(`https://mail.nervafs.xyz/v0/ui/mailboxes/${encodeURIComponent(sender.did)}/messages?cursor=0`, {
        headers: { Cookie: cookie }
      }),
      services.env,
      services
    );
    expect(forbiddenResponse.status).toBe(403);
  });

  it("returns a clear unsupported response for blob URL requests while attachments are disabled", async () => {
    await registerAgent(sender);

    const uploadRequest = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/blobs/upload-url", {
      method: "POST",
      body: {
        cid: "sha256:blob",
        mediaType: "text/plain",
        size: 12
      }
    });
    const uploadResponse = await handleRequest(uploadRequest, services.env, services);
    expect(uploadResponse.status).toBe(501);
    await expect(uploadResponse.json()).resolves.toEqual({ error: "blob_uploads_disabled" });

    const downloadRequest = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/blobs/download-url", {
      method: "POST",
      body: { key: "sha256/blob" }
    });
    const downloadResponse = await handleRequest(downloadRequest, services.env, services);
    expect(downloadResponse.status).toBe(501);
    await expect(downloadResponse.json()).resolves.toEqual({ error: "blob_uploads_disabled" });
  });

  async function registerAgent(agent: AgentRecord & { privateKey: CryptoKey }) {
    const request = await createSignedRequest(agent, "https://mail.nervafs.xyz/v0/agents/register", {
      method: "POST",
      body: { agent }
    });
    const response = await handleRequest(request, services.env, services);
    expect(response.status).toBe(201);
  }

  async function adminTopup(did: string, amount: number) {
    const response = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/credits/admin-topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${services.env.ADMIN_TOKEN}`
        },
        body: JSON.stringify({ did, amount, reason: "test topup" })
      }),
      services.env,
      services
    );
    expect(response.status).toBe(200);
  }

  async function getCredits(agent: AgentRecord & { privateKey: CryptoKey }) {
    const request = await createSignedRequest(agent, `https://mail.nervafs.xyz/v0/credits/${encodeURIComponent(agent.did)}`, {
      method: "GET"
    });
    const response = await handleRequest(request, services.env, services);
    expect(response.status).toBe(200);
    return response.json() as Promise<{ balance: number; held: number; llmTokenQuota: number }>;
  }

  async function loginViaCli(agent: AgentRecord & { privateKey: CryptoKey }): Promise<string> {
    const challengeResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/login/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did: agent.agentId })
      }),
      services.env,
      services
    );
    expect(challengeResponse.status).toBe(201);
    const challenge = await challengeResponse.json() as { code: string; nonce?: string; command?: string; did: string; agentId: string };
    expect(challenge.did).toBe(agent.did);
    expect(challenge.agentId).toBe(agent.agentId);
    expect(challenge.nonce).toBeUndefined();
    expect(challenge.command).toBeUndefined();

    const resolvedResponse = await handleRequest(
      new Request(`https://mail.nervafs.xyz/v0/ui/login/challenge/${encodeURIComponent(challenge.code)}?did=${encodeURIComponent(agent.agentId)}`),
      services.env,
      services
    );
    expect(resolvedResponse.status).toBe(200);
    const resolved = await resolvedResponse.json() as { nonce: string; did: string; agentId: string };
    expect(resolved.did).toBe(agent.did);
    expect(resolved.agentId).toBe(agent.agentId);

    const earlyCompleteResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/login/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: challenge.code })
      }),
      services.env,
      services
    );
    expect(earlyCompleteResponse.status).toBe(409);
    await expect(earlyCompleteResponse.json()).resolves.toMatchObject({ error: "challenge_not_signed" });

    const cliCompleteRequest = await createSignedRequest(agent, "https://mail.nervafs.xyz/v0/ui/login/cli-complete", {
      method: "POST",
      body: { code: challenge.code, nonce: resolved.nonce }
    });
    const cliCompleteResponse = await handleRequest(cliCompleteRequest, services.env, services);
    expect(cliCompleteResponse.status).toBe(200);

    const browserCompleteResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/login/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: challenge.code })
      }),
      services.env,
      services
    );
    expect(browserCompleteResponse.status).toBe(200);
    const cookie = browserCompleteResponse.headers.get("Set-Cookie");
    expect(cookie).toContain("nmail_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    return cookie?.split(";")[0] ?? "";
  }
});
