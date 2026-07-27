# Sentinel-o-car

> Version 1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring multiple used-car searches on Encar. It runs through GitHub Actions and sends all notifications to one configured Telegram channel or chat.

Sentinel-o-car is an independent personal project, not an official Encar service or official API client.

- `src/` collects and analyzes public listing data, compares state, and prepares notifications.
- `config.json` defines search profiles and purchase conditions.
- `data/state.json` preserves observations between runs and is written by GitHub Actions.
- `test/` verifies parsing, evaluation, state transitions, identity handling, and Telegram output without live requests.

## Behavior Contract

- `titleFilter.requiredAll`, `requiredAny`, and `excludedAny` are the only internal inclusion and exclusion rules applied to URL search results.
- Price is used only for the condition status shown in Telegram, and it does not suppress new-listing, price-change, or `send_current` output.
- Generic and Tesla profiles share the same collection, state, event, and notification flow. Tesla adds EAP/FSD detection, and when a purchased option is not confirmed, `maxPriceKrw` applies.
- Registration period, mileage, color, fuel, and sale method are selected in the Encar search URL, not in a profile.
- State uses schema version 2 with profile-id namespaces. Flat legacy state and a legacy `default` namespace are not migrated.
- A partial list crawl keeps the listings already collected and skips deletion reconciliation for that profile in that run. A zero-listing parse stops the run.

## Configuration Names

| Where | Name |
| --- | --- |
| Actions secret | `TELEGRAM_BOT_TOKEN` |
| Actions secret | `TELEGRAM_CHAT_ID` |
| Actions variable | one per profile, named after that profile's `searchUrlEnv` |
| Actions variable (optional) | `MAX_PAGES` |
| Manual run input | `RUN_MODE`: `telegram_test`, `send_current`, `normal` |

Setup and operation instructions are in the [한국어](#한국어) section.

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

`MAX_PAGES`는 선택 항목입니다. 값을 설정하면 실행 시 `config.json`의 `maxPages` 대신 사용되며, 모든 프로필에 동일하게 적용됩니다.

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

- `id`: 상태 namespace이므로 운영 중 변경하지 않습니다.
- `name`: 텔레그램에 표시할 검색 조건명입니다.
- `enabled`: `true`인 프로필만 실행합니다.
- `searchUrlEnv`: GitHub Variable 이름과 같아야 합니다.
- `isTesla`: Tesla 옵션별 가격 판정 사용 여부입니다.
- `titleFilter`: 제목 검증용이며 URL 검색조건을 대신하지 않습니다.
- `price`: 텔레그램 조건 판정 기준이며 알림을 차단하지 않습니다.

연식·주행거리·색상·연료·판매방식은 엔카 URL에서 설정합니다. `enabled`, `name`, `titleFilter`, `price` 변경은 `config.json`만 수정하면 되고, 새 `searchUrlEnv` 추가는 워크플로 환경변수 매핑도 필요합니다.

### 5. 최초 실행

경로: Repository → Actions → Sentinel-o-car → Run workflow

1. `telegram_test`: 텔레그램 설정 확인.
2. `send_current`: 현재 검색 결과 확인.
3. `normal`: 상태 비교와 정기 감시 시작. 프로필의 첫 `normal` 실행은 현재 결과를 기준점으로만 저장합니다.

### 6. 일반 운영

- 프로필 중지: `config.json`의 `enabled`를 `false`로 변경
- 검색 조건 변경: 엔카에서 URL을 다시 복사해 Variable 업데이트
- 가격·제목 조건 변경: `config.json` 수정
- 예약 실행: 워크플로의 `schedule`에 따라 `normal`로 실행
- `data/state.json`은 Actions가 관리하므로 수동 편집하지 않음

| 증상 | 조치 |
| --- | --- |
| Telegram 401 | Bot Token 확인 |
| chat not found | Chat ID와 봇의 채널 권한 확인 |
| URL environment variable 오류 | `searchUrlEnv`와 Variable 이름 확인 |
| 엔카 URL 오류 | 검색 결과 첫 페이지 URL 전체를 다시 복사 |

## 동작 요약

- `titleFilter`를 통과하고 상세 처리가 성공한 신규 매물, 가격 인하·인상, `매물삭제` 알림을 전송합니다.
- URL 검색 결과에 적용되는 내부 포함·제외 규칙은 `titleFilter.requiredAll`, `requiredAny`, `excludedAny`뿐입니다.
- 가격은 텔레그램 조건 판정에만 사용하며 신규·가격변동·`send_current` 출력을 막지 않습니다.
- 차량번호로 동일 차량 재등록을 식별하고 중복 광고를 억제하며, 상세 요청이 실패하면 기존 확정 값을 보존합니다.
- Tesla 프로필은 공개 정보 기반으로 FSD·EAP를 판정하고 해당 가격 기준을 적용합니다.
- 확인하지 못한 값은 추정하지 않고 `색상 미확인`처럼 그대로 표시합니다.
- 텔레그램 전송은 간격을 제어하며 HTTP 429는 자동 재시도합니다.

`매물삭제`는 해당 프로필의 검색 결과에서 광고가 사라졌다는 뜻이며 판매 완료를 확정하지 않습니다.

## 참고사항

- 엔카 페이지 구조가 바뀌면 파서 수정이 필요할 수 있습니다.
- 일부 옵션 판정은 공개 문구 기반이므로 직접 확인이 필요합니다.
- 구매 전 성능점검기록부, 보험이력, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인용 저빈도 사용을 목적으로 하며 대량 수집용이 아닙니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 검토하십시오.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
