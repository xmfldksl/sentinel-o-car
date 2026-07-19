import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDetail,
  createListingEvent,
  evaluateListing,
  formatTelegramMessage,
  getListingInspection,
  prepareSendCurrentListing
} from "../src/lib.mjs";

const config = {
  requiredTitleTerms: ["모델 3", "롱 레인지", "AWD"],
  yearMonthMin: "2022-05",
  yearMonthMax: "2022-12",
  maxMileageKm: 150000,
  priceLimitsKrw: {
    base: 35000000,
    eap: 37000000,
    fsd: 40000000,
    unknownOptionHardMax: 40000000
  },
  rentalPenaltyKrw: 3000000,
  excludedColorTerms: ["빨간색", "적색", "레드"],
  excludeContracted: true,
  notifyPriceIncrease: true
};

const baseListing = {
  id: "42023180",
  title: "모델 3 롱 레인지 AWD",
  url: "https://fem.encar.com/cars/detail/42023180",
  yearMonth: "2022-09",
  mileageKm: 92000,
  priceKrw: 38500000,
  region: "서울",
  contracted: false
};

function eventFor({ runMode, listing, detailSucceeded }) {
  return createListingEvent({
    runMode,
    wasInitialized: true,
    inspection: getListingInspection(undefined, listing, runMode),
    previous: undefined,
    listing,
    detailSucceeded,
    notifyPriceIncrease: true
  });
}

test("normal 모드는 조건 미충족 매물의 알림 이벤트를 만들지 않는다", () => {
  const enriched = analyzeDetail("<html>기본 차량, 외장색상 빨간색</html>", baseListing, config);
  const evaluated = evaluateListing(enriched, config);

  assert.equal(evaluated.eligible, false);
  assert.equal(eventFor({ runMode: "normal", listing: evaluated, detailSucceeded: true }), null);
});

test("send_current 모드는 조건 미충족 매물도 알림 이벤트를 만든다", () => {
  const overLimit = {
    ...baseListing,
    yearMonth: "2023-01",
    mileageKm: 151000,
    priceKrw: 41000000
  };
  const enriched = analyzeDetail("<html>기본 차량</html>", overLimit, config);
  const evaluated = evaluateListing(enriched, config);
  const sendCurrentListing = prepareSendCurrentListing(evaluated, config, { detailSucceeded: true });
  const event = eventFor({ runMode: "send_current", listing: sendCurrentListing, detailSucceeded: true });

  assert.equal(sendCurrentListing.conditionStatus, "조건 미충족");
  assert.equal(event.type, "현재 검색 결과 · 조건 미충족");
});

test("send_current 메시지에는 조건 충족 표시가 포함된다", () => {
  const enriched = analyzeDetail("<html>FSD 포함</html>", baseListing, config);
  const evaluated = evaluateListing(enriched, config);
  const sendCurrentListing = prepareSendCurrentListing(evaluated, config, { detailSucceeded: true });
  const event = eventFor({ runMode: "send_current", listing: sendCurrentListing, detailSucceeded: true });
  const message = formatTelegramMessage(event.type, event.listing);

  assert.match(message, /\[Sentinel-o-car 현재 검색 결과 · 조건 충족\]/);
  assert.match(message, /판정: 조건 충족/);
});

test("send_current 메시지에는 조건 미충족 사유가 포함된다", () => {
  const overLimit = {
    ...baseListing,
    yearMonth: "2023-01",
    mileageKm: 151000,
    priceKrw: 41000000
  };
  const enriched = analyzeDetail("<html>기본 차량</html>", overLimit, config);
  const evaluated = evaluateListing(enriched, config);
  const sendCurrentListing = prepareSendCurrentListing(evaluated, config, { detailSucceeded: true });
  const event = eventFor({ runMode: "send_current", listing: sendCurrentListing, detailSucceeded: true });
  const message = formatTelegramMessage(event.type, event.listing);

  assert.match(message, /판정: 조건 미충족/);
  assert.match(message, /사유: .*연월 범위 초과/);
  assert.match(message, /사유: .*주행거리 초과/);
  assert.match(message, /사유: .*가격 초과/);
});

test("상세 조회 실패 매물도 send_current에서는 목록 정보와 실패 표시로 전송 가능하다", () => {
  const sendCurrentListing = prepareSendCurrentListing(baseListing, config, {
    detailSucceeded: false,
    errorMessage: "HTTP 503"
  });
  const event = eventFor({ runMode: "send_current", listing: sendCurrentListing, detailSucceeded: false });
  const message = formatTelegramMessage(event.type, event.listing);

  assert.equal(event.type, "현재 검색 결과 · 조건 미충족");
  assert.match(message, /2022\/09 모델 3 롱 레인지 AWD/);
  assert.match(message, /38,500,000원/);
  assert.match(message, /상세: 상세 확인 실패/);
  assert.match(message, /사유: .*상세 확인 실패/);
  assert.match(message, /사유: .*옵션 미확인/);
});

test("normal 모드의 상세 조회 실패 알림 억제 동작은 유지된다", () => {
  const failedListing = prepareSendCurrentListing(baseListing, config, {
    detailSucceeded: false,
    errorMessage: "timeout"
  });

  assert.equal(eventFor({ runMode: "normal", listing: failedListing, detailSucceeded: false }), null);
});
