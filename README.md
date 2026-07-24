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

Add each search to the `profiles` array in `config.json`. Every profile has its own Encar search URL and `titleFilter`, while all messages use the same Telegram bot and channel and include the matching profile name.

- Every profile defines `id`, `name`, `enabled`, `isTesla`, `titleFilter`, `price`, and exactly one of `searchUrl` or `searchUrlEnv`.
- `titleFilter.requiredAll`, `requiredAny`, and `excludedAny` are the only internal inclusion and exclusion rules applied to URL search results.
- Profiles with `isTesla: false` use `price.maxPriceKrw`. Profiles with `isTesla: true` additionally use `price.eapMaxPriceKrw` and `price.fsdMaxPriceKrw`; when a purchased option is not confirmed, `maxPriceKrw` applies.
- Price is used only for the condition status shown in Telegram. It does not remove a listing from collection or state, and it does not suppress new-listing, price-change, or `send_current` output.
- Generic and Tesla profiles share the same collection, state, event, and notification flow. Tesla adds only EAP/FSD detection and selection of the matching price limit.
- Registration date, mileage, color, contract status, rental or total-loss history, and sale type are not profile condition fields. Configure searchable vehicle attributes in the Encar search URL.
- Set either `searchUrl` or `searchUrlEnv`.
- Register GitHub Repository Variables at `Settings → Secrets and variables → Actions → Variables`.
- To register a Repository Variable, select the desired vehicle and filters on Encar, open the search-results page, and copy the complete URL from the browser address bar.
- Current format: `https://car.encar.com/list/car?...`
- Legacy format: `https://www.encar.com/fc/fc_carsearchlist.do?...#!...`
- Legacy URLs are converted automatically in memory before any network request. The original Repository Variable is not modified.
- Unsupported or malformed URLs fail before collection starts, and the full URL is not printed in the error message or normal logs.
- Map each profile's `searchUrlEnv` value to a separate GitHub Actions Repository Variable in the workflow. Actual search URLs must not be written directly into the repository.
- See `examples/config.multi.example.json` for generic and Tesla examples without personal search URLs.
- State uses schema version 2 with profile-id namespaces. Flat legacy state and a legacy `default` namespace are not migrated.

Keep each profile `id` stable. Changing it can make the watcher treat the profile as a new state namespace.

## Five Profile Slots

The current configuration provides five profile slots: `Model 3 AWD` and `Toyota Sienna` are enabled, and three disabled slots are reserved for future searches. Each `config.json` profile connects its `searchUrlEnv` to the Repository Variable with the same name:

- `tesla-model3-long-range` → `ENCAR_SEARCH_URL_TESLA_MODEL3`
- `toyota-sienna` → `ENCAR_SEARCH_URL_TOYOTA_SIENNA`
- `slot-3` → `ENCAR_SEARCH_URL_3`
- `slot-4` → `ENCAR_SEARCH_URL_4`
- `slot-5` → `ENCAR_SEARCH_URL_5`

A disabled slot may keep its `searchUrlEnv` name without creating the corresponding Repository Variable. To add a sixth or later profile, add the profile and `searchUrlEnv` to `config.json`, expose the same environment variable in `.github/workflows/sentinel-o-car.yml`, and create the matching Repository Variable.

Vehicle, registration period, mileage, color, seller category, and sale method are selected as Encar search URL conditions.

The optional `MAX_PAGES` Repository Variable overrides `config.json`'s `maxPages` value for every profile.

Rental usage history does not trigger automatic depreciation or a separate message line, so the evaluated price remains equal to the actual listing price.

## Core Features

- Notifications for newly detected listings that pass `titleFilter` and complete detail processing; price condition status does not suppress them.
- Price-decrease notifications and optional price-increase notifications after successful detail processing; price condition status does not suppress them.
- `매물삭제` notifications when a tracked listing disappears from a profile's successfully collected Encar search result.
- Manual delivery of current search results, including condition outcomes.
- Re-registration identification by vehicle number and suppression of duplicate advertisements for the same vehicle.
- Preservation of previously confirmed state when a detail-page request fails.
- Internal filtering only through `titleFilter`, with price used only for Telegram condition status.
- Tesla-profile FSD and EAP detection from supported structured data and public seller text, on top of the common profile flow.
- Structured distinction among `NORMAL`, `LEASE`, and `RENT` sale types.
- Separate handling of a lease sale price and monthly payment.
- Telegram send pacing and automatic retries for HTTP 429 rate limits.
- Scheduled and manually dispatched GitHub Actions runs.

`매물삭제` means that the advertisement disappeared from the applicable profile's monitored search result. It does not confirm that the vehicle was sold; the advertisement may remain in another profile or may have expired or been removed.

## Version

Current release: v1.0

Version 1.0 marks the completed implementation of:

- Encar listing collection, detail analysis, title filtering, and price-condition evaluation.
- Detection of new listings, price changes, and listing deletion.
- Same-vehicle identification, duplicate suppression, and persistent state.
- Telegram notifications, GitHub Actions operation, and automated tests.

## Notes

- Changes to Encar page markup or internal state structures may require parser updates.
- A zero-listing parse stops the run and is not treated as deletion of every tracked listing.
- Some option judgments depend on public text and require manual verification.
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

`config.json`의 `profiles` 배열에 검색 조건을 추가합니다. 각 프로필은 독립된 엔카 검색 URL과 `titleFilter`를 사용하며, 모든 메시지는 동일한 텔레그램 봇과 채널로 전송되고 일치한 프로필 이름을 표시합니다.

- 모든 프로필은 `id`, `name`, `enabled`, `isTesla`, `titleFilter`, `price`와 `searchUrl` 또는 `searchUrlEnv` 중 하나를 설정합니다.
- URL 검색 결과에 적용되는 내부 포함·제외 규칙은 `titleFilter.requiredAll`, `requiredAny`, `excludedAny`뿐입니다.
- `isTesla: false` 프로필은 `price.maxPriceKrw`를 사용합니다. `isTesla: true` 프로필은 `price.eapMaxPriceKrw`와 `price.fsdMaxPriceKrw`를 추가로 사용하며, 구매 옵션이 확인되지 않으면 `maxPriceKrw`를 적용합니다.
- 가격은 텔레그램 메시지의 조건 충족 여부에만 사용합니다. 목록·상태에서 매물을 제거하지 않으며 신규·가격변동·`send_current` 출력을 막지 않습니다.
- 일반 프로필과 Tesla 프로필은 수집·상태·이벤트·알림 흐름이 같습니다. Tesla는 EAP/FSD 확인과 해당 가격 기준 선택만 추가합니다.
- 연식, 주행거리, 색상, 계약 상태, 렌트·전손 이력, 판매방식은 프로필 조건 필드가 아닙니다. 검색 가능한 차량 속성은 엔카 검색 URL에서 설정합니다.
- `searchUrl` 또는 `searchUrlEnv` 중 하나를 설정합니다.
- GitHub Repository Variables 등록 위치는 `Settings → Secrets and variables → Actions → Variables`입니다.
- Repository Variable을 등록할 때는 엔카에서 원하는 차량과 조건을 선택하고 검색 결과 화면을 연 뒤, 브라우저 주소창의 URL 전체를 복사합니다.
- 현재 형식: `https://car.encar.com/list/car?...`
- 기존 형식: `https://www.encar.com/fc/fc_carsearchlist.do?...#!...`
- 기존 형식은 네트워크 요청 전에 실행 중 메모리에서 자동 변환되며 Repository Variable 원본은 변경되지 않습니다.
- 지원하지 않거나 손상된 URL은 수집 시작 전에 오류로 중단하며, 오류 메시지와 일반 로그에 URL 전체를 출력하지 않습니다.
- 각 프로필의 `searchUrlEnv` 값을 워크플로에서 서로 다른 GitHub Actions Repository Variable과 연결합니다. 실제 검색 URL은 Repository Variables로만 관리하며 저장소에 직접 기록하지 않습니다.
- 개인 검색 URL이 없는 generic 및 Tesla 예시는 `examples/config.multi.example.json`에서 확인할 수 있습니다.
- 상태는 프로필 ID 네임스페이스를 사용하는 schema version 2만 지원합니다. 구형 flat state와 구형 `default` 네임스페이스는 마이그레이션하지 않습니다.

프로필 `id`는 안정적으로 유지하십시오. 값을 바꾸면 새로운 상태 영역으로 인식될 수 있습니다.

## 5개 프로필 자리

현재 `config.json`은 총 5개 프로필 슬롯을 지원합니다. `Model 3 AWD`와 `도요타 시에나` 2개는 활성 프로필이고, `slot-3`, `slot-4`, `slot-5` 3개는 비활성 슬롯입니다. 각 프로필의 `searchUrlEnv`는 다음과 같이 같은 이름의 Repository Variable 및 워크플로 환경변수와 연결됩니다.

- `tesla-model3-long-range` → `"searchUrlEnv": "ENCAR_SEARCH_URL_TESLA_MODEL3"`
- `toyota-sienna` → `"searchUrlEnv": "ENCAR_SEARCH_URL_TOYOTA_SIENNA"`
- `slot-3` → `"searchUrlEnv": "ENCAR_SEARCH_URL_3"`
- `slot-4` → `"searchUrlEnv": "ENCAR_SEARCH_URL_4"`
- `slot-5` → `"searchUrlEnv": "ENCAR_SEARCH_URL_5"`

비활성 프로필은 `searchUrlEnv` 이름만 유지하고 대응하는 Repository Variable을 만들지 않아도 됩니다. 6번째 이후 프로필을 추가할 때는 `config.json`의 프로필과 `searchUrlEnv`, `.github/workflows/sentinel-o-car.yml`의 환경변수, 같은 이름의 Repository Variable을 함께 추가해야 합니다.

차종, 연식, 주행거리, 제외색상과 다음 구분은 엔카 검색 URL 조건으로 선택합니다.

- 판매자: 개인, 딜러, 브랜드 인증 판매
- 판매방식: 일반, 리스, 운용리스, 금융리스, 렌트, 렌트승계

선택 Repository Variable인 `MAX_PAGES`는 모든 프로필에서 `config.json`의 `maxPages` 값을 재정의합니다.

과거 렌트 용도 이력에 따른 자동 감가와 별도 메시지 표시는 사용하지 않습니다. 렌트 용도 이력이 `true`여도 평가가격은 실제 매물가격과 동일합니다.

## 핵심 기능

- `titleFilter`를 통과하고 상세 처리가 성공한 신규 매물 알림. 가격 조건 결과로 알림을 억제하지 않음.
- 상세 처리가 성공한 가격 인하 알림과 선택적 가격 인상 알림. 가격 조건 결과로 알림을 억제하지 않음.
- 프로필별로 정상 수집한 엔카 검색 결과에서 추적 매물이 사라진 경우 `매물삭제` 알림.
- 조건 판정 결과를 포함한 현재 검색 결과 수동 전송.
- 차량번호 기반 동일 차량 재등록 식별과 동일 차량 중복 광고 억제.
- 상세 페이지 요청 실패 시 기존 확정 상태 보존.
- `titleFilter`만 사용하는 내부 필터링과 텔레그램 조건 표시에만 사용하는 가격 판정.
- 공통 프로필 흐름에 추가되는 Tesla 프로필의 구조화 데이터 및 공개 판매자 문구 기반 FSD·EAP 판정.
- 구조화 차량명·모델명·등급명과 차량명 전용 요소만 사용하는 제목 추출. 판매자 설명과 광고 문구는 제목으로 사용하지 않음.
- 매물 정보 행의 `색상 | 주행거리 | 가격 | 지역` 표시. 색상을 확인하지 못하면 `색상 미확인`으로 표시하며 조건 판정에는 사용하지 않음.
- `NORMAL`, `LEASE`, `RENT` 판매방식의 구조화 구분.
- 리스 매매가격과 월 납입금의 분리 처리.
- 텔레그램 전송 간격 제어와 HTTP 429 속도 제한 자동 재시도.
- GitHub Actions 예약 실행 및 수동 실행.

`매물삭제`는 해당 프로필의 감시 검색 결과에서 광고가 사라졌다는 뜻입니다. 실제 판매 완료를 확정하지 않으며, 다른 프로필에는 남아 있거나 광고가 종료·삭제됐을 수도 있습니다.

## 버전

현재 릴리스: v1.0

버전 1.0은 다음 범위의 구현이 완성된 버전입니다.

- 엔카 매물 수집, 상세 분석, 제목 필터링과 가격 조건 판정.
- 신규 매물, 가격 변경, 매물삭제 감지.
- 동일 차량 식별, 중복 억제, 상태 유지.
- 텔레그램 알림, GitHub Actions 운영, 자동 테스트.

## 참고사항

- 엔카 페이지 마크업이나 내부 상태 구조가 변경되면 파서 수정이 필요할 수 있습니다.
- 매물을 0건 파싱하면 모든 추적 매물의 삭제로 판단하지 않고 실행을 중단합니다.
- 일부 옵션 판정은 공개 문구를 기반으로 하므로 직접 확인이 필요합니다.
- 확인할 수 없는 과거 렌트 용도와 전손 이력은 `null`로 유지합니다.
- 구매 전 성능점검기록부, 보험이력, 해당되는 경우 고전압 배터리, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인용 저빈도 사용을 목적으로 하며 대량 수집용이 아닙니다.
- 텔레그램 봇 토큰과 채팅 ID는 GitHub Secrets로 관리합니다.
- 엔카 검색 URL은 GitHub Actions Repository Variables로 관리합니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 관측 시각 및 텔레그램 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 내용을 검토하거나 초기화해야 합니다.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
