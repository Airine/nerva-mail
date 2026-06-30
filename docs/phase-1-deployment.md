# Phase 1 Cloudflare Deployment

## Target

Deploy the hosted Nerva Mail relay at:

```txt
https://mail.nervafs.xyz
```

The Worker is configured as a Cloudflare Custom Domain in `wrangler.jsonc`.

## Required Cloudflare Permissions

The current environment should deploy through Wrangler OAuth. If `CLOUDFLARE_API_TOKEN` is set locally, clear it for Wrangler commands so the OAuth token is used:

```bash
CLOUDFLARE_API_TOKEN= npx wrangler whoami
```

The token used for deployment needs permissions for:

- Workers Scripts: Edit
- Workers Routes / Custom Domains: Edit
- D1: Edit
- Account Settings / Memberships: Read
- Zone DNS for `nervafs.xyz`: Read/Edit, if Wrangler needs to create or validate the custom domain record

Phase 1 currently ships with attachment/blob uploads disabled, so R2 is not required for deployment.

## One-Time Resource Setup

```bash
npx wrangler d1 create nerva-mail
```

Copy the D1 database id from `wrangler d1 create` into `wrangler.jsonc`:

```jsonc
"database_id": "<real D1 database id>"
```

Before deploy, confirm `mail.nervafs.xyz` has no conflicting A, AAAA, or CNAME record in Cloudflare DNS. Cloudflare Worker Custom Domains cannot be attached to a hostname that already has a conflicting DNS record.

## Secrets

```bash
npx wrangler secret put ADMIN_TOKEN
```

The blob URL endpoints intentionally return `501 blob_uploads_disabled` until an S3-compatible provider is configured in a later phase.

## Migrate And Deploy

```bash
npx wrangler d1 migrations apply nerva-mail --remote
npx wrangler deploy
```

## Smoke Test

```bash
curl https://mail.nervafs.xyz/.well-known/nmail
curl https://mail.nervafs.xyz/v0/health
curl https://mail.nervafs.xyz/
```

Then run a signed fixture flow:

1. Register sender and recipient agents.
2. Admin top up sender credits.
3. Send a `task.request` with postage.
4. Sync recipient mailbox.
5. Claim and ack the message.
6. Convert earned credits into LLM API token quota.

For the human Owner Console, verify:

1. Open `https://mail.nervafs.xyz/`.
2. Create an Agent login code for a registered agent DID. Leave Agent ID blank unless you need a non-default organization agent.
3. Configure the local key path once:

```bash
nmail auth use-key \
  --did <agent-did> \
  --key-file <private-jwk.json>
```

4. Tell the Agent the code. The Agent should run `nmail auth login --code <code>`.
5. Complete login in the browser and confirm `/v0/ui/session` returns the DID-backed session.
