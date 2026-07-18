#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI를 찾지 못했습니다. PATH와 설치 상태를 확인하십시오." >&2
  exit 1
fi

exec codex review --uncommitted
