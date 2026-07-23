#!/usr/bin/env bash
# Anchor Lines — one-shot setup + run script.
#
# Installs nvm (if missing), installs/uses Node.js 20, installs npm
# dependencies, sets up .env.local, and starts the dev server.
#
# Usage:
#   ./run.sh          # setup + start dev server (http://localhost:3000)
#   ./run.sh --setup  # setup only, don't start the dev server

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Anchor Lines setup"

# 1. nvm (Node Version Manager)
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "==> Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

# 2. Node.js 20
echo "==> Ensuring Node.js 20..."
nvm install 20 >/dev/null
nvm use 20 >/dev/null
echo "    node $(node --version) / npm $(npm --version)"

# 3. Dependencies
echo "==> Installing npm dependencies..."
npm install

# 4. Environment file (optional — only needed for live, non-sample letters)
if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "==> Created .env.local from .env.example"
  echo "    (optional — only required if you want to analyze a real letter;"
  echo "     add your ANTHROPIC_API_KEY there. Sample letters need no key.)"
fi

echo "==> Setup complete."

if [ "${1:-}" = "--setup" ]; then
  exit 0
fi

echo "==> Starting dev server: http://localhost:3000"
echo "    No API key needed — choose 'Try sample letters' to test the full flow."
npm run dev
