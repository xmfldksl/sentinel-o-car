import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeDetail,
  evaluateListing,
  matchesTitleFilter,
  prepareSendCurrentListing,
  recordDetailFailure,
  recordDetailSuccess
} from "../src/lib.mjs";

const genericProfile = {
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

const teslaProfile = {
  ...genericProfile,
  isTesla: true,
  price: {
    maxPriceKrw: 35000000,
    eapMaxPriceKrw: 37000000,
    fsdMaxPriceKrw: 40000000
  }
};

function listing(overrides = {}) {
  return {
    id: "anonymous-listing",
    title: "Alpha One Touring",
    url: "https://example.invalid/listing/anonymous",
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

test("generic과 Tesla는 같은 가격 판정 형태를 사용하고 Tesla만 옵션별 기준을 선택한다", async (t) => {
  const cases = [
    {
      name: "generic",
      profile: genericProfile,
      facts: {},
      option: undefined,
      limit: 35000000
    },
    {
      name: "Tesla 기본",
      profile: teslaProfile,
      facts: {
        hasFsd: false,
        hasEap: false
      },
      option: "미확인",
      limit: 35000000
    },
    {
      name: "Tesla EAP",
      profile: teslaProfile,
      facts: {
        hasFsd: false,
        hasEap: true
      },
      option: "EAP",
      limit: 37000000
    },
    {
      name: "Tesla FSD",
      profile: teslaProfile,
      facts: {
        hasFsd: true,
        hasEap: false
      },
      option: "FSD",
      limit: 40000000
    },
    {
      name: "Tesla FSD 우선",
      profile: teslaProfile,
      facts: {
        hasFsd: true,
        hasEap: true
      },
      option: "FSD",
      limit: 40000000
    }
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const atLimit = evaluateListing(
        listing({
          ...entry.facts,
          priceKrw: entry.limit
        }),
        entry.profile
      );
      const aboveLimit = evaluateListing(
        listing({
          ...entry.facts,
          priceKrw: entry.limit + 1
        }),
        entry.profile
      );

      assert.equal(
        atLimit.conditionStatus,
        "조건 충족"
      );
      assert.deepEqual(
        atLimit.conditionReasons,
        []
      );
      assert.equal(
        aboveLimit.conditionStatus,
        "조건 미충족"
      );
      assert.deepEqual(
        aboveLimit.conditionReasons,
        ["가격 초과"]
      );
      assert.equal(
        atLimit.option,
        entry.option
      );
    });
  }
});

test("Tesla 옵션 미확인과 상세 실패는 기본 가격을 사용한다", () => {
  const unknown = evaluateListing(
    listing({
      priceKrw: 35000001,
      hasFsd: false,
      hasEap: false
    }),
    teslaProfile
  );
  const failedAtLimit =
    prepareSendCurrentListing(
      listing({
        priceKrw: 35000000
      }),
      teslaProfile,
      {
        detailSucceeded: false
      }
    );
  const failedAbove =
    prepareSendCurrentListing(
      listing({
        priceKrw: 35000001
      }),
      teslaProfile,
      {
        detailSucceeded: false
      }
    );

  assert.equal(unknown.option, "미확인");
  assert.deepEqual(
    unknown.conditionReasons,
    ["가격 초과"]
  );
  assert.equal(
    failedAtLimit.conditionStatus,
    "조건 충족"
  );
  assert.deepEqual(
    failedAtLimit.conditionReasons,
    []
  );
  assert.equal(
    failedAbove.conditionStatus,
    "조건 미충족"
  );
  assert.deepEqual(
    failedAbove.conditionReasons,
    ["가격 초과"]
  );
  assert.equal(failedAbove.detailFailed, true);
  assert.equal(failedAbove.option, "미확인");
});

test("FSD Lite 가능 문구는 FSD 보유로 인정하지 않는다", () => {
  const analyzed = analyzeDetail(
    detailHtml({
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
    }),
    listing(),
    teslaProfile
  );

  assert.equal(analyzed.hasFsd, false);
  assert.equal(analyzed.hasEap, false);
  assert.equal(analyzed.option, "미확인");
});

test("generic 상세 흐름은 Tesla 옵션 사실을 결과에 만들지 않는다", () => {
  const analyzed = analyzeDetail(
    detailHtml({
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
    }),
    listing(),
    genericProfile
  );

  for (const key of [
    "option",
    "hasFsd",
    "hasEap",
    "optionSource",
    "optionEvidence"
  ]) {
    assert.equal(
      Object.hasOwn(analyzed, key),
      false,
      key
    );
  }
});

test("titleFilter의 세 배열만 제목 포함과 제외를 결정한다", () => {
  for (const [label, baseProfile] of [
    ["generic", genericProfile],
    ["Tesla", teslaProfile]
  ]) {
    const profile = {
      ...baseProfile,
      titleFilter: {
        requiredAll: ["Alpha", "Touring"],
        requiredAny: ["AWD", "4WD"],
        excludedAny: ["Damaged"]
      }
    };

    assert.equal(
      matchesTitleFilter(
        "alpha one touring AWD",
        profile
      ),
      true,
      `${label} include`
    );
    assert.equal(
      matchesTitleFilter(
        "alpha one touring",
        profile
      ),
      false,
      `${label} requiredAny`
    );
    assert.equal(
      matchesTitleFilter(
        "alpha one touring 4WD damaged",
        profile
      ),
      false,
      `${label} excludedAny`
    );
  }
});

test("generic 상태는 Tesla 옵션 필드를 저장하지 않고 판정 캐시도 만들지 않는다", () => {
  const genericRecord =
    recordDetailSuccess(
      undefined,
      listing(),
      evaluateListing(
        listing({
          hasFsd: true,
          hasEap: true,
          option: "FSD",
          optionSource: "구조화 옵션",
          optionEvidence: "FSD"
        }),
        genericProfile
      ),
      "2026-07-25T00:00:00.000Z",
      false
    );
  const teslaRecord =
    recordDetailSuccess(
      undefined,
      listing({
        hasFsd: true,
        hasEap: true,
        option: "FSD",
        optionSource: "구조화 옵션",
        optionEvidence: "FSD"
      }),
      evaluateListing(
        listing({
          hasFsd: true,
          hasEap: true,
          option: "FSD",
          optionSource: "구조화 옵션",
          optionEvidence: "FSD"
        }),
        teslaProfile
      ),
      "2026-07-25T00:00:00.000Z",
      true
    );

  for (const key of [
    "option",
    "hasFsd",
    "hasEap",
    "optionSource",
    "optionEvidence"
  ]) {
    assert.equal(
      Object.hasOwn(genericRecord, key),
      false,
      key
    );
  }

  assert.equal(teslaRecord.option, "FSD");
  assert.equal(teslaRecord.hasFsd, true);
  assert.equal(teslaRecord.hasEap, true);
});

test("상세 실패는 generic에서 Tesla 상태 필드만 제거하고 Tesla에서는 보존한다", () => {
  const optionFields = [
    "option",
    "hasFsd",
    "hasEap",
    "optionSource",
    "optionEvidence"
  ];
  const previous = {
    ...listing(),
    option: "FSD",
    hasFsd: true,
    hasEap: false,
    optionSource: "구조화 옵션",
    optionEvidence: "FSD",
    firstSeenAt:
      "2026-07-24T00:00:00.000Z"
  };
  const now =
    "2026-07-25T00:00:00.000Z";
  const genericRecords = [
    recordDetailFailure(
      previous,
      listing(),
      now,
      "HTTP 503",
      false
    )
  ];
  const teslaRecords = [
    recordDetailFailure(
      previous,
      listing(),
      now,
      "HTTP 503",
      true
    )
  ];

  for (const record of genericRecords) {
    for (const field of optionFields) {
      assert.equal(
        Object.hasOwn(record, field),
        false,
        field
      );
    }
    assert.equal(
      record.firstSeenAt,
      previous.firstSeenAt
    );
  }

  for (const record of teslaRecords) {
    assert.equal(record.option, "FSD");
    assert.equal(record.hasFsd, true);
    assert.equal(record.hasEap, false);
    assert.equal(
      record.optionSource,
      "구조화 옵션"
    );
    assert.equal(
      record.optionEvidence,
      "FSD"
    );
  }
});
