#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ -f "$HOME/.zprofile" ]]; then
  source "$HOME/.zprofile"
fi

npm run doctor
npm run codex
