#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

try {
  if (command === "setup") {
    await setup();
  } else if (command === "agent-a") {
    await runAgentA();
  } else if (command === "agent-b") {
    await runAgentB();
  } else if (command === "verify") {
    await verifyRun();
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}

async function setup() {
  const relay = required(args.relay, "--relay").replace(/\/+$/, "");
  const runId = args["run-id"] || `two-codex-${Date.now().toString(36)}`;
  const runDir = args["run-dir"] || `/tmp/ltmail-${runId}`;
  const initialCredits = Number(args.credits ?? 50);
  const postageA = Number(args["postage-a"] ?? 3);
  const postageB = Number(args["postage-b"] ?? 4);
  await mkdir(runDir, { recursive: true });

  const agentA = await createAgent("codex-agent-a", runId, relay);
  const agentB = await createAgent("codex-agent-b", runId, relay);
  const run = {
    runId,
    relay,
    startedAt: new Date().toISOString(),
    initialCredits,
    postageA,
    postageB,
    agentA: pickPublicAgent(agentA),
    agentB: pickPublicAgent(agentB),
    threadAtoB: `ltthread:${runId}:a-to-b`,
    threadBtoA: `ltthread:${runId}:b-to-a`,
    goalAtoB: "Agent A asks Agent B to confirm live relay delivery.",
    goalBtoA: "Agent B replies after claiming and acking Agent A's mail."
  };

  await writeJson(join(runDir, "agent-a.json"), agentA);
  await writeJson(join(runDir, "agent-b.json"), agentB);
  await writeJson(join(runDir, "run.json"), run);
  await seedRemoteD1(runDir, [agentA, agentB], initialCredits);
  await writeJson(join(runDir, "setup-result.json"), {
    status: "seeded",
    runDir,
    runId,
    relay,
    agentA: run.agentA,
    agentB: run.agentB
  });

  console.log(JSON.stringify({
    status: "ok",
    runDir,
    runId,
    agentACommand: `node scripts/live-agent-mail.mjs agent-a --run-dir ${runDir}`,
    agentBCommand: `node scripts/live-agent-mail.mjs agent-b --run-dir ${runDir}`,
    verifyCommand: `node scripts/live-agent-mail.mjs verify --run-dir ${runDir}`
  }, null, 2));
}

async function runAgentA() {
  const ctx = await loadRunContext();
  const sent = await sendTask(ctx.agentA, ctx.agentB, ctx.run.threadAtoB, ctx.run.goalAtoB, ctx.run.postageA);
  const reply = await pollForDelivery(ctx.agentA, ctx.agentB.did, 90_000);
  const claim = await claimDelivery(ctx.agentA, reply.messageId);
  const ack = await ackDelivery(ctx.agentA, reply.messageId);
  const credits = await getCredits(ctx.agentA);
  const result = {
    role: "agent-a",
    status: "ok",
    sentMessageId: sent.messageId,
    receivedReplyMessageId: reply.messageId,
    claim,
    ack,
    credits
  };
  await writeJson(join(ctx.runDir, "agent-a-result.json"), result);
  console.log(JSON.stringify(result, null, 2));
}

async function runAgentB() {
  const ctx = await loadRunContext();
  const inbound = await pollForDelivery(ctx.agentB, ctx.agentA.did, 90_000);
  const claim = await claimDelivery(ctx.agentB, inbound.messageId);
  const ack = await ackDelivery(ctx.agentB, inbound.messageId);
  const sent = await sendTask(ctx.agentB, ctx.agentA, ctx.run.threadBtoA, ctx.run.goalBtoA, ctx.run.postageB);
  const credits = await getCredits(ctx.agentB);
  const result = {
    role: "agent-b",
    status: "ok",
    receivedMessageId: inbound.messageId,
    claim,
    ack,
    sentReplyMessageId: sent.messageId,
    credits
  };
  await writeJson(join(ctx.runDir, "agent-b-result.json"), result);
  console.log(JSON.stringify(result, null, 2));
}

async function verifyRun() {
  const ctx = await loadRunContext();
  const [agentAResult, agentBResult] = await Promise.all([
    readJson(join(ctx.runDir, "agent-a-result.json")),
    readJson(join(ctx.runDir, "agent-b-result.json"))
  ]);
  const [aSync, bSync, aCredits, bCredits] = await Promise.all([
    syncMailbox(ctx.agentA),
    syncMailbox(ctx.agentB),
    getCredits(ctx.agentA),
    getCredits(ctx.agentB)
  ]);
  const aReply = aSync.messages.find((delivery) => delivery.messageId === agentBResult.sentReplyMessageId);
  const bInbound = bSync.messages.find((delivery) => delivery.messageId === agentAResult.sentMessageId);
  const expectedA = ctx.run.initialCredits - ctx.run.postageA + ctx.run.postageB;
  const expectedB = ctx.run.initialCredits - ctx.run.postageB + ctx.run.postageA;
  const checks = {
    agentAResultOk: agentAResult.status === "ok",
    agentBResultOk: agentBResult.status === "ok",
    agentAReplyAcked: aReply?.deliveryState === "acked",
    agentBInboundAcked: bInbound?.deliveryState === "acked",
    agentACreditsSettled: aCredits.balance === expectedA && aCredits.held === 0,
    agentBCreditsSettled: bCredits.balance === expectedB && bCredits.held === 0
  };
  const ok = Object.values(checks).every(Boolean);
  const result = {
    status: ok ? "ok" : "failed",
    runId: ctx.run.runId,
    checks,
    agentA: {
      did: ctx.agentA.did,
      credits: aCredits,
      delivery: aReply
    },
    agentB: {
      did: ctx.agentB.did,
      credits: bCredits,
      delivery: bInbound
    },
    agentAResult,
    agentBResult
  };
  await writeJson(join(ctx.runDir, "verify-result.json"), result);
  console.log(JSON.stringify(result, null, 2));
  if (!ok) process.exit(1);
}

async function loadRunContext() {
  const runDir = required(args["run-dir"], "--run-dir");
  return {
    runDir,
    run: await readJson(join(runDir, "run.json")),
    agentA: await readJson(join(runDir, "agent-a.json")),
    agentB: await readJson(join(runDir, "agent-b.json"))
  };
}

async function sendTask(sender, recipient, thread, goal, postage) {
  return signedFetch(sender, "POST", "/v0/messages", {
    type: "task.request",
    from: sender.did,
    to: [recipient.did],
    thread,
    body: { goal },
    postage: { creditAmount: postage },
    attachments: []
  });
}

async function pollForDelivery(agent, senderDid, timeoutMs) {
  const started = Date.now();
  let lastSync = null;
  while (Date.now() - started < timeoutMs) {
    lastSync = await syncMailbox(agent);
    const delivery = lastSync.messages.find((message) =>
      message.senderDid === senderDid && message.deliveryState === "available"
    );
    if (delivery) return delivery;
    await sleep(1500);
  }
  throw new Error(`timed_out_waiting_for_mail from ${senderDid}; lastSync=${JSON.stringify(lastSync)}`);
}

async function syncMailbox(agent) {
  return signedFetch(agent, "GET", `/v0/mailboxes/${encodeURIComponent(agent.did)}/sync?cursor=0`);
}

async function claimDelivery(agent, messageId) {
  return signedFetch(agent, "POST", `/v0/mailboxes/${encodeURIComponent(agent.did)}/claim`, {
    messageId,
    agentId: agent.did,
    leaseSeconds: 120
  });
}

async function ackDelivery(agent, messageId) {
  return signedFetch(agent, "POST", `/v0/messages/${encodeURIComponent(messageId)}/ack`, {
    mailboxId: agent.did,
    state: "acked"
  });
}

async function getCredits(agent) {
  return signedFetch(agent, "GET", `/v0/credits/${encodeURIComponent(agent.did)}`);
}

async function signedFetch(agent, method, pathAndQuery, body) {
  const relay = agent.serviceEndpoint.replace(/\/+$/, "");
  const path = new URL(`${relay}${pathAndQuery}`).pathname;
  const bodyText = body === undefined ? "" : stableJson(body);
  const timestamp = String(Date.now());
  const payload = `${method.toUpperCase()}\n${path}\n${await sha256Hex(bodyText)}\n${timestamp}`;
  const signature = await signP256(agent.privateKeyJwk, payload);
  const response = await fetch(`${relay}${pathAndQuery}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-LT-DID": agent.did,
      "X-LT-Key-Id": agent.agentId,
      "X-LT-Timestamp": timestamp,
      "X-LT-Signature": signature
    },
    body: bodyText || undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${pathAndQuery} failed ${response.status}: ${text}`);
  }
  return data;
}

async function seedRemoteD1(runDir, agents, initialCredits) {
  const now = Date.now();
  const sql = agents.map((agent) => `
INSERT INTO agents (did, agent_id, mailbox_id, display_name, public_key_jwk, service_endpoint, created_at, updated_at)
VALUES (${quoteSql(agent.did)}, ${quoteSql(agent.agentId)}, ${quoteSql(agent.mailboxId)}, ${quoteSql(agent.displayName)}, ${quoteSql(JSON.stringify(agent.publicKeyJwk))}, ${quoteSql(agent.serviceEndpoint)}, ${now}, ${now})
ON CONFLICT(did) DO UPDATE SET public_key_jwk = excluded.public_key_jwk, updated_at = excluded.updated_at;
INSERT INTO credit_accounts (did, balance, held, llm_token_quota, created_at, updated_at)
VALUES (${quoteSql(agent.did)}, ${initialCredits}, 0, 0, ${now}, ${now})
ON CONFLICT(did) DO UPDATE SET balance = excluded.balance, held = 0, llm_token_quota = 0, updated_at = excluded.updated_at;
`).join("\n");
  const sqlPath = join(runDir, "seed.sql");
  await writeFile(sqlPath, sql);
  execFileSync("npx", ["wrangler", "d1", "execute", "lingtai-mail", "--remote", "--file", sqlPath], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" }
  });
}

async function createAgent(prefix, runId, relay) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const did = `did:key:${prefix}-${runId}`;
  return {
    did,
    agentId: `${did}#default`,
    mailboxId: did,
    displayName: `${prefix}-${runId}`,
    publicKeyJwk,
    privateKeyJwk,
    serviceEndpoint: relay
  };
}

function pickPublicAgent(agent) {
  return {
    did: agent.did,
    agentId: agent.agentId,
    mailboxId: agent.mailboxId,
    displayName: agent.displayName,
    serviceEndpoint: agent.serviceEndpoint
  };
}

async function signP256(privateKeyJwk, payload) {
  const key = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(payload)
  );
  return Buffer.from(new Uint8Array(signature)).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function parseArgs(values) {
  const parsed = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = values[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = "true";
      } else {
        parsed[key] = next;
        index += 1;
      }
    } else {
      parsed._.push(value);
    }
  }
  return parsed;
}

function required(value, name) {
  if (!value || value === "true") throw new Error(`${name} is required`);
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  console.error(`Usage:
  node scripts/live-agent-mail.mjs setup --relay https://mail.nervafs.xyz
  node scripts/live-agent-mail.mjs agent-a --run-dir /tmp/ltmail-two-codex-...
  node scripts/live-agent-mail.mjs agent-b --run-dir /tmp/ltmail-two-codex-...
  node scripts/live-agent-mail.mjs verify --run-dir /tmp/ltmail-two-codex-...
`);
}
