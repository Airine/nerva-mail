import { AwsClient } from "aws4fetch";
import type { BlobGateway, BlobUrlRequest, BlobUrlResponse, Env } from "./types";

export class DisabledBlobGateway implements BlobGateway {
  async putMessage(_key: string, _body: string): Promise<void> {
    // Message raw JSON is already persisted in D1 metadata for the no-attachment MVP.
  }

  async createUploadUrl(_request: BlobUrlRequest): Promise<BlobUrlResponse> {
    throw new Error("blob_uploads_disabled");
  }

  async createDownloadUrl(_key: string): Promise<BlobUrlResponse> {
    throw new Error("blob_uploads_disabled");
  }
}

export class R2BlobGateway implements BlobGateway {
  constructor(private readonly env: Env) {}

  async putMessage(key: string, body: string): Promise<void> {
    if (!this.env.BLOBS) {
      throw new Error("r2_binding_required");
    }
    await this.env.BLOBS.put(key, body, {
      httpMetadata: { contentType: "application/nmail+json" }
    });
  }

  async createUploadUrl(request: BlobUrlRequest): Promise<BlobUrlResponse> {
    const key = keyForCid(request.cid);
    return this.presign("PUT", key, request.expiresIn ?? 3600);
  }

  async createDownloadUrl(key: string): Promise<BlobUrlResponse> {
    return this.presign("GET", key, 3600);
  }

  private async presign(method: "PUT" | "GET", key: string, expiresIn: number): Promise<BlobUrlResponse> {
    const accountId = required(this.env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
    const bucket = this.env.R2_BUCKET_NAME ?? "nerva-mail-blobs";
    const signer = new AwsClient({
      accessKeyId: required(this.env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
      secretAccessKey: required(this.env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
      service: "s3",
      region: "auto"
    });
    const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`);
    url.searchParams.set("X-Amz-Expires", String(expiresIn));
    const signed = await signer.sign(new Request(url, { method }), { aws: { signQuery: true } });
    return { method, key, url: signed.url, expiresIn };
  }
}

export function keyForCid(cid: string): string {
  return `sha256/${cid.replace(/^sha256:/, "").replaceAll(":", "/")}`;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name}_required`);
  }
  return value;
}
