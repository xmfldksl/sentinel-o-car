import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  analyzeDetail,
  evaluateListing,
  matchesBasicCriteria,
  parseListHtml,
  parseListingText,
  setPage
} from "../src/lib.mjs";

const config = JSON.parse(
  await fs.readFile(
    new URL("../config.json", import.meta.url),
    "utf8"
  )
);

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

test("목록 HTML에서 매물을 파싱하고 중복 ID를 제거한다", async () => {
  const html = await fs.readFile(
    new URL("./fixtures/list.html", import.meta.url),
    "utf8"
  );

  const listings = parseListHtml(html);

  assert.equal(listings.length, 3);

  const target = listings.find(
    (item) => item.id === "42023180"
  );

  assert.equal(
    target.title,
    "모델 3 롱 레인지 AWD"
  );
  assert.equal(target.yearMonth, "2022-09");
  assert.equal(target.mileageKm, 67235);
  assert.equal(target.priceKrw, 32700000);
});

test("목록 지역은 특정 연료명 없이 주행거리와 가격 사이에서만 판정한다", () => {
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

  for (const { title, metadata } of [
    {
      title: "서울 익명 차량",
      metadata: "가솔린"
    },
    {
      title: "경기 익명 차량",
      metadata: ""
    }
  ]) {
    const parsed = parseListingText({
      id: "anonymous-listing",
      href:
        "https://example.invalid/listing/anonymous",
      text:
        `${title} 24/01식 1,000 km ${metadata} 3,000 만원`
    });

    assert.equal(
      parsed.region,
      "미확인"
    );
  }
});

test("사용자 기본 조건을 적용한다", () => {
  const target = {
    title: "모델 3 롱 레인지 AWD",
    yearMonth: "2022-09",
    mileageKm: 67235
  };

  assert.equal(
    matchesBasicCriteria(target, config),
    true
  );

  assert.equal(
    matchesBasicCriteria(
      { ...target, mileageKm: 150001 },
      config
    ),
    false
  );

  assert.equal(
    matchesBasicCriteria(
      { ...target, title: "모델 3 RWD" },
      config
    ),
    false
  );
});

test("판매자 설명의 FSD 구매완료 문구는 유지하고 렌터카 자유 문구는 이력으로 판정하지 않는다", () => {
  const html = detailHtml(
    {
      vehicleNo: "12가3456",
      spec: {
        colorName: "검정색"
      },
      options: {
        etc: []
      },
      advertisement: {
        oneLineText:
          "완전무사고. FSD 구매완료. 라이젠."
      },
      photos: []
    },
    "렌터카 사용 이력"
  );

  const enriched = analyzeDetail(
    html,
    listing({ priceKrw: 36000000 }),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(result.hasFsd, true);
  assert.equal(result.hasEap, false);
  assert.equal(result.option, "FSD");
  assert.equal(
    result.optionSource,
    "판매자 설명"
  );
  assert.equal(result.saleType, "NORMAL");
  assert.equal(
    result.rentalUsageHistory,
    null
  );
  assert.equal(
    result.totalLossHistory,
    null
  );
  assert.equal(
    result.adjustedPriceKrw,
    36000000
  );
  assert.equal(result.limitKrw, 40000000);
  assert.equal(result.priceRule, "FSD 기준");
  assert.equal(result.eligible, true);
});

test("구조화 옵션의 EAP를 확인하고 EAP 가격 한도를 적용한다", () => {
  const html = detailHtml({
    vehicleNo: "12가3456",
    spec: {
      colorName: "검정색"
    },
    options: {
      etc: [
        "향상된 오토파일럿 (EAP)"
      ]
    },
    advertisement: {
      oneLineText: null
    },
    photos: []
  });

  const enriched = analyzeDetail(
    html,
    listing({ priceKrw: 36000000 }),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(result.hasFsd, false);
  assert.equal(result.hasEap, true);
  assert.equal(result.option, "EAP");
  assert.equal(
    result.optionSource,
    "구조화 옵션"
  );
  assert.equal(result.limitKrw, 37000000);
  assert.equal(result.priceRule, "EAP 기준");
  assert.equal(result.eligible, true);
});

test("FSD Lite 가능 문구는 FSD 보유로 인정하지 않고 기본 가격 한도를 적용한다", () => {
  const html = detailHtml({
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
    photos: [
      {
        desc: "FSD Lite 가능"
      }
    ]
  });

  const enriched = analyzeDetail(
    html,
    listing({ priceKrw: 36000000 }),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(result.hasFsd, false);
  assert.equal(result.hasEap, false);
  assert.equal(result.option, "미확인");
  assert.equal(result.optionSource, "미확인");
  assert.equal(result.limitKrw, 35000000);
  assert.equal(
    result.priceRule,
    "일반 차량 기준"
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(
    result.excludedReasons,
    ["가격 초과"]
  );
});

test("페이지 공통 본문의 색상과 옵션 단어는 판정에 사용하지 않는다", () => {
  const html = detailHtml(
    {
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
      photos: []
    },
    "빨간색 FSD EAP 완전자율주행 향상된 오토파일럿 안내"
  );

  const enriched = analyzeDetail(
    html,
    listing(),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(result.colorName, "검정색");
  assert.equal(result.redColor, false);
  assert.equal(result.hasFsd, false);
  assert.equal(result.hasEap, false);
  assert.equal(result.option, "미확인");
  assert.equal(result.eligible, true);
});

test("구조화 외장색이 빨간색이면 계약중과 함께 제외한다", () => {
  const html = detailHtml({
    vehicleNo: "12가3456",
    spec: {
      colorName: "빨간색"
    },
    options: {
      etc: []
    },
    advertisement: {
      oneLineText: null
    },
    photos: []
  });

  const enriched = analyzeDetail(
    html,
    listing({
      contracted: true,
      priceKrw: 32000000
    }),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(result.colorName, "빨간색");
  assert.equal(result.redColor, true);
  assert.equal(result.eligible, false);
  assert.deepEqual(
    result.excludedReasons,
    ["계약중", "빨간색 계열"]
  );
});

test("FSD와 EAP가 모두 확정되면 FSD 가격 기준을 우선한다", () => {
  const html = detailHtml({
    vehicleNo: "12가3456",
    spec: {
      colorName: "검정색"
    },
    options: {
      etc: [
        "향상된 오토파일럿 (EAP)"
      ]
    },
    advertisement: {
      oneLineText: "FSD 구매완료"
    },
    photos: []
  });

  const enriched = analyzeDetail(
    html,
    listing({ priceKrw: 39000000 }),
    config
  );

  const result = evaluateListing(
    enriched,
    config
  );

  assert.equal(enriched.hasFsd, true);
  assert.equal(enriched.hasEap, true);
  assert.equal(result.option, "FSD");
  assert.equal(result.hasFsd, true);
  assert.equal(result.hasEap, false);
  assert.equal(result.limitKrw, 40000000);
  assert.equal(result.eligible, true);
});

test("페이지 번호를 URL에 안전하게 반영한다", () => {
  assert.equal(
    setPage(
      "https://example.com/list?search=x&page=1",
      3
    ),
    "https://example.com/list?search=x&page=3"
  );
});
