#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

missing=0
for command_name in git node npm codex; do
  if command -v "$command_name" >/dev/null 2>&1; then
    printf '%-8s %s\n' "$command_name" "$(command -v "$command_name")"
  else
    printf '%-8s %s\n' "$command_name" "설치 또는 PATH 확인 필요"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

printf '\n버전\n'
printf 'git     %s\n' "$(git --version)"
printf 'node    %s\n' "$(node --version)"
printf 'npm     %s\n' "$(npm --version)"
printf 'codex   %s\n' "$(codex --version)"

printf '\n프로젝트 검사\n'
node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 20) { console.error("Node.js 20 이상이 필요합니다."); process.exit(1); }'
npm test

printf '\n환경 검사가 완료됐습니다. 다음 명령으로 Codex를 시작하십시오.\n'
printf 'npm run codex\n'
