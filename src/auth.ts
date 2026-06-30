import type { AgentRecord, Env, Repository, SignedIdentity } from "./types";
import { signingPayloadWithTimestamp, verifyP256Signature } from "./utils/crypto";

const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export async function requireSignedIdentity(
  request: Request,
  env: Env,
  repository: Repository,
  bodyText: string,
  now: number,
  fallbackAgent?: AgentRecord
): Promise<SignedIdentity> {
  const did = request.headers.get("X-LT-DID");
  const keyId = request.headers.get("X-LT-Key-Id");
  const timestamp = request.headers.get("X-LT-Timestamp");
  const signature = request.headers.get("X-LT-Signature");

  if (!did || !keyId || !timestamp || !signature) {
    throw new AuthError("missing_signature_headers");
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_MAX_SKEW_MS) {
    throw new AuthError("signature_timestamp_out_of_range");
  }

  const publicKeyJwk = await resolvePublicKey(did, keyId, env, repository, fallbackAgent);
  const path = new URL(request.url).pathname;
  const payload = await signingPayloadWithTimestamp(request.method, path, bodyText, timestamp);
  const valid = await verifyP256Signature(publicKeyJwk, payload, signature);
  if (!valid) {
    throw new AuthError("invalid_signature");
  }

  return { did, keyId };
}

export function requireAdmin(request: Request, env: Env): void {
  const expected = env.ADMIN_TOKEN;
  const actual = request.headers.get("Authorization");
  if (!expected || actual !== `Bearer ${expected}`) {
    throw new AuthError("admin_token_required");
  }
}

export class AuthError extends Error {
  status = 401;
}

async function resolvePublicKey(
  did: string,
  keyId: string,
  env: Env,
  repository: Repository,
  fallbackAgent?: AgentRecord
): Promise<JsonWebKey> {
  const registered = await repository.getAgent(did);
  if (registered) {
    return registered.publicKeyJwk;
  }

  if (fallbackAgent?.did === did && fallbackAgent.publicKeyJwk) {
    if (did.startsWith("did:key:") && env.ALLOW_DID_KEY_TEST_FIXTURES !== "true") {
      throw new AuthError("did_key_fixture_disabled");
    }
    return fallbackAgent.publicKeyJwk;
  }

  if (did.startsWith("did:web:")) {
    const didDocument = await resolveDidWeb(did);
    const verification = didDocument.verificationMethod?.find((method) => method.id === keyId)
      ?? didDocument.verificationMethod?.[0];
    if (verification?.publicKeyJwk) {
      return verification.publicKeyJwk;
    }
  }

  throw new AuthError("public_key_not_found");
}

interface DidWebDocument {
  verificationMethod?: Array<{ id: string; publicKeyJwk?: JsonWebKey }>;
}

async function resolveDidWeb(did: string): Promise<DidWebDocument> {
  const parts = did.replace("did:web:", "").split(":").map(decodeURIComponent);
  const host = parts.shift();
  if (!host) {
    throw new AuthError("invalid_did_web");
  }
  const path = parts.length > 0 ? `${parts.join("/")}/did.json` : ".well-known/did.json";
  const response = await fetch(`https://${host}/${path}`);
  if (!response.ok) {
    throw new AuthError("did_web_resolution_failed");
  }
  return response.json() as Promise<DidWebDocument>;
}
