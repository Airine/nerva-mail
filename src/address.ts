import { base64UrlEncode } from "./utils/crypto";

const NERVA_ADDRESS_DOMAIN = "nervafs.xyz";
const NERVA_HOSTED_DID_HOST = "mail.nervafs.xyz";
const NERVA_HOSTED_AGENT_PREFIX = `did:web:${NERVA_HOSTED_DID_HOST}:agents:`;
const NERVA_SYNTHETIC_DID_PREFIX = `did:web:${NERVA_HOSTED_DID_HOST}:ext:`;

export type ChannelTransport = "email" | "slack" | "telegram" | "feishu";

export interface SyntheticDidParts {
  did: string;
  transport: ChannelTransport;
  hash: string;
}

export interface ResolvedAddress {
  input: string;
  did: string;
  address?: string;
  kind: "did" | "nerva-address";
}

export function resolveIdentityAddress(input: string): ResolvedAddress {
  const value = input.trim();
  if (!value) {
    throw new Error("address_required");
  }
  if (value.startsWith("did:")) {
    const address = didToNervaAddress(value);
    return address
      ? { input: value, did: value, address, kind: "did" }
      : { input: value, did: value, kind: "did" };
  }

  const address = parseNervaAddress(value);
  if (!address) {
    throw new Error("unsupported_address");
  }

  return {
    input: value,
    did: `${NERVA_HOSTED_AGENT_PREFIX}${encodeURIComponent(address.local)}`,
    address: `${address.local}@${address.domain}`,
    kind: "nerva-address"
  };
}

export function didToNervaAddress(did: string): string | null {
  if (!did.startsWith(NERVA_HOSTED_AGENT_PREFIX)) return null;
  const tail = did.slice(NERVA_HOSTED_AGENT_PREFIX.length);
  if (!tail || tail.includes(":")) return null;
  return `${safeDecode(tail)}@${NERVA_ADDRESS_DOMAIN}`;
}

export async function createSyntheticDid(transport: ChannelTransport, externalId: string): Promise<string> {
  const normalized = normalizeExternalId(transport, externalId);
  if (!normalized) {
    throw new Error("external_id_required");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${transport}:${normalized}`));
  return `${NERVA_SYNTHETIC_DID_PREFIX}${transport}:${base64UrlEncode(new Uint8Array(digest))}`;
}

export function parseSyntheticDid(did: string): SyntheticDidParts | null {
  if (!did.startsWith(NERVA_SYNTHETIC_DID_PREFIX)) return null;
  const tail = did.slice(NERVA_SYNTHETIC_DID_PREFIX.length);
  const [transport, hash, ...rest] = tail.split(":");
  if (rest.length || !isChannelTransport(transport) || !hash || !/^[A-Za-z0-9_-]+$/.test(hash)) {
    return null;
  }
  return { did, transport, hash };
}

export function isSyntheticDid(did: string): boolean {
  return Boolean(parseSyntheticDid(did));
}

export function normalizeExternalId(transport: ChannelTransport, externalId: string): string {
  const value = externalId.trim();
  if (transport === "email") {
    return value.toLowerCase();
  }
  return value;
}

export function isNervaAddress(input: string): boolean {
  return Boolean(parseNervaAddress(input.trim()));
}

function parseNervaAddress(value: string): { local: string; domain: string } | null {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (domain !== NERVA_ADDRESS_DOMAIN) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(local)) return null;
  return { local, domain };
}

function isChannelTransport(value: string | undefined): value is ChannelTransport {
  return value === "email" || value === "slack" || value === "telegram" || value === "feishu";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
