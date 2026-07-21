import assert from "node:assert/strict";
import test from "node:test";
import {
  createListingEvent,
  getListingInspection,
  migrateLegacyState
} from "../src/lib.mjs";

test("구형 상태의 자유 문구 기반 rental을 제거하고 가격 및 식별 정보를 보존한다", () => {
  const firstSeenAt =
    "2026-07-18T00:00:00.000Z";

  const legacyState = {
    initializedAt:
      "2026-07-17T00:00:00.000Z",
    updatedAt:
      "2026-07-21T00:00:00.000Z",
    listings: {
      "42023180": {
        id: "42023180",
        title:
          "모델 3 롱 레인지 AWD",
        url: "https://fem.encar.com/cars/detail/42023180",
        yearMonth: "2022-09",
        mileageKm: 92000,
        priceKrw: 29000000,
        adjustedPriceKrw: 32000000,
        region: "서울",
        contracted: false,
        vehicleNo: "12가3456",
        previousListingId: "41000000",
        firstSeenAt,
        lastSeenAt:
          "2026-07-21T00:00:00.000Z",
        rental: true,
        eligible: true
      },
      "43000000": {
        id: "43000000",
        priceKrw: 31000000,
        adjustedPriceKrw: 34000000,
        rental: false,
        rentalUsageHistory: true,
        totalLossHistory: false
      }
    }
  };

  const original =
    structuredClone(legacyState);

  const migrated =
    migrateLegacyState(legacyState);

  assert.deepEqual(
    legacyState,
    original,
    "마이그레이션은 입력 상태를 변경하지 않아야 한다"
  );
  assert.notEqual(migrated, legacyState);
  assert.notEqual(
    migrated.listings["42023180"],
    legacyState.listings["42023180"]
  );

  const record =
    migrated.listings["42023180"];

  assert.equal(
    Object.hasOwn(record, "rental"),
    false
  );
  assert.equal(
    record.rentalUsageHistory,
    null
  );
  assert.equal(
    record.totalLossHistory,
    null
  );
  assert.equal(
    record.adjustedPriceKrw,
    record.priceKrw
  );
  assert.equal(record.priceKrw, 29000000);
  assert.equal(record.firstSeenAt, firstSeenAt);
  assert.equal(record.vehicleNo, "12가3456");
  assert.equal(
    record.previousListingId,
    "41000000"
  );

  const confirmedHistory =
    migrated.listings["43000000"];

  assert.equal(
    Object.hasOwn(
      confirmedHistory,
      "rental"
    ),
    false
  );
  assert.equal(
    confirmedHistory.rentalUsageHistory,
    true
  );
  assert.equal(
    confirmedHistory.totalLossHistory,
    false
  );
  assert.equal(
    confirmedHistory.adjustedPriceKrw,
    31000000
  );

  const current = {
    ...record,
    eligible: true
  };

  const inspection =
    getListingInspection(
      record,
      current,
      "normal"
    );

  assert.equal(inspection.isNew, false);
  assert.equal(
    inspection.priceChanged,
    false
  );

  assert.equal(
    createListingEvent({
      runMode: "normal",
      wasInitialized: true,
      inspection,
      previous: record,
      listing: current,
      detailSucceeded: true,
      notifyPriceIncrease: true
    }),
    null
  );
});
