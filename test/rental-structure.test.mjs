import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  analyzeDetail,
  evaluateListing,
  getListingInspection,
  recordDetailSuccess
} from "../src/lib.mjs";

const teslaProfile = {
  isTesla: true,
  titleFilter: {
    requiredAll: [],
    requiredAny: [],
    excludedAny: []
  },
  price: {
    maxPriceKrw: 35000000,
    eapMaxPriceKrw: 37000000,
    fsdMaxPriceKrw: 40000000
  }
};

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

test("렌트·전손 자유 문구는 구조화된 판매방식과 이력을 만들지 않는다", () => {
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
      listText: freeText
    }),
    teslaProfile
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

test("구조화된 leaseRentType과 advertisementType만 현재 판매방식을 판정한다", async (t) => {
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

  for (const entry of cases) {
    await t.test(entry.expected, () => {
      const analyzed = analyzeDetail(
        detailHtml(entry.cars),
        listing(),
        teslaProfile
      );

      assert.equal(
        analyzed.saleType,
        entry.expected
      );
      assert.equal(
        analyzed.rentalUsageHistory,
        null
      );
    });
  }
});

test("구조화 리스의 매매가격과 월 납입금을 원 단위로 분리한다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    listing({
      priceKrw: 31000000
    }),
    teslaProfile
  );
  const evaluated = evaluateListing(
    analyzed,
    teslaProfile
  );

  assert.equal(analyzed.saleType, "LEASE");
  assert.equal(analyzed.priceKrw, 29000000);
  assert.equal(
    analyzed.monthlyFeeKrw,
    620000
  );
  assert.equal(
    evaluated.conditionStatus,
    "조건 충족"
  );
});

test("목록 관측가격과 상세 매매가격을 분리하고 판정 캐시는 상태에 저장하지 않는다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    listing({
      priceKrw: 31000000
    }),
    teslaProfile
  );
  const evaluated = evaluateListing(
    analyzed,
    teslaProfile
  );
  const record = recordDetailSuccess(
    undefined,
    analyzed,
    evaluated,
    "2026-07-25T00:00:00.000Z",
    true
  );
  assert.equal(record.priceKrw, 29000000);
  assert.equal(
    record.listPriceKrw,
    31000000
  );
});

test("렌트·전손·판매방식 사실은 가격 조건을 바꾸지 않는다", () => {
  const variants = [
    {
      saleType: "NORMAL",
      rentalUsageHistory: null,
      totalLossHistory: null
    },
    {
      saleType: "RENT",
      rentalUsageHistory: true,
      totalLossHistory: true
    },
    {
      saleType: "LEASE",
      rentalUsageHistory: false,
      totalLossHistory: false
    }
  ];

  for (const facts of variants) {
    const result = evaluateListing(
      {
        ...listing({
          priceKrw: 35000000
        }),
        ...facts,
        hasFsd: false,
        hasEap: false
      },
      teslaProfile
    );

    assert.equal(
      result.conditionStatus,
      "조건 충족"
    );
    assert.deepEqual(
      result.conditionReasons,
      []
    );
  }
});
