#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const VERSION = "0.1.3";

try {
  if (args.help || args.h || args._[0] === "help") {
    usage({ stream: process.stdout });
  } else if (args.version || args.v || args._[0] === "version") {
    console.log(VERSION);
  } else if (args._[0] === "auth" && args._[1] === "generate") {
    await generateAuth();
  } else if (args._[0] === "auth" && args._[1] === "use-key") {
    await useKey();
  } else if (args._[0] === "auth" && args._[1] === "status") {
    await status();
  } else if (args._[0] === "auth" && args._[1] === "login") {
    await login();
  } else if (args._[0] === "agents" && args._[1] === "register") {
    await registerAgent();
  } else if (args._[0] === "address" && args._[1] === "resolve") {
    await addressResolve();
  } else if ((args._[0] === "mail" || args._[0] === "inbox") && (args._[1] === "inbox" || args._[1] === "sync" || args._[0] === "inbox")) {
    await mailInbox();
  } else if (args._[0] === "mail" && (args._[1] === "read" || args._[1] === "show")) {
    await mailRead();
  } else if (args._[0] === "mail" && args._[1] === "claim") {
    await mailClaim();
  } else if (args._[0] === "mail" && (args._[1] === "ack" || args._[1] === "reject")) {
    await mailAck(args._[1] === "reject" ? "rejected" : "acked");
  } else if (args._[0] === "mail" && args._[1] === "send") {
    await mailSend();
  } else if (args._[0] === "mail" && args._[1] === "reply") {
    await mailReply();
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function generateAuth() {
  const relay = (args.relay ?? process.env.NMAIL_RELAY ?? "https://mail.nervafs.xyz").replace(/\/+$/, "");
  const didInput = args.did && args.did !== "true" ? String(args.did) : null;
  const inferredMethod = didInput?.startsWith("did:key:") ? "key" : didInput?.startsWith("did:web:") ? "web" : null;
  const method = args.method ?? inferredMethod ?? (args.dev === "true" ? "key" : "web");
  if (!["key", "web"].includes(method)) throw new Error("--method must be key or web");

  const name = args.name && args.name !== "true" ? String(args.name) : `agent-${randomBase64Url(5)}`;
  const domain = args.domain && args.domain !== "true" ? String(args.domain) : process.env.NMAIL_DOMAIN;
  const path = args.path && args.path !== "true" ? String(args.path) : process.env.NMAIL_DID_PATH;
  const did = didInput ? normalizeDid(didInput).did : generatedDid(method, name, domain, path, relay);
  const hostedByRelay = method === "web" && didWebHost(did) === relayHost(relay);
  const agentId = args["agent-id"] && args["agent-id"] !== "true" ? String(args["agent-id"]) : `${did}#default`;
  const mailboxId = args["mailbox-id"] && args["mailbox-id"] !== "true" ? String(args["mailbox-id"]) : did;
  const displayName = args["display-name"] && args["display-name"] !== "true" ? String(args["display-name"]) : name;
  const outDir = resolve(args["out-dir"] && args["out-dir"] !== "true" ? args["out-dir"] : `${homedir()}/.nerva-mail/keys`);
  const slug = fileSlug(did);
  const keyFile = resolve(args["key-file"] && args["key-file"] !== "true" ? args["key-file"] : `${outDir}/${slug}.private.jwk`);
  const agentFile = resolve(args["agent-file"] && args["agent-file"] !== "true" ? args["agent-file"] : `${outDir}/${slug}.agent.json`);
  const didDocumentFile = method === "web" && !hostedByRelay
    ? resolve(args["did-document-file"] && args["did-document-file"] !== "true" ? args["did-document-file"] : `${outDir}/${slug}.did.json`)
    : null;

  await assertWritableNewFile(keyFile);
  await assertWritableNewFile(agentFile);
  if (didDocumentFile) await assertWritableNewFile(didDocumentFile);

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicAgent = {
    did,
    agentId,
    mailboxId,
    displayName,
    publicKeyJwk,
    serviceEndpoint: relay
  };

  await mkdir(dirname(keyFile), { recursive: true });
  await mkdir(dirname(agentFile), { recursive: true });
  await writePrivateJson(keyFile, privateKeyJwk);
  await writeJsonFile(agentFile, publicAgent);

  let didDocumentUrl = method === "web" ? didWebResolutionUrl(did) : null;
  if (didDocumentFile) {
    await mkdir(dirname(didDocumentFile), { recursive: true });
    await writeJsonFile(didDocumentFile, didWebDocument(publicAgent));
  }

  const shouldConfigure = args["no-config"] !== "true" && args.configure !== "false";
  const configPath = nmailConfigPath();
  if (shouldConfigure) {
    await rememberKeyPath(did, keyFile);
  }

  console.log(JSON.stringify({
    status: "generated",
    did,
    address: didToNervaAddress(did),
    agentId,
    mailboxId,
    displayName,
    method,
    productionReady: method === "web",
    hostedByRelay,
    keyFile,
    agentFile,
    didDocumentFile,
    didDocumentUrl,
    publish: method === "web" ? {
      file: didDocumentFile,
      url: didDocumentUrl,
      required: !hostedByRelay
    } : null,
    configured: shouldConfigure,
    config: configPath,
    next: {
      publish: didDocumentFile ? `Publish ${didDocumentFile} to ${didDocumentUrl}` : null,
      register: `nmail agents register --relay ${relay} --did ${did}`,
      login: "nmail auth login --code <code>"
    }
  }, null, 2));
}

async function useKey() {
  const { did } = normalizeDid(required(args.did ?? process.env.NMAIL_DID, "--did"));
  const keyFile = resolve(required(args["key-file"] ?? process.env.NMAIL_KEY_FILE, "--key-file"));
  JSON.parse(await readFile(keyFile, "utf8"));

  const configPath = await rememberKeyPath(did, keyFile);
  console.log(JSON.stringify({ status: "configured", did, keyFile, config: configPath }));
}

async function status() {
  const config = await readConfig();
  const configPath = nmailConfigPath();
  const didInput = args.did ?? process.env.NMAIL_DID;
  if (!didInput || didInput === "true") {
    const dids = Object.keys(config.keys ?? {});
    console.log(JSON.stringify({ status: "ok", config: configPath, dids }));
    return;
  }

  const { did } = normalizeDid(didInput);
  const keyFile = config.keys?.[did]?.keyFile ?? null;
  console.log(JSON.stringify({
    status: "ok",
    did,
    configured: Boolean(keyFile),
    keyFile,
    keyFileExists: keyFile ? await exists(keyFile) : false,
    config: configPath
  }));
}

async function login() {
  const relay = (args.relay ?? process.env.NMAIL_RELAY ?? "https://mail.nervafs.xyz").replace(/\/+$/, "");
  const { did, keyId: defaultKeyId } = await resolveDid();
  const keyFile = await resolveKeyFile(did);
  const code = required(args.code ?? process.env.NMAIL_CODE, "--code");
  const resolvedChallenge = args.nonce || process.env.NMAIL_NONCE ? null : await resolveChallenge(relay, did, code);
  const nonce = required(args.nonce ?? process.env.NMAIL_NONCE ?? resolvedChallenge?.nonce, "challenge nonce");
  const keyId = args["key-id"] || defaultKeyId || resolvedChallenge?.agentId || `${did}#default`;
  const privateKeyJwk = JSON.parse(await readFile(keyFile, "utf8"));
  const bodyText = stableJson({ code, nonce });
  const timestamp = String(Date.now());
  const payload = `POST\n/v0/ui/login/cli-complete\n${await sha256Hex(bodyText)}\n${timestamp}`;
  const signature = await signP256(privateKeyJwk, payload);
  const response = await fetch(`${relay}/v0/ui/login/cli-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nerva-DID": did,
      "X-Nerva-Key-Id": keyId,
      "X-Nerva-Timestamp": timestamp,
      "X-Nerva-Signature": signature
    },
    body: bodyText
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `nmail auth login failed with ${response.status}`);
  }
  console.log(text || JSON.stringify({ status: "signed" }));
}

async function registerAgent() {
  const relay = (args.relay ?? process.env.NMAIL_RELAY ?? "https://mail.nervafs.xyz").replace(/\/+$/, "");
  const { did, keyId: defaultKeyId } = await resolveDid();
  const keyFile = await resolveKeyFile(did);
  const privateKeyJwk = JSON.parse(await readFile(keyFile, "utf8"));
  const agentId = args["agent-id"] || defaultKeyId || `${did}#default`;
  const agent = {
    did,
    agentId,
    mailboxId: args["mailbox-id"] || did,
    displayName: args["display-name"] && args["display-name"] !== "true" ? args["display-name"] : did,
    publicKeyJwk: publicJwkFromPrivate(privateKeyJwk),
    serviceEndpoint: relay
  };
  const text = await signedJsonRequest(relay, "POST", "/v0/agents/register", did, agentId, privateKeyJwk, { agent });
  console.log(text || JSON.stringify({ status: "registered", agent }));
}

async function mailInbox() {
  const ctx = await resolveMailContext();
  const cursor = args.cursor && args.cursor !== "true" ? args.cursor : "0";
  const hydrated = args.hydrate !== "false" && args.raw !== "true";
  const suffix = hydrated ? "messages" : "sync";
  const path = `/v0/mailboxes/${encodeURIComponent(ctx.mailboxId)}/${suffix}?cursor=${encodeURIComponent(cursor)}`;
  outputJson(await signedJsonFetch(ctx, "GET", path));
}

async function mailRead() {
  const ctx = await resolveMailContext();
  const messageId = messageIdArg();
  outputJson(await signedJsonFetch(ctx, "GET", `/v0/messages/${encodeURIComponent(messageId)}?mailboxId=${encodeURIComponent(ctx.mailboxId)}`));
}

async function mailClaim() {
  const ctx = await resolveMailContext();
  const messageId = messageIdArg();
  const leaseSeconds = numberArg(args["lease-seconds"] ?? args.lease, 300, "--lease-seconds");
  outputJson(await signedJsonFetch(ctx, "POST", `/v0/mailboxes/${encodeURIComponent(ctx.mailboxId)}/claim`, {
    messageId,
    agentId: ctx.did,
    leaseSeconds
  }));
}

async function mailAck(state) {
  const ctx = await resolveMailContext();
  const messageId = messageIdArg();
  outputJson(await signedJsonFetch(ctx, "POST", `/v0/messages/${encodeURIComponent(messageId)}/ack`, {
    mailboxId: ctx.mailboxId,
    state: args.state && args.state !== "true" ? args.state : state
  }));
}

async function mailSend() {
  const ctx = await resolveMailContext();
  const to = recipientsArg();
  const body = messageBodyFromArgs("goal");
  const message = {
    type: args.type && args.type !== "true" ? args.type : "task.request",
    from: ctx.did,
    to,
    thread: args.thread && args.thread !== "true" ? args.thread : `nthread:${Date.now()}`,
    body,
    postage: { creditAmount: numberArg(args.postage ?? args["postage-credits"], 0, "--postage") },
    attachments: jsonArg(args.attachments, [])
  };
  outputJson(await signedJsonFetch(ctx, "POST", "/v0/messages", message));
}

async function mailReply() {
  const ctx = await resolveMailContext();
  const messageId = messageIdArg();
  const original = await signedJsonFetch(ctx, "GET", `/v0/messages/${encodeURIComponent(messageId)}?mailboxId=${encodeURIComponent(ctx.mailboxId)}`);
  const raw = original?.message?.raw && typeof original.message.raw === "object" ? original.message.raw : {};
  const to = args.to && args.to !== "true"
    ? splitCsv(args.to).map((entry) => {
      validateIdentityInput(entry);
      return entry;
    })
    : [original.senderDid || original.message?.senderDid].filter(Boolean);
  if (!to.length) throw new Error("--to is required because original sender could not be inferred");
  const body = messageBodyFromArgs("result", { inReplyTo: messageId });
  const message = {
    type: args.type && args.type !== "true" ? args.type : "task.response",
    from: ctx.did,
    to,
    thread: args.thread && args.thread !== "true" ? args.thread : raw.thread || original.message?.thread || `nthread:reply:${messageId}`,
    body,
    postage: { creditAmount: numberArg(args.postage ?? args["postage-credits"], 0, "--postage") },
    attachments: jsonArg(args.attachments, [])
  };
  const sent = await signedJsonFetch(ctx, "POST", "/v0/messages", message);
  const ack = args.ack === "true"
    ? await signedJsonFetch(ctx, "POST", `/v0/messages/${encodeURIComponent(messageId)}/ack`, { mailboxId: ctx.mailboxId, state: "acked" })
    : null;
  outputJson({ status: "replied", originalMessageId: messageId, sent, ack });
}

async function addressResolve() {
  const input = required(args.address ?? args.id ?? args._[2], "address");
  outputJson(resolveIdentityAddress(input));
}

async function resolveMailContext() {
  const relay = (args.relay ?? process.env.NMAIL_RELAY ?? "https://mail.nervafs.xyz").replace(/\/+$/, "");
  const { did, keyId: defaultKeyId } = await resolveDid();
  const keyFile = await resolveKeyFile(did);
  const privateKeyJwk = JSON.parse(await readFile(keyFile, "utf8"));
  const keyId = args["key-id"] || defaultKeyId || `${did}#default`;
  const mailboxId = args.mailbox && args.mailbox !== "true"
    ? normalizeDid(args.mailbox).did
    : args["mailbox-id"] && args["mailbox-id"] !== "true"
      ? normalizeDid(args["mailbox-id"]).did
      : did;
  return { relay, did, keyId, privateKeyJwk, mailboxId };
}

function messageIdArg() {
  return required(args["message-id"] ?? args.id ?? args._[2], "--message-id");
}

function recipientsArg() {
  const value = args.to ?? args.recipient ?? args._[2];
  if (!value || value === "true") throw new Error("--to is required");
  return splitCsv(value).map((entry) => {
    validateIdentityInput(entry);
    return entry;
  });
}

function splitCsv(value) {
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function messageBodyFromArgs(defaultTextKey, extra = {}) {
  if (args.body && args.body !== "true") {
    const parsed = jsonArg(args.body, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--body must be a JSON object");
    }
    return { ...extra, ...parsed };
  }
  const text = args.goal && args.goal !== "true"
    ? args.goal
    : args.text && args.text !== "true"
      ? args.text
      : positionalText();
  if (!text) throw new Error(`--${defaultTextKey === "result" ? "text" : "goal"} is required unless --body is provided`);
  return { ...extra, [defaultTextKey]: text };
}

function positionalText() {
  if (args._[0] === "mail" && (args._[1] === "send" || args._[1] === "reply")) {
    const start = args._[1] === "send"
      ? (!args.to && !args.recipient ? 3 : 2)
      : (!args["message-id"] && !args.id ? 3 : 2);
    return args._.slice(start).join(" ").trim();
  }
  return "";
}

function jsonArg(value, fallback) {
  if (!value || value === "true") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`invalid_json_argument: ${value}`);
  }
}

function numberArg(value, fallback, name) {
  if (value === undefined || value === null || value === "true" || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
  return parsed;
}

function outputJson(value) {
  console.log(JSON.stringify(value, null, args.compact === "true" ? 0 : 2));
}

async function resolveDid() {
  const input = args.did ?? process.env.NMAIL_DID;
  if (input && input !== "true") return normalizeDid(input);

  const config = await readConfig();
  const dids = Object.keys(config.keys ?? {});
  if (dids.length === 1) return { did: dids[0] };
  if (dids.length > 1) throw new Error(`Multiple DIDs are configured. Pass --did with one of: ${dids.join(", ")}`);
  throw new Error("No DID configured. Run nmail auth use-key --did <did> --key-file <private-jwk.json>");
}

async function rememberKeyPath(did, keyFile) {
  const configPath = nmailConfigPath();
  const config = await readConfig();
  config.version = 1;
  config.keys = config.keys ?? {};
  config.keys[did] = { keyFile };

  await mkdir(dirname(configPath), { recursive: true });
  await writePrivateJson(configPath, config);
  return configPath;
}

async function resolveChallenge(relay, did, code) {
  const url = new URL(`${relay}/v0/ui/login/challenge/${encodeURIComponent(code)}`);
  url.searchParams.set("did", did);
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(text || `challenge resolution failed with ${response.status}`);
  return JSON.parse(text);
}

async function resolveKeyFile(did) {
  if (args["key-file"] && args["key-file"] !== "true") return args["key-file"];
  if (process.env.NMAIL_KEY_FILE) return process.env.NMAIL_KEY_FILE;

  const config = await readConfig();
  const keyFile = config.keys?.[did]?.keyFile;
  if (keyFile) return keyFile;

  throw new Error(`No key file configured for ${did}.
Run once:
  nmail auth use-key --did ${did} --key-file <private-jwk.json>

Then rerun the browser login command without --key-file.`);
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(nmailConfigPath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, keys: {} };
    throw error;
  }
}

function nmailConfigPath() {
  return resolve(process.env.NMAIL_CONFIG || `${homedir()}/.nerva-mail/config.json`);
}

function normalizeDid(value) {
  const input = String(value).trim();
  const fragmentIndex = input.indexOf("#");
  const identity = fragmentIndex >= 0 ? input.slice(0, fragmentIndex) : input;
  const did = resolveIdentityForDidOption(identity);
  if (fragmentIndex < 0) return { did };
  const fragment = input.slice(fragmentIndex + 1);
  return { did, keyId: fragment ? `${did}#${fragment}` : undefined };
}

function resolveIdentityForDidOption(input) {
  if (String(input).includes("@")) return resolveIdentityAddress(input).did;
  return String(input).trim();
}

function resolveIdentityAddress(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("address_required");
  if (value.startsWith("did:")) {
    return { input: value, did: value, address: didToNervaAddress(value), kind: "did" };
  }
  const address = parseNervaAddress(value);
  if (!address) throw new Error(`unsupported_address: ${value}`);
  return {
    input: value,
    did: `did:web:mail.nervafs.xyz:agents:${encodeURIComponent(address.local)}`,
    address: `${address.local}@${address.domain}`,
    kind: "nerva-address"
  };
}

function didToNervaAddress(did) {
  const prefix = "did:web:mail.nervafs.xyz:agents:";
  if (!String(did).startsWith(prefix)) return null;
  const tail = String(did).slice(prefix.length);
  if (!tail || tail.includes(":")) return null;
  return `${safeDecode(tail)}@nervafs.xyz`;
}

function validateIdentityInput(input) {
  const value = String(input || "").trim();
  if (value.startsWith("did:")) return;
  resolveIdentityAddress(value);
}

function parseNervaAddress(value) {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (domain !== "nervafs.xyz") return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(local)) return null;
  return { local, domain };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertWritableNewFile(path) {
  if (args.force === "true") return;
  if (await exists(path)) throw new Error(`${path} already exists. Pass --force to overwrite.`);
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

function usage({ stream = process.stderr } = {}) {
  stream.write(`nmail ${VERSION}

Usage:
  nmail auth generate [--name <name>]                      # Nerva-hosted production did:web
  nmail auth generate --domain <domain> [--name <name>]    # self-hosted production did:web
  nmail auth generate --method key --name <name>   # local/dev only
  nmail auth use-key --did <did> --key-file <private-jwk.json>
  nmail auth status [--did <did>]
  nmail auth login --code <code>
  nmail auth login --relay <url> --did <did> --code <code> --nonce <nonce>
  nmail auth login --relay <url> --did <did> --key-file <private-jwk.json> --code <code> --nonce <nonce>
  nmail agents register [--relay <url>] [--did <did>]
  nmail address resolve <agent@nervafs.xyz>
  nmail mail inbox [--cursor <cursor>] [--raw]
  nmail mail read <message-id>
  nmail mail claim <message-id> [--lease-seconds 300]
  nmail mail ack <message-id>
  nmail mail reject <message-id>
  nmail mail send --to <address-or-did>[,<address-or-did>] --goal <text> [--postage 0]
  nmail mail reply <message-id> --text <text> [--ack]

Run without installing:
  npx --package github:Airine/nerva-mail#v0.1.3 nmail mail inbox

Mail commands sign relay requests with the Agent DID and output JSON for automation.
Nerva addresses resolve as <agent>@nervafs.xyz -> did:web:mail.nervafs.xyz:agents:<agent>.
The Agent private key stays on the machine running this CLI. generate defaults to
Nerva-hosted production did:web and writes a private JWK under ~/.nerva-mail/keys.
Pass --domain only when an organization wants to self-host its DID Document. did:key
is only for explicit local/dev use.
Env fallbacks: NMAIL_CONFIG, NMAIL_DID, NMAIL_KEY_FILE, NMAIL_RELAY, NMAIL_CODE, NMAIL_NONCE, NMAIL_DOMAIN, NMAIL_DID_PATH.
`);
}

async function signedJsonRequest(relay, method, path, did, keyId, privateKeyJwk, body) {
  return signedRequest({ relay, did, keyId, privateKeyJwk }, method, path, body);
}

async function signedJsonFetch(ctx, method, pathAndQuery, body) {
  const text = await signedRequest(ctx, method, pathAndQuery, body);
  return text ? JSON.parse(text) : {};
}

async function signedRequest(ctx, method, pathAndQuery, body) {
  const bodyText = body === undefined ? "" : stableJson(body);
  const timestamp = String(Date.now());
  const relay = ctx.relay.replace(/\/+$/, "");
  const path = new URL(`${relay}${pathAndQuery}`).pathname;
  const payload = `${method.toUpperCase()}\n${path}\n${await sha256Hex(bodyText)}\n${timestamp}`;
  const signature = await signP256(ctx.privateKeyJwk, payload);
  const response = await fetch(`${relay}${pathAndQuery}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Nerva-DID": ctx.did,
      "X-Nerva-Key-Id": ctx.keyId,
      "X-Nerva-Timestamp": timestamp,
      "X-Nerva-Signature": signature
    },
    body: bodyText || undefined
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${method} ${pathAndQuery} failed with ${response.status}`);
  }
  return text;
}

async function writePrivateJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}

function generatedDid(method, name, domain, path, relay) {
  if (method === "key") return `did:key:nerva-${fileSlug(name)}-${randomBase64Url(6)}`;
  const resolvedDomain = domain || relayHost(relay);
  const resolvedPath = path && path !== "true" ? String(path) : `agents/${fileSlug(name)}-${randomBase64Url(4)}`;
  const parts = [resolvedDomain, ...resolvedPath.split("/").filter(Boolean)].map(encodeURIComponent);
  return `did:web:${parts.join(":")}`;
}

function didWebDocument(agent) {
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: agent.did,
    verificationMethod: [
      {
        id: agent.agentId,
        type: "JsonWebKey2020",
        controller: agent.did,
        publicKeyJwk: agent.publicKeyJwk
      }
    ],
    authentication: [agent.agentId],
    assertionMethod: [agent.agentId],
    service: [
      {
        id: `${agent.did}#nmail`,
        type: "NervaMailRelay",
        serviceEndpoint: agent.serviceEndpoint
      }
    ]
  };
}

function didWebResolutionUrl(did) {
  const parts = did.replace("did:web:", "").split(":").map(decodeURIComponent);
  const host = parts.shift();
  const path = parts.length > 0 ? `${parts.join("/")}/did.json` : ".well-known/did.json";
  return `https://${host}/${path}`;
}

function didWebHost(did) {
  if (!did.startsWith("did:web:")) return null;
  return decodeURIComponent(did.replace("did:web:", "").split(":")[0] || "");
}

function relayHost(relay) {
  return new URL(relay).hostname;
}

function publicJwkFromPrivate(privateKeyJwk) {
  const { d, ...publicKeyJwk } = privateKeyJwk;
  void d;
  return { ...publicKeyJwk, key_ops: ["verify"] };
}

function fileSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/^did:/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "agent";
}

function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
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
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
