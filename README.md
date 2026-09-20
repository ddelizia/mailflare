# mailflare

An Ink + TypeScript CLI/TUI for managing Cloudflare Email Routing setups.

## Requirements

- Node.js 20+
- Wrangler authentication (`npx wrangler login`)

Wrangler OAuth is used for Cloudflare API calls after login. A scoped API token
can also be supplied explicitly:

```sh
export CLOUDFLARE_API_TOKEN=...
npx wrangler login
```

## Interactive TUI

Launch without arguments to open the Ink interface:

```sh
npm run build
node dist/index.js
```

From the dashboard:

- Press `l` to open Wrangler's Cloudflare login flow and refresh available
  accounts.
- Press `a` to select the active Cloudflare account.
- Press `s` to enter a domain and Gmail destination and create the route.
- Press `e` to view saved setups, `v` to refresh the Wrangler session, or `q` to
  quit.

Wrangler owns the OAuth credentials and opens the browser for login. Mailflare
only stores the selected account ID in its local config.

## Commands

```sh
npm install
npm run build

# Create an inbound route and save a local setup profile
node dist/index.js setup example.com you@gmail.com

# List saved setups
node dist/index.js list

# Check routing status or restore a saved route
node dist/index.js verify example.com
node dist/index.js fix example.com
```

Use `--zone-id` when a domain has more than one matching zone, and
`--account-id` when an account must be recorded explicitly. SMTP fields can be
saved with `--smtp-host`, `--smtp-port`, and `--smtp-username`.

Setup profiles are stored in `~/.mailflare/config.json` with mode `0600`. The
generated local API key is included in the setup output and is stored in that
file so a future SMTP relay command can use it.

### Scope note

Cloudflare Email Routing manages inbound forwarding and destination
verification; it is not an outbound SMTP service. Mailflare therefore creates
the Cloudflare route and records the SMTP provider profile, but an SMTP provider
is still required for sending mail. The generated key is a local Mailflare
credential, not a Cloudflare API token. Keep `CLOUDFLARE_API_TOKEN` separate and
scoped.
