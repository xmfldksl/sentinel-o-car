#!/usr/bin/env bash
# sentinel-o-car 로컬 실행기 (launchd 또는 수동 실행용)
# GitHub Actions workflow(.github/workflows/sentinel-o-car.yml)의 단계를 같은 순서로 수행한다.
#   1) 의존성 설치(필요할 때만)  2) npm test  3) npm run scrape
# 상태 파일은 저장소 밖(STATE_PATH)에 두고, 저장소에는 commit하지 않는다.
#
# 사용법: local/run.sh [RUN_MODE]
#   RUN_MODE: normal(기본) | send_current | telegram_test
# 환경변수 재정의(테스트용): ENV_FILE, LOG_DIR, STATE_PATH
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.local}"
LOG_DIR="${LOG_DIR:-$HOME/Library/Logs/sentinel-o-car}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/opt/homebrew/bin}"
LOCAL_STATE_DEFAULT="$HOME/Library/Application Support/sentinel-o-car/state.json"
LOCK_DIR="${TMPDIR:-/tmp}/sentinel-o-car.lock"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"
exec >>"$LOG_FILE" 2>&1

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }

# 중복 실행 방지 (workflow의 concurrency 대체). 비정상 종료로 남은 lock은 수동 삭제.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "이전 실행이 진행 중이어 건너뜁니다 (lock: $LOCK_DIR)"
  exit 0
fi
# 잠금을 획득한 실행만 정리한다. 정리 중 오류가 원래 종료 코드를 바꾸지 않게 한다.
finish() {
  local status=$?
  trap - EXIT
  log "종료 코드=$status" || true
  rmdir "$LOCK_DIR" 2>/dev/null || true
  exit "$status"
}
trap finish EXIT

cd "$REPO_DIR"
export PATH="$NODE_BIN_DIR:/usr/local/bin:/usr/bin:/bin"

if [[ ! -f "$ENV_FILE" ]]; then
  log "환경 파일이 없습니다: $ENV_FILE (.env.local.example 참고)"
  exit 78
fi

# 비밀값은 환경변수로만 노출하고 로그에는 찍지 않는다. (set -x 사용 금지)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ $# -ge 1 && -n "$1" ]]; then
  export RUN_MODE="$1"
fi
export RUN_MODE="${RUN_MODE:-normal}"
export STATE_PATH="${STATE_PATH:-$LOCAL_STATE_DEFAULT}"

log "시작 RUN_MODE=$RUN_MODE STATE_PATH=$STATE_PATH node=$(command -v node) $(node --version)"

# 단계를 조건부 명령 묶음에 넣지 않아 set -e가 실패 즉시 중단하게 한다.
# 1) 의존성 설치: 현재 외부 의존성이 없어 package-lock.json이 있고 node_modules가 없을 때만 수행
if [[ -f package-lock.json && ! -d node_modules ]]; then
  log "npm ci"
  npm ci
fi

# 2) 회귀 테스트
log "npm test"
npm test

# 3) 본 실행
if [[ "$RUN_MODE" != "telegram_test" ]]; then
  mkdir -p "$(dirname "$STATE_PATH")"
  if [[ ! -f "$STATE_PATH" ]]; then
    log "상태 파일이 없습니다: $STATE_PATH (install.sh가 data/state.json을 복사합니다)"
    exit 66
  fi
fi
log "npm run scrape"
npm run scrape
