# 로컬 launchd 실행

macOS의 launchd를 사용해 Sentinel-o-car를 정기 실행하는 방법을 안내합니다.
실행기는 의존성 설치, 테스트, 수집을 순서대로 수행하며, 앞 단계가 실패하면 다음 단계를 실행하지 않고 해당 종료 코드를 반환합니다.

## 준비 사항

- macOS 사용자 로그인 세션
- Node.js 25 및 npm
- 프로젝트 저장소
- Telegram 봇 토큰과 알림을 받을 채팅 ID
- 활성 검색 프로필의 검색 URL

아래 명령은 프로젝트 루트에서 실행합니다.
다른 Mac이나 실행 환경과 동시에 운영하지 않도록 예약과 실행 중인 작업을 확인하세요.

## 환경 설정

`.env.local.example`을 복사해 환경 파일을 만듭니다.
이미 `.env.local`이 있으면 기존 설정을 유지하세요.

```bash
cp .env.local.example .env.local
chmod 600 .env.local
```

`.env.local`에 Telegram 설정과 활성 프로필의 검색 URL을 입력합니다.
이 파일은 Git에서 무시되며, 실행기가 셸 파일로 `source`합니다.
신뢰할 수 있는 설정만 입력하고 실제 토큰과 인증 정보는 로그·문서·Git에 남기지 마세요.

`STATE_PATH`를 생략하면 기본 외부 상태 경로를 사용합니다.
직접 지정할 경우 공백이 포함된 경로는 반드시 따옴표로 감쌉니다.

```bash
STATE_PATH="$HOME/Library/Application Support/sentinel-o-car/state.json"
```

## 예약 등록

`local/install.sh`는 현재 `node`의 디렉터리를 plist에 설정합니다.
수동 실행기의 기본 Node.js 경로는 `/opt/homebrew/bin`입니다.

설치기는 `.env.local`의 존재 여부만 확인하며, 설정값의 유효성은 검증하지 않습니다.
등록 전에 필수 설정과 상태 파일 경로를 확인하세요.

```bash
local/install.sh
```

설치 시 기본 외부 상태 파일이 없으면 저장소의 `data/state.json`을 복사하고, 이미 있으면 유지합니다.
별도 `STATE_PATH`를 지정한 경우 설치기가 준비하는 기본 경로와 실제 실행 경로가 달라질 수 있으므로, 지정한 경로의 상태 파일과 읽기·쓰기 권한을 직접 준비해야 합니다.

이미 등록된 서비스는 해제 후 재등록됩니다.
등록 여부만 확인할 때는 설치기를 다시 실행하지 말고 다음 명령을 사용하세요.

```bash
launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car
```

서비스는 매시 **17분·47분**에 실행됩니다.
`RunAtLoad=false`이므로 등록 직후 자동 실행하지 않지만, 다음 예약부터 실제 수집과 Telegram 전송이 발생할 수 있습니다.
사용자 GUI 세션의 LaunchAgent이며, 로그인 전부터 동작하는 시스템 데몬은 아닙니다.

## 수동 실행

| 명령 | 동작 |
| --- | --- |
| `local/run.sh normal` | 수집, 변경 알림, 상태 저장 |
| `local/run.sh telegram_test` | Telegram 메시지 1건 전송, 수집·상태 읽기·저장 없음 |
| `local/run.sh send_current` | 현재 검색 결과 전송, 상태 저장 |

위 명령은 모두 실제 운영 명령이며 dry-run이 아닙니다.

명령 인수는 `.env.local` 및 상속 환경의 `RUN_MODE`보다 우선합니다.
인수가 없으면 환경값을 사용하고, 환경값도 없으면 `normal`로 실행합니다.
출력은 터미널 대신 일별 로그 파일에 기록됩니다.

`send_current`는 기준선 초기화, 삭제 판정, 전송 이력 갱신, Git commit을 생략하지만 **상태 파일 저장은 수행합니다**.
`telegram_test`와 `send_current` 모두 실제 메시지를 전송합니다.

## 파일 위치와 로그 확인

| 항목 | 기본 위치 |
| --- | --- |
| 환경 설정 | 프로젝트 루트의 `.env.local` |
| 상태 파일 | `$HOME/Library/Application Support/sentinel-o-car/state.json` |
| 일별 실행 로그 | `$HOME/Library/Logs/sentinel-o-car/YYYY-MM-DD.log` |
| launchd 출력 로그 | `$HOME/Library/Logs/sentinel-o-car/launchd.log` |

일별 로그에는 실행 단계와 종료 코드가 기록됩니다.
`launchd.log`에는 실행기가 일별 로그로 출력을 전환하기 전의 표준 출력과 오류가 기록됩니다.

다음 명령은 추가 수집 없이 등록 상태와 당일 로그를 확인합니다.

```bash
launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car
tail -n 80 "$HOME/Library/Logs/sentinel-o-car/$(date +%Y-%m-%d).log"
```

정상 완료 여부는 종료 코드와 앱 완료 기록을 함께 확인하세요.
중복 실행 방지로 건너뛴 경우에도 종료 코드가 0일 수 있습니다.

## 중복 실행 방지

실행기는 `${TMPDIR:-/tmp}/sentinel-o-car.lock` 디렉터리를 사용해 중복 실행을 방지합니다.
잠금을 획득한 실행만 종료 처리에서 자신의 잠금을 정리합니다.
기존 잠금이 있으면 후속 단계를 실행하지 않고 해당 잠금도 삭제하지 않습니다.

잠금은 같은 경로를 사용하는 실행에만 적용됩니다.
다른 `TMPDIR`을 사용하는 수동 실행이나 다른 환경의 실행까지 공통으로 잠그지는 않습니다.

SIGKILL이나 전원 종료로 종료 처리가 수행되지 않으면 잠금이 남을 수 있습니다.
남은 잠금을 제거하기 전에는 실제 수집 프로세스가 실행 중인지 확인하세요.

## 상태 파일과 알림

로컬 실행기는 기본적으로 저장소 외부의 상태 파일을 사용하며, 상태를 Git에 commit하지 않습니다.
다만 상속 환경 또는 `.env.local`의 `STATE_PATH`가 저장소 내부를 가리키면 해당 파일을 읽고 쓸 수 있으므로 경로를 확인하세요.

프로젝트 루트에서 `npm run scrape` 또는 `node src/index.mjs`를 직접 실행하면 `.env.local`을 자동으로 읽지 않습니다.
별도 `STATE_PATH`도 없으면 저장소의 `data/state.json`을 사용합니다.

기존 기준선이 있으면 `normal` 실행은 현재 검색 결과와 저장된 상태를 비교합니다.
기준선이 없는 프로필은 첫 실행에서 초기화 요약을 보내며, 개별 신규·삭제 알림은 만들지 않습니다.

활성 프로필과 검색 범위는 프로젝트 설정에 따릅니다.
신규·가격변동·재등록·삭제 알림은 각 판정 조건에 따라 발생하며, 가격 상한은 알림 건수 상한이 아닙니다.

실행당 알림 건수 상한은 없습니다.
중단 기간의 모든 매물 이력을 재생하는 방식이 아니라, 재개 시 검색 결과와 기존 상태의 차이를 비교합니다.

전송 도중 실패하면 마지막 상태 저장까지 도달하지 못할 수 있습니다.
이 경우 이미 전송한 일부 알림이 다음 실행에서 반복될 수 있습니다.

## 잠자기와 예약

`StartCalendarInterval`은 잠든 동안 놓친 예약을 깨어날 때 실행하며, 여러 예약을 놓쳤으면 한 번으로 합칩니다.
전원이 꺼진 동안 놓친 예약은 소급 실행하지 않고 다음 예약 시각에 실행합니다.

합쳐지는 것은 예약 실행 횟수이며, 중단 기간의 매물 이력이 복원되는 것은 아닙니다.

참고: [Apple — Scheduling Timed Jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)

## 예약 해제

```bash
local/uninstall.sh
```

해제 스크립트는 에이전트를 해제하고 plist를 삭제합니다.
상태 파일과 로그는 유지합니다.

## 실행기 테스트

```bash
node --test test/local-runner.test.mjs
```

단계 실패, 성공 순서, 잠금 정리, 기존 잠금 보존을 검증합니다.
테스트는 실제 `local/run.sh`를 임시 저장소에 복사하고 가짜 npm·node를 사용합니다.
환경 파일·로그·상태·잠금도 임시 경로를 사용하며, 운영 앱이나 자격 증명은 복사하지 않습니다.
이 테스트는 전체 `npm test`에도 포함됩니다.
