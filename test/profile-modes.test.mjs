import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeDetail,
  evaluateListing,
  formatTelegramMessage,
  getBasicCriteriaFailureReasons,
  matchesBasicCriteria,
  prepareSendCurrentListing,
  recordDetailFailure,
  recordDetailSuccess,
  recordListObservation,
  sanitizeListingStateForOptionMode
} from "../src/lib.mjs";

const TESLA_STATE_FIELDS = [
  "option",
  "hasFsd",
  "hasEap",
  "optionSource",
  "optionEvidence"
];

const genericConfig = {
  optionMode: "generic",
  titleFilter: {
    requiredAll: [],
    requiredAny: [],
    excludedAny: []
  },
  yearMonthMin: "2020-01",
  yearMonthMax: "2030-12",
  maxMileageKm: 200000,
  excludedColorTerms: [],
  excludeContracted: true,
  price: {
    maxPriceKrw: 35000000
  }
};

const teslaConfig = {
  ...genericConfig,
  optionMode: "tesla",
  price: {
    maxPriceKrw: 35000000,
    teslaOptionLimitsKrw: {
      eap: 37000000,
      fsd: 40000000,
      unknownOptionHardMax: 36000000
    }
  }
};

function listing(overrides = {}) {
  return {
    id: "anonymous-listing",
    title: "Alpha One Touring",
    url: "https://example.invalid/listing/anonymous",
    year: 2024,
    month: 6,
    yearMonth: "2024-06",
    mileageKm: 50000,
    priceKrw: 34000000,
    listPriceKrw: 34000000,
    region: "테스트 지역",
    contracted: false,
    vehicleNo: null,
    saleType: "NORMAL",
    monthlyFeeKrw: null,
    rentalUsageHistory: null,
    totalLossHistory: null,
    colorName: null,
    colorStatus: "미확인",
    redColor: false,
    smokingWarning: false,
    tuningWarning: false,
    ...overrides
  };
}

function detailHtml(base, body = "익명 테스트 차량") {
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

function assertHasNoTeslaStateFields(value) {
  for (const field of TESLA_STATE_FIELDS) {
    assert.equal(
      Object.hasOwn(value, field),
      false,
      `generic 결과에 ${field} 필드가 없어야 한다`
    );
  }
}

test("generic 모드는 단일 최대가격 이하만 통과시킨다", () => {
  const below = evaluateListing(
    listing({ priceKrw: 35000000 }),
    genericConfig
  );
  const above = evaluateListing(
    listing({ priceKrw: 35000001 }),
    genericConfig
  );

  assert.equal(below.limitKrw, 35000000);
  assert.equal(below.eligible, true);
  assert.equal(above.limitKrw, 35000000);
  assert.equal(above.eligible, false);
  assert.deepEqual(above.excludedReasons, [
    "가격 초과"
  ]);
  assertHasNoTeslaStateFields(below);
  assertHasNoTeslaStateFields(above);
});

test("generic 가격 판정은 Tesla 옵션별 가격 필드에 접근하지 않는다", () => {
  const price = {
    maxPriceKrw: 35000000
  };

  Object.defineProperty(
    price,
    "teslaOptionLimitsKrw",
    {
      enumerable: true,
      get() {
        throw new Error(
          "generic 모드가 Tesla 옵션별 가격을 읽었다"
        );
      }
    }
  );

  const config = {
    ...genericConfig,
    price
  };
  const candidate = listing({
    priceKrw: 35000000,
    hasFsd: true,
    hasEap: true
  });
  const evaluated = evaluateListing(
    candidate,
    config
  );
  const detailFailed =
    prepareSendCurrentListing(
      candidate,
      config,
      {
        detailSucceeded: false,
        errorMessage:
          "anonymous failure"
      }
    );

  assert.equal(
    evaluated.limitKrw,
    35000000
  );
  assert.equal(
    detailFailed.limitKrw,
    35000000
  );
  assertHasNoTeslaStateFields(
    evaluated
  );
  assertHasNoTeslaStateFields(
    detailFailed
  );
});

test("generic 상세 분석은 Tesla 옵션 및 판매자 옵션 문구 필드를 읽지 않는다", (t) => {
  const advertisement = {
    price: 3400
  };

  Object.defineProperty(
    advertisement,
    "oneLineText",
    {
      enumerable: true,
      get() {
        throw new Error(
          "generic 모드가 FSD/EAP 판매자 문구를 읽었다"
        );
      }
    }
  );

  const base = {
    vehicleNo: null,
    advertisement,
    spec: {
      colorName: "무채색"
    }
  };

  for (const field of [
    "options",
    "contents",
    "photos"
  ]) {
    Object.defineProperty(base, field, {
      enumerable: true,
      get() {
        throw new Error(
          `generic 모드가 Tesla 옵션 필드 ${field}를 읽었다`
        );
      }
    });
  }

  t.mock.method(JSON, "parse", () => ({
    cars: { base }
  }));

  const analyzed = analyzeDetail(
    `<!doctype html>
<main>FSD 구매완료 EAP 구매완료</main>
<script>__PRELOADED_STATE__ = {};</script>`,
    listing(),
    genericConfig
  );

  assert.equal(analyzed.saleType, "NORMAL");
  assert.equal(analyzed.priceKrw, 34000000);
  assertHasNoTeslaStateFields(analyzed);
});

test("generic 텔레그램 메시지는 검색 조건만 추가하고 Tesla 옵션 문구를 숨긴다", () => {
  const message = formatTelegramMessage(
    "신규",
    listing({
      option: "FSD",
      hasFsd: true,
      hasEap: true
    }),
    {
      profileNames: ["일반 조건"],
      showTeslaOption: false
    }
  );

  assert.match(message, /검색 조건: 일반 조건/);
  assert.doesNotMatch(
    message,
    /FSD|EAP|옵션: 미확인/
  );
});

test("generic 신규 가격변경 현재매물 매물삭제 메시지는 모두 프로필을 표시하고 옵션 문구를 숨긴다", () => {
  const eventTypes = [
    "신규",
    "가격 인하 31,000,000원 → 30,000,000원",
    "가격 인상 29,000,000원 → 30,000,000원",
    "현재 검색 결과",
    "deleted"
  ];

  for (const eventType of eventTypes) {
    const message = formatTelegramMessage(
      eventType,
      listing({
        option: "FSD",
        hasFsd: true,
        hasEap: true
      }),
      {
        profileNames: ["일반 조건"],
        showTeslaOption: false
      }
    );

    assert.match(
      message,
      /검색 조건: 일반 조건/
    );
    assert.doesNotMatch(
      message,
      /FSD|EAP|옵션: 미확인/
    );
  }
});

test("tesla 메시지는 프로필 이름과 기존 EAP 옵션 표시를 함께 유지한다", () => {
  const message = formatTelegramMessage(
    "신규",
    listing({
      option: "EAP",
      hasFsd: false,
      hasEap: true
    }),
    {
      profileNames: ["Tesla 조건"],
      showTeslaOption: true
    }
  );

  assert.match(
    message,
    /검색 조건: Tesla 조건/
  );
  assert.match(
    message,
    /옵션: EAP 확인/
  );
});

test("generic 상세 실패 send_current 판정에는 옵션 미확인 사유가 없다", () => {
  const prepared = prepareSendCurrentListing(
    listing({ priceKrw: 36000000 }),
    genericConfig,
    {
      detailSucceeded: false,
      errorMessage: "anonymous failure"
    }
  );

  assert.equal(prepared.limitKrw, 35000000);
  assert.equal(
    prepared.conditionStatus,
    "조건 미충족"
  );
  assert.match(
    prepared.conditionReasons.join(", "),
    /가격 초과/
  );
  assert.match(
    prepared.conditionReasons.join(", "),
    /상세 확인 실패/
  );
  assert.doesNotMatch(
    prepared.conditionReasons.join(", "),
    /옵션|FSD|EAP/
  );
  assertHasNoTeslaStateFields(prepared);
});

test("generic 상세 성공 상태는 기존 Tesla 옵션 필드도 남기지 않는다", () => {
  const current = listing();
  const evaluated = evaluateListing(
    current,
    genericConfig
  );
  const previous = {
    ...listing(),
    option: "FSD",
    hasFsd: true,
    hasEap: false,
    optionSource: "legacy source",
    optionEvidence: "legacy evidence",
    firstSeenAt: "2026-01-01T00:00:00.000Z"
  };

  const record = recordDetailSuccess(
    previous,
    current,
    evaluated,
    "2026-01-02T00:00:00.000Z"
  );

  assert.equal(record.priceKrw, 34000000);
  assert.equal(record.saleType, "NORMAL");
  assertHasNoTeslaStateFields(record);
});

test("Tesla에서 generic으로 바뀐 상태는 모든 저장 경로에서 옵션 필드만 제거한다", () => {
  const firstSeenAt =
    "2026-01-01T00:00:00.000Z";
  const previous = {
    ...listing({
      priceKrw: 34000000,
      vehicleNo: "00가0000",
      saleType: "RENT",
      rentalUsageHistory: true,
      totalLossHistory: false
    }),
    optionMode: "tesla",
    option: "FSD",
    hasFsd: true,
    hasEap: false,
    optionSource: "anonymous source",
    optionEvidence:
      "anonymous evidence",
    firstSeenAt,
    lastEvaluatedAt:
      firstSeenAt,
    eligible: true
  };
  const samePrice = listing({
    priceKrw: 34000000,
    vehicleNo: null,
    saleType: "NORMAL"
  });
  const changedPrice = listing({
    priceKrw: 33000000,
    vehicleNo: "00가0000",
    saleType: "RENT",
    rentalUsageHistory: true,
    totalLossHistory: false
  });

  const sanitized =
    sanitizeListingStateForOptionMode(
      previous,
      "generic"
    );
  const observed = recordListObservation(
    previous,
    samePrice,
    "2026-01-02T00:00:00.000Z",
    "generic"
  );
  const failed = recordDetailFailure(
    previous,
    changedPrice,
    "2026-01-03T00:00:00.000Z",
    "anonymous failure",
    "generic"
  );
  const evaluated = evaluateListing(
    changedPrice,
    genericConfig
  );
  const succeeded = recordDetailSuccess(
    previous,
    changedPrice,
    evaluated,
    "2026-01-04T00:00:00.000Z"
  );

  for (const record of [
    sanitized,
    observed,
    failed,
    succeeded
  ]) {
    assert.equal(
      record.optionMode,
      "generic"
    );
    assert.equal(
      record.vehicleNo,
      "00가0000"
    );
    assert.equal(
      record.saleType,
      "RENT"
    );
    assert.equal(
      record.rentalUsageHistory,
      true
    );
    assert.equal(
      record.totalLossHistory,
      false
    );
    assert.equal(
      record.firstSeenAt,
      firstSeenAt
    );
    assertHasNoTeslaStateFields(
      record
    );
  }

  assert.notEqual(sanitized, previous);
  assert.equal(previous.option, "FSD");
  assert.equal(observed.priceKrw, 34000000);
  assert.equal(failed.priceKrw, 34000000);
  assert.equal(
    failed.lastObservedPriceKrw,
    33000000
  );
  assert.equal(succeeded.priceKrw, 33000000);
});

test("tesla 새 가격 설정은 기본 EAP FSD 상한을 각각 적용한다", () => {
  const base = evaluateListing(
    listing({
      priceKrw: 35000001,
      hasFsd: false,
      hasEap: false
    }),
    teslaConfig
  );
  const eap = evaluateListing(
    listing({
      priceKrw: 37000000,
      hasFsd: false,
      hasEap: true
    }),
    teslaConfig
  );
  const fsd = evaluateListing(
    listing({
      priceKrw: 40000000,
      hasFsd: true,
      hasEap: true
    }),
    teslaConfig
  );

  assert.equal(base.option, "미확인");
  assert.equal(base.limitKrw, 35000000);
  assert.equal(base.eligible, false);

  assert.equal(eap.option, "EAP");
  assert.equal(eap.limitKrw, 37000000);
  assert.equal(eap.eligible, true);

  assert.equal(fsd.option, "FSD");
  assert.equal(fsd.limitKrw, 40000000);
  assert.equal(fsd.eligible, true);
});

test("tesla 상세 실패 send_current는 unknownOptionHardMax를 사용한다", () => {
  const prepared = prepareSendCurrentListing(
    listing({ priceKrw: 36000001 }),
    teslaConfig,
    {
      detailSucceeded: false,
      errorMessage: "anonymous failure"
    }
  );

  assert.equal(prepared.limitKrw, 36000000);
  assert.match(
    prepared.conditionReasons.join(", "),
    /가격 초과/
  );
  assert.match(
    prepared.conditionReasons.join(", "),
    /옵션 미확인/
  );
});

test("tesla FSD Lite 가능 문구는 FSD가 아니며 기본 상한을 사용한다", () => {
  const analyzed = analyzeDetail(
    detailHtml({
      vehicleNo: null,
      spec: {
        colorName: "무채색"
      },
      options: {
        etc: []
      },
      advertisement: {
        price: 3600,
        oneLineText: null
      },
      photos: [
        {
          desc: "FSD Lite 가능"
        }
      ]
    }),
    listing({ priceKrw: 36000000 }),
    teslaConfig
  );
  const evaluated = evaluateListing(
    analyzed,
    teslaConfig
  );

  assert.equal(evaluated.hasFsd, false);
  assert.equal(evaluated.hasEap, false);
  assert.equal(evaluated.option, "미확인");
  assert.equal(evaluated.limitKrw, 35000000);
  assert.equal(evaluated.eligible, false);
});

test("titleFilter는 all any excluded와 대소문자 및 공백 정규화를 적용한다", () => {
  const config = {
    ...genericConfig,
    titleFilter: {
      requiredAll: [
        " alpha   one ",
        " PREMIUM "
      ],
      requiredAny: [
        "ELECTRIC",
        "hybrid"
      ],
      excludedAny: [
        " demo ",
        "salvage"
      ]
    }
  };

  const matching = listing({
    title:
      "  ALPHA    ONE Premium electric package  "
  });

  assert.equal(
    matchesBasicCriteria(matching, config),
    true
  );
  assert.deepEqual(
    getBasicCriteriaFailureReasons(
      matching,
      config
    ),
    []
  );

  for (const title of [
    "Alpha Two premium electric package",
    "Alpha One premium diesel package",
    "Alpha One premium electric demo"
  ]) {
    const candidate = listing({ title });

    assert.equal(
      matchesBasicCriteria(
        candidate,
        config
      ),
      false
    );
    assert.match(
      getBasicCriteriaFailureReasons(
        candidate,
        config
      ).join(", "),
      /차종|트림|제목|필수|선택|제외/
    );
  }
});

test("기존 requiredTitleTerms는 대소문자 무관 AND 조건을 유지한다", () => {
  const legacyConfig = {
    requiredTitleTerms: [
      "alpha",
      "ONE"
    ],
    yearMonthMin: "2020-01",
    yearMonthMax: "2030-12",
    maxMileageKm: 200000
  };

  assert.equal(
    matchesBasicCriteria(
      listing({
        title: "Alpha One package"
      }),
      legacyConfig
    ),
    true
  );
  assert.equal(
    matchesBasicCriteria(
      listing({
        title: "Alpha Two package"
      }),
      legacyConfig
    ),
    false
  );
});