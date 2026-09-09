# Sentinel-o-car

> Version 1.1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring multiple used-car search conditions on Encar. Its production monitoring workflow runs through GitHub Actions on a self-hosted Apple Silicon Mac and sends all notifications to a single Telegram channel or chat. It is not an official Encar service or an official API client.

## Deployment and Usage

### 1. Start the self-hosted Mac runner

The production monitoring workflow, `.github/workflows/sentinel-o-car.yml`, requires a runner with the labels `[self-hosted, macOS, ARM64]` and uses Node.js 25. A GitHub-hosted runner could not collect Encar listings because Encar returned `client-verification/blocked`, while collection and a `normal` run were verified on the self-hosted Mac. Do not change this production workflow back to `ubuntu-latest`.

The runner is installed in `~/actions-runner` and is currently started manually, not as a `launchd` service. Before scheduled or manual operation, run:

```bash
cd ~/actions-runner
./run.sh
```

The runner is active when the terminal displays `Listening for Jobs`. Keep that terminal and process running, and keep the Mac awake and network-connected. If the terminal is closed, the process exits, or the Mac is unavailable, a scheduled job can remain queued while waiting for a matching runner.

### 2. Prepare Telegram

1. Open Telegram `@BotFather`, create a bot with `/newbot`, and securely store the Bot Token.
2. Create a notification channel, add the bot as an administrator through the `Administrators` menu, and grant it permission to post messages.
3. Using a public channel is recommended. Enter `@channel_username` as `TELEGRAM_CHAT_ID`.
4. The command below can be used to find the Chat ID of a direct conversation or group with the bot. It does not return channel IDs.

```bash
TELEGRAM_BOT_TOKEN=<BOT_TOKEN> npm run chat-id
```

References: [Bot tutorial](https://core.telegram.org/bots/tutorial) · [Bot API](https://core.telegram.org/bots/api)

### 3. GitHub Secrets

Path: Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token issued by BotFather |
| `TELEGRAM_CHAT_ID` | `@channel_username` or a numeric channel ID |

Do not store the token or Chat ID in `config.json` or the README.

### 4. GitHub Variables and Encar URLs

Path: Repository → Settings → Secrets and variables → Actions → Variables → New repository variable

1. Select the desired conditions on the [Encar](https://car.encar.com/) search page.
2. On the first page of the search results, copy the complete URL from the browser address bar.
3. Save it as a Repository Variable with the same name as the profile's `searchUrlEnv` value in `config.json`.

The production workflow currently maps these Repository Variables:

| Profile | Repository Variable | Current status |
| --- | --- | --- |
| Model 3 AWD | `ENCAR_SEARCH_URL_TESLA_MODEL3` | Enabled; required |
| Toyota Sienna | `ENCAR_SEARCH_URL_TOYOTA_SIENNA` | Disabled |
| Search slot 3 | `ENCAR_SEARCH_URL_3` | Disabled |
| Search slot 4 | `ENCAR_SEARCH_URL_4` | Disabled |
| Search slot 5 | `ENCAR_SEARCH_URL_5` | Disabled |

An enabled profile requires a non-empty Variable matching its `searchUrlEnv`. A disabled profile may leave its Variable empty, but it must be configured before that profile is enabled.

- Use a search-results URL, not an individual vehicle-detail URL.
- Do not shorten or manually edit the URL.
- Enter only the URL, without quotation marks.

The maximum number of pages to collect is configured with maxPages in config.json.

### 5. Configure `config.json`

```json
{
  "configVersion": 2,
  "notifyPriceIncrease": true,
  "maxPages": 2,
  "requestDelayMs": 1500,
  "profiles": [
    {
      "id": "example-profile",
      "name": "Example vehicle",
      "enabled": true,
      "searchUrlEnv": "ENCAR_SEARCH_URL_EXAMPLE",
      "isTesla": false,
      "titleFilter": {
        "requiredAll": [],
        "requiredAny": [],
        "excludedAny": []
      },
      "price": { "maxPriceKrw": 30000000 }
    },
    {
      "id": "example-tesla",
      "name": "Example Tesla profile",
      "enabled": false,
      "searchUrlEnv": "ENCAR_SEARCH_URL_EXAMPLE_TESLA",
      "isTesla": true,
      "titleFilter": {
        "requiredAll": [],
        "requiredAny": [],
        "excludedAny": []
      },
      "price": {
        "maxPriceKrw": 30000000,
        "eapMaxPriceKrw": 32000000,
        "fsdMaxPriceKrw": 34000000
      }
    }
  ]
}
```

- `id`: A unique identifier for the listing profile. Do not change it after the profile begins operating.
- `name`: The profile name displayed in Telegram messages.
- `enabled`: Only profiles set to `true` are processed.
- `searchUrlEnv`: The name of the GitHub Variable containing the Encar search URL.
- `isTesla`: Determines whether Tesla option-specific price evaluation is used.
- `titleFilter`: Additional conditions evaluated from the listing title. It does not replace the search conditions encoded in the Encar URL.
- `price`: The threshold used for condition evaluation in Telegram messages. It does not block notifications.

Set registration year, mileage, color, fuel type, and sale type through the Encar search URL. Changes to `enabled`, `name`, `titleFilter`, or `price` require editing only `config.json`. Adding a new `searchUrlEnv` also requires adding the corresponding environment-variable mapping to the workflow.

### 6. Run the workflow and choose `RUN_MODE`

Path: Repository → Actions → Sentinel-o-car → Run workflow

The workflow supports two triggers:

- `schedule`: `17,47 * * * *`, which requests a `normal` run at minute 17 and 47 of every hour. GitHub Actions cron is evaluated in UTC.
- `workflow_dispatch`: A manual run with the required `run_mode` choice. The default is `normal`, and the only choices are `normal`, `send_current`, and `telegram_test`.

The supported `RUN_MODE` values are:

1. `normal`: Compares saved state with the current listings and handles new listings, price changes, deletions, and relistings. On the first run, it saves the current listings as the baseline and sends one initialization summary instead of individual new-listing notifications.
2. `send_current`: Sends the current listings that pass `titleFilter`. It does not initialize the baseline or evaluate deletions, and the workflow does not commit state in this mode.
3. `telegram_test`: Sends one real Telegram test message without collecting Encar listings or reading or saving watcher state. Configuration is validated first, so Variables required by enabled profiles must already be set.

Every workflow run checks out the repository, sets up Node.js 25, runs `npm test`, and then runs `npm run scrape`. Updated `data/state.json` is committed only for scheduled runs and manually dispatched `normal` runs, and only when the file changed.

### 7. Regular Operation

- Keep the self-hosted runner online and showing `Listening for Jobs` before a run is due.
- Disable a profile: Change its `enabled` value in `config.json` to `false`.
- Change search conditions: Search again on Encar with the updated conditions, copy the new URL, and update the corresponding Variable.
- Change price or title conditions: Edit `config.json`.
- Do not manually edit `data/state.json`; it is managed by GitHub Actions.
- Run the local test suite with the package script below. It does not perform the production scrape.

```bash
npm test
```

| Symptom | Action |
| --- | --- |
| Workflow job remains queued | Start `~/actions-runner/run.sh`, confirm `Listening for Jobs`, and keep the Mac available |
| Encar `client-verification/blocked` | Confirm the production workflow still uses `[self-hosted, macOS, ARM64]`; do not move it to `ubuntu-latest` |
| Telegram `fetch` repeatedly reports `ETIMEDOUT` | Keep the workflow on Node.js 25. On the same Mac, Node 22.23.2 repeatedly timed out while Node 25.9.0 connected successfully |
| Telegram 401 | Check the Bot Token |
| `chat not found` | Check the Chat ID and the bot's channel permissions |
| URL environment-variable error | Check that `searchUrlEnv` matches the Variable name |
| Encar URL error | Copy the complete URL again from the first page of the search results |

Telegram delivery retries only selected temporary connection errors and HTTP 429 responses, up to a limited number of attempts. Persistent failures still fail the job and require a network or configuration check.

## Behavior Summary

- Sends notifications for new listings, price increases or decreases, deleted listings, and relisted listings according to the saved profile state and `titleFilter`.
- The only internal inclusion and exclusion rules applied to URL search results are `titleFilter.requiredAll`, `requiredAny`, and `excludedAny`.
- Price is used only for condition evaluation in Telegram messages. Notifications are still sent even when the listing does not meet the price condition.
- Identifies relisted vehicles by registration number, suppresses duplicate advertisements, and preserves previously confirmed values when a listing-detail request fails.
- For Tesla profiles, FSD and EAP options are evaluated from the dealer's listing description, and the corresponding price threshold is applied.
- Unconfirmed values are not guessed and are displayed explicitly, such as `Color unavailable`.
- Telegram sending intervals are controlled to avoid excessive requests, and selected temporary connection errors and HTTP 429 responses are retried a limited number of times.

A `listing deleted` notification means that the advertisement disappeared from the search results for that profile. It does not confirm that the vehicle was sold.

## Notes

- Changes to the Encar page structure may require updates to the project.
- If no Encar listings can be extracted, the run fails instead of saving an empty result. If a later page fails, collected results are kept while deletion detection is suppressed.
- Some option evaluations rely on public listing text and should be verified manually.
- Before purchasing a vehicle, separately verify the vehicle inspection report, insurance history, and actual vehicle condition.
- This project is intended for personal use, not bulk data collection.
- `data/state.json` may contain listing IDs, vehicle registration numbers, prices, URLs, and notification records. Review it before making the repository public.
- This project is distributed under the MIT License. See `LICENSE` for details.

---

# 한국어

## 개요

Sentinel-o-car는 엔카의 여러 중고차 검색 조건을 감시하는 개인용 도구입니다.
운영 감시 워크플로는 Apple Silicon Mac의 self-hosted runner에서 GitHub Actions로 실행되며 모든 알림을 하나의 텔레그램 채널 또는 채팅으로 전송합니다.
엔카 공식 서비스나 공식 API 클라이언트가 아닙니다.

## 배포 및 사용

### 1. Self-hosted Mac runner 시작

운영 감시 워크플로 `.github/workflows/sentinel-o-car.yml`은 `[self-hosted, macOS, ARM64]` label의 runner와 Node.js 25를 사용합니다. GitHub-hosted runner에서는 엔카가 `client-verification/blocked`를 반환하여 목록을 수집하지 못했고 self-hosted Mac에서는 목록 수집과 `normal` 실행 성공을 확인했으므로, 이 운영 워크플로를 `ubuntu-latest`로 되돌리지 않습니다.

runner는 `~/actions-runner`에 설치되어 있으며 현재 `launchd` 서비스가 아닌 수동 실행 방식입니다. 예약 또는 수동 운영 전에 다음 명령으로 시작합니다.

```bash
cd ~/actions-runner
./run.sh
```

터미널에 `Listening for Jobs`가 표시되면 runner가 활성화된 상태입니다. 터미널과 프로세스를 계속 실행하고 Mac의 잠자기 및 네트워크 연결 상태를 확인합니다. 터미널을 닫거나 프로세스가 종료되거나 Mac을 사용할 수 없으면 예약 job이 조건에 맞는 runner를 기다리며 대기할 수 있습니다.

### 2. Telegram 준비

1. Telegram `@BotFather`에서 `/newbot`으로 봇을 만들고 Bot Token을 보관합니다.
2. 알림용 채널을 만들고 관리자(`Administrators`) 메뉴에서 봇을 관리자로 추가한 뒤 메시지 게시 권한을 부여합니다.
3. 공개 채널 사용을 권장하며, `TELEGRAM_CHAT_ID`에는 `@채널사용자명`을 입력합니다.
4. 아래 명령은 봇과의 1:1 대화 또는 그룹 Chat ID 확인용이며 채널 ID는 출력하지 않습니다.

```bash
TELEGRAM_BOT_TOKEN=<BOT_TOKEN> npm run chat-id
```

참고: [Bot tutorial](https://core.telegram.org/bots/tutorial) · [Bot API](https://core.telegram.org/bots/api)

### 3. GitHub Secrets

경로: Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret

| 이름 | 값 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 발급 토큰 |
| `TELEGRAM_CHAT_ID` | `@채널사용자명` 또는 숫자 채널 ID |

토큰과 Chat ID는 `config.json`이나 README에 넣지 않습니다.

### 4. GitHub Variables와 엔카 URL

경로: Repository → Settings → Secrets and variables → Actions → Variables → New repository variable

1. [엔카](https://car.encar.com/) 검색 화면에서 원하는 조건을 선택합니다.
2. 검색 결과 첫 페이지에서 주소창 URL 전체를 복사합니다.
3. `config.json`의 `searchUrlEnv`와 같은 이름의 Repository Variable에 저장합니다.

운영 워크플로가 현재 연결하는 Repository Variables는 다음과 같습니다.

| 프로필 | Repository Variable | 현재 상태 |
| --- | --- | --- |
| Model 3 AWD | `ENCAR_SEARCH_URL_TESLA_MODEL3` | 활성화, 필수 |
| 도요타 시에나 | `ENCAR_SEARCH_URL_TOYOTA_SIENNA` | 비활성화 |
| 검색 조건 3 | `ENCAR_SEARCH_URL_3` | 비활성화 |
| 검색 조건 4 | `ENCAR_SEARCH_URL_4` | 비활성화 |
| 검색 조건 5 | `ENCAR_SEARCH_URL_5` | 비활성화 |

활성 프로필에는 `searchUrlEnv`와 일치하는 비어 있지 않은 Variable이 필요합니다. 비활성 프로필의 Variable은 비워 둘 수 있지만, 해당 프로필을 활성화하기 전에 설정해야 합니다.

- 차량 상세 URL이 아닌 검색 결과 URL 사용
- URL을 자르거나 직접 편집하지 않음
- 따옴표 없이 URL만 입력

매물의 최대 수집 페이지 수는 config.json의 maxPages에서 설정합니다.

### 5. config.json 설정

```json
{
  "configVersion": 2,
  "notifyPriceIncrease": true,
  "maxPages": 2,
  "requestDelayMs": 1500,
  "profiles": [
    {
      "id": "example-profile",
      "name": "Example vehicle",
      "enabled": true,
      "searchUrlEnv": "ENCAR_SEARCH_URL_EXAMPLE",
      "isTesla": false,
      "titleFilter": {
        "requiredAll": [],
        "requiredAny": [],
        "excludedAny": []
      },
      "price": { "maxPriceKrw": 30000000 }
    },
    {
      "id": "example-tesla",
      "name": "Example Tesla profile",
      "enabled": false,
      "searchUrlEnv": "ENCAR_SEARCH_URL_EXAMPLE_TESLA",
      "isTesla": true,
      "titleFilter": {
        "requiredAll": [],
        "requiredAny": [],
        "excludedAny": []
      },
      "price": {
        "maxPriceKrw": 30000000,
        "eapMaxPriceKrw": 32000000,
        "fsdMaxPriceKrw": 34000000
      }
    }
  ]
}
```

- `id`: 매물 프로필 고유값이므로 변경하지 않습니다.
- `name`: 텔레그램에 표시할 프로필 이름입니다.
- `enabled`: `true`인 프로필만 실행합니다.
- `searchUrlEnv`: GitHub Variable 에 등록된 엔카 URL주소의 항목명을 적습니다.
- `isTesla`: Tesla 옵션별 가격 판정 사용 여부입니다.
- `titleFilter`: 매물의 이름으로 판단하는 추가 조건이며 엔카 URL주소의 검색조건을 대신하지 않습니다.
- `price`: 텔레그램 메시지의 조건충족 판정 기준이며 알림 자체를 차단하지 않습니다.

연식·주행거리·색상·연료·판매방식은 엔카 URL에서 설정합니다. `enabled`, `name`, `titleFilter`, `price` 변경은 `config.json`만 수정하면 되고, 새 `searchUrlEnv` 추가는 워크플로 환경변수 매핑도 필요합니다.

### 6. 워크플로 실행과 `RUN_MODE` 선택

경로: Repository → Actions → Sentinel-o-car → Run workflow

워크플로는 두 가지 방식으로 실행됩니다.

- `schedule`: `17,47 * * * *`로 매시 17분과 47분에 `normal` 실행을 요청합니다. GitHub Actions cron은 UTC 기준입니다.
- `workflow_dispatch`: 필수 선택 항목인 `run_mode`로 수동 실행합니다. 기본값은 `normal`이며 선택지는 `normal`, `send_current`, `telegram_test`뿐입니다.

지원하는 `RUN_MODE` 값은 다음과 같습니다.

1. `normal`: 저장 상태와 현재 매물을 비교하여 신규·가격변동·삭제·재등록을 처리합니다. 최초 실행에서는 현재 매물을 기준점으로 저장하고 개별 신규 매물 알림 대신 초기화 요약 메시지 1건을 보냅니다.
2. `send_current`: `titleFilter`를 통과한 현재 매물을 전송합니다. 기준점을 초기화하거나 삭제를 판정하지 않으며, 워크플로는 이 모드에서 상태를 커밋하지 않습니다.
3. `telegram_test`: 실제 텔레그램 테스트 메시지 1건을 보내며 엔카 목록을 수집하거나 감시 상태를 읽고 저장하지 않습니다. 먼저 설정을 검증하므로 활성 프로필에 필요한 Variable은 미리 설정되어 있어야 합니다.

모든 워크플로 실행은 저장소 checkout, Node.js 25 설정, `npm test`, `npm run scrape` 순서로 진행됩니다. 변경된 `data/state.json`은 예약 실행과 수동 `normal` 실행에서만, 실제 파일 변경이 있을 때 커밋됩니다.

### 7. 일반 운영

- 실행 예정 시각 전에 self-hosted runner를 켜고 `Listening for Jobs` 상태를 유지
- 프로필 중지: `config.json`의 `enabled`를 `false`로 변경
- 검색 조건 변경: 엔카에서 변경된 조건으로 검색 후 URL을 복사해 Variable 업데이트
- 가격·제목 조건 변경: `config.json` 수정
- `data/state.json`은 Github Actions가 관리하므로 수동 편집하지 않음
- 아래 package script로 로컬 테스트를 실행하며 실제 운영 수집은 수행하지 않음

```bash
npm test
```

| 증상 | 조치 |
| --- | --- |
| 워크플로 job이 대기 상태에 머묾 | `~/actions-runner/run.sh`를 시작하고 `Listening for Jobs`를 확인한 뒤 Mac을 사용 가능한 상태로 유지 |
| 엔카 `client-verification/blocked` | 운영 워크플로가 `[self-hosted, macOS, ARM64]`를 유지하는지 확인하고 `ubuntu-latest`로 변경하지 않음 |
| Telegram `fetch`에서 `ETIMEDOUT` 반복 | Node.js 25를 유지. 같은 Mac에서 Node 22.23.2는 반복 실패했고 Node 25.9.0은 정상 연결을 확인함 |
| Telegram 401 | Bot Token 확인 |
| chat not found | Chat ID와 봇의 채널 권한 확인 |
| URL environment variable 오류 | `searchUrlEnv`와 Variable 이름 확인 |
| 엔카 URL 오류 | 검색 결과 첫 페이지 URL 전체를 다시 복사 |

텔레그램 전송은 일부 일시적 연결 오류와 HTTP 429만 제한된 횟수로 재시도합니다. 오류가 계속되면 job이 실패하므로 네트워크와 설정을 확인해야 합니다.

## 동작 요약

- 저장된 프로필 상태와 `titleFilter`에 따라 신규 매물, 가격 인하·인상, 매물삭제, 재등록 알림을 전송합니다.
- URL 검색 결과에 적용되는 내부 포함·제외 규칙은 `titleFilter.requiredAll`, `requiredAny`, `excludedAny`뿐입니다.
- 가격은 텔레그램 조건 판정에만 사용하며, 가격이 맞지 않아도 텔레그램 메시지는 전송됩니다.
- 차량번호로 동일 차량 재등록을 식별하고 중복 광고를 억제하며, 매물 상세 페이지 요청이 실패하는 경우 기존 값을 유지합니다.
- Tesla 프로필은 딜러의 매물소개란 기반으로 FSD·EAP 옵션을 판정하여 가격 기준을 추가 적용합니다.
- 확인하지 못한 값은 추정하지 않고 `색상 미확인`처럼 그대로 표시합니다.
- 텔레그램 전송 간격을 제어하며, 일부 일시적 연결 오류와 HTTP 429를 제한된 횟수로 재시도합니다.

`매물삭제`는 해당 프로필의 검색 결과에서 광고가 사라졌다는 뜻이며 판매 완료를 확정하지 않습니다.

## 참고사항

- 엔카 페이지 구조가 바뀌면 수정이 필요할 수 있습니다.
- 엔카 매물을 한 건도 추출하지 못하면 빈 결과를 저장하지 않고 실패 처리합니다. 후속 페이지가 실패하면 수집된 결과는 유지하되 삭제 판정을 억제합니다.
- 일부 옵션 판정은 공개 문구 기반이므로 직접 확인이 필요합니다.
- 구매 전 성능점검기록부, 보험이력, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인 사용을 목적으로 하며 대량 수집용이 아닙니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 검토하십시오.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
