#!/usr/bin/env bash
# Install (or uninstall) the latest mailflare release binary.
#   curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ddelizia/mailflare/main/install.sh | bash -s -- --uninstall
#
# Env: MAILFLARE_INSTALL_DIR (default: ~/.local/bin)
set -euo pipefail

REPO="ddelizia/mailflare"
BIN_NAME="mailflare"
INSTALL_DIR="${MAILFLARE_INSTALL_DIR:-$HOME/.local/bin}"
PATH_MARKER="mailflare installer"

if [ -t 1 ]; then
  c_info='\033[1;34m'; c_ok='\033[1;32m'; c_warn='\033[1;33m'; c_err='\033[1;31m'; c_off='\033[0m'
else
  c_info=''; c_ok=''; c_warn=''; c_err=''; c_off=''
fi
info()  { printf "${c_info}==>${c_off} %s\n" "$1"; }
ok()    { printf "${c_ok}==>${c_off} %s\n" "$1"; }
warn()  { printf "${c_warn}==>${c_off} %s\n" "$1" >&2; }
fail()  { printf "${c_err}Error:${c_off} %s\n" "$1" >&2; exit 1; }

action="install"
if [ "${1:-}" = "--uninstall" ]; then
  action="uninstall"
fi

target="$INSTALL_DIR/$BIN_NAME"

path_has_dir() { case ":$PATH:" in *":$1:"*) return 0 ;; *) return 1 ;; esac; }

rc_file_for_shell() {
  case "$(basename "${SHELL:-}")" in
    zsh) echo "$HOME/.zshrc" ;;
    bash) echo "$HOME/.bashrc" ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    *) echo "" ;;
  esac
}

add_to_path_rc() {
  local rc; rc="$(rc_file_for_shell)"
  [ -n "$rc" ] || return 0
  grep -qs "$PATH_MARKER" "$rc" 2>/dev/null && return 0
  mkdir -p "$(dirname "$rc")"
  if [ "$(basename "$rc")" = "config.fish" ]; then
    printf '\n# >>> %s >>>\nfish_add_path %s\n# <<< %s <<<\n' "$PATH_MARKER" "$INSTALL_DIR" "$PATH_MARKER" >> "$rc"
  else
    printf '\n# >>> %s >>>\nexport PATH="%s:$PATH"\n# <<< %s <<<\n' "$PATH_MARKER" "$INSTALL_DIR" "$PATH_MARKER" >> "$rc"
  fi
  info "Added $INSTALL_DIR to PATH in $rc (restart your shell, or run: source $rc)"
}

remove_from_path_rc() {
  local rc; rc="$(rc_file_for_shell)"
  [ -n "$rc" ] && [ -f "$rc" ] || return 0
  grep -qs "$PATH_MARKER" "$rc" 2>/dev/null || return 0
  local tmp="$rc.tmp.$$"
  awk -v marker="$PATH_MARKER" '
    index($0, "# >>> " marker " >>>") { skip=1; next }
    index($0, "# <<< " marker " <<<") { skip=0; next }
    !skip { print }
  ' "$rc" > "$tmp" && mv "$tmp" "$rc"
  info "Removed $INSTALL_DIR from PATH in $rc"
}

if [ "$action" = "uninstall" ]; then
  if [ ! -e "$target" ]; then
    warn "$target not found, nothing to remove."
  elif [ -w "$INSTALL_DIR" ]; then
    rm -f "$target"
  else
    warn "Removing $target requires sudo..."
    sudo rm -f "$target"
  fi
  remove_from_path_rc
  ok "Uninstalled $BIN_NAME."
  exit 0
fi

info "Detecting platform..."
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *) fail "Unsupported OS: $os" ;;
esac

case "$arch" in
  x86_64|amd64) platform_arch="x64" ;;
  arm64|aarch64) platform_arch="arm64" ;;
  *) fail "Unsupported architecture: $arch" ;;
esac
echo "    $platform/$platform_arch"

asset="${BIN_NAME}-${platform}-${platform_arch}"
url="https://github.com/${REPO}/releases/latest/download/${asset}"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

info "Downloading ${asset}..."
curl -fsSL "$url" -o "$tmp_file" || fail "download failed from $url"
chmod +x "$tmp_file"

info "Verifying binary..."
"$tmp_file" --help >/dev/null 2>&1 || fail "downloaded binary failed to run"

info "Installing to $target..."
mkdir -p "$INSTALL_DIR"
if [ -w "$INSTALL_DIR" ]; then
  mv "$tmp_file" "$target"
else
  warn "$INSTALL_DIR requires sudo..."
  sudo mv "$tmp_file" "$target"
fi
trap - EXIT

ok "Installed $BIN_NAME to $target"

if path_has_dir "$INSTALL_DIR"; then
  echo ""
  ok "Run '${BIN_NAME}' to get started."
else
  add_to_path_rc
  echo ""
  ok "Installed. Restart your shell, then run '${BIN_NAME}' to get started."
fi
