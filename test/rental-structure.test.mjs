import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  analyzeDetail,
  evaluateListing,
  getListingInspection,
  recordListObservation,
  recordDetailSuccess
} from "../src/lib.mjs";

const config = JSON.parse(
  await fs.readFile(
    new URL("../config.json", import.meta.url),
    "utf8"
  )
);

const leaseDetailHtml =
  await fs.readFile(
    new URL(
      "./fixtures/detail-lease-preloaded.html",
      import.meta.url
    ),
    "utf8"
  );

function detailHtml(
  cars,
  body = "테스트 차량"
) {
  return `<!doctype html>
<html lang="ko">
  <body>
    <main>${body}</main>
    <script>
      __PRELOADED_STATE__ = ${JSON.stringify({
        cars
      })};
    </script>
  </body>
</html>`;
}

function listing(overrides = {}) {
  return {
    id: "42023180",
    title: "모델 3 롱 레인지 AWD",
    url: "https://fem.encar.com/cars/detail/42023180",
    yearMonth: "2022-09",
    mileageKm: 92000,
    priceKrw: 32000000,
    region: "서울",
    contracted: false,
    ...overrides
  };
}

function normalBase(overrides = {}) {
  return {
    vehicleNo: "12가3456",
    spec: {
      colorName: "검정색"
    },
    options: {
      etc: []
    },
    advertisement: {
      oneLineText: null
    },
    photos: [],
    contents: null,
    ...overrides
  };
}

test("판매자 자유 문구의 렌트X는 판매방식과 이력 및 평가가격에 영향을 주지 않는다", () => {
  const analyzed = analyzeDetail(
    detailHtml({
      base: normalBase({
        advertisement: {
          oneLineText: "렌트X"
        }
      })
    }),
    listing({
      listText: "렌트X"
    }),
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  assert.equal(analyzed.saleType, "NORMAL");
  assert.equal(analyzed.monthlyFeeKrw, null);
  assert.equal(
    analyzed.rentalUsageHistory,
    null
  );
  assert.equal(
    analyzed.totalLossHistory,
    null
  );
  assert.equal(
    evaluated.adjustedPriceKrw,
    analyzed.priceKrw
  );
  assert.doesNotMatch(
    evaluated.excludedReasons.join(" "),
    /렌트/
  );
  assert.doesNotMatch(
    evaluated.warnings.join(" "),
    /렌트/
  );
});

test("모든 렌트 및 전손 자유 문구는 구조화 값이 없으면 판정에 사용하지 않는다", () => {
  const freeText =
    "렌트 렌터카 대여용도 전손";

  const analyzed = analyzeDetail(
    detailHtml(
      {
        base: normalBase({
          advertisement: {
            oneLineText: freeText
          },
          contents: freeText,
          photos: [
            {
              desc: freeText
            }
          ]
        })
      },
      freeText
    ),
    listing({
      listText: freeText,
      detailTextSample: freeText
    }),
    config
  );

  assert.equal(analyzed.saleType, "NORMAL");
  assert.equal(
    analyzed.rentalUsageHistory,
    null
  );
  assert.equal(
    analyzed.totalLossHistory,
    null
  );
});

test("구조화된 leaseRentType과 advertisementType은 각각 현재 판매방식을 판정한다", () => {
  const cases = [
    {
      cars: {
        detailFlags: {
          leaseRentType: "LEASE"
        },
        base: normalBase()
      },
      expected: "LEASE"
    },
    {
      cars: {
        base: normalBase({
          advertisementType:
            "OPERATING_LEASE"
        })
      },
      expected: "LEASE"
    },
    {
      cars: {
        detailFlags: {
          leaseRentType: "RENT"
        },
        base: normalBase()
      },
      expected: "RENT"
    },
    {
      cars: {
        base: normalBase({
          advertisementType: "RENT"
        })
      },
      expected: "RENT"
    }
  ];

  for (const { cars, expected } of cases) {
    const analyzed = analyzeDetail(
      detailHtml(cars),
      listing(),
      config
    );

    assert.equal(
      analyzed.saleType,
      expected
    );
    assert.equal(
      analyzed.rentalUsageHistory,
      null
    );
  }
});

test("구조화 리스의 만 원 단위 매매가격과 월 납입금을 원 단위로 분리한다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    listing({
      priceKrw: 31000000
    }),
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  assert.equal(analyzed.saleType, "LEASE");
  assert.equal(analyzed.priceKrw, 29000000);
  assert.equal(
    analyzed.monthlyFeeKrw,
    620000
  );
  assert.equal(
    analyzed.rentalUsageHistory,
    null
  );
  assert.equal(
    analyzed.totalLossHistory,
    null
  );
  assert.equal(
    evaluated.adjustedPriceKrw,
    29000000
  );
  assert.doesNotMatch(
    evaluated.warnings.join(" "),
    /렌트/
  );
});

test("목록 관측가격과 상세 매매가격이 달라도 같은 목록을 반복 상세 조회하지 않는다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    listing({
      priceKrw: 31000000
    }),
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  const record = recordDetailSuccess(
    undefined,
    analyzed,
    evaluated,
    "2026-07-22T00:00:00.000Z"
  );

  const unchangedList = listing({
    priceKrw: 31000000
  });

  const inspection =
    getListingInspection(
      record,
      unchangedList,
      "normal"
    );

  assert.equal(record.priceKrw, 29000000);
  assert.equal(
    record.listPriceKrw,
    31000000
  );
  assert.equal(inspection.priceChanged, false);
  assert.equal(inspection.shouldInspect, false);

  const observed = recordListObservation(
    record,
    unchangedList,
    "2026-07-22T00:30:00.000Z"
  );

  assert.equal(observed.priceKrw, 29000000);
  assert.equal(
    observed.listPriceKrw,
    31000000
  );

  assert.equal(
    getListingInspection(
      record,
      listing({
        priceKrw: 30000000
      }),
      "normal"
    ).shouldInspect,
    true
  );
});

test("현재 판매방식이 RENT여도 렌트 용도 이력이 null이면 감가하지 않는다", () => {
  const result = evaluateListing(
    {
      ...listing(),
      saleType: "RENT",
      monthlyFeeKrw: null,
      rentalUsageHistory: null,
      totalLossHistory: null,
      hasFsd: false,
      hasEap: false,
      redColor: false,
      smokingWarning: false,
      tuningWarning: false
    },
    config
  );

  assert.equal(
    result.adjustedPriceKrw,
    32000000
  );
  assert.equal(result.eligible, true);
  assert.doesNotMatch(
    result.excludedReasons.join(" "),
    /렌트/
  );
  assert.doesNotMatch(
    result.warnings.join(" "),
    /렌트/
  );
});

test("렌트 용도 이력이 명시적으로 true일 때만 렌트 감가를 적용한다", () => {
  const result = evaluateListing(
    {
      ...listing({
        priceKrw: 33000000
      }),
      saleType: "NORMAL",
      monthlyFeeKrw: null,
      rentalUsageHistory: true,
      totalLossHistory: null,
      hasFsd: false,
      hasEap: false,
      redColor: false,
      smokingWarning: false,
      tuningWarning: false
    },
    config
  );

  assert.equal(
    result.adjustedPriceKrw,
    36000000
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(
    result.excludedReasons,
    ["렌트 감가 후 가격 초과"]
  );
  assert.match(
    result.warnings.join(" "),
    /렌트 이력 감가 3,000,000원 반영/
  );
});

test("상세 성공 상태에는 새 구조화 필드를 저장하고 legacy rental 키를 제거한다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    listing({
      priceKrw: 31000000
    }),
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  const record = recordDetailSuccess(
    {
      ...listing(),
      rental: true,
      firstSeenAt:
        "2026-07-18T00:00:00.000Z"
    },
    analyzed,
    evaluated,
    "2026-07-22T00:00:00.000Z"
  );

  assert.equal(
    Object.hasOwn(record, "rental"),
    false
  );
  assert.equal(record.saleType, "LEASE");
  assert.equal(record.priceKrw, 29000000);
  assert.equal(
    record.monthlyFeeKrw,
    620000
  );
  assert.equal(
    record.rentalUsageHistory,
    null
  );
  assert.equal(
    record.totalLossHistory,
    null
  );
});
