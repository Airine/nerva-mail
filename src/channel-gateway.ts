import type { ChannelEgressRequest, ChannelEgressResult, Env } from "./types";

export class QueuedChannelGateway {
  async queueEgress(request: ChannelEgressRequest): Promise<ChannelEgressResult> {
    return {
      recipientDid: request.recipientDid,
      transport: request.identity.transport,
      externalId: request.identity.externalId,
      status: "queued"
    };
  }
}

export function isAllowedChannelGateway(env: Env, did: string): boolean {
  return channelGatewayDids(env).has(did);
}

export function channelGatewayDids(env: Env): Set<string> {
  return new Set((env.CHANNEL_GATEWAY_DIDS ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean));
}

export function channelGatewayDidFromEnvelope(body: Record<string, unknown>): string | null {
  const channel = body.channel;
  if (!isPlainObject(channel)) return null;
  return typeof channel.gatewayDid === "string" ? channel.gatewayDid : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
