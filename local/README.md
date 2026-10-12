# 로컬 launchd 실행

GitHub Actions가 계정 단위로 비활성화된 동안(2026-09-24~) 맥의 launchd가 예약 실행을 대신한다.
workflow와 같은 주기(매시 17분, 47분)로 `local/run.sh`를 실행하며, 상태 파일은 저장소 밖에 둔다.

## 설치
1. `cp .env.local.example .env.local` 후 값을 채운다. (.env.local은 git에서 무시됨)
2. `local/install.sh` 실행. `data/state.json`을 `~/Library/Application Support/sentinel-o-car/state.json`으로 한 번 복사하고 에이전트를 등록한다.
3. 확인: `launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car`

## 해제
`local/uninstall.sh` (상태 파일과 로그는 유지)

## 로그
- `~/Library/Logs/sentinel-o-car/YYYY-MM-DD.log`: 실행 단계와 종료 코드
- `~/Library/Logs/sentinel-o-car/launchd.log`: run.sh 시작 전 오류

## 수동 실행
```bash
local/run.sh                 # normal
local/run.sh telegram_test   # Telegram 연결 확인
local/run.sh send_current    # 현재 매물 전송
```
출력은 터미널이 아니라 위 로그 파일에 기록된다.

## 주의
- 맥이 잠자기 상태면 launchd 예약은 실행되지 않는다. 전원 연결 시 잠자기 방지(시스템 설정 > 배터리 > 옵션)를 사용자가 직접 설정한다.
- 상태 파일은 저장소에 commit하지 않는다. `data/state.json`은 Actions 시절 기록으로 그대로 둔다.
- 자기호스팅 러너 서비스(actions.runner.*)는 건드리지 않는다.

## Actions 복구 시 되돌리기
1. `local/uninstall.sh`로 에이전트 해제 (이중 실행 방지)
2. 로컬 상태를 이어받으려면 `~/Library/Application Support/sentinel-o-car/state.json`을 `data/state.json`에 복사해 commit
3. `.github/workflows/sentinel-o-car.yml`의 `schedule` 주석 해제 후 commit
