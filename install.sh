#!/usr/bin/env bash
# Install the latest mailflare release binary.
#   curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash
set -euo pipefail

REPO="ddelizia/mailflare"
BIN_NAME="mailflare"
INSTALL_DIR="${MAILFLARE_INSTALL_DIR:-/usr/local/bin}"

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

if [ -w "$INSTALL_DIR" ]; then
  mv "$tmp_file" "$INSTALL_DIR/$BIN_NAME"
else
  echo "Installing to $INSTALL_DIR requires sudo..."
  sudo mv "$tmp_file" "$INSTALL_DIR/$BIN_NAME"
fi
trap - EXIT

echo "Installed $BIN_NAME to $INSTALL_DIR/$BIN_NAME"
echo "Run '${BIN_NAME}' to get started."
