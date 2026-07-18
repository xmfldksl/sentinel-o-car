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
  contracted: false
};

const evaluated = {
  ...listing,
  option: "FSD",
  rental: false,
  eligible: true
};

test("처음 발견한 매물의 상세 조회 실패는 신규 알림을 만들지 않는다", () => {
  const inspection = getListingInspection(undefined, listing, "normal");
  const failed = recordDetailFailure(undefined, listing, failedAt, "HTTP 503");

  assert.equal(inspection.isNew, true);
  assert.equal(failed.priceKrw, undefined);
  assert.equal(failed.lastObservedPriceKrw, listing.priceKrw);
  assert.equal(createListingEvent({ runMode: "normal", wasInitialized: true, inspection, previous: undefined, listing: failed, detailSucceeded: false }), null);
});

test("상세 조회 실패 매물은 다음 실행에서 다시 상세 조회 대상이 된다", () => {
  const failed = recordDetailFailure(undefined, listing, failedAt, "timeout");
  const retry = getListingInspection(failed, listing, "normal");

  assert.equal(retry.isNew, true);
  assert.equal(retry.shouldInspect, true);
});

test("가격 인하 후 상세 조회 실패는 알림을 만들지 않는다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt };
  const inspection = getListingInspection(previous, listing, "normal");
  const failed = recordDetailFailure(previous, listing, failedAt, "HTTP 500");

  assert.equal(inspection.priceDropped, true);
  assert.equal(createListingEvent({ runMode: "normal", wasInitialized: true, inspection, previous, listing: failed, detailSucceeded: false }), null);
});

test("상세 조회 실패는 기존 정상 가격과 판정 결과를 덮어쓰지 않는다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt, lastEvaluatedAt: firstSeenAt };
  const failed = recordDetailFailure(previous, listing, failedAt, "timeout");

  assert.equal(failed.priceKrw, 34000000);
  assert.equal(failed.option, "FSD");
  assert.equal(failed.rental, false);
  assert.equal(failed.eligible, true);
  assert.equal(failed.lastEvaluatedAt, firstSeenAt);
  assert.equal(failed.lastSeenAt, failedAt);
  assert.equal(failed.lastDetailFetchError, "timeout");
});

test("상세 조회가 이후 성공하면 정상 상태와 가격 인하 알림으로 복귀한다", () => {
  const previous = { ...evaluated, priceKrw: 34000000, firstSeenAt };
  const failed = recordDetailFailure(previous, listing, failedAt, "timeout");
  const retry = getListingInspection(failed, listing, "normal");
  const recovered = recordDetailSuccess(failed, listing, evaluated, recoveredAt);
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
  const failed = recordDetailFailure(undefined, listing, failedAt, "timeout");
  const retry = getListingInspection(failed, listing, "normal");
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
