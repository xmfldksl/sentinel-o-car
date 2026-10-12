# 인수인계: 로컬 실행 활성화

작성자: codex (사용자 지정 gpt-handoff 파일명 유지)
날짜: 2026-10-13
대상: codex

## 프로젝트
- 경로: /Users/softnexia/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main, 시작 HEAD `3e6a3fc`

## 작업 목적
기존 상태를 외부 경로로 이어받아 normal을 한 번 실행하고, 수집·전송·저장이 정상 완료된 경우에만 launchd 예약 운영을 시작한다.

## 문제 현상 (있으면)
- 시작 작업 트리는 clean. 성공한 git fetch 후 HEAD와 origin/main은 `3e6a3fc`로 일치하며 원격 workflow의 schedule은 주석 처리되어 있다.
- 필수 Telegram 두 값과 활성 프로필 검색 URL은 입력됨. .env.local은 권한 600, Git 미추적·ignore 상태다. 값은 출력하지 않았다.
- STATE_PATH 등 실행 경로 재정의 없음. 실제 상태 경로는 `/Users/softnexia/Library/Application Support/sentinel-o-car/state.json`이다.
- 사용자 중단 후에도 수집 프로세스·잠금·대상 launchd·plist·운영 로그·외부 상태 파일이 없다. 실제 운영 실행은 아직 하지 않았다.
- GitHub Actions 실행 목록은 API 연결 오류 후 사용자 지시로 조회를 중단했다. 미확인 사항으로 남기며 이것만으로 전환을 중단하지 않는다.

## 먼저 확인할 파일
- ai/CONTEXT.md, ai/README.md, CLAUDE.md, AGENTS.md, 연결된 최신 인수인계·보고
- README.md, config.json, origin/main의 .github/workflows/sentinel-o-car.yml
- local/README.md, local/run.sh, local/install.sh, local/uninstall.sh, plist 템플릿
- ai/templates/handoff.md, ai/templates/report.md, src/index.mjs, src/runtime.mjs

## 수정 범위와 제한
- 사용자가 외부 상태 최초 준비, normal 실제 수집·Telegram 알림 1회, 성공 후 launchd 등록·예약 실행, 관련 AI 문서 commit·일반 push를 명시 승인했다. 이전 문서의 승인 대기는 이 범위에 한해 해제한다.
- 이 인수인계와 CONTEXT를 먼저 별도 commit한다. 코드는 변경하지 않고 기존 검증은 반복하지 않는다. run.sh 내부의 npm test는 그대로 수행한다.
- 외부 상태가 없을 때만 저장소 data/state.json을 복사하고 형식·읽기·쓰기 가능 여부를 확인한다. 기존 파일은 유지한다. 저장소 내부 상태 경로이면 중단한다.
- launchd 미등록·다른 수집 부재를 확인하고 local/run.sh normal을 한 번 실행한다. 종료 코드와 앱 로그를 함께 확인하며 프로필·전송 실패 또는 부분 수집을 정상 운영 성공으로 취급하지 않는다.
- 실패하면 재실행·등록 없이 정제한 오류·전송·상태 저장 여부를 기록한다. 알림 0건이면 Telegram 수신 검증으로 보고하지 않는다.
- 정상 완료 후에만 local/install.sh를 실행한다. 준비한 상태 파일 유지, 서비스 실행 경로, 매시 17분·47분 예약을 확인한다. 추가 실행 없이 다음 예약 시각과 미확인 사항을 보고한다.

## 금지 작업
- telegram_test, send_current, kickstart, 실패 후 normal 재실행
- GitHub Actions 실행 목록의 연결 오류 진단·재조회, workflow 실행
- 저장소 data/state.json 수정·commit, 외부 기존 상태 덮어쓰기
- 비밀값·전체 인증 URL·채팅 ID·상태 내용의 출력·문서화·commit
- 전원·잠자기·기존 자기호스팅 러너 변경, 관련 없는 코드 수정
- 기존 미완료 변경 reset·checkout·삭제, 무관한 변경 commit, force push, ai/chats/ 읽기

## 테스트 방법
- 운영 준비 조건과 중단 이후 실행 흔적만 재확인한다. 기존 회귀 검증을 별도로 반복하지 않는다.
- 실행기 내 npm test, 앱 완료·실패 로그, 외부 상태 저장·원본 상태 보존을 확인한다.
- 설치 후 launchctl과 실제 plist로 상태 보존·예약·실행 경로를 확인한다. 다음 예약까지 기다리지 않는다.
- 문서 diff·비밀값 비포함·CONTEXT 50줄 이내를 확인하고 일반 push 후 원격 hash와 Git 상태를 확인한다.

## commit 메시지
- docs(ai): add local runner activation handoff / 로컬 실행 활성화 인수인계 추가
- docs(ai): record local runner activation / 로컬 실행 활성화 결과 기록

## 완료 시
- ai/notes/2026-10-13-claudecode-report-local-runner-activate.md를 report 템플릿으로 작성한다. 지정 파일명을 유지하고 실제 작성자는 codex로 기록한다.
- ai/CONTEXT.md를 50줄 이내로 갱신한다. 새로운 설계 결정이 있을 때만 ai/DECISIONS.md에 추가한다.
- 종료 코드·수집·알림·외부 저장, launchd·다음 한국시간 예약·예약 실행 검증 여부, 원본 상태 보존, 최종 commit·push·Git 상태와 사용자 확인 명령을 보고한다.
