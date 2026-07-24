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
  optionMode: "tesla",
  titleFilter: {
    requiredAll: [
      "모델 3",
      "롱 레인지",
      "AWD"
    ],
    requiredAny: [],
    excludedAny: []
  },
  yearMonthMin: "2022-05",
  yearMonthMax: "2022-12",
  maxMileageKm: 150000,
  price: {
    maxPriceKrw: 35000000,
    teslaOptionLimitsKrw: {
      eap: 37000000,
      fsd: 40000000,
      unknownOptionHardMax:
        40000000
    }
  },
  excludedColors: [
    "빨간색",
    "적색",
    "레드"
  ],
  excludeContractPending: true,
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

function basicDetail(overrides = {}) {
  return detailHtml({
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
  });
}

function eventFor({
  runMode,
  listing,
  detailSucceeded
}) {
  return createListingEvent({
    runMode,
    wasInitialized: true,
    inspection: getListingInspection(
      undefined,
      listing,
      runMode
    ),
    previous: undefined,
    listing,
    detailSucceeded,
    notifyPriceIncrease: true
  });
}

test("normal 모드는 조건 미충족 매물의 알림 이벤트를 만들지 않는다", () => {
  const html = basicDetail({
    spec: {
      colorName: "빨간색"
    }
  });

  const enriched = analyzeDetail(
    html,
    baseListing,
    config
  );

  const evaluated = evaluateListing(
    enriched,
    config
  );

  assert.equal(evaluated.redColor, true);
  assert.equal(evaluated.eligible, false);

  assert.equal(
    eventFor({
      runMode: "normal",
      listing: evaluated,
      detailSucceeded: true
    }),
    null
  );
});

test("send_current 조건 충족 메시지는 제목과 본문 판정을 분리한다", () => {
  const html = basicDetail({
    advertisement: {
      oneLineText:
        "완전무사고. FSD 구매완료. 라이젠."
    }
  });

  const enriched = analyzeDetail(
    html,
    baseListing,
    config
  );

  const evaluated = evaluateListing(
    enriched,
    config
  );

  const sendCurrentListing =
    prepareSendCurrentListing(
      evaluated,
      config,
      { detailSucceeded: true }
    );

  const event = eventFor({
    runMode: "send_current",
    listing: sendCurrentListing,
    detailSucceeded: true
  });

  const message = formatTelegramMessage(
    event.type,
    event.listing
  );

  const firstLine = message.split("\n")[0];

  assert.equal(evaluated.option, "FSD");
  assert.equal(evaluated.eligible, true);

  assert.equal(
    firstLine,
    "[현재 검색 결과]"
  );

  assert.doesNotMatch(
    firstLine,
    /조건 충족|조건 미충족/
  );

  assert.doesNotMatch(
    message,
    /Sentinel-o-car/i
  );

  assert.match(
    message,
    /판정: 조건 충족/
  );

  assert.match(
    message,
    /옵션: FSD 확인/
  );
});

test("FSD Lite 가능 차량은 FSD로 인정하지 않고 기본 가격 초과로 판정한다", () => {
  const html = basicDetail({
    photos: [
      {
        desc: "FSD Lite 가능"
      }
    ]
  });

  const enriched = analyzeDetail(
    html,
    baseListing,
    config
  );

  const evaluated = evaluateListing(
    enriched,
    config
  );

  const sendCurrentListing =
    prepareSendCurrentListing(
      evaluated,
      config,
      { detailSucceeded: true }
    );

  assert.equal(evaluated.option, "미확인");
  assert.equal(evaluated.hasFsd, false);
  assert.equal(evaluated.limitKrw, 35000000);
  assert.equal(evaluated.eligible, false);

  assert.deepEqual(
    evaluated.excludedReasons,
    ["가격 초과"]
  );

  assert.equal(
    sendCurrentListing.conditionStatus,
    "조건 미충족"
  );

  assert.match(
    sendCurrentListing.conditionReasons.join(
      ", "
    ),
    /가격 초과/
  );
});

test("send_current 조건 미충족 메시지는 제목과 본문 판정을 분리하고 사유를 유지한다", () => {
  const overLimit = {
    ...baseListing,
    yearMonth: "2023-01",
    mileageKm: 151000,
    priceKrw: 41000000
  };

  const enriched = analyzeDetail(
    basicDetail(),
    overLimit,
    config
  );

  const evaluated = evaluateListing(
    enriched,
    config
  );

  const sendCurrentListing =
    prepareSendCurrentListing(
      evaluated,
      config,
      { detailSucceeded: true }
    );

  const event = eventFor({
    runMode: "send_current",
    listing: sendCurrentListing,
    detailSucceeded: true
  });

  const message = formatTelegramMessage(
    event.type,
    event.listing
  );

  const firstLine = message.split("\n")[0];

  assert.equal(
    firstLine,
    "[현재 검색 결과]"
  );

  assert.doesNotMatch(
    firstLine,
    /조건 충족|조건 미충족/
  );

  assert.match(
    message,
    /판정: 조건 미충족/
  );

  assert.match(
    message,
    /사유: .*연월 범위 초과/
  );

  assert.match(
    message,
    /사유: .*주행거리 초과/
  );

  assert.match(
    message,
    /사유: .*가격 초과/
  );
});

test("상세 조회 실패 매물도 send_current에서는 목록 정보와 실패 표시로 전송 가능하다", () => {
  const sendCurrentListing =
    prepareSendCurrentListing(
      baseListing,
      config,
      {
        detailSucceeded: false,
        errorMessage: "HTTP 503"
      }
    );

  const event = eventFor({
    runMode: "send_current",
    listing: sendCurrentListing,
    detailSucceeded: false
  });

  const message = formatTelegramMessage(
    event.type,
    event.listing
  );

  assert.equal(
    event.type,
    "현재 검색 결과"
  );

  assert.match(
    message,
    /2022\/09 모델 3 롱 레인지 AWD/
  );

  assert.match(
    message,
    /38,500,000원/
  );

  assert.match(
    message,
    /상세: 상세 확인 실패/
  );

  assert.match(
    message,
    /사유: .*상세 확인 실패/
  );

  assert.match(
    message,
    /사유: .*옵션 미확인/
  );
});
