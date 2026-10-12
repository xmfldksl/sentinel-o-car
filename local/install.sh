#!/usr/bin/env bash
# launchd 에이전트 등록. 사용자 확인 후 실행한다.
set -euo pipefail

LABEL="com.xmfldksl.sentinel-o-car"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$REPO_DIR/local/$LABEL.plist.template"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/sentinel-o-car"
STATE_DIR="$HOME/Library/Application Support/sentinel-o-car"
STATE_FILE="$STATE_DIR/state.json"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
DOMAIN="gui/$(id -u)"

if [[ ! -f "$REPO_DIR/.env.local" ]]; then
  echo ".env.local이 없습니다. .env.local.example을 복사해 값을 채운 뒤 다시 실행하십시오." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$STATE_DIR"

# 상태 파일 이어받기: 없을 때만 저장소의 data/state.json을 한 번 복사
if [[ ! -f "$STATE_FILE" ]]; then
  cp "$REPO_DIR/data/state.json" "$STATE_FILE"
  echo "상태 파일 복사: data/state.json -> $STATE_FILE"
else
  echo "상태 파일 유지: $STATE_FILE"
fi

sed -e "s|__REPO_DIR__|$REPO_DIR|g" \
    -e "s|__NODE_BIN_DIR__|$NODE_BIN_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$TEMPLATE" > "$PLIST"
plutil -lint "$PLIST"

# 이미 등록돼 있으면 해제 후 재등록
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"

echo "등록 완료: $PLIST"
echo "확인: launchctl print $DOMAIN/$LABEL"
echo "로그: $LOG_DIR/YYYY-MM-DD.log"
