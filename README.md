# Sentinel-o-car

> Version 1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring multiple used-car search conditions on Encar. It runs through GitHub Actions and sends all notifications to a single Telegram channel or chat. It is not an official Encar service or an official API client.

## Deployment and Usage

### 1. Prepare Telegram

1. Open Telegram `@BotFather`, create a bot with `/newbot`, and securely store the Bot Token.
2. Create a notification channel, add the bot as an administrator through the `Administrators` menu, and grant it permission to post messages.
3. Using a public channel is recommended. Enter `@channel_username` as `TELEGRAM_CHAT_ID`.
4. The command below can be used to find the Chat ID of a direct conversation or group with the bot. It does not return channel IDs.

```bash
TELEGRAM_BOT_TOKEN=<BOT_TOKEN> npm run chat-id
```

References: [Bot tutorial](https://core.telegram.org/bots/tutorial) · [Bot API](https://core.telegram.org/bots/api)

### 2. GitHub Secrets

Path: Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token issued by BotFather |
| `TELEGRAM_CHAT_ID` | `@channel_username` or a numeric channel ID |

Do not store the token or Chat ID in `config.json` or the README.

### 3. GitHub Variables and Encar URLs

Path: Repository → Settings → Secrets and variables → Actions → Variables → New repository variable

1. Select the desired conditions on the [Encar](https://car.encar.com/) search page.
2. On the first page of the search results, copy the complete URL from the browser address bar.
3. Save it as a Repository Variable with the same name as the profile's `searchUrlEnv` value in `config.json`.

- Use a search-results URL, not an individual vehicle-detail URL.
- Do not shorten or manually edit the URL.
- Enter only the URL, without quotation marks.

The maximum number of pages to collect is configured with the root-level `maxPages` value in `config.json`. A separately registered GitHub Repository Variable named `MAX_PAGES` takes precedence when it is set.

### 4. Configure `config.json`

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

### 5. Initial Run

Path: Repository → Actions → Sentinel-o-car → Run workflow

1. `telegram_test`: Sends a message to verify the Telegram configuration.
2. `send_current`: Sends messages for all currently found listings.  
   The results are not saved as the baseline listing state.
3. `normal`: Compares the saved baseline with the currently found listings and sends notifications for new listings, price changes, deletions, and relistings. This is the regular scheduled run mode.  
   On the first `normal` run, all currently found listings are saved as the baseline, but they are not treated as new listings and no individual listing notifications are sent for them.

### 6. Regular Operation

- Disable a profile: Change its `enabled` value in `config.json` to `false`.
- Change search conditions: Search again on Encar with the updated conditions, copy the new URL, and update the corresponding Variable.
- Change price or title conditions: Edit `config.json`.
- Scheduled runs: The workflow runs in `normal` mode according to its `schedule`.
- Do not manually edit `data/state.json`; it is managed by GitHub Actions.

| Symptom | Action |
| --- | --- |
| Telegram 401 | Check the Bot Token |
| `chat not found` | Check the Chat ID and the bot's channel permissions |
| URL environment-variable error | Check that `searchUrlEnv` matches the Variable name |
| Encar URL error | Copy the complete URL again from the first page of the search results |

## Behavior Summary

- Sends notifications for new listings, price increases or decreases, deleted listings, and relisted listings that pass `titleFilter` and complete detail processing successfully.
- The only internal inclusion and exclusion rules applied to URL search results are `titleFilter.requiredAll`, `requiredAny`, and `excludedAny`.
- Price is used only for condition evaluation in Telegram messages. Notifications are still sent even when the listing does not meet the price condition.
- Identifies relisted vehicles by registration number, suppresses duplicate advertisements, and preserves previously confirmed values when a listing-detail request fails.
- For Tesla profiles, FSD and EAP options are evaluated from the dealer's listing description, and the corresponding price threshold is applied.
- Unconfirmed values are not guessed and are displayed explicitly, such as `Color unavailable`.
- Telegram sending intervals are controlled to avoid excessive requests, and HTTP 429 responses are retried automatically.

A `listing deleted` notification means that the advertisement disappeared from the search results for that profile. It does not confirm that the vehicle was sold.

## Notes

- Changes to the Encar page structure may require updates to the project.
- Some option evaluations rely on public listing text and should be verified manually.
- Before purchasing a vehicle, separately verify the vehicle inspection report, insurance history, and actual vehicle condition.
- This project is intended for personal use, not bulk data collection.
- `data/state.json` may contain listing IDs, vehicle registration numbers, prices, URLs, and notification records. Review it before making the repository public.
- This project is distributed under the MIT License. See `LICENSE` for details.

---

# 한국어

## 개요

Sentinel-o-car는 엔카의 여러 중고차 검색 조건을 감시하는 개인용 도구입니다. GitHub Actions에서 실행되며 모든 알림을 하나의 텔레그램 채널 또는 채팅으로 전송합니다. 엔카 공식 서비스나 공식 API 클라이언트가 아닙니다.

## 배포 및 사용

### 1. Telegram 준비

1. Telegram `@BotFather`에서 `/newbot`으로 봇을 만들고 Bot Token을 보관합니다.
2. 알림용 채널을 만들고 관리자(`Administrators`) 메뉴에서 봇을 관리자로 추가한 뒤 메시지 게시 권한을 부여합니다.
3. 공개 채널 사용을 권장하며, `TELEGRAM_CHAT_ID`에는 `@채널사용자명`을 입력합니다.
4. 아래 명령은 봇과의 1:1 대화 또는 그룹 Chat ID 확인용이며 채널 ID는 출력하지 않습니다.

```bash
TELEGRAM_BOT_TOKEN=<BOT_TOKEN> npm run chat-id
```

참고: [Bot tutorial](https://core.telegram.org/bots/tutorial) · [Bot API](https://core.telegram.org/bots/api)

### 2. GitHub Secrets

경로: Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret

| 이름 | 값 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 발급 토큰 |
| `TELEGRAM_CHAT_ID` | `@채널사용자명` 또는 숫자 채널 ID |

토큰과 Chat ID는 `config.json`이나 README에 넣지 않습니다.

### 3. GitHub Variables와 엔카 URL

경로: Repository → Settings → Secrets and variables → Actions → Variables → New repository variable

1. [엔카](https://car.encar.com/) 검색 화면에서 원하는 조건을 선택합니다.
2. 검색 결과 첫 페이지에서 주소창 URL 전체를 복사합니다.
3. `config.json`의 `searchUrlEnv`와 같은 이름의 Repository Variable에 저장합니다.

- 차량 상세 URL이 아닌 검색 결과 URL 사용
- URL을 자르거나 직접 편집하지 않음
- 따옴표 없이 URL만 입력

최대 수집 페이지 수는 `config.json` 최상위의 `maxPages`에서 설정합니다. GitHub Repository Variable에 `MAX_PAGES`를 별도로 등록한 경우에만 해당 값이 우선 적용됩니다.

### 4. config.json 설정

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

### 5. 최초 실행

경로: Repository → Actions → Sentinel-o-car → Run workflow

1. `telegram_test`: 텔레그램 설정 확인 메시지 전송.
2. `send_current`: 현재 검색된 모든 매물을 메시지로 전송. 
   단, 해당 결과는 매물 상태의 기준점으로 저장되지 않음
3. `normal`: 저장된 기준점과 현재 검색된 매물 상태를 비교해 신규·가격변동·삭제·재등록 메시지를 전송 (정기 실행값)
   첫 `normal` 실행 시 현재 검색된 모든 매물을 기준점으로 저장하지만, 신규 매물로 인식하여 메시지를 전송하지는 않음

### 6. 일반 운영

- 프로필 중지: `config.json`의 `enabled`를 `false`로 변경
- 검색 조건 변경: 엔카에서 변경된 조건으로 검색 후 URL을 복사해 Variable 업데이트
- 가격·제목 조건 변경: `config.json` 수정
- 예약 실행: 워크플로의 `schedule`에 따라 `normal`로 실행
- `data/state.json`은 Github Actions가 관리하므로 수동 편집하지 않음

| 증상 | 조치 |
| --- | --- |
| Telegram 401 | Bot Token 확인 |
| chat not found | Chat ID와 봇의 채널 권한 확인 |
| URL environment variable 오류 | `searchUrlEnv`와 Variable 이름 확인 |
| 엔카 URL 오류 | 검색 결과 첫 페이지 URL 전체를 다시 복사 |

## 동작 요약

- `titleFilter`를 통과하고 상세 처리가 성공한 신규 매물, 가격 인하·인상, 매물삭제, 재등록 알림을 전송합니다.
- URL 검색 결과에 적용되는 내부 포함·제외 규칙은 `titleFilter.requiredAll`, `requiredAny`, `excludedAny`뿐입니다.
- 가격은 텔레그램 조건 판정에만 사용하며, 가격이 맞지 않아도 텔레그램 메시지는 전송됩니다.
- 차량번호로 동일 차량 재등록을 식별하고 중복 광고를 억제하며, 매물 상세 페이지 요청이 실패하는 경우 기존 값을 유지합니다.
- Tesla 프로필은 딜러의 매물소개란 기반으로 FSD·EAP 옵션을 판정하여 가격 기준을 추가 적용합니다.
- 확인하지 못한 값은 추정하지 않고 `색상 미확인`처럼 그대로 표시합니다.
- 텔레그램 전송은 시간 간격을 적당히 제어하며, HTTP 429는 자동 재시도합니다.

`매물삭제`는 해당 프로필의 검색 결과에서 광고가 사라졌다는 뜻이며 판매 완료를 확정하지 않습니다.

## 참고사항

- 엔카 페이지 구조가 바뀌면 수정이 필요할 수 있습니다.
- 일부 옵션 판정은 공개 문구 기반이므로 직접 확인이 필요합니다.
- 구매 전 성능점검기록부, 보험이력, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인 사용을 목적으로 하며 대량 수집용이 아닙니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 검토하십시오.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
