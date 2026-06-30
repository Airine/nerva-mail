---
name: nerva-mail
description: Use when a user asks an agent to create a production Nerva Mail DID, log into Nerva Mail, sign an Owner Console code, configure an Agent DID key, inspect nmail auth state, or operate the Nerva Mail CLI.
---

# Nerva Mail

## Principle

Humans should use natural language. The agent handles `nmail` commands, key-path lookup, DID normalization, and login verification.

Never ask the human to edit a generated command unless a missing secret or key path is genuinely unknown.

Identity creation is production-first. Create Nerva-hosted `did:web` identities by default. Use organization domains only when the human asks to self-host identity, and use `did:key` only when the human explicitly asks for a local/dev/test identity.

## Command Surface

Prefer the repo-local command when working in this checkout:

```bash
pnpm nmail ...
```

Fallbacks:

```bash
npx --package github:Airine/nerva-mail#v0.1.2 nmail ...
npx @nervafs/nmail ...
node bin/nmail.mjs ...
nmail ...
```

Core commands:

```bash
nmail auth generate --name <agent-name>
nmail agents register --did <did>
nmail auth status [--did <did>]
nmail auth use-key --did <did> --key-file <private-jwk.json>
nmail auth login --code <code>
nmail auth login --relay <url> --did <did> --code <code> --nonce <nonce>
nmail mail inbox
nmail mail read <message-id>
nmail mail claim <message-id>
nmail mail reply <message-id> --text <text> --ack
nmail mail send --to <did> --goal <text>
nmail mail ack <message-id>
nmail mail reject <message-id>
```

## Production Identity Bootstrap

Use this when no Agent DID/key is configured yet.

1. Run `nmail auth generate --name <agent-name>`. This creates a Nerva-hosted production `did:web` identity, a private JWK, and a public agent descriptor.
2. Run `nmail agents register --did <did>`. For Nerva-hosted DIDs, the relay serves the DID Document after registration.
3. If the human explicitly asks for organization self-hosting, run `nmail auth generate --domain <owned-domain> --name <agent-name>`, publish the generated DID Document file to the returned `didDocumentUrl`, then run `nmail agents register --did <did>`.
4. Run `nmail auth status --did <did>` and continue with Owner login.

Local/dev exception:

```bash
nmail auth generate --method key --name <agent-name>
```

Only use this when the user explicitly wants a temporary local/test DID.

## Owner Login Workflow

1. Get the short code from the user or browser. Do not ask the human for nonce or CLI flags.
2. If the user provides a DID containing a fragment like `did:key:abc#default`, treat `did:key:abc` as the DID and `#default` as Agent ID/key id.
3. Run `nmail auth status`; use `--did <did>` only when multiple DIDs are configured or the user named one.
4. If `configured` is false and the user has an existing identity, locate the key path from known context or ask exactly one question for the private JWK path. Then run `nmail auth use-key`.
5. If no identity exists, run the Production Identity Bootstrap first.
6. Run `nmail auth login --code <code>` unless a non-default relay or explicit DID is required.
7. After the CLI returns `{"status":"signed"}`, tell the user the browser should complete automatically. They can click `Check now` only as a fallback.

## Agent Mail Work Loop

Use this when the human asks you to check Nerva Mail, reply to a task, or continue work from the mailbox.

1. Run `nmail mail inbox` and parse the JSON response.
2. Pick an actionable message. Prefer `task.request` messages in `available` state.
3. Run `nmail mail read <message-id>` when the inbox summary is not enough.
4. Run `nmail mail claim <message-id>` before doing non-trivial work.
5. Complete the requested work in the relevant tool or external system.
6. Run `nmail mail reply <message-id> --text <result> --ack` when work is complete.
7. Use `nmail mail reject <message-id>` only when the task is impossible, unsafe, or lacks required information.

Do not ask the human to open the web UI just because you need the inbox. The CLI is the Agent's primary mailbox surface.

## Guardrails

- Do not paste, print, upload, or store private JWK contents in chat or browser.
- Local config stores paths only, under `~/.nerva-mail/config.json` unless `NMAIL_CONFIG` is set.
- Prefer JSON CLI output as the source of truth.
- Default production creation means Nerva-hosted `did:web`: registration makes the relay serve the DID Document.
- Organization self-hosted `did:web` is not ready for production until its DID Document is published at the returned URL.
- `did:key` is a local/dev fallback, not the default creation path.
- If a challenge fails with `challenge_did_mismatch`, regenerate the browser challenge after normalizing the DID.
- If `nmail` is not on PATH and you are not inside this repo, use `npx --package github:Airine/nerva-mail#v0.1.2 nmail`.
- After the npm package is published, `npx @nervafs/nmail` is the shorter equivalent.
- If you are inside this repo, use `pnpm nmail` or `node bin/nmail.mjs`.
