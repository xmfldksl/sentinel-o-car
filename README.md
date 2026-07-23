# Sentinel-o-car

> Version 1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring multiple used-car searches on Encar. It runs through GitHub Actions and sends all notifications to one configured Telegram channel or chat.

Sentinel-o-car is an independent personal project, not an official Encar service or official API client.

## System Architecture

> Encar search and detail pages → listing analysis and condition evaluation → comparison with previous state → Telegram notifications → `data/state.json` update

The project is divided into a few focused components:

- `src/` collects and analyzes public listing data, compares state, and prepares notifications.
- `config.json` defines vehicle profiles and purchase conditions.
- `data/state.json` preserves observations between runs.
- GitHub Actions provides scheduled monitoring and manual run modes.
- `test/` verifies parsing, evaluation, state transitions, identity handling, and Telegram output without live requests.

## Vehicle Profiles

Add each search to the `profiles` array in `config.json`. Every profile has its own Encar search URL and filters, while all messages use the same Telegram bot and channel and include the matching profile name.

- `generic` profiles use one `price.maxPriceKrw`. Configure the make, model, trim, fuel, drivetrain, and ordinary options in the Encar search URL.
- `tesla` profiles can use separate EAP and FSD price limits. The base maximum remains the limit when no purchased option is confirmed, while `unknownOptionHardMax` applies when detail verification fails.
- Set either `searchUrl` or `searchUrlEnv`.
- To register a Repository Variable, select the desired vehicle and filters on Encar, open the search-results page, and copy the complete URL from the browser address bar.
- Both the current `https://car.encar.com/list/car?...` format and the legacy `https://www.encar.com/fc/fc_carsearchlist.do?...#!...` format are supported.
- Legacy URLs are converted automatically in memory before any network request. The original Repository Variable is not modified.
- Unsupported or malformed URLs fail before collection starts, and the full URL is not printed in the error message or normal logs.
- Map each profile's `searchUrlEnv` value to a separate GitHub Actions Repository Variable in the workflow. Actual search URLs should not be stored in the repository.
- See `examples/config.multi.example.json` for generic and Tesla examples without personal search URLs.
- When migrating a populated legacy state to multiple profiles, set `legacyStateProfileId` to the single profile that should inherit it; legacy state is never copied to every profile.

Keep each profile `id` stable. Changing it can make the watcher treat the profile as a new state namespace.

## Core Features

- Notifications for newly detected eligible listings.
- Price-decrease notifications and optional price-increase notifications.
- `매물삭제` notifications when a tracked listing disappears from a profile's successfully collected Encar search result.
- Manual delivery of current search results, including condition outcomes.
- Re-registration identification by vehicle number and suppression of duplicate advertisements for the same vehicle.
- Preservation of previously confirmed state when a detail-page request fails.
- Filtering by registration period, mileage, price, exterior color, and contract status.
- Tesla-profile FSD and EAP detection from supported structured data and public seller text.
- Structured distinction among `NORMAL`, `LEASE`, and `RENT` sale types.
- Separate handling of a lease sale price and monthly payment.
- Telegram send pacing and automatic retries for HTTP 429 rate limits.
- Scheduled and manually dispatched GitHub Actions runs.

`매물삭제` means that the advertisement disappeared from the applicable profile's monitored search result. It does not confirm that the vehicle was sold; the advertisement may remain in another profile or may have expired or been removed.

## Version

Current release: v1.0

Version 1.0 marks the completed implementation of:

- Encar listing collection, detail analysis, and condition filtering.
- Detection of new listings, price changes, and listing deletion.
- Same-vehicle identification, duplicate suppression, and persistent state.
- Telegram notifications, GitHub Actions operation, and automated tests.

## Notes

- Changes to Encar page markup or internal state structures may require parser updates.
- A zero-listing parse stops the run and is not treated as deletion of every tracked listing.
- Some option, smoking, and tuning judgments depend on public text and require manual verification.
- Unconfirmed past rental usage and total-loss history remain `null`.
- Before purchasing, separately verify the performance inspection record, insurance history, high-voltage battery when applicable, and actual vehicle condition.
- This project is intended for personal, low-frequency use rather than bulk collection.
- Store the Telegram bot token and chat ID as GitHub Secrets.
- Store Encar search URLs as GitHub Actions Repository Variables.
- `data/state.json` may contain listing IDs, vehicle numbers, prices, URLs, observation timestamps, and Telegram delivery metadata. Review or reset it before making the repository public.
- This project is licensed under the MIT License. See `LICENSE`.

---

# 한국어

## 개요

Sentinel-o-car는 엔카의 여러 중고차 검색 조건을 감시하는 개인용 도구입니다. GitHub Actions에서 실행되며 모든 알림을 하나의 설정된 텔레그램 채널 또는 채팅으로 전송합니다.

Sentinel-o-car는 개인이 독립적으로 만든 프로젝트이며 엔카 공식 서비스나 공식 API 클라이언트가 아닙니다.

## 시스템 구조

> 엔카 검색 및 상세 페이지 → 매물 분석과 조건 판정 → 이전 상태와 비교 → 텔레그램 알림 → `data/state.json` 상태 갱신

프로젝트는 다음과 같은 주요 구성요소로 나뉩니다.

- `src/`는 공개 매물 정보를 수집·분석하고 상태를 비교해 알림을 준비합니다.
- `config.json`은 차량 프로필과 구매 조건을 정의합니다.
- `data/state.json`은 실행 사이의 관측 상태를 유지합니다.
- GitHub Actions는 예약 감시와 수동 실행 모드를 제공합니다.
- `test/`는 실제 요청 없이 파싱, 조건 판정, 상태 전이, 차량 식별, 텔레그램 출력을 검증합니다.

## 차량 프로필

`config.json`의 `profiles` 배열에 검색 조건을 추가합니다. 각 프로필은 독립된 엔카 검색 URL과 필터를 사용하며, 모든 메시지는 동일한 텔레그램 봇과 채널로 전송되고 일치한 프로필 이름을 표시합니다.

- `generic` 프로필은 `price.maxPriceKrw` 하나를 사용합니다. 브랜드, 모델, 트림, 연료, 구동방식과 일반 옵션은 엔카 검색 URL에서 설정합니다.
- `tesla` 프로필은 EAP 및 FSD 가격 상한을 별도로 사용할 수 있습니다. 구매 옵션이 확인되지 않으면 기본 최대가격을, 상세 확인 자체가 실패하면 `unknownOptionHardMax`를 사용합니다.
- `searchUrl` 또는 `searchUrlEnv` 중 하나를 설정합니다.
- Repository Variable을 등록할 때는 엔카에서 원하는 차량과 조건을 선택하고 검색 결과 화면을 연 뒤, 브라우저 주소창의 URL 전체를 복사합니다.
- 현재 `https://car.encar.com/list/car?...` 형식과 기존 `https://www.encar.com/fc/fc_carsearchlist.do?...#!...` 형식을 모두 지원합니다.
- 기존 형식은 네트워크 요청 전에 실행 중 메모리에서 자동 변환되며 Repository Variable 원본은 변경되지 않습니다.
- 지원하지 않거나 손상된 URL은 수집 시작 전에 오류로 중단하며, 오류 메시지와 일반 로그에 URL 전체를 출력하지 않습니다.
- 각 프로필의 `searchUrlEnv` 값을 워크플로에서 서로 다른 GitHub Actions Repository Variable과 연결합니다. 실제 검색 URL은 저장소에 기록하지 않는 것을 권장합니다.
- 개인 검색 URL이 없는 generic 및 Tesla 예시는 `examples/config.multi.example.json`에서 확인할 수 있습니다.
- 기존 상태가 있는 상태에서 여러 프로필로 전환할 때는 상태를 승계할 한 프로필을 `legacyStateProfileId`로 지정합니다. 구형 상태를 모든 프로필에 복제하지 않습니다.

프로필 `id`는 안정적으로 유지하십시오. 값을 바꾸면 새로운 상태 영역으로 인식될 수 있습니다.

## 핵심 기능

- 조건을 충족하는 신규 매물 알림.
- 가격 인하 알림과 선택적 가격 인상 알림.
- 프로필별로 정상 수집한 엔카 검색 결과에서 추적 매물이 사라진 경우 `매물삭제` 알림.
- 조건 판정 결과를 포함한 현재 검색 결과 수동 전송.
- 차량번호 기반 동일 차량 재등록 식별과 동일 차량 중복 광고 억제.
- 상세 페이지 요청 실패 시 기존 확정 상태 보존.
- 최초등록 기간, 주행거리, 가격, 외장색, 계약 상태 필터링.
- Tesla 프로필에서 지원되는 구조화 데이터와 공개 판매자 문구를 통한 FSD 및 EAP 판정.
- `NORMAL`, `LEASE`, `RENT` 판매방식의 구조화 구분.
- 리스 매매가격과 월 납입금의 분리 처리.
- 텔레그램 전송 간격 제어와 HTTP 429 속도 제한 자동 재시도.
- GitHub Actions 예약 실행 및 수동 실행.

`매물삭제`는 해당 프로필의 감시 검색 결과에서 광고가 사라졌다는 뜻입니다. 실제 판매 완료를 확정하지 않으며, 다른 프로필에는 남아 있거나 광고가 종료·삭제됐을 수도 있습니다.

## 버전

Current release: v1.0

버전 1.0은 다음 범위의 구현이 완성된 버전입니다.

- 엔카 매물 수집, 상세 분석, 조건 필터링.
- 신규 매물, 가격 변경, 매물삭제 감지.
- 동일 차량 식별, 중복 억제, 상태 유지.
- 텔레그램 알림, GitHub Actions 운영, 자동 테스트.

## 참고사항

- 엔카 페이지 마크업이나 내부 상태 구조가 변경되면 파서 수정이 필요할 수 있습니다.
- 매물을 0건 파싱하면 모든 추적 매물의 삭제로 판단하지 않고 실행을 중단합니다.
- 일부 옵션, 흡연, 튜닝 판정은 공개 문구를 기반으로 하므로 직접 확인이 필요합니다.
- 확인할 수 없는 과거 렌트 용도와 전손 이력은 `null`로 유지합니다.
- 구매 전 성능점검기록부, 보험이력, 해당되는 경우 고전압 배터리, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인용 저빈도 사용을 목적으로 하며 대량 수집용이 아닙니다.
- 텔레그램 봇 토큰과 채팅 ID는 GitHub Secrets로 관리합니다.
- 엔카 검색 URL은 GitHub Actions Repository Variables로 관리합니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 관측 시각 및 텔레그램 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 내용을 검토하거나 초기화해야 합니다.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
