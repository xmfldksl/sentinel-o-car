#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPT_FILE="$ROOT_DIR/CODEX_START_PROMPT.md"

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI를 찾지 못했습니다. PATH와 설치 상태를 확인하십시오." >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "시작 프롬프트를 찾지 못했습니다: $PROMPT_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec codex --cd "$ROOT_DIR" "$(cat "$PROMPT_FILE")"
