# 보고: 로컬 실행기 단계 실패 처리 수정

작성자: codex
날짜: 2026-10-13
대상: ai/notes/2026-10-13-gpt-handoff-local-runner-failure-fix.md

## 확인된 원인

- 실제 `local/run.sh`의 `{ ...; } || status=$?`에서는 Bash의 errexit가 명령 묶음 내부에서 적용되지 않았다. npm ci/test 실패 후에도 뒤의 명령을 실행하며, 마지막 명령이 성공하면 앞의 실패를 숨길 수 있었다.
- 종료 코드 기록이 스크립트 끝에만 있어 환경 파일 누락·source 실패·상태 누락의 조기 종료는 코드 기록을 건너뛰었다.
- 시작 시 main, HEAD `3f3e6ac`, 작업 트리 clean, 로컬 origin/main 대비 7 ahead / 0 behind였다. 기존 미완료 변경은 없었다. CONTEXT·README·AGENTS·CLAUDE·연결된 handoff·지정 검증 보고·템플릿과 실행기·기존 테스트 구조를 먼저 읽었다. ai/chats/는 읽지 않았다.

## 변경 파일

- `local/run.sh`: 조건부 명령 묶음 제거, EXIT 종료 처리 통합.
- `test/local-runner.test.mjs`: 실제 실행기의 격리 회귀 테스트 10건 추가.
- `README.md`, `local/README.md`: 수정 완료된 실패 처리·로그·잠금 동작과 회귀 테스트 설명 반영, 운영 준비·원격 schedule 미해결 사항 유지.
- `ai/notes/2026-10-13-gpt-handoff-local-runner-failure-fix.md`: 요청을 먼저 기록한 인수인계. 지정 파일명은 유지하고 실제 작성자는 codex로 표기.
- `ai/notes/2026-10-13-codex-report-local-runner-failure-fix.md`: 이 보고서.
- `ai/CONTEXT.md`: 최신 인수인계·보고와 후속 운영 준비 사항 갱신, 50줄 이내.

## 수정 내용

- 기존 실행 순서와 의존성 설치 조건을 유지하면서 `||`로 감싼 묶음을 제거했다. `set -euo pipefail` 아래에서 각 단계를 직접 실행하므로 실패한 단계 뒤의 명령은 실행되지 않는다.
- 잠금 획득에 성공한 뒤에만 `finish` EXIT trap을 등록한다. 함수 진입 즉시 원래 `$?`를 지역 변수에 보관하고 종료 코드를 한 번 기록한 뒤, 해당 잠금 디렉터리를 rmdir하고 원래 코드로 종료한다. 기록·정리 중 오류가 원래 코드를 바꾸지 않도록 했다.
- 기존 잠금이 있으면 trap 등록 전에 기존과 같이 건너뜀 메시지·코드 0으로 종료한다. 이후 단계가 실행되지 않고 기존 잠금을 삭제·교체하지 않음을 빈 잠금 디렉터리의 존재와 inode로 검증했다.
- STATE_PATH·RUN_MODE 정책, 수집·전송 로직, workflow·설치기·해제기·plist는 변경하지 않았다. 운영 코드에 테스트용 경로 재정의나 별도 실행 모드를 추가할 필요가 없었다.
- 새 설계 결정은 없어서 DECISIONS.md는 변경하지 않았다. 기존 테스트 파일·assertion과 이전 ai/notes 기록도 수정하지 않았다.

## 테스트 결과

- 관련 테스트: `node --test test/local-runner.test.mjs`. 셸 구조만 재작성한 테스트가 아니라 저장소의 실제 `local/run.sh`를 **바이트 변경 없이 복사**해 `/bin/bash`로 실행한다. 매번 새 임시 저장소를 만들므로 REPO_DIR 산출과 package-lock/node_modules 설치 조건도 실제 코드로 시험한다.
- 안전한 격리: 운영 앱·설정·상태·자격 증명은 복사하지 않는다. 임시 저장소에는 npm scripts도 없다. NODE_BIN_DIR에는 명령 기록·지정 코드 반환만 하는 가짜 npm과 `--version`만 받는 가짜 node를 놓는다. 두 가짜 실행 파일은 실제 명령에 위임하지 않고 예상 밖 인수는 실패시킨다. child 환경은 필요한 값만 전달하므로 실제 비밀값·BASH_ENV·NODE_OPTIONS·npm 설정을 상속하지 않는다. HOME은 실제 값을 유지하고 환경 파일·로그·상태·TMPDIR를 모두 명시적 임시 경로로 지정한다. 실제 npm test의 하위 실행에서 npm test를 다시 호출하는 재귀도 가짜 npm으로 차단한다.
- 수정 전: 실행기를 바꾸기 전에 회귀 테스트 실행, **10건 중 5 pass / 5 fail, 종료 1**. 설치 실패에도 호출 기록이 ci → test → run scrape였고, 테스트 실패 후에도 run scrape가 호출됐다. 환경 파일 누락·source 실패·상태 누락은 종료 코드 로그가 없어 실패했다. 이것이 코드 결함의 재현 근거다.
- 수정 후: 같은 회귀 테스트 **10 pass / 0 fail, 종료 0**. 시나리오와 기대값·assertion은 수정 전후 동일하다.

| 시나리오 | 수정 후 호출 순서 | 호출자·로그의 종료 코드 |
| --- | --- | --- |
| lockfile 있음 / node_modules 없음 / 설치 실패 | ci | 41 |
| 설치 성공 / 테스트 실패 | ci → test | 42 |
| 수집 실패 | ci → test → run scrape | 43 |
| 모든 단계 성공 | ci → test → run scrape | 0 |
| lockfile 없음 | test → run scrape | 0 |
| node_modules 있음 | test → run scrape | 0 |
| 기존 빈 잠금 있음 | 없음; 기존 잠금 보존 | 호출자 0, 건너뜀 로그 (기존 동작 유지) |
| 환경 파일 누락 | 없음 | 78 |
| 환경 파일 source 실패 | 없음 | 44 |
| 상태 파일 누락 | ci → test | 66 |

- 공통 검증: 가짜 npm은 실행 중 자신이 사용할 잠금이 존재하는지도 확인한다. 정상·실패 종료 뒤 획득한 잠금이 사라지고 기존 잠금은 유지된다. 모든 케이스에서 로그·표준 출력·표준 오류에 더미 비밀값이 없고 임시 상태도 불변임을 확인했다.
- 운영 상태 보존: 매 회귀 케이스 전후 저장소 `data/state.json`과 실제 기본 외부 상태 경로의 존재 여부·내용 해시·수정 시각을 비교한다. after hook이 실패 케이스에서도 검사하고 임시 fixture만 정리한다. 검사 모두 통과. 저장소 상태는 시작 커밋의 blob과도 일치하며 현재 실제 기본 외부 상태는 부재 상태를 유지한다. 상태 원문을 출력하거나 다른 파일로 복사하지 않았다.
- 전체 테스트: 기존 src·package.json·테스트가 이전 안전성 검증 이후 변경되지 않았고 신규 테스트도 위와 같이 격리됨을 확인한 뒤 **`npm test` 246 pass / 0 fail / 0 skipped, 종료 0**. 기존 236건과 신규 10건이다.
- 정적 검증: `/bin/bash -n local/run.sh`, `node --check test/local-runner.test.mjs`, `git diff --check` 및 staged diff 검사 통과. run.sh 실행 권한 유지.
- 실행 환경: 로컬 macOS, `/bin/bash`, Node v25.9.0. 전체 테스트에서 실제 수집·Telegram 전송은 없었다.
- 이전 launchd 조회·전체 비밀값 검사·plist 검증·원격 fetch는 반복하지 않았다. 이번 수정과 무관한 이전 결과는 이전 검증 보고의 시점 정보로 유지한다.

## Git

- branch: `main`, 시작 HEAD `3f3e6ac`.
- commit: `87f6796` — `docs(ai): add local runner fix handoff / 로컬 실행기 수정 인수인계 추가`
- commit: `18a3a59` — `fix: stop local runner on stage failure / 단계 실패 시 로컬 실행 중단` (실행기·신규 테스트·직접 관련 README)
- 이 report와 최종 CONTEXT는 `docs(ai): record local runner failure fix / 로컬 실행기 실패 처리 수정 기록`으로 별도 commit한다. 최종 hash와 commit 후 status는 사용자 최종 보고에 기재한다.
- Pull Request: 없음, main 직접 commit.
- GitHub Actions: 실행·변경·push 없음. 이전 fetch의 origin/main에는 활성 schedule이 남아 있으며 이 미해결 사항을 유지한다.

## 남은 제한사항

- **코드 수정과 격리 회귀 검증은 완료했지만 운영 전환은 완료하지 않았다.** 실제 .env.local·기본 외부 상태는 현재 없다. 환경·자격 증명·상태 준비와 원격 예약 중복 방지, 승인된 등록·첫 실제 실행 확인이 별도 필요하다. 이 작업에서 서비스 상태를 다시 조회하거나 변경하지 않았다.
- STATE_PATH 재정의/직접 실행의 원본 상태 사용 가능성, 예제 공백 경로 따옴표 누락, 알림 건수 상한 없음, 다른 TMPDIR·Actions와 잠금 비공유, SIGKILL·전원 종료 후 잠금 잔여, 설치·해제기의 bootout 오류 구분은 이번 범위 밖이다. 이전 검증 보고를 따른다.
- 로그 디렉터리 생성·출력 연결 자체가 실패하면 그 로그에 종료 코드를 쓸 수 없다. 기존 잠금으로 건너뛴 경우도 실제 수집 성공을 뜻하지 않는다.

## 정리

- 임시 파일 또는 workflow 유지/삭제: 회귀 fixture는 각 테스트의 after hook에서 정리했다. 수정 전·후 및 전체 테스트 출력과 문서 초안은 `/private/tmp/sentinel-runner-fix.iM95dY/`에 있다. 실제 환경·상태 파일 사본은 없다. 저장소에는 요청한 코드·테스트·문서만 남겼다.
- .env.local 생성·수정, 실제 수집·전송, launchd 등록·해제·재시작, 전원·자기호스팅 러너 변경, 운영 상태 변경, push는 하지 않았다.
