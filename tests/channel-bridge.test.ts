import { describe, expect, it } from "vitest";
import { createSyntheticDid, isSyntheticDid, normalizeExternalId, parseSyntheticDid } from "../src/address";
import { handleEmail, handleRequest } from "../src/index";
import {
  createSignedRequest,
  createTestServices,
  generateDidKeyAgent,
  generateHostedDidWebAgent
} from "./support/test-env";
import type { AgentRecord, TestServices } from "../src/types";

describe("channel bridge", () => {
  it("creates and parses stable synthetic DIDs for external email identities", async () => {
    const did = await createSyntheticDid("email", " Alice@Example.COM ");

    expect(did).toMatch(/^did:web:mail\.nervafs\.xyz:ext:email:[A-Za-z0-9_-]+$/);
    expect(await createSyntheticDid("email", "alice@example.com")).toBe(did);
    expect(isSyntheticDid(did)).toBe(true);
    expect(parseSyntheticDid(did)).toEqual({
      did,
      transport: "email",
      hash: expect.any(String)
    });
    expect(normalizeExternalId("email", " Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("stores channel identities, threads, and owner-scoped bindings", async () => {
    const services = createTestServices();
    const now = services.clock();
    const syntheticDid = await createSyntheticDid("email", "alice@example.com");

    await services.repository.upsertChannelIdentity({
      syntheticDid,
      transport: "email",
      externalId: "alice@example.com",
      displayName: "Alice",
      createdAt: now,
      updatedAt: now
    });

    await expect(services.repository.getChannelIdentityBySyntheticDid(syntheticDid)).resolves.toMatchObject({
      syntheticDid,
      transport: "email",
      externalId: "alice@example.com",
      displayName: "Alice"
    });
    await expect(services.repository.getChannelIdentityByExternalId("email", "alice@example.com")).resolves.toMatchObject({
      syntheticDid
    });

    await services.repository.upsertChannelThread({
      nmailThread: "nthread:alice",
      transport: "email",
      externalThreadId: "<email-thread@example.com>",
      agentDid: "did:web:mail.nervafs.xyz:agents:agent-3ZMn2A",
      createdAt: now,
      updatedAt: now
    });

    await expect(services.repository.getChannelThreadByExternal("email", "<email-thread@example.com>", "did:web:mail.nervafs.xyz:agents:agent-3ZMn2A")).resolves.toMatchObject({
      nmailThread: "nthread:alice"
    });
    await expect(services.repository.getChannelThreadByNmailThread("nthread:alice")).resolves.toMatchObject({
      externalThreadId: "<email-thread@example.com>"
    });

    const binding = await services.repository.createChannelBinding({
      ownerDid: "did:web:mail.nervafs.xyz:agents:agent-3ZMn2A",
      transport: "email",
      workspaceOrChat: "agent-3ZMn2A@nervafs.xyz",
      agentDid: "did:web:mail.nervafs.xyz:agents:agent-3ZMn2A",
      createdAt: now,
      updatedAt: now
    });

    await expect(services.repository.listChannelBindings("did:web:mail.nervafs.xyz:agents:agent-3ZMn2A")).resolves.toEqual([
      expect.objectContaining({ id: binding.id, transport: "email", workspaceOrChat: "agent-3ZMn2A@nervafs.xyz" })
    ]);
    await expect(services.repository.listChannelBindings("did:web:mail.nervafs.xyz:agents:other")).resolves.toEqual([]);
    await expect(services.repository.deleteChannelBinding(binding.id, "did:web:mail.nervafs.xyz:agents:other")).resolves.toBe(false);
    await expect(services.repository.deleteChannelBinding(binding.id, "did:web:mail.nervafs.xyz:agents:agent-3ZMn2A")).resolves.toBe(true);
  });

  it("rejects synthetic senders unless an allowlisted gateway signs the request", async () => {
    const services = createTestServices();
    const sender = await generateDidKeyAgent("sender");
    const recipient = await generateDidKeyAgent("recipient");
    await services.repository.upsertAgent(sender);
    await services.repository.upsertAgent(recipient);
    const syntheticDid = await createSyntheticDid("email", "alice@example.com");

    const request = await createSignedRequest(sender, "https://mail.nervafs.xyz/v0/messages", {
      method: "POST",
      body: {
        type: "task.request",
        from: syntheticDid,
        to: [recipient.did],
        thread: "nthread:external-forbidden",
        channel: {
          version: "channel/0.1",
          direction: "inbound",
          transport: "email",
          externalFrom: { id: "alice@example.com", address: "alice@example.com", displayName: "Alice" },
          externalTo: { address: "agent-3ZMn2A@nervafs.xyz" },
          externalThreadId: "<thread@example.com>",
          externalMessageId: "<message@example.com>",
          gatewayDid: sender.did,
          gatewayKeyId: sender.agentId
        },
        body: { humanRequest: "Please triage this email." },
        postage: { creditAmount: 0 },
        attachments: []
      }
    });

    const response = await handleRequest(request, services.env, services);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "synthetic_sender_forbidden" });
  });

  it("accepts allowlisted gateway inbound email as a signed task.request with channel metadata", async () => {
    const services = createTestServices();
    const gateway = await generateDidKeyAgent("channel-gateway");
    const recipient = await generateDidKeyAgent("recipient");
    services.env.CHANNEL_GATEWAY_DIDS = gateway.did;
    await services.repository.upsertAgent(gateway);
    await services.repository.upsertAgent(recipient);
    const syntheticDid = await createSyntheticDid("email", "alice@example.com");

    const channel = {
      version: "channel/0.1",
      direction: "inbound",
      transport: "email",
      externalFrom: { id: "alice@example.com", address: "alice@example.com", displayName: "Alice" },
      externalTo: { address: "agent-3ZMn2A@nervafs.xyz" },
      externalThreadId: "<thread@example.com>",
      externalMessageId: "<message@example.com>",
      gatewayDid: gateway.did,
      gatewayKeyId: gateway.agentId
    };
    const request = await createSignedRequest(gateway, "https://mail.nervafs.xyz/v0/messages", {
      method: "POST",
      body: {
        type: "task.request",
        from: syntheticDid,
        to: [recipient.did],
        thread: "nthread:external-email",
        channel,
        body: { humanRequest: "Please triage this email." },
        postage: { creditAmount: 0 },
        attachments: []
      }
    });

    const response = await handleRequest(request, services.env, services);

    expect(response.status).toBe(202);
    const sent = await response.json() as { messageId: string; deliveries: Array<{ mailboxId: string }> };
    expect(sent.deliveries).toEqual([expect.objectContaining({ mailboxId: recipient.did })]);

    const inboxRequest = await createSignedRequest(
      recipient,
      `https://mail.nervafs.xyz/v0/mailboxes/${encodeURIComponent(recipient.did)}/messages?cursor=0`,
      { method: "GET" }
    );
    const inboxResponse = await handleRequest(inboxRequest, services.env, services);
    const inbox = await inboxResponse.json() as {
      messages: Array<{ senderDid: string; message: { raw: { channel: unknown; body: { humanRequest: string } } } }>;
    };
    expect(inbox.messages).toEqual([
      expect.objectContaining({
        senderDid: syntheticDid,
        message: expect.objectContaining({
          raw: expect.objectContaining({
            channel,
            body: { humanRequest: "Please triage this email." }
          })
        })
      })
    ]);
  });

  it("exposes owner-scoped UI channel endpoints", async () => {
    const services = createTestServices();
    const owner = await generateDidKeyAgent("owner");
    const other = await generateDidKeyAgent("other");
    await services.repository.upsertAgent(owner);
    await services.repository.upsertAgent(other);
    const cookie = await loginViaCli(owner, services);

    const resolveResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/channels/identities/resolve", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://mail.nervafs.xyz" },
        body: JSON.stringify({
          transport: "email",
          externalId: " Alice@Example.COM ",
          displayName: "Alice"
        })
      }),
      services.env,
      services
    );
    expect(resolveResponse.status).toBe(200);
    const resolved = await resolveResponse.json() as { identity: { syntheticDid: string; externalId: string } };
    expect(resolved.identity).toMatchObject({
      syntheticDid: expect.stringMatching(/^did:web:mail\.nervafs\.xyz:ext:email:/),
      externalId: "alice@example.com"
    });

    const createBindingResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/channels/bindings", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://mail.nervafs.xyz" },
        body: JSON.stringify({
          transport: "email",
          workspaceOrChat: "agent-3ZMn2A@nervafs.xyz",
          agentDid: owner.did,
          displayName: "Public email"
        })
      }),
      services.env,
      services
    );
    expect(createBindingResponse.status).toBe(201);
    const created = await createBindingResponse.json() as { binding: { id: string; ownerDid: string } };
    expect(created.binding).toMatchObject({ ownerDid: owner.did });

    const listResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/channels", {
        headers: { Cookie: cookie }
      }),
      services.env,
      services
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      ownerDid: owner.did,
      supportedTransports: ["email", "slack", "telegram", "feishu"],
      bindings: [expect.objectContaining({ id: created.binding.id, transport: "email" })],
      identities: []
    });

    const otherCookie = await loginViaCli(other, services);
    const forbiddenDelete = await handleRequest(
      new Request(`https://mail.nervafs.xyz/v0/ui/channels/bindings/${created.binding.id}`, {
        method: "DELETE",
        headers: { Cookie: otherCookie, Origin: "https://mail.nervafs.xyz" }
      }),
      services.env,
      services
    );
    expect(forbiddenDelete.status).toBe(404);

    const deleteResponse = await handleRequest(
      new Request(`https://mail.nervafs.xyz/v0/ui/channels/bindings/${created.binding.id}`, {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: "https://mail.nervafs.xyz" }
      }),
      services.env,
      services
    );
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ status: "deleted" });
  });

  it("routes messages to synthetic recipients through email egress instead of mailbox delivery", async () => {
    const services = createTestServices();
    const owner = await generateDidKeyAgent("owner");
    await services.repository.upsertAgent(owner);
    const cookie = await loginViaCli(owner, services);

    const syntheticDid = await createSyntheticDid("email", "alice@example.com");
    await services.repository.upsertChannelIdentity({
      syntheticDid,
      transport: "email",
      externalId: "alice@example.com",
      displayName: "Alice",
      createdAt: services.clock(),
      updatedAt: services.clock()
    });

    const sendResponse = await handleRequest(
      new Request("https://mail.nervafs.xyz/v0/ui/messages", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://mail.nervafs.xyz" },
        body: JSON.stringify({
          type: "task.request",
          to: [syntheticDid],
          thread: "nthread:reply-email",
          body: { goal: "Reply with the current task status" },
          postage: { creditAmount: 0 },
          attachments: []
        })
      }),
      services.env,
      services
    );

    expect(sendResponse.status).toBe(202);
    const sent = await sendResponse.json() as {
      messageId: string;
      deliveries: Array<{ mailboxId: string }>;
      egress: Array<{ recipientDid: string; transport: string; externalId: string; status: string }>;
    };
    expect(sent.deliveries).toEqual([]);
    expect(sent.egress).toEqual([
      {
        recipientDid: syntheticDid,
        transport: "email",
        externalId: "alice@example.com",
        status: "queued"
      }
    ]);
    await expect(services.repository.getDelivery(syntheticDid, sent.messageId)).resolves.toBeNull();
    expect(services.channelGateway.egress).toEqual([
      expect.objectContaining({
        messageId: sent.messageId,
        recipientDid: syntheticDid,
        identity: expect.objectContaining({ externalId: "alice@example.com" })
      })
    ]);
  });

  it("ingests Cloudflare routed email into the addressed agent mailbox", async () => {
    const services = createTestServices();
    const recipient = await generateHostedDidWebAgent("agent-3ZMn2A");
    const gatewayDid = "did:web:mail.nervafs.xyz:agents:channel-gateway";
    services.env.CHANNEL_GATEWAY_DIDS = gatewayDid;
    await services.repository.upsertAgent(recipient);

    const raw = [
      "From: Alice <alice@example.com>",
      "To: agent-3ZMn2A@nervafs.xyz",
      "Subject: Need status",
      "Message-ID: <message@example.com>",
      "",
      "Can you send the latest status?"
    ].join("\r\n");
    const rejected: string[] = [];
    const message = {
      from: "alice@example.com",
      to: "agent-3ZMn2A@nervafs.xyz",
      raw: new Response(raw).body,
      headers: new Headers({
        From: "Alice <alice@example.com>",
        To: "agent-3ZMn2A@nervafs.xyz",
        Subject: "Need status",
        "Message-ID": "<message@example.com>"
      }),
      rawSize: raw.length,
      setReject(reason: string) {
        rejected.push(reason);
      }
    } as unknown as ForwardableEmailMessage;

    await handleEmail(message, services.env, services);

    expect(rejected).toEqual([]);
    const inboxRequest = await createSignedRequest(
      recipient,
      `https://mail.nervafs.xyz/v0/mailboxes/${encodeURIComponent(recipient.did)}/messages?cursor=0`,
      { method: "GET" }
    );
    const inboxResponse = await handleRequest(inboxRequest, services.env, services);
    expect(inboxResponse.status).toBe(200);
    const inbox = await inboxResponse.json() as {
      messages: Array<{ senderDid: string; message: { raw: { channel: Record<string, unknown>; body: { humanRequest: string } } } }>;
    };
    const syntheticDid = await createSyntheticDid("email", "alice@example.com");
    expect(inbox.messages).toEqual([
      expect.objectContaining({
        senderDid: syntheticDid,
        message: expect.objectContaining({
          raw: expect.objectContaining({
            type: "task.request",
            body: expect.objectContaining({ humanRequest: "Can you send the latest status?" }),
            channel: expect.objectContaining({
              version: "channel/0.1",
              direction: "inbound",
              transport: "email",
              externalFrom: { id: "alice@example.com", address: "alice@example.com", displayName: "Alice" },
              externalTo: { address: "agent-3ZMn2A@nervafs.xyz" },
              externalThreadId: "<message@example.com>",
              externalMessageId: "<message@example.com>",
              gatewayDid
            })
          })
        })
      })
    ]);
  });
});

async function loginViaCli(agent: AgentRecord & { privateKey: CryptoKey }, services: TestServices): Promise<string> {
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
  const challenge = await challengeResponse.json() as { code: string; did: string; agentId: string };

  const resolvedResponse = await handleRequest(
    new Request(`https://mail.nervafs.xyz/v0/ui/login/challenge/${encodeURIComponent(challenge.code)}?did=${encodeURIComponent(agent.agentId)}`),
    services.env,
    services
  );
  expect(resolvedResponse.status).toBe(200);
  const resolved = await resolvedResponse.json() as { nonce: string };

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
  return cookie?.split(";")[0] ?? "";
}
