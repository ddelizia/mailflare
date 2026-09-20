# mailflare

An Ink + TypeScript CLI/TUI for managing Cloudflare Email Routing and
Cloudflare's outbound SMTP relay.

## Requirements

- Node.js 20+
- A Cloudflare account with the domain added as a zone
- Wrangler authentication (`npx wrangler login`, or use `mailflare login`)

Wrangler owns the OAuth login flow; mailflare only stores the selected
account ID locally. That OAuth session covers zones and email routing, but
Cloudflare does not let it manage API tokens — creating or listing SMTP
tokens needs a real API token exported explicitly. Use `MAILFLARE_CF_API_TOKEN`,
not `CLOUDFLARE_API_TOKEN` — the latter is also read by the `wrangler` CLI
itself and would override your OAuth login for every Wrangler command:

```sh
export MAILFLARE_CF_API_TOKEN=...
```

Create it at https://dash.cloudflare.com/profile/api-tokens with the "User >
API Tokens > Edit" permission.

## Installation

Download a prebuilt binary. It installs to `~/.local/bin` by default (no
`sudo`), verifies the binary runs, and adds that directory to your `PATH`
(via `~/.zshrc`, `~/.bashrc`, or fish config) if it isn't there already:

```sh
curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash
```

Set `MAILFLARE_INSTALL_DIR` to install elsewhere instead (`sudo` is only
used if that directory isn't writable).

To remove it (also undoes the `PATH` change the installer made):

```sh
curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash -s -- --uninstall
```

Or build from source (see [Contributing](#contributing)).

## Usage

Run `mailflare` with no arguments to open the interactive TUI, or use it as
a CLI:

```sh
mailflare login                        # Log in with Wrangler
mailflare accounts                     # List Cloudflare accounts for the logged-in user
mailflare accounts use <account-id>    # Set the active Cloudflare account
mailflare route create <email|domain> <dest> # Create an inbound route
mailflare route list                   # List email routing rules for the active account
mailflare route enable <rule-id>       # Enable a routing rule
mailflare route disable <rule-id>      # Disable a routing rule
mailflare route update <rule-id> <dest> # Change a routing rule's destination
mailflare route delete <rule-id>       # Delete a routing rule
mailflare smtp create                  # Mint the account's outbound SMTP token (once per account)
mailflare smtp show                    # Show the SMTP token saved for the active account
mailflare smtp list                    # List mailflare-issued SMTP tokens
mailflare smtp delete <token-id>       # Delete an SMTP token
mailflare help                         # Show this message
```

Pass a full email address to route only that address, or a bare domain for a
catch-all (`*@domain`).

### TUI dashboard

Running `mailflare` with no arguments opens a full-screen dashboard: a
status bar (active account, Wrangler login state, SMTP token state), a
sidebar for navigation with numbered quick-access shortcuts (`1`-`5`, `Q` to
quit), and a main panel for the active screen. Selecting an existing route
from **List email routes** opens actions to enable/disable it, change its
destination, or delete it. The **Outbound SMTP token** screen can also
delete any mailflare-issued token. Press `Esc` to go back a screen.

### Scope note

Cloudflare Email Routing manages inbound forwarding and destination
verification; it is not an outbound SMTP service. Mailflare creates the
Cloudflare route, but the domain must also be onboarded for Email Sending in
the Cloudflare dashboard (Compute > Email Service > Email Sending) — there is
no API for that step yet.

Cloudflare's Email Sending permission is account-wide — a token can't be
scoped to a single address — so mailflare mints **one SMTP token per
account** with `mailflare smtp create`, independent of any route. Run it once
after adding your first route; every route on that account then shares the
same credential. The password is shown once and saved to
`~/.mailflare/config.json` (mode `0600`) — Cloudflare never returns it again,
but `mailflare smtp show` reprints it from that local copy.

## Contributing

This project uses [pnpm](https://pnpm.io) — not npm or yarn.

```sh
git clone git@github.com:ddelizia/mailflare.git
cd mailflare
pnpm install

pnpm dev            # run the CLI/TUI from source with tsx
pnpm build          # compile to dist/
pnpm typecheck      # type-check without emitting
```

Please open an issue or pull request on GitHub. Keep changes focused and
match the existing code style.

## License

MIT — see [LICENSE](LICENSE).
