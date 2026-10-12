# 보고: 맥 launchd 전환 결과 검증과 운영 안내 정정

작성자: codex
날짜: 2026-10-13
대상: ai/notes/2026-10-13-gpt-handoff-local-launchd-review.md

## 확인된 원인

**운영 시작 보류.** 실행기에서 회귀 테스트 실패가 수집·전송을 막지 못하는 결함을 확인했다. `.env.local`, 기본 외부 상태 파일, 설치된 plist, 로컬 운영 로그도 아직 없다. 이번 작업은 문서 정정과 검증이며 코드·workflow·운영 설정은 수정하지 않았다.

### 저장소와 기존 변경

- 실제 경로 `/Users/softnexia/Projects/sentinel-o-car`, branch `main`, upstream `origin/main`, remote `git@github.com:xmfldksl/sentinel-o-car.git` 확인. 시작 작업 트리는 clean으로 기존 미완료 변경은 없었다.
- `git fetch origin` 후 원격은 `1f6e118`, 시작 시 로컬은 `85c51ee`로 4 ahead / 0 behind. pull·merge·checkout·reset·push는 실행하지 않았다.
- `ai/CONTEXT.md`부터 읽고 ai/README, 연결된 최신 handoff/report, AGENTS.md, CLAUDE.md, handoff/report/review-request 템플릿, README, config, workflow를 확인했다. REQUIREMENTS.md는 없으며 생성하지 않았다. ai/chats/는 읽거나 검사하지 않았다.
- 보고된 네 커밋은 모두 존재하며 main의 연속 이력이다.

| 커밋 | 실제 변경 |
| --- | --- |
| `5dd6ecf` | 이전 launchd handoff 추가 |
| `0b8c3a4` | local/의 run·install·uninstall·plist·README, .env.local.example 추가; .gitignore와 루트 README 수정 |
| `1c751eb` | workflow의 schedule 주석 처리와 안내 주석 추가 |
| `85c51ee` | 이전 완료 report 추가, CONTEXT·DECISIONS 갱신 |

### workflow와 예약

- 최종 **로컬 main 파일**의 활성 `schedule`은 없고 `workflow_dispatch`는 유지된다. `workflow_dispatch:` 이후 문자열을 이전 파일과 비교해 입력·권한·concurrency·runner·Node·테스트·수집·상태 commit 단계가 그대로임을 확인했다.
- 원본 cron `17,47 * * * *`과 plist의 Minute 17/47이 일치한다. 한국시간도 매시 17분·47분이다. workflow는 self-hosted/macOS/ARM64, Node 25, timeout 12분을 유지한다.
- **fetch한 `origin/main`에는 활성 schedule이 남아 있다.** 기존 네 커밋과 이번 문서는 push하지 않았으므로 로컬 파일의 예약 중지를 GitHub 반영 완료로 해석하면 안 된다. 계정의 Actions 비활성화 여부는 이번에 원격 서비스에서 다시 확인하지 않았다. 복구 시 로컬 예약과 원격 예약·수동 실행의 중복을 별도로 방지해야 한다.
- workflow 상단의 “로컬 launchd로 실행 중”이라는 주석은 실제 미등록 상태와 다르다. workflow 수정은 범위 밖이라 그대로 두었고, 최소 정정안은 “로컬 launchd 전환용 예약 중지; 등록 상태는 운영 문서 확인”이다.

### 실행기·설치·잠금 검토

- `local/run.sh`, `install.sh`, `uninstall.sh`, plist 템플릿 전체를 읽었다. 실행기는 저장소로 이동하고 로그를 연 뒤 잠금을 얻으며, PATH 설정 → `set -a; source "$ENV_FILE"; set +a` → 모드·상태 경로 설정 → 조건부 npm ci → npm test → npm run scrape 순이다.
- 환경 파일은 셸 코드로 읽는다. 실행 인수가 RUN_MODE보다 우선하고, 인수가 없으면 환경값, 없으면 normal이다. NODE_BIN_DIR 기본값은 `/opt/homebrew/bin`이고 PATH 설정은 환경 파일 source보다 앞선다. 설치기는 설치 시 찾은 node 디렉터리를 plist에 넣는다. 현재 Node와 npm 모두 `/opt/homebrew/bin`에서 발견됐다. 환경 파일 내 NODE_BIN_DIR 변경만으로 이미 설정된 PATH가 바뀌지는 않는다.
- package.json은 외부 dependencies 및 설치·테스트 lifecycle hook이 없고 package-lock.json도 없다. 현재 조건에서는 npm ci가 실행되지 않는다. workflow와 달리 로컬 실행기는 Node 버전을 설치하거나 강제하지 않는다.
- 로그는 날짜별 파일로 추가 기록하고 plist stdout/stderr는 고정 launchd.log를 사용한다. 값 덤프나 `set -x`는 없다. 상태 경로·실행 모드·Node 경로는 로그에 남는다.
- 잠금은 `${TMPDIR:-/tmp}/sentinel-o-car.lock`의 원자적 mkdir이다. 같은 경로끼리 중복을 막고 EXIT trap에서 rmdir한다. 현재 일반 사용자 TMPDIR과 /tmp 모두 잔여 잠금은 없다.

| 우선순위 | 위치·확인된 문제 | 영향 | 최소 수정안 (이번에 미변경) |
| --- | --- | --- | --- |
| P1, 시작 차단 | `local/run.sh:55-76`의 `{ ...; } || status=$?` | Bash가 묶음 내부에서 errexit를 무시한다. npm ci/test가 실패해도 scrape로 진행하며 마지막 명령 성공 시 종료 0으로 실패를 숨길 수 있다. | 묶음의 `||` 의존을 없애고 단계별 실패 시 명시적으로 종료한다. EXIT trap에 종료 코드 기록과 잠금 해제를 모으고, 가짜 npm으로 test 실패 시 scrape 미호출·실패 코드 유지·잠금 해제를 검증한다. |
| P2 | `local/run.sh:35-44,67-78` | 환경 파일 누락은 78, 상태 누락은 66으로 종료하지만 마지막 “종료 코드=” 행은 남지 않는다. source 실패도 동일한 로그 누락 경로다. | 위 EXIT 처리에서 코드 기록을 일원화한다. |
| P2 | `local/run.sh:17,26-30` | 다른 TMPDIR의 수동 실행과 Actions에는 공통 잠금이 없다. SIGKILL·전원 종료로 남은 잠금이나 mkdir 권한 오류도 “진행 중”으로 취급해 계속 0으로 건너뛸 수 있다. | 고정 사용자 전용 잠금 경로, 소유 프로세스 확인, 잠금 획득 오류와 중복의 구분을 추가한다. 생존 프로세스 확인 없이 잠금을 지우지 않는다. |
| P2, 경로 주의 | `local/run.sh:43,50`, `src/index.mjs:769-775`, `local/install.sh:10-24` | 외부 상태는 기본값일 뿐이다. STATE_PATH로 저장소 경로를 지정할 수 있고, 설치기는 재정의한 경로를 준비하지 않는다. | 로컬 실행에서 상태 경로를 정규화해 저장소 내부를 거부하고 설치·실행의 경로 계약을 맞추는 방안을 별도 검토한다. 직접 앱 실행의 기존 기본값은 유지한다. |
| P2 | `.env.local.example:17` | 공백 있는 STATE_PATH 예제에 따옴표가 없어 주석을 그대로 해제하면 source 시 명령 오류가 난다. 현재는 주석이라 실행되지 않는다. | 예제를 `STATE_PATH="$HOME/Library/Application Support/sentinel-o-car/state.json"`로 고친다. 운영 설정 변경 금지에 따라 예제는 미변경하고 README에 정확한 사용법을 적었다. |
| P2 | `local/uninstall.sh:9-10`, `local/install.sh:37` | bootout 실패 원인을 구분하지 않는다. 특히 uninstall은 실제 해제 실패도 “없음”으로 표시한 뒤 plist를 삭제할 수 있다. | 미등록 오류와 기타 실패를 구분하고 기타 오류는 중단·보고한다. |

로컬 실행에는 workflow의 12분 제한에 해당하는 시간 제한이 없다. 이 자체를 운영 실패로 단정하지 않지만 장기 실행 시 다음 실행은 잠금으로 건너뛰므로 로그 감시가 필요하다. 이번에는 중단·복구 동작을 실제 서비스에서 시험하지 않았다.

### 상태 파일 분리와 원본 보존

- 코드에 이미 STATE_PATH 지원이 있다(`src/index.mjs:769-775,886`). 앱 직접 실행 기본값은 상대 경로 `data/state.json`, 로컬 wrapper 기본값은 `$HOME/Library/Application Support/sentinel-o-car/state.json`이다.
- 설치기는 외부 대상에 일반 파일이 있으면 유지하고, 없을 때만 저장소 상태를 복사한다(`local/install.sh:22-28`). 설치기는 실행하지 않았으며 현재 기본 외부 상태는 없다. 재설치의 복사 생략은 코드로 확인했고 실제 파일로 시험하지 않았다.
- 보고된 네 커밋 각각과 그 이전·현재의 `data/state.json` Git blob이 모두 같다. 변경·삭제가 없으며 이번 검증 전후 파일 해시도 같다. 상태 내용을 문서에 복사하지 않았다.
- 저장소 상태는 schema v2이고 활성 프로필에는 이미 초기 기준선이 있다. 활성 프로필의 마지막 갱신일은 한국시간 2026-09-24다. 파일을 초기화·복사·수정·삭제·commit하지 않았다.
- 상속 환경이나 .env.local의 STATE_PATH가 `data/state.json`이면 wrapper도 저장소 원본을 읽고 쓸 수 있다. 저장소에서 STATE_PATH 없이 직접 `npm run scrape` / `node src/index.mjs`를 실행해도 원본을 사용한다. 직접 실행은 .env.local을 자동 로드하지 않는다. 따라서 이전 보고의 “로컬 실행은 data/state.json을 읽거나 쓰지 않는다”는 표현은 기본 경로를 사용한 앱 본 실행에 한정해야 한다. npm test에는 원본을 **읽는** repository-config 검증도 있다.

### 비밀값 검사

- .env.local은 없음. 파일 권한은 대상 부재로 확인 불가, Git 추적 안 됨, `.gitignore:5`의 ignore 적용 확인. 값을 읽거나 파일을 만들지 않았다.
- workflow secrets 이름 2개(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)와 repository variables 이름 5개(ENCAR_SEARCH_URL_TESLA_MODEL3, ENCAR_SEARCH_URL_TOYOTA_SIENNA, ENCAR_SEARCH_URL_3/4/5)가 .env.local.example의 활성 키와 정확히 일치한다. 누락·초과 없음.
- 검사 시점 추적 파일 64개(ai/chats 제외), 관련 네 커밋의 서로 다른 변경 파일 blob 13개, 기존 자기호스팅 러너 stdout.log/stderr.log 2개에서 Telegram 토큰·숫자형 Chat ID 대입·GitHub 토큰·AWS 키·개인키·URL 인증정보·리터럴 인증 헤더 패턴을 검사했다. 발견 없음. 검사 결과는 위치와 유형만 출력하도록 했으며 값이나 해당 줄을 출력하지 않았다.
- 로컬 launchd 로그 디렉터리는 없고, 이전 스모크 테스트 원본 로그는 현재 확인 가능한 위치에서 확보하지 못했다. 따라서 이전 스모크 비밀값 미노출은 새로 입증한 사실이 아니라 이전 보고 내용이다.
- 패턴 검사는 전체 Git 이력이나 모든 종류의 비밀값에 대한 부재 증명이 아니다. .env.local의 실제 값과 GitHub secrets/variables 값·유효성은 확인하지 않았다. 이력 재작성과 비밀값 변경은 하지 않았다.

### 현재 등록·실행 여부

- 샌드박스의 launchctl list가 실패해 권한을 받아 읽기 전용 조회만 재수행했다. gui/501, user/501, system 모두 `com.xmfldksl.sentinel-o-car` 조회는 service not found(113)였다.
- `~/Library/LaunchAgents/com.xmfldksl.sentinel-o-car.plist`와 `~/Library/Logs/sentinel-o-car` 없음. 관련 run.sh / src/index.mjs 실행 프로세스도 조회 시 발견되지 않았다. 현재 로컬 작업은 미등록·미실행으로 판단하며 과거의 모든 수동 실행 부재까지 증명하지는 않는다.
- 기존 `actions.runner.xmfldksl-sentinel-o-car.SoftNexiaui-MacBookAir`는 running, PID 816으로 확인. 서비스는 변경하지 않았다.
- 기존 러너 stdout 로그의 마지막 작업 완료 표시는 2026-09-24 12:19:45 UTC(21:19:45 KST), Succeeded다. 마지막 대기 표시는 2026-10-12 15:01:53 UTC(10-13 00:01:53 KST)다. 이는 저장소 상태의 갱신일과 부합하지만 원격 workflow #756이나 현재 계정 차단 상태를 별도로 검증한 것은 아니다.

### 재개 후 첫 알림

- 실제 외부 상태는 아직 없다. 앞으로 설치기가 기존 저장소 상태를 이어받고 normal로 실행한다는 조건에서, 활성 프로필은 이미 initializedAt이 있으므로 초기화 요약 대신 저장 상태와 당시 검색 결과를 비교한다(`src/index.mjs:345-349,658-712`).
- 기준선이 없는 프로필은 첫 normal 실행에서 기준선을 만들고 초기화 요약을 보낸다. 개별 신규·삭제 알림은 초기화된 프로필에 한정된다. 파일 자체가 없으면 wrapper는 초기화 전에 코드 66으로 종료한다.
- 신규는 단순 등록 날짜가 아니라 기존에 확정된 가격 기록이 없는 매물이며, 상세 조회 성공과 titleFilter 통과 후 알린다(`src/lib.mjs:1465-1541,2716-2809`). 매물 ID와 차량 동일성으로 이전 기록을 찾고 중복을 병합한다. 기존 기록과 비교한 가격 인하·인상, 삭제·재등록도 각 조건에 따라 알린다. 가격 기준 초과는 전송 억제 조건이 아니다.
- 현재 config는 활성 프로필 1개, maxPages 2, requestDelayMs 1500, 가격 인상 알림 활성이다. **실행당 알림 건수 상한은 없다**(`src/index.mjs:830-886`). Telegram 기본 간격 1100ms, 메시지별 최대 5회 시도, 메시지 길이 4096자 제한은 전체 알림 건수 제한이 아니다(`src/runtime.mjs:1725-1908`).
- 2026-09-24 이후 중단 기간을 날짜별로 재조회하거나 모든 과거 매물을 발송하는 로직은 없다. 재개 시 조회되는 최대 2페이지와 저장된 상태의 차이가 대상이다. 중단 중 나타났다가 사라진 매물은 현재 결과와 저장 상태 양쪽에 없으면 감지할 수 없다. 실제 결과·조회 성공 여부·알림 건수는 실제 조회 없이 알 수 없다.
- 현재 결과에서 빠진 기존 매물은 삭제 조건에 해당할 수 있지만 판매 완료를 뜻하지 않는다. 첫 페이지 실패·총 0건은 실패 처리한다. 후속 페이지 실패 시 수집분은 처리하되 삭제 판정을 억제하고, 차량 동일성 확인이 부족한 경우에도 삭제를 보류할 수 있다.
- normal은 알림 전송 후 마지막에 상태를 저장한다. 일부 메시지만 성공한 뒤 실패하면 이번 상태 저장이 이루어지지 않아 다음 실행에서 중복 전송될 수 있다.
- `telegram_test`는 설정 검증 후 실제 Telegram 메시지 1건을 보내며 수집·상태 입출력을 생략한다. `send_current`는 현재 결과를 전송하고 기준선 초기화·삭제·전송 이력 갱신은 생략하지만 마지막 **상태 저장은 수행한다**. workflow의 Git commit 생략과 파일 저장 생략은 다르다. 두 모드 모두 이번에 실행하지 않았다.

## 변경 파일

- `ai/notes/2026-10-13-gpt-handoff-local-launchd-review.md`: 요청을 handoff 템플릿으로 먼저 기록. 지정 파일명은 유지하고 실제 작성자는 codex로 표기.
- `README.md`: 로컬 전환 준비·미등록·운영 보류, 예약 중지, 실행 방식과 상태 경로 설명을 영문·한국어에서 정정.
- `local/README.md`: 설치 전 차단 문제, 실제 실행 시점, 상태 경로·모드·로그·잠금·첫 알림·잠자기·향후 복구 절차 명확화.
- `ai/notes/2026-10-13-codex-report-local-launchd-review.md`: 이 검증 보고.
- `ai/CONTEXT.md`: 최신 인수인계·보고와 운영 보류 사유를 50줄 이내로 갱신.

## 수정 내용

- “로컬에서 이미 실행 중”을 준비 상태·미등록으로 정정했다. 로컬 main의 schedule 주석 처리와 원격 미반영의 차이는 위에 기록했다.
- `RunAtLoad=false`여도 등록 후 다음 예약 시각에 수집·전송할 수 있음을 설치 안내에 명시했다. 설치기가 기존 등록을 해제·재등록한다는 사실도 추가했다.
- 잠자기 동안 놓친 StartCalendarInterval 실행은 깨어날 때 수행하고 여러 예약은 한 번으로 합친다. 전원 종료 중 놓친 실행은 다음 예약까지 기다린다. 현재 macOS 26.6.2의 `man launchd.plist` 및 [Apple ScheduledJobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)로 확인했다. 전원·잠자기 설정은 바꾸지 않았다.
- 이전 handoff/report는 append-only 기록이므로 덮어쓰지 않았다. 해당 보고의 단순한 잠자기 설명, 상태 분리에 대한 절대적 표현은 이 보고와 운영 문서로 정정한다. 새 설계 결정은 없어서 DECISIONS.md는 변경하지 않았다.

## 테스트 결과

- 관련 테스트: 테스트 모듈 17개와 import·부작용 경로를 먼저 확인. processProfile/fetch/Telegram은 주입한 mock을 사용한다. main 호출 3곳은 송신·프로필 처리·저장을 대체하거나 telegram_test 경로의 상태 접근을 차단한다. repository-config는 원본 상태를 읽기만 한다. 실제 네트워크 호출·파일 쓰기·하위 프로세스 실행 경로가 없는 것을 확인한 뒤 실행했다.
- 전체 테스트: `npm test` 실제 실행, **236 pass / 0 fail / 0 skipped**, 종료 0. 테스트 코드는 변경하지 않았다.
- 셸: `/bin/bash`에서 run/install/uninstall 각각 `bash -n` 통과. install.sh와 운영 run.sh는 실행하지 않았다.
- plist: 원본 템플릿 및 현재 경로로 임시 디렉터리에 렌더링한 plist 모두 `plutil -lint` OK. Calendar Minute 17/47, RunAtLoad false를 파싱해 확인했다. 설치 경로에는 쓰지 않았다.
- 실패 동작: 운영 명령 없이 `/bin/bash -c`에서 같은 `{ false; printf ...; } || status=$?` 구조를 재현했다. 뒤의 모의 수집 마커가 출력되고 최종 status=0으로 끝나 P1 결함을 확인했다. 명령은 false/printf뿐이며 운영 실행기를 호출하지 않았다.
- 이전 스모크: 더미 URL 검증에서 **종료 코드 1인 실패 경로 확인**이라는 이전 보고를 확인했다. 이번에 재실행하지 않았으며 정상 운영·성공한 수집·전송의 근거로 사용하지 않는다.
- 문서 diff 공백 검사와 변경 범위 검토 통과. 상태 파일 해시 및 Git blob 불변 확인. 문서만 변경했으므로 통과한 테스트를 이유 없이 반복하지 않았다.
- 실행 환경: 로컬 macOS 26.6.2 (25G83), ARM64, Node v25.9.0, npm 11.12.1.

## Git

- branch: `main`, 원격 기준 `origin/main` (`1f6e118`, fetch 시점).
- commit: `9465288` — `docs(ai): add local runner verification handoff / 로컬 실행 검증 인수인계 추가`
- commit: `c0ef8da` — `docs: clarify local runner operation / 로컬 실행 운영 안내 정정`
- 본 report와 최종 CONTEXT는 `docs(ai): record local runner verification / 로컬 실행 검증 결과 기록`으로 별도 commit한다. 해당 hash와 commit 후 최종 git status는 사용자 최종 보고에 기재한다.
- Pull Request: 없음. main에 직접 commit.
- GitHub Actions: 실행하지 않음. 로컬 예약 중지 커밋은 원격에 미반영. 계정 차단 상태는 이전 보고 배경이며 이번에 원격 재검증하지 않음.

## 남은 제한사항

- P1 실패 차단 결함 해결과 무전송 회귀 검증이 먼저 필요하다. 환경 파일·자격 증명·외부 상태 준비, launchd 등록, 실수집·전송·첫 예약 실행의 성공은 모두 미확인 또는 미실시다.
- launchd 조회는 현재 시점의 스냅샷이다. 과거 수동 실행 전체와 GitHub 서비스 상태는 이 근거만으로 확정하지 않는다.
- 다음 사용자 단계 한 가지: **`local/run.sh`의 실패 즉시 종료 결함 수정을 별도 작업으로 요청한다.** 그 작업에서도 실제 운영 실행 승인과는 구분한다.

## 정리

- 임시 파일 또는 workflow 유지/삭제: 검사 스크립트 출력·테스트 로그·렌더링 plist·문서 초안은 `/private/tmp/sentinel-launchd-review.GCfyIf/`에만 두었다. 운영 상태·환경 파일을 복사한 임시 파일은 없다. 저장소에는 요청한 문서만 남기며 workflow는 수정하지 않았다.
- 실제 수집·Telegram 전송·외부 API 쓰기, launchd 등록·해제·재시작, 전원 설정과 자기호스팅 러너 변경, 상태 파일 변경, .env.local 생성·수정, push는 수행하지 않았다.
