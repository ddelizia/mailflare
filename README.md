# mailflare

An Ink + TypeScript CLI/TUI for managing Cloudflare Email Routing and
Cloudflare's outbound SMTP relay.

## Requirements

- Node.js 20+
- A Cloudflare account with the domain added as a zone
- Wrangler authentication (`npx wrangler login`, or use `mailflare login`)

Wrangler owns the OAuth login flow; mailflare only stores the selected
account ID locally. A scoped API token can also be supplied explicitly:

```sh
export CLOUDFLARE_API_TOKEN=...
```

## Installation

Download a prebuilt binary. It installs to `~/.local/bin` by default, so no
`sudo` is needed:

```sh
curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash
```

Add `~/.local/bin` to your `PATH` if the script tells you it isn't there
already. Set `MAILFLARE_INSTALL_DIR` to install elsewhere instead (`sudo` is
only used if that directory isn't writable).

To remove it:

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
mailflare route create <domain> <dest> # Create an inbound route + outbound SMTP token
mailflare route list                   # List email routing rules for the active account
mailflare smtp list                    # List mailflare-issued SMTP tokens
mailflare help                         # Show this message
```

From the TUI menu you can log in, pick an account, create a route, and list
existing routes or SMTP credentials.

`mailflare route create` prints the outbound SMTP credential Cloudflare
issues for the domain (host, port, username, password). The password is
shown once and saved to `~/.mailflare/config.json` (mode `0600`) — Cloudflare
never returns it again.

### Scope note

Cloudflare Email Routing manages inbound forwarding and destination
verification; it is not an outbound SMTP service. Mailflare creates the
Cloudflare route and mints an SMTP token, but the domain must also be
onboarded for Email Sending in the Cloudflare dashboard (Compute > Email
Service > Email Sending) — there is no API for that step yet.

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
