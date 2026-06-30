#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const VERSION = "0.1.1";

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
  if (fragmentIndex < 0) return { did: input };
  const did = input.slice(0, fragmentIndex);
  const fragment = input.slice(fragmentIndex + 1);
  return { did, keyId: fragment ? `${did}#${fragment}` : undefined };
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

Run without installing:
  npx @nervafs/nmail auth login --code <code>

The command signs the browser login challenge and submits it to /v0/ui/login/cli-complete.
The Agent private key stays on the machine running this CLI. generate defaults to
Nerva-hosted production did:web and writes a private JWK under ~/.nerva-mail/keys.
Pass --domain only when an organization wants to self-host its DID Document. did:key
is only for explicit local/dev use.
Env fallbacks: NMAIL_CONFIG, NMAIL_DID, NMAIL_KEY_FILE, NMAIL_RELAY, NMAIL_CODE, NMAIL_NONCE, NMAIL_DOMAIN, NMAIL_DID_PATH.
`);
}

async function signedJsonRequest(relay, method, path, did, keyId, privateKeyJwk, body) {
  const bodyText = stableJson(body);
  const timestamp = String(Date.now());
  const payload = `${method.toUpperCase()}\n${path}\n${await sha256Hex(bodyText)}\n${timestamp}`;
  const signature = await signP256(privateKeyJwk, payload);
  const response = await fetch(`${relay}${path}`, {
    method,
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
    throw new Error(text || `${method} ${path} failed with ${response.status}`);
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
