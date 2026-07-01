# Email Channel Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an email-first Channel Gateway path that maps external humans to synthetic DIDs, preserves signed Nerva envelopes, and routes replies to email egress.

**Architecture:** Keep the existing `/v0/messages` flow as the canonical message path. Add channel identity, thread, and binding repository records; add a small gateway service that resolves identities and queues egress; allow synthetic `:ext:` senders only when the request is signed by an allowlisted gateway DID.

**Tech Stack:** TypeScript Cloudflare Worker, D1 migrations, Durable Objects for native mailboxes, Vitest.

---

### Task 1: Synthetic DID address primitives

**Files:**
- Modify: `src/address.ts`
- Test: `tests/phase1-flow.test.ts`

**Step 1: Write the failing test**

Add a test that calls the public address resolver for:

- `did:web:mail.nervafs.xyz:ext:email:<hash>`
- `alice@example.com` through the new channel identity resolver path later

For direct primitives, import and assert:

```ts
expect(createSyntheticDid("email", "alice@example.com")).toMatch(/^did:web:mail\.nervafs\.xyz:ext:email:/);
expect(parseSyntheticDid(did)).toEqual({ transport: "email", hash: expect.any(String) });
expect(isSyntheticDid(did)).toBe(true);
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "synthetic"`
Expected: FAIL because the functions do not exist.

**Step 3: Implement primitives**

Add exported helpers:

- `createSyntheticDid(transport, externalId)`
- `parseSyntheticDid(did)`
- `isSyntheticDid(did)`
- `normalizeExternalId(transport, externalId)`

Use SHA-256 plus base64url for stable opaque hashes. Support `email`, `slack`, `telegram`, and `feishu`.

**Step 4: Run test**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "synthetic"`
Expected: PASS.

### Task 2: Channel storage model

**Files:**
- Create: `migrations/0003_channel_bridge.sql`
- Modify: `src/storage/schema.ts`
- Modify: `src/types.ts`
- Modify: `src/repository.ts`
- Modify: `tests/support/test-env.ts`
- Test: `tests/phase1-flow.test.ts`

**Step 1: Write failing repository tests**

Assert that channel identities can be upserted and fetched by synthetic DID and by `(transport, external_id)`, that bindings are scoped to `ownerDid`, and that channel thread rows can be upserted.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "channel repository"`
Expected: FAIL because repository methods do not exist.

**Step 3: Implement storage**

Add repository interfaces and D1/memory implementations for:

- `upsertChannelIdentity`
- `getChannelIdentityBySyntheticDid`
- `getChannelIdentityByExternalId`
- `listChannelIdentitiesForOwner`
- `upsertChannelThread`
- `getChannelThreadByExternal`
- `getChannelThreadByNmailThread`
- `createChannelBinding`
- `listChannelBindings`
- `deleteChannelBinding`

**Step 4: Run test**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "channel repository"`
Expected: PASS.

### Task 3: Gateway trust and inbound envelope creation

**Files:**
- Create: `src/channel-gateway.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`
- Test: `tests/phase1-flow.test.ts`

**Step 1: Write failing tests**

Cover:

- A normal agent cannot send `from = :ext:` and gets `403 synthetic_sender_forbidden`.
- An allowlisted gateway DID can send `from = :ext:` and the resulting mailbox message hydrates `raw.channel`.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "gateway"`
Expected: FAIL because trust checks are missing.

**Step 3: Implement trust checks**

Add `CHANNEL_GATEWAY_DIDS` env parsing. In `sendMessage`, allow `from !== signer` only when `from` is synthetic, `signer` is allowlisted, and `raw.channel.gatewayDid === signer`.

**Step 4: Run test**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "gateway"`
Expected: PASS.

### Task 4: UI channel endpoints

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types.ts`
- Test: `tests/phase1-flow.test.ts`

**Step 1: Write failing tests**

Cover:

- `GET /v0/ui/channels` returns bindings and identities for the logged-in DID.
- `POST /v0/ui/channels/identities/resolve` returns a synthetic DID for an email address.
- `POST /v0/ui/channels/bindings` creates an owner-scoped binding.
- `DELETE /v0/ui/channels/bindings/:id` deletes only the current owner's binding.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "UI channel"`
Expected: FAIL because routes are missing.

**Step 3: Implement routes**

Add UI routes under `handleUiRoute`. Require session for all routes. Never accept arbitrary mailbox ownership; use `session.did` as `ownerDid`.

**Step 4: Run test**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "UI channel"`
Expected: PASS.

### Task 5: Outbound synthetic recipient egress

**Files:**
- Modify: `src/channel-gateway.ts`
- Modify: `src/index.ts`
- Modify: `src/types.ts`
- Test: `tests/phase1-flow.test.ts`

**Step 1: Write failing test**

Send a UI message to a resolved email synthetic DID. Assert the message response has `egress[]`, no native delivery for that synthetic DID, and the in-memory channel gateway recorded the queued email egress.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "egress"`
Expected: FAIL because all recipients are currently enqueued to mailbox DOs.

**Step 3: Implement egress split**

After message persistence, route synthetic recipients to `services.channelGateway.queueEgress` and native recipients to the existing mailbox enqueue path. Return both `deliveries[]` and `egress[]`.

**Step 4: Run test**

Run: `pnpm vitest run tests/phase1-flow.test.ts -t "egress"`
Expected: PASS.

### Task 6: Full verification

**Files:**
- No new files

**Step 1: Run complete verification**

Run: `pnpm check`
Expected: all tests, CLI smoke, and typecheck pass.

**Step 2: Inspect dirty worktree**

Run: `git status --short`
Expected: backend files and docs only, plus unrelated `src/ui-app.ts` from the Console work.
