import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  analyzeDetail,
  evaluateListing,
  matchesTitleFilter,
  parseListHtml,
  parseListingText
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

function detailHtml(base, body = "테스트 차량") {
  return `<!doctype html>
<html lang="ko">
  <body>
    <main>${body}</main>
    <script>
      __PRELOADED_STATE__ = ${JSON.stringify({
        cars: { base }
      })};
    </script>
  </body>
</html>`;
}

function listing(overrides = {}) {
  return {
    id: "1",
    title: "모델 3 롱 레인지 AWD",
    url: "https://fem.encar.com/cars/detail/1",
    yearMonth: "2022-09",
    mileageKm: 67235,
    priceKrw: 32000000,
    region: "서울",
    contracted: false,
    ...overrides
  };
}

function detailBase(overrides = {}) {
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
    ...overrides
  };
}

test("목록 HTML에서 필수 구조를 파싱하고 중복 ID를 제거한다", async () => {
  const html = await fs.readFile(
    new URL("./fixtures/list.html", import.meta.url),
    "utf8"
  );
  const listings = parseListHtml(html);
  const target = listings.find(
    (item) => item.id === "42023180"
  );

  assert.equal(listings.length, 3);
  assert.equal(
    target.title,
    "모델 3 롱 레인지 AWD"
  );
  assert.equal(target.yearMonth, "2022-09");
  assert.equal(target.mileageKm, 67235);
  assert.equal(target.priceKrw, 32700000);
  assert.equal(
    parseListingText({
      id: "invalid",
      href:
        "https://example.invalid/listing/invalid",
      text: "필수 연식 주행거리 가격 구조 없음"
    }),
    null
  );
});

test("목록 지역은 주행거리와 가격 사이의 구조에서만 판정한다", () => {
  const cases = [
    ["전기 경기", "경기"],
    ["가솔린 서울", "서울"],
    ["디젤 부산", "부산"],
    ["하이브리드 제주", "제주"],
    ["서울", "서울"]
  ];

  for (const [metadata, expected] of cases) {
    const parsed = parseListingText({
      id: "anonymous-listing",
      href:
        "https://example.invalid/listing/anonymous",
      text:
        `익명 차량 24/01식 1,000 km ${metadata} 3,000 만원`
    });

    assert.equal(
      parsed.region,
      expected,
      metadata
    );
  }
});

test("연식과 주행거리는 titleFilter 판정에 영향을 주지 않는다", () => {
  const profile = {
    ...teslaProfile,
    titleFilter: {
      requiredAll: ["모델 3"],
      requiredAny: ["AWD"],
      excludedAny: ["RWD"]
    }
  };

  assert.equal(
    matchesTitleFilter(
      "모델 3 AWD",
      profile
    ),
    true
  );
  assert.equal(
    matchesTitleFilter(
      "모델 3 RWD AWD",
      profile
    ),
    false
  );
  assert.equal(
    matchesTitleFilter(
      {
        toString: () => "모델 3 AWD",
        yearMonth: "1900-01",
        mileageKm: Number.MAX_SAFE_INTEGER
      },
      profile
    ),
    true
  );
});

test("Tesla 옵션은 구조화 값과 제한된 판매자 문구에서만 확인한다", async (t) => {
  const cases = [
    {
      name: "판매자 FSD",
      base: detailBase({
        advertisement: {
          oneLineText:
            "완전무사고. FSD 구매완료."
        }
      }),
      body: "렌터카 사용 이력",
      expectedOption: "FSD",
      expectedSource: "판매자 설명"
    },
    {
      name: "구조화 EAP",
      base: detailBase({
        options: {
          etc: [
            "향상된 오토파일럿 (EAP)"
          ]
        }
      }),
      expectedOption: "EAP",
      expectedSource: "구조화 옵션"
    },
    {
      name: "FSD Lite",
      base: detailBase({
        photos: [
          {
            desc: "FSD Lite 가능"
          }
        ]
      }),
      expectedOption: "미확인",
      expectedSource: "미확인"
    }
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const analyzed = analyzeDetail(
        detailHtml(
          entry.base,
          entry.body
        ),
        listing(),
        teslaProfile
      );

      assert.equal(
        analyzed.option,
        entry.expectedOption
      );
      assert.equal(
        analyzed.optionSource,
        entry.expectedSource
      );
      assert.equal(
        analyzed.rentalUsageHistory,
        null
      );
      assert.equal(
        analyzed.totalLossHistory,
        null
      );
    });
  }
});

test("색상과 계약 상태는 사실로 남지만 가격 조건 판정에는 사용하지 않는다", () => {
  const analyzed = analyzeDetail(
    detailHtml(
      detailBase({
        spec: {
          colorName: "빨간색"
        }
      }),
      "빨간색 계약중 렌트 전손"
    ),
    listing({
      contracted: true,
      priceKrw: 35000000
    }),
    teslaProfile
  );
  const evaluated = evaluateListing(
    analyzed,
    teslaProfile
  );

  assert.equal(analyzed.colorName, "빨간색");
  assert.equal(analyzed.contracted, true);
  assert.equal(
    evaluated.conditionStatus,
    "조건 충족"
  );
  assert.deepEqual(
    evaluated.conditionReasons,
    []
  );
});

test("EAP와 FSD가 모두 확인되면 FSD 기준을 우선하고 사실 값은 모두 보존한다", () => {
  const analyzed = analyzeDetail(
    detailHtml(
      detailBase({
        options: {
          etc: [
            "향상된 오토파일럿 (EAP)"
          ]
        },
        advertisement: {
          oneLineText: "FSD 구매완료"
        }
      })
    ),
    listing({
      priceKrw: 39000000
    }),
    teslaProfile
  );
  const evaluated = evaluateListing(
    analyzed,
    teslaProfile
  );

  assert.equal(evaluated.option, "FSD");
  assert.equal(evaluated.hasFsd, true);
  assert.equal(evaluated.hasEap, true);
  assert.equal(
    evaluated.conditionStatus,
    "조건 충족"
  );
});
