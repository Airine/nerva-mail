import { didToNervaAddress } from "./address";
import type { ChannelReadiness, ChannelEgressRequest, ChannelEgressResult, Env, Repository } from "./types";

export class ChannelEgressError extends Error {
  constructor(message: string, readonly status: number, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

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

export class CloudflareEmailChannelGateway {
  constructor(private readonly env: Env) {}

  async queueEgress(request: ChannelEgressRequest): Promise<ChannelEgressResult> {
    if (request.identity.transport !== "email") {
      throw new ChannelEgressError("channel_egress_not_implemented", 501, { transport: request.identity.transport });
    }
    if (!emailOutboundReady(this.env)) {
      throw new ChannelEgressError("channel_egress_unconfigured", 503, { transport: "email" });
    }

    const from = didToNervaAddress(request.senderDid);
    if (!from) {
      throw new ChannelEgressError("channel_sender_address_required", 400, { senderDid: request.senderDid });
    }

    try {
      const result = await this.env.EMAIL!.send({
        from,
        to: request.identity.externalId,
        subject: emailSubject(request.raw),
        text: emailText(request.raw),
        headers: {
          "X-Nerva-Message-ID": request.messageId
        }
      });
      return {
        recipientDid: request.recipientDid,
        transport: request.identity.transport,
        externalId: request.identity.externalId,
        status: "sent",
        providerMessageId: result.messageId
      };
    } catch (error) {
      const details = error instanceof Error
        ? { message: error.message, code: (error as { code?: unknown }).code }
        : {};
      throw new ChannelEgressError("channel_egress_failed", 502, details);
    }
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
        outbound: emailOutboundReady(env) ? "live" : "unconfigured"
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

export function emailOutboundReady(env: Env): boolean {
  return env.CHANNEL_EMAIL_OUTBOUND_PROVIDER === "cloudflare"
    && env.CHANNEL_EMAIL_DNS_READY === "true"
    && Boolean(env.EMAIL);
}

function emailSubject(raw: Record<string, unknown>): string {
  if (typeof raw.subject === "string" && raw.subject.trim()) return raw.subject.trim();
  const body = isPlainObject(raw.body) ? raw.body : {};
  if (typeof body.goal === "string" && body.goal.trim()) return body.goal.trim().slice(0, 140);
  if (typeof body.objective === "string" && body.objective.trim()) return body.objective.trim().slice(0, 140);
  return "Nerva Mail message";
}

function emailText(raw: Record<string, unknown>): string {
  const body = isPlainObject(raw.body) ? raw.body : {};
  if (typeof body.humanRequest === "string" && body.humanRequest.trim()) return body.humanRequest.trim();
  if (typeof body.goal === "string" && body.goal.trim()) return body.goal.trim();
  if (typeof body.objective === "string" && body.objective.trim()) return body.objective.trim();
  return JSON.stringify(body, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
