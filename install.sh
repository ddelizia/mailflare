#!/usr/bin/env bash
# Install (or uninstall) the latest mailflare release binary.
#   curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash -s -- --uninstall
set -euo pipefail

REPO="ddelizia/mailflare"
BIN_NAME="mailflare"
INSTALL_DIR="${MAILFLARE_INSTALL_DIR:-$HOME/.local/bin}"

action="install"
if [ "${1:-}" = "--uninstall" ]; then
  action="uninstall"
fi

target="$INSTALL_DIR/$BIN_NAME"

if [ "$action" = "uninstall" ]; then
  if [ -w "$INSTALL_DIR" ] || [ ! -e "$target" ]; then
    rm -f "$target"
  else
    echo "Removing $target requires sudo..."
    sudo rm -f "$target"
  fi
  echo "Removed $target"
  exit 0
fi

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *) echo "Unsupported OS: $os" >&2; exit 1 ;;
esac

case "$arch" in
  x86_64|amd64) platform_arch="x64" ;;
  arm64|aarch64) platform_arch="arm64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac

asset="${BIN_NAME}-${platform}-${platform_arch}"
url="https://github.com/${REPO}/releases/latest/download/${asset}"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

echo "Downloading ${asset}..."
curl -fsSL "$url" -o "$tmp_file"
chmod +x "$tmp_file"

mkdir -p "$INSTALL_DIR"
if [ -w "$INSTALL_DIR" ]; then
  mv "$tmp_file" "$target"
else
  echo "Installing to $INSTALL_DIR requires sudo..."
  sudo mv "$tmp_file" "$target"
fi
trap - EXIT

echo "Installed $BIN_NAME to $target"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) echo "Run '${BIN_NAME}' to get started." ;;
  *)
    echo "$INSTALL_DIR is not on your PATH. Add it, e.g.:"
    echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc"
    ;;
esac
