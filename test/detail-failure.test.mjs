import assert from "node:assert/strict";
import test from "node:test";
import {
  createListingEvent,
  getListingInspection,
  recordDetailFailure,
  recordDetailSuccess
} from "../src/lib.mjs";

const firstSeenAt = "2026-07-18T00:00:00.000Z";
const failedAt = "2026-07-19T00:00:00.000Z";
const recoveredAt = "2026-07-19T00:30:00.000Z";
const listing = {
  id: "42023180",
  title: "모델 3 롱 레인지 AWD",
  url: "https://fem.encar.com/cars/detail/42023180",
  yearMonth: "2022-09",
  mileageKm: 67235,
  priceKrw: 32700000,
  region: "경기",
  contracted: false,
  vehicleNo: "12가3456"
};

const evaluated = {
  ...listing,
  option: "FSD",
  saleType: "NORMAL",
  monthlyFeeKrw: null,
  rentalUsageHistory: null,
  totalLossHistory: null,
  hasFsd: true,
  hasEap: false,
  conditionStatus: "조건 충족",
  conditionReasons: []
};

test("처음 발견한 매물의 상세 조회 실패는 신규 알림을 만들지 않는다", () => {
  const inspection = getListingInspection(undefined, listing);
  const failed = recordDetailFailure(
    undefined,
    listing,
    failedAt,
    "HTTP 503",
    true
  );

  assert.equal(inspection.isNew, true);
  assert.equal(failed.priceKrw, undefined);
  assert.equal(failed.lastObservedPriceKrw, listing.priceKrw);
  assert.equal(createListingEvent({ runMode: "normal", wasInitialized: true, inspection, previous: undefined, listing: failed, detailSucceeded: false }), null);
});

test("가격 인하 후 상세 조회 실패는 알림을 만들지 않는다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt };
  const inspection = getListingInspection(previous, listing);
  const failed = recordDetailFailure(
    previous,
    listing,
    failedAt,
    "HTTP 500",
    true
  );

  assert.equal(inspection.priceDropped, true);
  assert.equal(createListingEvent({ runMode: "normal", wasInitialized: true, inspection, previous, listing: failed, detailSucceeded: false }), null);
});

test("상세 조회 실패는 기존 정상 가격과 사실 정보를 덮어쓰지 않는다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt, lastEvaluatedAt: firstSeenAt };
  const failed = recordDetailFailure(
    previous,
    listing,
    failedAt,
    "timeout",
    true
  );

  assert.equal(failed.priceKrw, 34000000);
  assert.equal(failed.option, "FSD");
  assert.equal(failed.vehicleNo, "12가3456");
  assert.equal(failed.saleType, "NORMAL");
  assert.equal(
    failed.rentalUsageHistory,
    null
  );
  assert.equal(
    failed.totalLossHistory,
    null
  );
  assert.equal(
    Object.hasOwn(failed, "rental"),
    false
  );
  assert.equal(failed.lastEvaluatedAt, firstSeenAt);
  assert.equal(failed.lastSeenAt, failedAt);
  assert.equal(failed.lastDetailFetchError, "timeout");
});

test("상세 조회가 이후 성공하면 정상 상태와 가격 인하 알림으로 복귀한다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt };
  const failed = recordDetailFailure(
    previous,
    listing,
    failedAt,
    "timeout",
    true
  );
  const retry = getListingInspection(failed, listing);
  const recovered = recordDetailSuccess(
    failed,
    listing,
    evaluated,
    recoveredAt,
    true
  );
  const event = createListingEvent({
    runMode: "normal",
    wasInitialized: true,
    inspection: retry,
    previous: failed,
    listing: evaluated,
    detailSucceeded: true
  });

  assert.equal(recovered.priceKrw, listing.priceKrw);
  assert.equal(recovered.lastDetailFetchError, undefined);
  assert.match(event.type, /^가격 인하/);
});

test("처음 상세 조회에 실패한 신규 매물은 성공 후 신규 알림 흐름으로 복귀한다", () => {
  const failed = recordDetailFailure(
    undefined,
    listing,
    failedAt,
    "timeout",
    true
  );
  const retry = getListingInspection(failed, listing);
  const event = createListingEvent({
    runMode: "normal",
    wasInitialized: true,
    inspection: retry,
    previous: failed,
    listing: evaluated,
    detailSucceeded: true
  });

  assert.equal(event.type, "신규");
});
