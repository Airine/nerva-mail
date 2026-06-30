#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const args = parseArgs(process.argv.slice(2));

if (args._[0] !== "auth" || args._[1] !== "login") {
  usage();
  process.exit(1);
}

try {
  const relay = required(args.relay, "--relay").replace(/\/+$/, "");
  const did = required(args.did, "--did");
  const keyFile = required(args["key-file"], "--key-file");
  const code = required(args.code, "--code");
  const nonce = required(args.nonce, "--nonce");
  const keyId = args["key-id"] || `${did}#default`;
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
    console.error(text || `nmail auth login failed with ${response.status}`);
    process.exit(1);
  }
  console.log(text || JSON.stringify({ status: "signed" }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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
  nmail auth login --relay <url> --did <did> --key-file <private-jwk.json> --code <code> --nonce <nonce>

The command signs the browser login challenge and submits it to /v0/ui/login/cli-complete.
The Agent private key stays on the machine running this CLI.`);
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
