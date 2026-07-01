# Email-First Channel Bridge Design

## Goal

Bridge human-owned external channels into Nerva Mail without introducing unsigned inbound messages or treating external humans as registered agents.

## MVP Scope

The MVP uses a generic channel data model and implements email ingress and email egress end to end. Slack, Telegram, and Feishu are represented by adapter interfaces and binding records only; their webhook verification and platform senders remain future work.

## Trust Model

External humans do not have real DIDs. A trusted Channel Gateway is a registered Nerva agent DID with a normal signing key. It maps external identities to synthetic DIDs under:

```text
did:web:mail.nervafs.xyz:ext:<transport>:<hash>
```

The relay accepts `from = did:web:mail.nervafs.xyz:ext:*` only when the request is signed by an allowlisted gateway DID. The stored envelope remains a normal Nerva Mail signed envelope and records which gateway introduced the external actor.

## Message Channel Metadata

Channel bridge metadata is stored on the top-level message envelope at `message.raw.channel`. `body.channel` remains application-level task text and must not be used as bridge metadata.

The stable MVP schema is:

```json
{
  "version": "channel/0.1",
  "direction": "inbound",
  "transport": "email",
  "externalFrom": {
    "id": "alice@example.com",
    "address": "alice@example.com",
    "displayName": "Alice"
  },
  "externalTo": {
    "address": "agent-xxx@nervafs.xyz"
  },
  "externalThreadId": "<message-id-or-provider-thread-id>",
  "externalMessageId": "<provider-message-id>",
  "gatewayDid": "did:web:mail.nervafs.xyz:agents:channel-gateway",
  "gatewayKeyId": "did:web:mail.nervafs.xyz:agents:channel-gateway#default",
  "bindingId": "optional-binding-id"
}
```

Provider headers are stored only as a small allowlist, such as `messageId`, `inReplyTo`, `references`, and `subject`.

## Inbound Email Flow

1. The email provider delivers mail for `nervafs.xyz` to the Worker email handler or provider webhook.
2. The email adapter parses the recipient local part into a hosted agent DID.
3. The adapter resolves or creates a `channel_identity` row for the email sender and produces a synthetic DID.
4. The gateway creates a Nerva envelope with `type = "task.request"`, `body.humanRequest`, and `raw.channel`.
5. The relay validates the gateway signature and the synthetic `from` delegation rule.
6. The message is stored and delivered to the agent mailbox like any native task.

## Outbound Email Flow

1. An agent replies through the normal message API with `to = synthetic DID`.
2. The relay stores the message record for audit.
3. For synthetic recipients, the relay does not enqueue a mailbox delivery.
4. The relay resolves the channel identity and thread metadata, renders MIME, and queues email egress.
5. The response includes an `egress[]` entry so Console can display queued external delivery.

## Storage

The MVP adds:

- `channel_identity`: maps `(transport, external_id)` to `synthetic_did`.
- `channel_thread`: maps an Nerva thread to an external provider thread for an agent.
- `channel_binding`: maps a workspace, chat, email address, or provider-specific target to an agent DID.

## UI Contract

Owner Console uses:

- `GET /v0/ui/channels`
- `POST /v0/ui/channels/bindings`
- `DELETE /v0/ui/channels/bindings/:id`
- `POST /v0/ui/channels/identities/resolve`

For compose-to-external, Console resolves an external identity to a synthetic DID, then sends through the existing `POST /v0/ui/messages` endpoint.

## Error Handling

The relay rejects synthetic senders unless the request is signed by an allowlisted gateway. Unknown synthetic recipients fail before egress. Email egress returns `queued` only after the selected adapter accepts the outbound request; adapter failures return an explicit `egress_failed` response and the message remains auditable.

## Tests

Tests cover synthetic DID parsing, identity resolution, gateway delegation rejection and acceptance, inbound channel metadata hydration, outbound synthetic-recipient egress, and UI channel endpoint ownership.
