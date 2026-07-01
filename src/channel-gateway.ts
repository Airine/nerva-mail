import type { ChannelReadiness, ChannelEgressRequest, ChannelEgressResult, Env, Repository } from "./types";

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

export async function channelReadiness(env: Env, repository: Repository): Promise<ChannelReadiness> {
  const configuredGatewayDids = channelGatewayDids(env);
  const gatewayConfigured = await hasRegisteredGateway(configuredGatewayDids, repository);
  const emailInbound = gatewayConfigured && env.CHANNEL_EMAIL_INBOUND_ENABLED === "true"
    ? "live"
    : "unconfigured";

  return {
    gatewayConfigured,
    transports: {
      email: {
        inbound: emailInbound,
        outbound: "not_implemented"
      },
      slack: {
        inbound: "not_implemented",
        outbound: "not_implemented"
      },
      telegram: {
        inbound: "not_implemented",
        outbound: "not_implemented"
      },
      feishu: {
        inbound: "not_implemented",
        outbound: "not_implemented"
      }
    }
  };
}

async function hasRegisteredGateway(gatewayDids: Set<string>, repository: Repository): Promise<boolean> {
  for (const did of gatewayDids) {
    if (await repository.getAgent(did)) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
