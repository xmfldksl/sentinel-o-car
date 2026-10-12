# 인수인계: 로컬 실행기 단계 실패 처리 수정

작성자: codex
날짜: 2026-10-13
대상: codex

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main, 직접 commit, push 금지
- 사용자 지정 gpt-handoff 파일명을 유지하고 실제 작성자는 codex로 기록한다.

## 작업 목적
local/run.sh에서 선행 단계가 실패하면 이후 단계를 실행하지 않고, 실패 코드를 호출자와 로그에 전달하며 자신이 획득한 잠금만 정상·실패 종료 시 정리하도록 최소 수정한다.

## 문제 현상 (있으면)
- 실제 파일의 `{ ...; } || status=$?` 구조에서는 set -e가 내부 명령 실패를 중단시키지 않는다. npm ci/test 실패 후 scrape로 진행하고 마지막 명령이 성공하면 0으로 종료할 수 있다.
- 이전 검증 보고: ai/notes/2026-10-13-codex-report-local-launchd-review.md
- 시작 상태: main, HEAD 3f3e6ac, 작업 트리 clean, origin/main보다 7 ahead / 0 behind. 기존 변경 없음. 이전 검증의 원격 schedule 활성·미push 이슈는 유지하며 불필요한 서비스·네트워크 재조회는 하지 않는다.

## 먼저 확인할 파일
- ai/CONTEXT.md, ai/README.md, AGENTS.md, CLAUDE.md, 위 검증 보고와 연결된 handoff
- ai/templates/handoff.md, ai/templates/report.md
- local/run.sh, package.json, test/의 기존 테스트 구조
- README.md, local/README.md, config.json, .github/workflows/sentinel-o-car.yml

## 수정 범위와 제한
- 현재 구현을 먼저 읽고 최소 변경한다. 실행기 실패 처리와 직접 관련된 테스트·문서만 수정한다.
- 셸 구조 복제만으로 재현하지 않는다. 실제 local/run.sh를 바이트 변경 없이 임시 저장소에 복사해 실행하고, 가짜 npm·node와 임시 환경 파일·로그·상태·TMPDIR로 격리한 회귀 테스트를 먼저 작성한다.
- 실제 운영 앱과 자격 증명은 테스트 환경에 복사하거나 상속하지 않는다. 테스트에는 실제 수집·전송 명령으로 연결되는 실행 파일을 두지 않는다.
- 수정 전 회귀 실패를 확인한 뒤 수정하고 같은 테스트로 통과를 확인한다.
- 안전한 격리에 필요한 최소 변경만 허용된다. 테스트만 통과시키기 위한 운영 동작 변경은 하지 않는다.
- 기존 잠금은 후속 작업 실행 없이 유지하고, 성공적으로 획득한 잠금에만 정리 처리를 등록한다.
- 루트/local README의 실패 처리 안내를 수정 결과와 일치시킨다. 새 설계 결정이 없으면 DECISIONS.md는 변경하지 않는다.

## 금지 작업
- STATE_PATH 정책, 알림 상한, 수집·전송 로직 변경
- 실제 .env.local 생성·수정, 비밀값 출력, 실제 수집·Telegram 전송
- launchd 등록·해제·재시작, 전원 설정 또는 자기호스팅 러너 변경
- 저장소·실제 외부 상태 파일 변경, workflow 변경, push
- 기존 미완료 변경 reset·checkout·삭제, 기존 테스트 삭제·assertion 약화, 관련 없는 리팩터링, ai/chats/ 읽기

## 테스트 방법
- 설치 조건(package-lock.json 존재, node_modules 없음)에서 npm ci 실패 시 test/scrape 미호출.
- npm test 실패 시 scrape 미호출, scrape 실패 시 실패 종료 코드·로그, 전부 성공 시 ci → test → scrape 순서·종료 0.
- 조건에 따라 ci 생략, 환경 파일 누락·source 실패·상태 누락도 실패 코드와 로그 확인.
- 자신이 생성한 잠금 정리와 기존 잠금 보존, 로그의 더미 비밀값 미노출 확인.
- 저장소 data/state.json과 실제 기본 외부 상태의 존재 여부·내용 해시를 전후 비교하되 내용을 출력·복사하지 않는다.
- 관련 회귀 테스트 → 안전성을 확인한 전체 npm test → bash -n local/run.sh → git diff --check. 이전 테스트 파일 변경 여부를 확인하고 이전 서비스 검증을 반복하지 않는다.

## commit 메시지
- docs(ai): add local runner fix handoff / 로컬 실행기 수정 인수인계 추가
- fix: stop local runner on stage failure / 단계 실패 시 로컬 실행 중단
- docs(ai): record local runner failure fix / 로컬 실행기 실패 처리 수정 기록

## 완료 시
- ai/notes/2026-10-13-codex-report-local-runner-failure-fix.md를 report 템플릿으로 작성한다.
- ai/CONTEXT.md를 50줄 이내로 갱신하고 최신 handoff/report를 연결한다. ai/ 문서는 별도 commit한다.
- 원인·최소 수정, 수정 전 실패와 수정 후 통과, 전체 테스트, 변경 파일·commit·최종 status를 보고한다.
- 코드 수정 완료와 운영 전환 완료를 구분하고 원격 schedule 활성·환경/상태 준비·등록/실제 운영 미검증을 남긴다.
