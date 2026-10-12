# 로컬 launchd 실행

GitHub Actions 계정 비활성화에 대응해 준비한 맥 launchd 실행기다. workflow의 `schedule`은 주석 처리했고, `workflow_dispatch`와 기존 실행 단계는 유지했다.
원본 cron `17,47 * * * *`과 plist 모두 매시 17분·47분이며 한국시간도 같다.

2026-10-13 검증에서 에이전트 미등록과 `.env.local`·외부 상태 파일·로컬 운영 로그 부재를 확인했다. 이후 실행기의 단계 실패 처리 결함은 수정했고 격리 회귀 테스트를 통과했다. npm ci 또는 npm test가 실패하면 후속 단계를 실행하지 않으며, 수집 실패도 원래 종료 코드로 반환한다. 이번 수정에서 운영 준비·등록·실제 수집·전송은 수행하지 않았다. 이전 검증에서 확인한 원격 schedule 활성·미push 문제도 남아 있다. [실패 처리 수정 보고](../ai/notes/2026-10-13-codex-report-local-runner-failure-fix.md)와 [기존 운영 검증 보고](../ai/notes/2026-10-13-codex-report-local-launchd-review.md)를 참조한다.

## 설치

아래는 운영 준비를 마치고 사용자가 운영 시작을 승인했을 때의 절차다. 이번 수정에서는 실행하지 않았다.

1. Node.js 25와 npm 경로를 확인한다. 설치기는 현재 `node`의 디렉터리를 plist에 넣으며, 수동 실행기의 기본 경로는 `/opt/homebrew/bin`이다.
2. `.env.local.example`을 `.env.local`로 복사하고 값을 채운 뒤 `chmod 600 .env.local`로 접근 권한을 제한한다. 이 파일은 Git에서 무시되며 실행기가 셸 파일로 `source`한다. 실제 값은 로그·문서·Git에 남기지 않는다.
3. `STATE_PATH`는 지정하지 않으면 아래 외부 경로를 사용한다. 예제의 주석을 해제해 직접 지정할 때는 공백 때문에 반드시 `STATE_PATH="$HOME/Library/Application Support/sentinel-o-car/state.json"`처럼 따옴표로 감싼다. 현재 예제의 주석에는 따옴표가 빠져 있다.
4. `local/install.sh`는 외부 상태 파일이 **없을 때만** `data/state.json`을 복사한다. 기존 외부 파일은 유지한다. 설치기는 `.env.local`의 존재만 확인하고 내용은 검증하지 않으며, 기본 외부 경로만 준비하므로 별도 `STATE_PATH`를 지정한 경우 설치·실행 경로가 달라질 수 있다.
5. 준비와 실제 실행 승인을 마친 뒤 `local/install.sh`로 등록한다. 이미 등록돼 있으면 해제 후 재등록하므로 단순 확인용으로 실행하지 않는다.
6. 등록 상태 조회: `launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car`

**`RunAtLoad=false`는 등록 즉시 시작하는 것을 막을 뿐이다. 등록 후 다음 17분·47분에는 실제 수집과 Telegram 전송이 시작될 수 있고, 잠든 동안 놓친 예약은 깨어날 때 실행될 수 있다.** 사용자 GUI 세션의 LaunchAgent이며 로그인 전 시스템 데몬으로 동작하는 구성이 아니다.

## 해제

`local/uninstall.sh`는 에이전트를 해제하고 plist를 삭제한다. 상태 파일과 로그는 유지한다. 이번 검증에서는 실행하지 않았다.

## 로그와 중복 실행

- `~/Library/Logs/sentinel-o-car/YYYY-MM-DD.log`: 실행 단계와 종료 코드. 로그 연결·잠금 획득 후의 정상 종료와 단계 실패, 환경 파일 누락·로드 실패·상태 누락은 EXIT 처리에서 원래 코드를 한 번 기록한다.
- `~/Library/Logs/sentinel-o-car/launchd.log`: 실행기 자체 로그 전환 전의 표준 출력·오류.
- 같은 `${TMPDIR:-/tmp}/sentinel-o-car.lock`을 사용하는 실행끼리는 `mkdir` 잠금으로 중복을 막는다. 잠금 획득에 성공한 실행만 `EXIT` trap을 등록해 정상·실패 종료 시 정리한다. 기존 잠금이 있으면 후속 단계를 실행하지 않고 잠금도 삭제하지 않는다. 다른 `TMPDIR`의 수동 실행이나 Actions 실행까지 공통으로 잠그지는 않는다.
- SIGKILL·전원 종료처럼 EXIT 처리가 불가능한 중단 후 잠금이 남으면 이후 실행은 건너뛰고 0을 반환할 수 있다. 잠금을 제거하기 전 실행 중인 프로세스 유무를 확인해야 한다. 종료 코드 0만으로 실제 수집 성공을 판단하지 말고 실행 단계와 앱 완료 기록도 확인한다.

## 실행기 회귀 테스트

`node --test test/local-runner.test.mjs`로 단계 실패, 성공 순서, 잠금 정리·기존 잠금 보존을 검증한다. 테스트는 실제 `local/run.sh`를 내용 변경 없이 임시 저장소에 복사하고 가짜 npm·node만 호출한다. 환경 파일·로그·상태·잠금도 임시 경로를 사용하며 운영 앱이나 자격 증명을 복사하지 않는다. 전체 `npm test`에도 포함된다.

## 수동 실행

다음 명령은 모두 실제 운영 명령이다. dry-run은 없으며 별도 실행 승인이 필요하다.

```bash
local/run.sh normal          # 수집·변경 알림·상태 저장
local/run.sh telegram_test   # 실제 Telegram 메시지 1건; 수집·상태 읽기/저장 없음
local/run.sh send_current    # 현재 검색 결과 전송·상태 저장
```

명령 인수가 `.env.local` 및 상속 환경의 `RUN_MODE`보다 우선한다. 인수 없이 실행하면 환경값을 사용하고, 값도 없으면 `normal`이다. 출력은 터미널이 아니라 위 로그 파일에 기록된다.

`send_current`는 기준선 초기화·삭제 판정·전송 이력 갱신·Git commit을 생략하지만 **상태 파일 저장은 수행한다**. 두 전송 모드 모두 연결 확인용 무전송 테스트가 아니다.

## 상태 파일과 재개 후 첫 알림

- `local/run.sh`의 기본 상태 경로는 `$HOME/Library/Application Support/sentinel-o-car/state.json`이다. 로컬 실행기는 상태를 Git에 commit하지 않는다.
- 이 분리는 기본값에 의존한다. 상속 환경 또는 `.env.local`의 `STATE_PATH`가 저장소 경로를 가리키면 원본을 읽고 쓸 수 있다. 저장소 루트에서 `STATE_PATH` 없이 `npm run scrape` 또는 `node src/index.mjs`를 직접 실행하면 `data/state.json`을 사용하며 `.env.local`도 자동 로드하지 않는다.
- 현재 저장소 상태에는 활성 프로필의 기존 기준선이 있다. 이를 설치 때 이어받으면 재개 실행은 초기화가 아니라 기존 상태와 현재 조회 결과를 비교한다. 기준선이 없는 프로필의 첫 `normal` 실행은 초기화 요약을 보내고 개별 신규·삭제 알림은 만들지 않는다.
- 현재 설정은 활성 프로필 1개, 검색 최대 2페이지다. 기존에 확정된 기록이 없는 현재 매물은 상세 조회 성공 시 신규 알림 대상이며, 가격변동·재등록·삭제는 각각 코드 조건을 따른다. 가격 상한은 알림 건수를 제한하지 않는다.
- 실행당 알림 건수 상한은 없다. Telegram의 기본 전송 간격 1.1초와 메시지별 최대 5회 시도는 건수 상한이 아니다. 2026-09-24 이후 중단 기간 전체 매물을 재생하는 기능도 없다. 재개 시 실제 검색 결과와 기존 상태의 차이만 알 수 있으며 예상 건수는 실제 조회 없이 확정할 수 없다.
- 전송 도중 실패하면 마지막 상태 저장까지 도달하지 못해, 이미 보낸 일부 알림이 다음 실행에서 반복될 수 있다.

## 잠자기와 예약

`StartCalendarInterval`은 잠든 동안 놓친 실행을 깨어날 때 수행하며, 여러 예약이 지났으면 한 번으로 합친다. 전원이 꺼져 있을 때 놓친 실행은 다음 예약 시각까지 실행되지 않는다. 근거: macOS 26.6.2의 `man launchd.plist`와 [Apple의 Scheduling Timed Jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html).

전원·잠자기 설정과 기존 자기호스팅 러너 서비스(`actions.runner.*`)는 이번 검증에서 변경하지 않았다. 예약을 놓쳤을 때 합쳐지는 것은 실행 횟수이며, 중단 기간 매물 이력이 복원되는 것은 아니다.

## Actions 복구 시 되돌리기

아래는 향후 전환 계획이며 이번 작업의 실행 승인에 포함되지 않는다.

1. 승인된 전환 시점에 `local/uninstall.sh`로 로컬 예약을 해제하고 실행 중인 수집도 없는지 확인한다. `workflow_dispatch`도 실제 실행할 수 있으므로 중복 운영하지 않는다.
2. 별도 승인 아래 실제 사용한 외부 상태를 `data/state.json`으로 이어받을지 검토한다. 복사·commit은 이번 검증에서 하지 않는다.
3. 상태 인계와 로컬 중지가 확인된 뒤 `.github/workflows/sentinel-o-car.yml`의 `schedule` 주석 해제를 별도로 검토한다.
