# 보고: sentinel-o-car 맥 launchd 내재화

작성자: claudecode
날짜: 2026-10-13
대상: ai/notes/2026-10-12-claude-handoff-local-launchd.md

## 확인된 원인
- GitHub Actions 계정 비활성화로 schedule(매시 17, 47분) 실행이 2026-09-24 이후 중단. 자기호스팅 러너 서비스(actions.runner.xmfldksl-sentinel-o-car.*)는 launchd에 등록·enabled 상태로 남아 있으며 건드리지 않았다.
- 상태 파일 경로는 코드가 이미 `STATE_PATH` 환경변수로 받는다(src/index.mjs, 기본값 data/state.json). 따라서 코드 변경과 "feat: allow state file path override" commit은 불필요했다.
- 비밀값은 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 두 개. ENCAR_SEARCH_URL_* 다섯 개는 secrets가 아닌 repository variables지만 로컬 실행에 필요해 .env.local.example에 함께 나열했다.
- dry-run 모드는 없다. telegram_test와 send_current 모두 실제 Telegram 전송을 한다.

## 변경 파일
- local/run.sh (신규): .env.local 로드, PATH에 /opt/homebrew/bin, npm test → npm run scrape, 날짜별 로그, 종료 코드 기록, mkdir 기반 중복 실행 방지
- local/com.xmfldksl.sentinel-o-car.plist.template (신규): StartCalendarInterval Minute 17/47, RunAtLoad false
- local/install.sh, local/uninstall.sh (신규)
- local/README.md (신규)
- .env.local.example (신규), .gitignore(.env.local 추가), README.md(local/README.md 안내 한 줄)
- .github/workflows/sentinel-o-car.yml: schedule 주석 처리, workflow_dispatch 유지, 상단 안내 주석

## 수정 내용
- cron "17,47 * * * *"은 분 단위라 시간대 변환 없이 동일하게 매시 17분, 47분으로 등록.
- launchd StandardOutPath는 날짜를 넣을 수 없어 launchd.log(고정)로 두고, run.sh가 자체적으로 YYYY-MM-DD.log에 기록한다.
- 로컬 상태 경로 기본값 `~/Library/Application Support/sentinel-o-car/state.json`. install.sh가 파일이 없을 때만 data/state.json을 한 번 복사한다. 로컬 실행은 data/state.json을 읽거나 쓰지 않는다.
- 의존성이 없어(package.json dependencies 없음) npm ci는 package-lock.json이 있고 node_modules가 없을 때만 수행하도록 조건부 처리.

## 테스트 결과
- 관련 테스트: run.sh 스모크 실행(ENV_FILE/LOG_DIR/STATE_PATH를 임시 경로로, 더미 URL). 환경 로드 → npm test 236건 통과 → scrape 진입 후 검색 URL 검증에서 네트워크 요청 전 중단, 종료 코드 1 기록. 로그에 더미 비밀값 미노출, data/state.json 변경 없음, 렌더링한 plist plutil -lint OK.
- 전체 테스트: npm test 236 pass / 0 fail (workflow 수정 후 재실행)
- 실행 환경: 로컬 (node v25.9.0, /opt/homebrew/bin)
- 미수행: install.sh 실행(launchd 등록)과 실제 1회 실행. 인수인계 지시대로 사용자 확인 후 진행.

## Git
- branch: main
- commit: 5dd6ecf(handoff), 0b8c3a4(local runner), 1c751eb(workflow pause), 보고 commit은 아래 CONTEXT 갱신과 함께
- Pull Request: 없음
- GitHub Actions: 비활성화 상태

## 남은 제한사항
- 맥이 잠자기 상태면 예약이 실행되지 않는다. 전원/잠자기 설정은 변경하지 않았다.
- 비정상 종료로 lock 디렉터리($TMPDIR/sentinel-o-car.lock)가 남으면 수동 삭제가 필요하다.
- 로컬 상태와 저장소의 data/state.json은 분리되어 시간이 지나면 달라진다. Actions 복구 시 local/README.md의 되돌리기 절차를 따른다.

## 사용자가 할 일
1. `cp .env.local.example .env.local` 후 값 입력 (URL은 큰따옴표)
2. `local/install.sh` 실행 허가 (또는 직접 실행). 확인: `launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car`
3. 원하면 `local/run.sh telegram_test`로 연결 확인 (실제 Telegram 전송 1건)
4. 전원 연결 시 잠자기 방지 설정 (시스템 설정 > 배터리 > 옵션)
5. 다음 17분 또는 47분 이후 `~/Library/Logs/sentinel-o-car/YYYY-MM-DD.log`에 "종료 코드=0" 확인

## 정리
- 임시 파일 또는 workflow 유지/삭제: 스크래치 임시 파일만 사용, 저장소에 임시 파일 없음. workflow는 schedule 주석 상태로 유지.
