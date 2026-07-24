import assert from "node:assert/strict";
import test from "node:test";

import {
  createListingEvent,
  evaluateListing,
  formatTelegramMessage,
  getListingInspection,
  prepareSendCurrentListing,
  selectRepresentativeCandidates
} from "../src/lib.mjs";

const profile = {
  isTesla: false,
  titleFilter: {
    requiredAll: [],
    requiredAny: [],
    excludedAny: []
  },
  price: {
    maxPriceKrw: 35000000
  }
};

function listing(overrides = {}) {
  return {
    id: "listing-1",
    title: "테스트 차량",
    url: "https://example.invalid/listing/1",
    yearMonth: "1999-01",
    mileageKm: 999999,
    priceKrw: 34000000,
    listPriceKrw: 34000000,
    region: "서울",
    contracted: true,
    colorName: "빨간색",
    saleType: "RENT",
    monthlyFeeKrw: null,
    rentalUsageHistory: true,
    totalLossHistory: true,
    ...overrides
  };
}

function eventFor({
  runMode,
  previous,
  current,
  notifyPriceIncrease = true
}) {
  return createListingEvent({
    runMode,
    wasInitialized: true,
    inspection: getListingInspection(
      previous,
      current,
      runMode
    ),
    previous,
    listing: current,
    detailSucceeded: true,
    notifyPriceIncrease
  });
}

test("가격 이하와 가격 초과 모두 신규·가격 인하·가격 인상·send_current 이벤트를 만든다", async (t) => {
  const cases = [
    {
      name: "가격 이하",
      priceKrw: 34000000,
      status: "조건 충족",
      reasons: []
    },
    {
      name: "가격 초과",
      priceKrw: 36000000,
      status: "조건 미충족",
      reasons: ["가격 초과"]
    }
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const current = evaluateListing(
        listing({
          priceKrw: entry.priceKrw,
          listPriceKrw: entry.priceKrw
        }),
        profile
      );

      const events = [
        eventFor({
          runMode: "normal",
          previous: undefined,
          current
        }),
        eventFor({
          runMode: "normal",
          previous: {
            ...current,
            priceKrw:
              entry.priceKrw + 1000000,
            listPriceKrw:
              entry.priceKrw + 1000000
          },
          current
        }),
        eventFor({
          runMode: "normal",
          previous: {
            ...current,
            priceKrw:
              entry.priceKrw - 1000000,
            listPriceKrw:
              entry.priceKrw - 1000000
          },
          current
        }),
        eventFor({
          runMode: "send_current",
          previous: undefined,
          current:
            prepareSendCurrentListing(
              current,
              profile,
              {
                detailSucceeded: true
              }
            )
        })
      ];

      assert.deepEqual(
        events.map((event) => event?.kind),
        [
          "new",
          "price_decrease",
          "price_increase",
          "current"
        ]
      );

      for (const event of events) {
        assert.equal(
          event.listing.conditionStatus,
          entry.status
        );
        assert.deepEqual(
          event.listing.conditionReasons,
          entry.reasons
        );
      }
    });
  }
});

test("연식·주행거리·색상·계약·렌트·전손·판매방식은 판정과 이벤트를 막지 않는다", () => {
  const evaluated = evaluateListing(
    listing(),
    profile
  );
  const event = eventFor({
    runMode: "normal",
    previous: undefined,
    current: evaluated
  });

  assert.equal(
    evaluated.conditionStatus,
    "조건 충족"
  );
  assert.deepEqual(
    evaluated.conditionReasons,
    []
  );
  assert.equal(event.kind, "new");
});

test("계약중 여부는 동일 차량 대표 매물 우선순위가 아니다", () => {
  const [representative] =
    selectRepresentativeCandidates([
      {
        order: 0,
        detailSucceeded: true,
        listing: listing({
          id: "first",
          vehicleNo: "12가3456",
          contracted: true
        })
      },
      {
        order: 1,
        detailSucceeded: true,
        listing: listing({
          id: "second",
          vehicleNo: "12가3456",
          contracted: false
        })
      }
    ]).representatives;

  assert.equal(
    representative.listing.id,
    "first"
  );
});

test("Telegram 판정은 가격 사유만 표시하고 Tesla 옵션 표시는 실행 컨텍스트로 제어한다", () => {
  const current =
    prepareSendCurrentListing(
      evaluateListing(
        listing({
          priceKrw: 36000000
        }),
        profile
      ),
      profile,
      {
        detailSucceeded: true
      }
    );
  const message = formatTelegramMessage(
    "현재 검색 결과",
    current,
    {
      profileNames: ["테스트"],
      showTeslaOption: false
    }
  );

  assert.match(message, /판정: 조건 미충족/);
  assert.match(message, /사유: 가격 초과/);
  assert.doesNotMatch(
    message,
    /연월 범위|주행거리|빨간색|계약중/
  );
  assert.doesNotMatch(message, /옵션:/);
});
