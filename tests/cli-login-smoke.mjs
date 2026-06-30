import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const did = "did:key:cli-smoke";
const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

const tmp = await mkdtemp(join(tmpdir(), "nmail-cli-"));
const keyFile = join(tmp, "agent.private.jwk");
const configFile = join(tmp, "config.json");
await writeFile(keyFile, JSON.stringify(privateKeyJwk), "utf8");

let verified = false;
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  const timestamp = request.headers["x-nerva-timestamp"];
  const signature = request.headers["x-nerva-signature"];
  const receivedDid = request.headers["x-nerva-did"];
  const keyId = request.headers["x-nerva-key-id"];

  if (
    request.method === "POST" &&
    request.url === "/v0/ui/login/cli-complete" &&
    receivedDid === did &&
    keyId === `${did}#default` &&
    typeof timestamp === "string" &&
    typeof signature === "string"
  ) {
    const payload = `POST\n/v0/ui/login/cli-complete\n${await sha256Hex(bodyText)}\n${timestamp}`;
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
  }

  response.writeHead(verified ? 200 : 400, { "Content-Type": "application/json" });
  response.end(JSON.stringify(verified ? { status: "signed" } : { error: "bad_signature" }));
});

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const relay = `http://127.0.0.1:${address.port}`;
  const env = { NMAIL_CONFIG: configFile };

  const configured = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "use-key",
    "--did",
    did,
    "--key-file",
    keyFile
  ], env);
  if (configured.code !== 0) {
    console.error(configured.stderr || configured.stdout);
    process.exit(configured.code ?? 1);
  }
  const status = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "status",
    "--did",
    `${did}#default`
  ], env);
  if (status.code !== 0 || !JSON.parse(status.stdout).configured) {
    console.error(status.stderr || status.stdout);
    process.exit(status.code ?? 1);
  }

  const result = await run(process.execPath, [
    "bin/nmail.mjs",
    "auth",
    "login",
    "--relay",
    relay,
    "--did",
    `${did}#default`,
    "--code",
    "123-456",
    "--nonce",
    "nonce-smoke"
  ], env);

  if (result.code !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.code ?? 1);
  }
  if (!verified) {
    console.error("CLI request was not verified by the smoke relay");
    process.exit(1);
  }
} finally {
  server.close();
  await rm(tmp, { recursive: true, force: true });
}

async function run(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code] = await once(child, "exit");
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8")
  };
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

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}
