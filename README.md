# Sentinel-o-car

> Version 1.0

[English](#english) | [한국어](#한국어)

# English

## Overview

Sentinel-o-car is a personal tool for monitoring used-car listings on Encar. It runs through GitHub Actions and sends notifications to a configured Telegram channel or chat.

The current configuration targets used Tesla Model 3 listings. Sentinel-o-car is an independent personal project, not an official Encar service or official API client.

## System Architecture

> Encar search and detail pages → listing analysis and condition evaluation → comparison with previous state → Telegram notifications → `data/state.json` update

The project is divided into a few focused components:

- `src/` collects and analyzes public listing data, compares state, and prepares notifications.
- `config.json` defines the current vehicle and purchase conditions.
- `data/state.json` preserves observations between runs.
- GitHub Actions provides scheduled monitoring and manual run modes.
- `test/` verifies parsing, evaluation, state transitions, identity handling, and Telegram output without live requests.

## Core Features

- Notifications for newly detected eligible listings.
- Price-decrease notifications and optional price-increase notifications.
- `매물삭제` notifications when a tracked listing disappears from the successfully collected result across the configured Encar search pages.
- Manual delivery of current search results, including condition outcomes.
- Re-registration identification by vehicle number and suppression of duplicate advertisements for the same vehicle.
- Preservation of previously confirmed state when a detail-page request fails.
- Filtering by registration period, mileage, price, exterior color, and contract status.
- FSD and EAP detection from supported structured data and public seller text.
- Structured distinction among `NORMAL`, `LEASE`, and `RENT` sale types.
- Separate handling of a lease sale price and monthly payment.
- Telegram send pacing and automatic retries for HTTP 429 rate limits.
- Scheduled and manually dispatched GitHub Actions runs.

`매물삭제` means that the advertisement disappeared from the monitored search result. It does not confirm that the vehicle was sold; the advertisement may also have expired or been removed.

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
- Before purchasing, separately verify the performance inspection record, insurance history, high-voltage battery, and actual vehicle condition.
- This project is intended for personal, low-frequency use rather than bulk collection.
- Store the Telegram bot token and chat ID as GitHub Secrets.
- `data/state.json` may contain listing IDs, vehicle numbers, prices, URLs, observation timestamps, and Telegram delivery metadata. Review or reset it before making the repository public.
- This project is licensed under the MIT License. See `LICENSE`.

---

# 한국어

## 개요

Sentinel-o-car는 엔카 중고차 매물을 감시하는 개인용 도구입니다. GitHub Actions에서 실행되며 설정한 텔레그램 채널 또는 채팅으로 알림을 전송합니다.

현재는 테슬라 모델 3 중고 매물 검색용으로 구성돼 있습니다. Sentinel-o-car는 개인이 독립적으로 만든 프로젝트이며 엔카 공식 서비스나 공식 API 클라이언트가 아닙니다.

## 시스템 구조

> 엔카 검색 및 상세 페이지 → 매물 분석과 조건 판정 → 이전 상태와 비교 → 텔레그램 알림 → `data/state.json` 상태 갱신

프로젝트는 다음과 같은 주요 구성요소로 나뉩니다.

- `src/`는 공개 매물 정보를 수집·분석하고 상태를 비교해 알림을 준비합니다.
- `config.json`은 현재 차량 조건과 구매 조건을 정의합니다.
- `data/state.json`은 실행 사이의 관측 상태를 유지합니다.
- GitHub Actions는 예약 감시와 수동 실행 모드를 제공합니다.
- `test/`는 실제 요청 없이 파싱, 조건 판정, 상태 전이, 차량 식별, 텔레그램 출력을 검증합니다.

## 핵심 기능

- 조건을 충족하는 신규 매물 알림.
- 가격 인하 알림과 선택적 가격 인상 알림.
- 설정된 엔카 검색 페이지 범위에서 정상 수집한 전체 결과에서 추적 매물이 사라진 경우 `매물삭제` 알림.
- 조건 판정 결과를 포함한 현재 검색 결과 수동 전송.
- 차량번호 기반 동일 차량 재등록 식별과 동일 차량 중복 광고 억제.
- 상세 페이지 요청 실패 시 기존 확정 상태 보존.
- 최초등록 기간, 주행거리, 가격, 외장색, 계약 상태 필터링.
- 지원되는 구조화 데이터와 공개 판매자 문구를 통한 FSD 및 EAP 판정.
- `NORMAL`, `LEASE`, `RENT` 판매방식의 구조화 구분.
- 리스 매매가격과 월 납입금의 분리 처리.
- 텔레그램 전송 간격 제어와 HTTP 429 속도 제한 자동 재시도.
- GitHub Actions 예약 실행 및 수동 실행.

`매물삭제`는 감시 중인 검색 결과에서 광고가 사라졌다는 뜻입니다. 실제 판매 완료를 확정하지 않으며 광고 종료나 판매자 삭제일 수도 있습니다.

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
- 구매 전 성능점검기록부, 보험이력, 고전압 배터리, 실제 차량 상태를 별도로 확인해야 합니다.
- 개인용 저빈도 사용을 목적으로 하며 대량 수집용이 아닙니다.
- 텔레그램 봇 토큰과 채팅 ID는 GitHub Secrets로 관리합니다.
- `data/state.json`에는 매물번호, 차량번호, 가격, URL, 관측 시각 및 텔레그램 알림 기록이 포함될 수 있으므로 저장소를 공개하기 전에 내용을 검토하거나 초기화해야 합니다.
- 이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 `LICENSE`를 확인하십시오.
