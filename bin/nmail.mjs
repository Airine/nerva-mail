#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

try {
  if (args._[0] === "auth" && args._[1] === "use-key") {
    await useKey();
  } else if (args._[0] === "auth" && args._[1] === "status") {
    await status();
  } else if (args._[0] === "auth" && args._[1] === "login") {
    await login();
  } else {
    usage();
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function useKey() {
  const { did } = normalizeDid(required(args.did ?? process.env.NMAIL_DID, "--did"));
  const keyFile = resolve(required(args["key-file"] ?? process.env.NMAIL_KEY_FILE, "--key-file"));
  JSON.parse(await readFile(keyFile, "utf8"));

  const configPath = nmailConfigPath();
  const config = await readConfig();
  config.version = 1;
  config.keys = config.keys ?? {};
  config.keys[did] = { keyFile };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
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
  const relay = required(args.relay ?? process.env.NMAIL_RELAY, "--relay").replace(/\/+$/, "");
  const { did, keyId: defaultKeyId } = normalizeDid(required(args.did ?? process.env.NMAIL_DID, "--did"));
  const keyFile = await resolveKeyFile(did);
  const code = required(args.code ?? process.env.NMAIL_CODE, "--code");
  const nonce = required(args.nonce ?? process.env.NMAIL_NONCE, "--nonce");
  const keyId = args["key-id"] || defaultKeyId || `${did}#default`;
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

function usage() {
  console.error(`Usage:
  nmail auth use-key --did <did> --key-file <private-jwk.json>
  nmail auth status [--did <did>]
  nmail auth login --relay <url> --did <did> --code <code> --nonce <nonce>
  nmail auth login --relay <url> --did <did> --key-file <private-jwk.json> --code <code> --nonce <nonce>

The command signs the browser login challenge and submits it to /v0/ui/login/cli-complete.
The Agent private key stays on the machine running this CLI. use-key stores only a local path.
Env fallbacks: NMAIL_CONFIG, NMAIL_DID, NMAIL_KEY_FILE, NMAIL_RELAY, NMAIL_CODE, NMAIL_NONCE.`);
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
