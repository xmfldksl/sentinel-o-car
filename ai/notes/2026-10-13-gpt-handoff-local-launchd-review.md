# 인수인계: 맥 launchd 전환 결과 검증과 운영 안내 정정

작성자: codex
날짜: 2026-10-13
대상: codex

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main, 직접 commit. push 금지.
- 요청자가 지정한 파일명에 따라 gpt-handoff로 저장하되 실제 작성자는 codex로 기록한다.

## 작업 목적
Claude Code가 추가한 맥 launchd 실행기를 실제 저장소와 읽기 전용 운영 근거로 검증하고, 운영 시작 전에 남은 문제와 최소 수정안을 정리한다. 확인된 사실의 문서 정정만 수행한다.

## 문제 현상 (있으면)
- 이전 보고: 5dd6ecf(인수인계), 0b8c3a4(실행기), 1c751eb(schedule 중지), 85c51ee(완료 기록).
- 이전 보고의 236건 테스트 통과, 더미 URL 스모크 종료 코드 1, 등록·운영 실행·push 미실시는 검증 대상이다. 스모크의 종료 코드 1을 운영 성공으로 해석하지 않는다.
- 시작 시 main 작업 트리는 clean. origin fetch 후 main은 origin/main보다 4 ahead / 0 behind. remote와 upstream은 요청과 일치한다.
- REQUIREMENTS.md는 현재 저장소에 없다. AGENTS.md·CLAUDE.md·ai/README.md와 최신 handoff/report, 관련 템플릿을 확인했다.

## 먼저 확인할 파일
- ai/CONTEXT.md → ai/README.md → 연결된 최신 handoff/report
- REQUIREMENTS.md 존재 여부, AGENTS.md, CLAUDE.md, ai/templates/{handoff,report,review-request}.md
- .github/workflows/sentinel-o-car.yml, config.json, package.json, README.md
- local/run.sh, local/install.sh, local/uninstall.sh, plist 템플릿, local/README.md
- STATE_PATH·초기화·이벤트·전송 상한·실행 모드를 처리하는 src/ 코드와 test/
- .env.local.example, .gitignore; .env.local은 존재·권한·추적·ignore 여부만 확인

## 수정 범위와 제한
- 현재 구현을 먼저 읽고 최소 변경한다. 필드명·함수명·환경변수명을 코드에서 확인한다.
- 보고된 커밋의 존재·변경 파일, 최종 workflow의 schedule 중지와 workflow_dispatch·실행 단계 유지, cron과 plist의 매시 17·47분 일치를 확인한다.
- 환경 로드, PATH, 실행 순서, 실패 코드, 로그, 잠금과 해제, 외부 상태 기본 경로와 기존 파일 보존, 환경변수·직접 실행 시 저장소 상태 사용 가능성을 검토한다.
- 관련 커밋의 data/state.json 변경·삭제 여부를 확인하고 상태 내용은 보고서에 복사하지 않는다.
- secrets/variables 이름을 예제와 대조한다. 추적 파일·관련 커밋·기존 로그의 비밀값 검사는 값과 해당 줄을 출력하지 않고 발견 여부·위치만 기록한다.
- launchctl 조회와 기존 로그로 현재 등록·실행 여부를 확인한다. 이전 보고 이후 설치됐을 가능성도 확인한다.
- 초기 기준선과 기존 상태 비교, 신규·재등록·가격변동·삭제 판단, 전송 상한, 모드별 동작을 읽고 2026-09-24 이후 중단의 영향을 설명한다. 중단 기간 전체 매물 발송을 추정하지 않는다.
- 잠자기 동작은 현재 macOS man launchd.plist 또는 Apple ScheduledJobs 문서로 확인한다. 놓친 예약은 깨어날 때 실행되며 여러 건은 한 번으로 합쳐진다.
- RunAtLoad=false여도 등록 후 예약 시각에는 실제 수집·전송할 수 있음을 안내한다.
- 코드·workflow·운영 설정 결함은 위치·영향·최소 수정안만 보고하고 변경하지 않는다.
- 일반 문서와 ai/ 문서를 별도 commit한다. 기존 미완료 변경이 나타나면 보존하고 이번 commit에서 제외한다.

## 금지 작업
- 실제 수집, Telegram 전송, 외부 API 쓰기, telegram_test/send_current 실행
- launchd 등록·해제·재시작, install.sh나 운영 run.sh 실행
- 전원·잠자기 설정 또는 자기호스팅 러너 서비스 변경
- 상태 파일 복사·수정·삭제·commit, .env.local 생성·수정, 비밀값 출력
- 기존 미완료 변경 reset·checkout·삭제, pull·merge·checkout·reset, 이력 재작성, 비밀값 변경, push
- 기존 테스트 삭제·assertion 약화, 관련 없는 리팩터링, ai/chats/ 읽기

## 테스트 방법
- 테스트 코드를 먼저 읽어 외부 전송과 운영 상태 쓰기가 없음을 확인한 후 npm test를 실행한다.
- bash -n으로 셸 문법, plutil -lint로 plist 형식을 확인한다. 필요하면 상태·환경 파일과 무관한 임시 디렉터리에서 템플릿만 렌더링한다.
- git diff --check, 변경 파일 범위와 상태 파일 무변경, 최종 git status를 확인한다.
- 실제 API 응답·알림 수량·운영 성공은 조회하거나 실행하지 않고 미확인으로 남긴다.

## commit 메시지
- docs(ai): add local runner verification handoff / 로컬 실행 검증 인수인계 추가
- docs: clarify local runner operation / 로컬 실행 운영 안내 정정
- docs(ai): record local runner verification / 로컬 실행 검증 결과 기록

## 완료 시
- ai/notes/2026-10-13-codex-report-local-launchd-review.md를 report 템플릿으로 작성한다.
- ai/CONTEXT.md를 50줄 이내로 갱신하고 최신 보고서를 연결한다. 새로운 결정이 있을 때만 ai/DECISIONS.md에 추가한다.
- 운영 시작 가능 여부·차단 문제, 확인/미확인 항목, workflow, 상태 분리·원본, 비밀값 검사, 현재 launchd 상태, 첫 알림 근거, 실제 테스트 결과, 변경 파일·branch·commit·최종 git status, 사용자 다음 단계 한 가지를 보고한다.
