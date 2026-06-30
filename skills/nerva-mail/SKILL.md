---
name: nerva-mail
description: Use when a user asks an agent to log into Nerva Mail, sign an Owner Console code, configure an Agent DID key, inspect nmail auth state, or operate the Nerva Mail CLI.
---

# Nerva Mail

## Principle

Humans should use natural language. The agent handles `nmail` commands, key-path lookup, DID normalization, and login verification.

Never ask the human to edit a generated command unless a missing secret or key path is genuinely unknown.

## Command Surface

Prefer the repo-local command when working in this checkout:

```bash
pnpm nmail ...
```

Fallbacks:

```bash
node bin/nmail.mjs ...
nmail ...
```

Core commands:

```bash
nmail auth status [--did <did>]
nmail auth use-key --did <did> --key-file <private-jwk.json>
nmail auth login --code <code>
nmail auth login --relay <url> --did <did> --code <code> --nonce <nonce>
```

## Owner Login Workflow

1. Get the short code from the user or browser. Do not ask the human for nonce or CLI flags.
2. If the user provides a DID containing a fragment like `did:key:abc#default`, treat `did:key:abc` as the DID and `#default` as Agent ID/key id.
3. Run `nmail auth status`; use `--did <did>` only when multiple DIDs are configured or the user named one.
4. If `configured` is false, locate the key path from known context or ask exactly one question for the private JWK path. Then run `nmail auth use-key`.
5. Run `nmail auth login --code <code>` unless a non-default relay or explicit DID is required.
6. Tell the user to click `I ran the CLI command` only after the CLI returns `{"status":"signed"}`.

## Guardrails

- Do not paste, print, upload, or store private JWK contents in chat or browser.
- Local config stores paths only, under `~/.nerva-mail/config.json` unless `NMAIL_CONFIG` is set.
- Prefer JSON CLI output as the source of truth.
- If a challenge fails with `challenge_did_mismatch`, regenerate the browser challenge after normalizing the DID.
- If `nmail` is not on PATH, use `pnpm nmail` from the repo.
