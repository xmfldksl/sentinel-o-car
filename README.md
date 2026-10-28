# Sentinel-o-car

> Version 1.1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring used-car listings on Encar.

It periodically collects configured search results, compares them with saved state, and sends Telegram notifications when listings change.

## Features

- Multiple Encar search profiles
- New-listing notifications
- Price increase and decrease notifications
- Deleted-listing detection
- Relisting detection
- Duplicate listing suppression using vehicle identity
- Profile-specific title filtering
- Tesla EAP and FSD option detection
- Profile-specific price thresholds
- Telegram notifications
- Persistent listing state
- Automatic regression tests before production scraping

## Requirements

- Node.js 25
- macOS with launchd
- Telegram Bot Token
- Telegram Chat ID

Production runs on Mac launchd. The repository no longer ships GitHub Actions workflows; Encar listing collection is blocked in the GitHub-hosted runner environment, so scheduled and manual runs both use the local runner script.

## Setup

For current Mac operation, store the following values in `.env.local` at the repository root, following [the local operation guide](local/README.md):

| Name | Description |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather token |
| `TELEGRAM_CHAT_ID` | Telegram channel or chat ID |

Store each Encar search-results URL in the same environment file.

The environment variable name must match the profile's `searchUrlEnv` value in `config.json`. Manual runs through `local/run.sh` read the same environment file.

Use the full Encar search-results URL from the first page. Do not use a vehicle-detail URL.

## Configuration

Example `config.json`:

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
      "price": {
        "maxPriceKrw": 30000000
      }
    },
    {
      "id": "example-tesla",
      "name": "Example Tesla",
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

Main settings:

- `enabled`: Enables or disables the profile.
- `searchUrlEnv`: Environment variable containing the Encar search URL (set in `.env.local` for the local runner).
- `titleFilter`: Additional title-based inclusion and exclusion rules.
- `price`: Price threshold used for notification evaluation.
- `isTesla`: Enables Tesla option-specific evaluation.

Search conditions such as registration year, mileage, color, fuel type, and sale type should normally be configured in the Encar search URL.

## Usage

Production runs on the Mac launchd runner, scheduled at minutes 17 and 47 of every hour. See [the local operation guide](local/README.md) for paths and operating procedures.

### `normal`

Normal monitoring mode.

It compares current listings with saved state and processes:

- new listings
- price increases
- price decreases
- deleted listings
- relisted listings

State changes are saved to `STATE_PATH`, or `data/state.json` when it is unset. The local wrapper defaults to the external path described below.

### `send_current`

Sends the currently available listings that pass `titleFilter`.

It does not initialize a baseline or perform deletion detection. It still saves watcher state to the selected state file; the local runner does not commit it to Git.

### `telegram_test`

Sends one Telegram test message.

It does not collect Encar listings or modify watcher state.

## State

Watcher state is stored in:

```text
data/state.json
```

This is the default when invoking the application directly without `STATE_PATH`. `local/run.sh` defaults to `$HOME/Library/Application Support/sentinel-o-car/state.json`; an explicit `STATE_PATH` overrides that default. Direct `npm run scrape` does not load `.env.local` or select the local state path.

The state is separated by profile and preserves confirmed listing information across runs.

When a detail request fails, previously confirmed values are preserved instead of being replaced by incomplete data.

Do not manually edit the state file during normal operation.

## Testing

Run:

```bash
npm test
```

Tests do not perform production scraping or Telegram delivery.

The local runner runs the test suite before scraping.

## Notes

- Price thresholds affect condition evaluation but do not suppress listing notifications.
- A deleted-listing notification means the advertisement disappeared from the configured search results. It does not confirm that the vehicle was sold.
- If listing extraction fails completely, the watcher does not replace the current state with an empty result.
- If a later search-results page fails, already collected listings are retained and deletion detection is suppressed for that run.
- Changes to the Encar page structure may require parser updates.
- Do not commit Telegram credentials or other secrets.
- This project is intended for personal use.

## Release Notes

### 2026-10-28

- Removed the GitHub Actions workflows. Production and manual runs use the Mac launchd runner only.

### 2026-10-13

- Added a Mac launchd runner scheduled at minutes 17 and 47 of every hour.
- Stopped GitHub Actions scheduled runs; manual `workflow_dispatch` runs remain available.

### Version 1.1.0

Changes since Version 1.0:

- Added multi-profile monitoring.
- Added GitHub Repository Variable based search URLs.
- Added profile-specific title filtering.
- Added Tesla EAP and FSD price evaluation.
- Added deleted-listing and relisting detection.
- Added vehicle identity matching and duplicate suppression.
- Improved detail-fetch failure handling and persistent-state integrity.
- Improved Telegram delivery reliability.
- Moved production scraping to an Apple Silicon self-hosted runner.
- Standardized the production workflow on Node.js 25.
- Expanded regression tests.

## License

MIT License.

---

# 한국어

## 개요

Sentinel-o-car는 엔카 중고차 검색 결과를 감시하는 개인용 도구입니다.

설정된 검색 결과를 주기적으로 수집하고 이전 상태와 비교하여 변경사항을 텔레그램으로 알립니다.

## 주요 기능

- 여러 엔카 검색 프로필 지원
- 신규 매물 알림
- 가격 인상·인하 알림
- 매물삭제 감지
- 재등록 감지
- 차량 동일성 기반 중복 광고 억제
- 프로필별 제목 필터
- Tesla EAP·FSD 옵션 판정
- 프로필별 가격 기준
- Telegram 알림
- 매물 상태 저장
- 운영 스크래핑 전 자동 회귀 테스트

## 요구사항

- Node.js 25
- macOS와 launchd
- Telegram Bot Token
- Telegram Chat ID

현재 운영은 Mac launchd를 사용합니다. 저장소에는 더 이상 GitHub Actions workflow가 없으며, GitHub-hosted runner 환경에서는 엔카 목록 수집이 차단되므로 예약 실행과 수동 실행 모두 로컬 실행기 스크립트를 사용합니다.

## 설정 준비

현재 Mac 운영에서는 [로컬 운영 안내](local/README.md)에 따라 저장소 루트의 `.env.local`에 다음 값을 설정합니다.

| 이름 | 설명 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather에서 발급한 토큰 |
| `TELEGRAM_CHAT_ID` | Telegram 채널 또는 Chat ID |

엔카 검색 결과 URL도 같은 환경 파일에 저장합니다.

환경변수 이름은 `config.json` 각 프로필의 `searchUrlEnv`와 일치해야 합니다. `local/run.sh`를 통한 수동 실행도 같은 환경 파일을 읽습니다.

엔카 검색 결과 첫 페이지의 전체 URL을 사용하며 차량 상세 URL은 사용하지 않습니다.

## Configuration

`config.json` 예시:

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
      "price": {
        "maxPriceKrw": 30000000
      }
    },
    {
      "id": "example-tesla",
      "name": "Example Tesla",
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

주요 설정:

- `enabled`: 프로필 활성 여부
- `searchUrlEnv`: 엔카 검색 URL이 저장된 환경변수 이름(로컬 실행기에서는 `.env.local`에 설정)
- `titleFilter`: 제목 기반 추가 포함·제외 조건
- `price`: 알림의 가격 조건 판정 기준
- `isTesla`: Tesla 옵션별 판정 사용 여부

연식, 주행거리, 색상, 연료, 판매방식 등의 검색 조건은 기본적으로 엔카 검색 URL에서 설정합니다.

## 실행

Mac launchd 실행기로 운영하며, 매시 17분·47분에 실행됩니다. 경로와 운영 절차는 [로컬 운영 안내](local/README.md)를 참조하십시오.

### `normal`

일반 감시 모드입니다.

현재 매물과 저장 상태를 비교하여 다음 이벤트를 처리합니다.

- 신규 매물
- 가격 인상
- 가격 인하
- 매물삭제
- 재등록

상태 변경 내용은 `STATE_PATH`에 저장하며, 지정하지 않으면 `data/state.json`을 사용합니다. 로컬 실행기의 기본값은 아래 외부 경로입니다.

### `send_current`

현재 검색 결과 중 `titleFilter`를 통과한 매물을 전송합니다.

기준선 초기화와 삭제 판정은 하지 않습니다. 선택된 상태 파일에는 처리 결과를 저장하지만 로컬 실행기는 Git commit을 하지 않습니다.

### `telegram_test`

Telegram 테스트 메시지 1건을 전송합니다.

엔카 매물을 수집하거나 감시 상태를 변경하지 않습니다.

## 상태 관리

감시 상태는 다음 파일에 저장합니다.

```text
data/state.json
```

위 경로는 `STATE_PATH` 없이 앱을 직접 실행할 때의 기본값입니다. `local/run.sh`의 기본값은 `$HOME/Library/Application Support/sentinel-o-car/state.json`이며, 별도로 지정한 `STATE_PATH`가 우선합니다. 직접 `npm run scrape`를 실행하면 `.env.local` 로드와 로컬 상태 경로 지정이 생략됩니다.

프로필별로 상태를 관리하며 실행 사이에 확인된 매물 정보를 보존합니다.

상세 조회가 실패하면 기존에 확인된 값을 불완전한 정보로 덮어쓰지 않습니다.

정상 운영 중에는 상태파일을 직접 수정하지 않습니다.

## 테스트

```bash
npm test
```

테스트에서는 실제 운영 스크래핑이나 Telegram 전송을 수행하지 않습니다.

로컬 실행기는 스크래핑 전에 테스트를 실행합니다.

## 참고사항

- 가격 기준은 조건 판정에 사용하며 기준을 초과한 매물도 알림 자체는 전송됩니다.
- `매물삭제`는 해당 검색 결과에서 광고가 사라졌다는 의미이며 실제 판매 완료를 의미하지 않습니다.
- 매물을 전혀 추출하지 못한 경우 빈 결과로 기존 상태를 덮어쓰지 않습니다.
- 후속 검색 페이지 조회가 실패하면 이미 수집한 결과를 유지하고 해당 실행의 삭제 판정을 억제합니다.
- 엔카 페이지 구조가 변경되면 파서 수정이 필요할 수 있습니다.
- Telegram Token 등 비밀값은 저장소에 commit하지 않습니다.
- 개인 사용 목적의 프로젝트입니다.

## 릴리즈 노트

### 2026-10-28

- GitHub Actions workflow 삭제. 운영과 수동 실행 모두 Mac launchd 실행기만 사용

### 2026-10-13

- Mac launchd 실행기 추가: 매시 17분·47분에 예약 실행
- GitHub Actions 예약 중지 (`workflow_dispatch` 수동 실행은 유지)

### Version 1.1.0

Version 1.0 이후 주요 변경사항:

- 여러 검색 프로필 지원
- GitHub Repository Variable 기반 검색 URL 관리
- 프로필별 제목 필터 추가
- Tesla EAP·FSD 가격 판정 추가
- 매물삭제 및 재등록 감지 추가
- 차량 동일성 판정 및 중복 광고 억제
- 상세 조회 실패 처리 및 상태 무결성 개선
- Telegram 전송 안정성 개선
- Apple Silicon self-hosted runner로 운영 환경 변경
- 운영 Node.js 25 적용
- 회귀 테스트 확대

## License

MIT License.
