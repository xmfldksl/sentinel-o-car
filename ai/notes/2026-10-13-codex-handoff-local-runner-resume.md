# 인수인계: 토큰 재발급 후 로컬 운영 재개

작성자: codex
날짜: 2026-10-13
대상: codex

## 프로젝트
- 경로: /Users/softnexia/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main, 시작 HEAD `918fe5d`

## 작업 목적
사용자가 교체한 Telegram 설정을 검증하고 기존 외부 상태로 normal을 한 번 실행한 뒤, 정상 완료한 경우에만 로컬 예약 운영을 등록한다.

## 문제 현상 (있으면)
- 이전 normal은 2026-10-13 02:44:31~02:46:01 KST에 종료 코드 1로 실패했다. Telegram 오류는 400 chat not found였고, 사용자가 채팅 ID에 봇 이름을 입력한 문제를 확인했다.
- 사용자는 노출된 토큰을 재발급받아 .env.local에 교체했다고 알렸다. 이전 토큰은 다시 사용하거나 조회하지 않는다.
- 시작 작업 트리는 clean. 성공한 git fetch 후 HEAD와 origin/main은 `918fe5d`로 같고 원격 workflow의 schedule은 중지되어 있다.
- 기존 외부 상태는 schema v2이며 이전 최초 복사본 그대로다. 기존 로그에는 이전 실패 1회만 있고, 추가 수집·Runner.Worker·잠금·대상 launchd·plist는 없다. 기존 Runner.Listener는 유지한다.
- getMe·getChat·getChatMember 조회에서 토큰의 봇, 설정된 음수 ID의 채널, 관리자 지위와 게시 권한을 확인했다. 실제 값과 응답 전문은 출력하지 않았다.
- 현재 대화와 최신 보고서에 채널 게시물 링크가 없어 사용자에게 대조용 링크를 요청했다. 링크 대조 전에는 normal을 시작하지 않는다.

## 먼저 확인할 파일
- AGENTS.md, ai/README.md, ai/CONTEXT.md와 연결된 최신 활성화 handoff·report 및 실행기 수정 report
- README.md, config.json, .github/workflows/sentinel-o-car.yml
- local/README.md, local/run.sh, local/install.sh, plist 템플릿
- src/index.mjs, src/runtime.mjs, src/lib.mjs, ai/templates/handoff.md, ai/templates/report.md

## 수정 범위와 제한
- 이번 사용자 요청은 실제 수집·Telegram 알림·외부 상태 저장을 포함한 normal 1회와 성공 후 등록·예약 실행, AI 문서 commit·일반 push를 승인한다.
- 채팅 ID의 음수 형식, 사용자 확인 게시물 링크에서 계산한 ID와의 일치, 새 봇의 채널 접근·게시 권한을 모두 충족해야 한다.
- 실행 직전 환경·외부 상태 불변과 중복 실행 부재를 재확인한다. 기존 외부 상태를 다시 복사하거나 초기화하지 않는다.
- 실행 종료 코드와 신규 로그 구간, 프로필별 수집·전송 이력·저장 결과를 함께 확인한다. 실패·부분 수집이면 추가 실행과 등록을 하지 않는다.
- 정상 완료 후 대상이 미등록일 때만 local/install.sh를 실행한다. 이미 등록되어 있으면 상태만 확인한다.
- 실제 plist의 실행 경로와 매시 17분·47분, RunAtLoad=false를 확인한다. 발생하지 않은 예약 실행은 미검증으로 남긴다.
- 저장소 변경은 이 handoff, 결과 report, CONTEXT 등 AI 문서로 제한한다. 기존 미완료 변경을 보존한다.

## 금지 작업
- 토큰·채팅 ID·인증 URL·API 응답 전문·상태 내용의 출력, 보고서 기록 또는 commit
- telegram_test, send_current, kickstart, 실패 후 추가 normal 실행
- gh run list 재시도, Actions 실행, 전원·잠자기·기존 자기호스팅 러너 변경
- 기존 외부 상태를 data/state.json으로 덮어쓰기, 환경·상태 파일 commit
- 무관한 코드 변경, 기존 변경 reset·checkout·삭제, force push, ai/chats/ 읽기

## 테스트 방법
- 이전 회귀 테스트를 별도 반복하지 않고 run.sh 내부 npm test 결과를 확인한다.
- 원격 예약 중지와 코드 동기화는 Git으로 검증한다. GitHub Actions 실행 목록은 미확인으로 유지한다.
- API 검증은 메모리에서 필요한 필드만 판정한다. 이번 수동 실행의 로그는 임시 FIFO에서 민감값·API 오류 전문을 제거한 뒤 기존 운영 로그에 추가한다. 운영 코드는 변경하지 않는다.
- 종료 코드, 앱 Done 기록, 새 전송 이력, 외부 상태 갱신, 저장소 상태·환경 불변, 잠금 정리를 확인한다.
- AI 문서 범위·비밀값 비포함·git diff --check·CONTEXT 50줄 이내를 검증하고 일반 push 결과를 확인한다.

## commit 메시지
- docs(ai): record local runner resume / 로컬 운영 재개 결과 기록

## 완료 시
- ai/notes/2026-10-13-codex-report-local-runner-resume.md를 보고 템플릿으로 작성한다.
- ai/CONTEXT.md를 50줄 이내로 갱신하고 새 결정이 있으면 ai/DECISIONS.md에 추가한다.
- 종료 코드, 전송 성공 건수, 외부 상태 저장, launchd 등록, 다음 한국시간 예약, commit·push 결과를 보고한다.
- 알림 0건은 Telegram 전송 검증 완료로 표현하지 않는다. 사용자 수신 확인과 API 전송 성공을 구분한다.
