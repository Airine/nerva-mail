export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function messageIdFor(value: unknown): Promise<string> {
  return `sha256:${await sha256Hex(stableJson(value))}`;
}

export async function signingPayload(method: string, path: string, bodyText: string): Promise<string> {
  return `${method.toUpperCase()}\n${path}\n${await sha256Hex(bodyText)}\n`;
}

export async function signingPayloadWithTimestamp(method: string, path: string, bodyText: string, timestamp: string): Promise<string> {
  return `${method.toUpperCase()}\n${path}\n${await sha256Hex(bodyText)}\n${timestamp}`;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function verifyP256Signature(publicKeyJwk: JsonWebKey, payload: string, signature: string): Promise<boolean> {
  const signatureBytes = base64UrlDecode(signature);
  const signatureBuffer = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signatureBuffer,
    new TextEncoder().encode(payload)
  );
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, sortValue(record[key])])
    );
  }
  return value;
}
