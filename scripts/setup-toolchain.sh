#!/usr/bin/env bash
# One-time build toolchain for Academic Studio on macOS.
# Installs: nvm + Node 22.22.1, rustup (for the CLI/tunnel binary).
# Assumes: git, jq, Xcode Command Line Tools, python3 already present.
set -e

echo "=== nvm + Node 22.22.1 ==="
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 22.22.1
nvm use 22.22.1
echo "node: $(node --version)  npm: $(npm --version)"

echo "=== rustup (Rust toolchain for the code CLI) ==="
if ! command -v rustup >/dev/null 2>&1 && [ ! -x "$HOME/.cargo/bin/rustup" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
rustc --version || echo "(open a new shell to get cargo on PATH)"

echo ""
echo "Toolchain ready. Next: scripts/build-macos.sh"
