import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeProfileEvents
} from "../src/runtime.mjs";

function profile(
  id,
  name,
  optionMode = "generic"
) {
  return {
    id,
    name,
    optionMode
  };
}

function event({
  kind = "new",
  listingId = "listing-anonymous",
  profile: eventProfile = profile(
    "profile-anonymous",
    "익명 조건"
  ),
  priceKrw = 30000000,
  previousPriceKrw,
  newPriceKrw,
  detailSucceeded = true,
  observedAt =
    "2026-01-01T00:00:00.000Z",
  listingFields = {}
} = {}) {
  return {
    kind,
    listingId,
    profile: eventProfile,
    stateListingId: listingId,
    detailSucceeded,
    observedAt,
    ...(previousPriceKrw === undefined
      ? {}
      : { previousPriceKrw }),
    ...(newPriceKrw === undefined
      ? {}
      : { newPriceKrw }),
    listing: {
      id: listingId,
      title: "Anonymous Vehicle",
      url: `https://example.invalid/listing/${listingId}`,
      priceKrw,
      ...listingFields
    }
  };
}

function target(profileId, listingId) {
  return {
    profileId,
    stateListingId: listingId
  };
}

test("동일 신규 이벤트는 한 건으로 병합하고 프로필 이름과 상태 대상을 합친다", () => {
  const firstProfile = profile(
    "profile-first",
    "첫 번째 조건"
  );
  const secondProfile = profile(
    "profile-second",
    "두 번째 조건"
  );
  const first = event({
    listingId: "listing-new",
    profile: firstProfile
  });
  first.profileName =
    firstProfile.name;
  first.profileNames = [
    firstProfile.name
  ];
  const second = event({
    listingId: "listing-new",
    profile: secondProfile
  });

  const [single] = mergeProfileEvents([
    first
  ]);

  assert.deepEqual(single.profileNames, [
    "첫 번째 조건"
  ]);
  assert.deepEqual(single.stateTargets, [
    target("profile-first", "listing-new")
  ]);

  const merged = mergeProfileEvents([
    first,
    second
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].kind, "new");
  assert.deepEqual(
    merged[0].profileNames,
    ["첫 번째 조건", "두 번째 조건"]
  );
  assert.deepEqual(
    merged[0].stateTargets,
    [
      target(
        "profile-first",
        "listing-new"
      ),
      target(
        "profile-second",
        "listing-new"
      )
    ]
  );
});

test("동일 현재매물 이벤트를 한 건으로 병합한다", () => {
  const merged = mergeProfileEvents([
    event({
      kind: "current",
      listingId: "listing-current",
      profile: profile(
        "profile-a",
        "현재 조건 A"
      )
    }),
    event({
      kind: "current",
      listingId: "listing-current",
      profile: profile(
        "profile-b",
        "현재 조건 B"
      )
    })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].kind, "current");
  assert.deepEqual(merged[0].profileNames, [
    "현재 조건 A",
    "현재 조건 B"
  ]);
});

for (const kind of [
  "price-decrease",
  "price-increase"
]) {
  test(`동일 ${kind} 이벤트는 이전 가격과 새 가격이 같을 때 병합한다`, () => {
    const merged = mergeProfileEvents([
      event({
        kind,
        listingId: `listing-${kind}`,
        profile: profile(
          "profile-price-a",
          "가격 조건 A"
        ),
        priceKrw: 29000000,
        previousPriceKrw: 30000000,
        newPriceKrw: 29000000
      }),
      event({
        kind,
        listingId: `listing-${kind}`,
        profile: profile(
          "profile-price-b",
          "가격 조건 B"
        ),
        priceKrw: 29000000,
        previousPriceKrw: 30000000,
        newPriceKrw: 29000000
      })
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].kind, kind);
    assert.equal(
      merged[0].previousPriceKrw,
      30000000
    );
    assert.equal(
      merged[0].newPriceKrw,
      29000000
    );
    assert.deepEqual(
      merged[0].profileNames,
      ["가격 조건 A", "가격 조건 B"]
    );
  });
}

test("서로 다른 가격변경 이벤트는 분리하고 경고한다", () => {
  const warnings = [];
  const merged = mergeProfileEvents(
    [
      event({
        kind: "price-decrease",
        listingId:
          "listing-price-conflict",
        profile: profile(
          "profile-price-first",
          "가격 조건 첫째"
        ),
        priceKrw: 29000000,
        previousPriceKrw: 30000000,
        newPriceKrw: 29000000
      }),
      event({
        kind: "price-decrease",
        listingId:
          "listing-price-conflict",
        profile: profile(
          "profile-price-second",
          "가격 조건 둘째"
        ),
        priceKrw: 28000000,
        previousPriceKrw: 31000000,
        newPriceKrw: 28000000
      })
    ],
    {
      warn: (message) =>
        warnings.push(message)
    }
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((item) => [
      item.previousPriceKrw,
      item.newPriceKrw
    ]),
    [
      [30000000, 29000000],
      [31000000, 28000000]
    ]
  );
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /price-change events.*kept separate/i
  );
});

test("동시에 감지된 삭제 이벤트는 프로필 이름과 상태 대상을 합친다", () => {
  const merged = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId: "listing-deleted",
      profile: profile(
        "profile-deleted-a",
        "삭제 조건 A"
      )
    }),
    event({
      kind: "deleted",
      listingId: "listing-deleted",
      profile: profile(
        "profile-deleted-b",
        "삭제 조건 B"
      )
    })
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].kind, "deleted");
  assert.deepEqual(merged[0].profileNames, [
    "삭제 조건 A",
    "삭제 조건 B"
  ]);
  assert.deepEqual(merged[0].stateTargets, [
    target(
      "profile-deleted-a",
      "listing-deleted"
    ),
    target(
      "profile-deleted-b",
      "listing-deleted"
    )
  ]);
});

test("한 프로필에서만 감지된 삭제는 해당 프로필만 유지한다", () => {
  const merged = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId: "listing-single-delete",
      profile: profile(
        "profile-only",
        "단일 삭제 조건"
      )
    })
  ]);

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].profileNames, [
    "단일 삭제 조건"
  ]);
  assert.deepEqual(merged[0].stateTargets, [
    target(
      "profile-only",
      "listing-single-delete"
    )
  ]);
});

test("대표 이벤트는 상세 성공, 최신 관측, 채워진 필드 순으로 선택한다", () => {
  const merged = mergeProfileEvents([
    event({
      listingId: "listing-detail-priority",
      profile: profile(
        "profile-detail-failed",
        "상세 실패 조건"
      ),
      detailSucceeded: false,
      observedAt:
        "2026-01-03T00:00:00.000Z",
      listingFields: {
        representative: "detail-failed",
        colorName: "filled",
        region: "filled"
      }
    }),
    event({
      listingId: "listing-detail-priority",
      profile: profile(
        "profile-detail-success",
        "상세 성공 조건"
      ),
      detailSucceeded: true,
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative: "detail-success"
      }
    }),
    event({
      listingId:
        "listing-observed-priority",
      profile: profile(
        "profile-observed-old",
        "이전 관측 조건"
      ),
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative: "observed-old",
        colorName: "filled"
      }
    }),
    event({
      listingId:
        "listing-observed-priority",
      profile: profile(
        "profile-observed-new",
        "최신 관측 조건"
      ),
      observedAt:
        "2026-01-02T00:00:00.000Z",
      listingFields: {
        representative: "observed-new"
      }
    }),
    event({
      listingId:
        "listing-populated-priority",
      profile: profile(
        "profile-populated-sparse",
        "정보 적은 조건"
      ),
      listingFields: {
        representative: "populated-sparse"
      }
    }),
    event({
      listingId:
        "listing-populated-priority",
      profile: profile(
        "profile-populated-rich",
        "정보 많은 조건"
      ),
      listingFields: {
        representative: "populated-rich",
        colorName: "filled",
        region: "filled"
      }
    })
  ]);

  assert.equal(merged.length, 3);
  assert.equal(
    merged[0].listing.representative,
    "detail-success"
  );
  assert.equal(
    merged[1].listing.representative,
    "observed-new"
  );
  assert.equal(
    merged[2].listing.representative,
    "populated-rich"
  );
});

test("삭제 이벤트 대표값은 이벤트 생성 시각보다 저장된 매물 관측 시각을 우선한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-freshness",
      profile: profile(
        "profile-fresh-listing",
        "최신 매물 상태"
      ),
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative:
          "fresh-listing-state",
        lastEvaluatedAt:
          "2026-01-05T00:00:00.000Z",
        lastSeenAt:
          "2026-01-01T00:00:00.000Z"
      }
    }),
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-freshness",
      profile: profile(
        "profile-new-event",
        "최신 삭제 이벤트"
      ),
      observedAt:
        "2026-01-10T00:00:00.000Z",
      listingFields: {
        representative:
          "stale-listing-state",
        lastEvaluatedAt:
          "2026-01-04T00:00:00.000Z",
        lastSeenAt:
          "2026-01-20T00:00:00.000Z"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "fresh-listing-state"
  );
});

test("삭제 이벤트의 저장 시각 필드가 없으면 event observedAt을 사용한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-fallback",
      profile: profile(
        "profile-deletion-old",
        "이전 삭제"
      ),
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative: "old"
      }
    }),
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-fallback",
      profile: profile(
        "profile-deletion-new",
        "최신 삭제"
      ),
      observedAt:
        "2026-01-02T00:00:00.000Z",
      listingFields: {
        representative: "new"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "new"
  );
});

test("삭제 이벤트는 lastEvaluatedAt이 없을 때 lastSeenAt을 사용한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-last-seen",
      profile: profile(
        "profile-last-seen-new",
        "최근 저장 상태"
      ),
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative: "newer-state",
        lastSeenAt:
          "2026-01-05T00:00:00.000Z"
      }
    }),
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-last-seen",
      profile: profile(
        "profile-last-seen-old",
        "이전 저장 상태"
      ),
      observedAt:
        "2026-01-10T00:00:00.000Z",
      listingFields: {
        representative: "older-state",
        lastSeenAt:
          "2026-01-04T00:00:00.000Z"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "newer-state"
  );
});

test("삭제 이벤트에 비교 가능한 날짜가 없으면 정보 완성도를 사용한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-completeness",
      profile: profile(
        "profile-sparse",
        "정보 적은 상태"
      ),
      observedAt: null,
      listingFields: {
        representative: "sparse"
      }
    }),
    event({
      kind: "deleted",
      listingId:
        "listing-deletion-completeness",
      profile: profile(
        "profile-rich",
        "정보 많은 상태"
      ),
      observedAt: null,
      listingFields: {
        representative: "rich",
        region: "서울",
        saleType: "NORMAL"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "rich"
  );
});

test("삭제 대표 비교는 숫자와 비ISO 및 유효하지 않은 날짜를 무시한다", () => {
  for (const invalidStoredTime of [
    Date.UTC(2026, 0, 20),
    "January 20, 2026",
    "2026-02-30T00:00:00.000Z"
  ]) {
    const [merged] = mergeProfileEvents([
      event({
        kind: "deleted",
        listingId:
          "listing-deletion-invalid-date",
        profile: profile(
          "profile-invalid-date",
          "잘못된 저장 시각"
        ),
        observedAt:
          "2026-01-01T00:00:00.000Z",
        listingFields: {
          representative:
            "invalid-date-state",
          lastEvaluatedAt:
            invalidStoredTime
        }
      }),
      event({
        kind: "deleted",
        listingId:
          "listing-deletion-invalid-date",
        profile: profile(
          "profile-valid-date",
          "유효한 이벤트 시각"
        ),
        observedAt:
          "2026-01-02T00:00:00.000Z",
        listingFields: {
          representative:
            "valid-event-state"
        }
      })
    ]);

    assert.equal(
      merged.listing.representative,
      "valid-event-state"
    );
  }
});

test("삭제 외 이벤트는 기존처럼 event observedAt을 우선한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      listingId:
        "listing-event-freshness",
      profile: profile(
        "profile-event-old",
        "이전 이벤트"
      ),
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        representative:
          "old-event-new-listing",
        lastEvaluatedAt:
          "2026-01-10T00:00:00.000Z"
      }
    }),
    event({
      listingId:
        "listing-event-freshness",
      profile: profile(
        "profile-event-new",
        "최신 이벤트"
      ),
      observedAt:
        "2026-01-02T00:00:00.000Z",
      listingFields: {
        representative:
          "new-event-old-listing",
        lastEvaluatedAt:
          "2026-01-03T00:00:00.000Z"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "new-event-old-listing"
  );
});

test("동일 이벤트의 매물가격 충돌은 경고하고 안전한 대표값을 사용한다", () => {
  const warnings = [];
  const merged = mergeProfileEvents(
    [
      event({
        listingId:
          "listing-value-conflict",
        profile: profile(
          "profile-value-weak",
          "정보 약한 조건"
        ),
        priceKrw: 30000000,
        detailSucceeded: false,
        observedAt:
          "2026-01-02T00:00:00.000Z",
        listingFields: {
          representative: "weak"
        }
      }),
      event({
        listingId:
          "listing-value-conflict",
        profile: profile(
          "profile-value-safe",
          "정보 확정 조건"
        ),
        priceKrw: 31000000,
        detailSucceeded: true,
        observedAt:
          "2026-01-01T00:00:00.000Z",
        listingFields: {
          representative: "safe"
        }
      })
    ],
    {
      warn: (message) =>
        warnings.push(message)
    }
  );

  assert.equal(merged.length, 1);
  assert.equal(
    merged[0].listing.representative,
    "safe"
  );
  assert.equal(
    merged[0].listing.priceKrw,
    31000000
  );
  assert.deepEqual(merged[0].profileNames, [
    "정보 약한 조건",
    "정보 확정 조건"
  ]);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /conflicting listing prices.*representative priority/i
  );
});

test("Tesla 프로필이 하나라도 병합되면 옵션 표시를 유지한다", () => {
  const mixed = mergeProfileEvents([
    event({
      listingId: "listing-mixed-mode",
      observedAt:
        "2026-01-01T00:00:00.000Z",
      profile: profile(
        "profile-tesla",
        "Tesla 조건",
        "tesla"
      ),
      listingFields: {
        representative: "tesla",
        option: "FSD",
        hasFsd: true,
        hasEap: false,
        optionSource: "테스트",
        optionEvidence: "테스트"
      }
    }),
    event({
      listingId: "listing-mixed-mode",
      observedAt:
        "2026-01-02T00:00:00.000Z",
      profile: profile(
        "profile-generic",
        "일반 조건",
        "generic"
      ),
      listingFields: {
        representative: "generic"
      }
    })
  ]);
  const genericOnly = mergeProfileEvents([
    event({
      listingId:
        "listing-generic-mode",
      profile: profile(
        "profile-generic-a",
        "일반 조건 A",
        "generic"
      )
    }),
    event({
      listingId:
        "listing-generic-mode",
      profile: profile(
        "profile-generic-b",
        "일반 조건 B",
        "generic"
      )
    })
  ]);

  assert.equal(
    mixed[0].showTeslaOption,
    true
  );
  assert.equal(
    mixed[0].listing.representative,
    "generic"
  );
  assert.equal(
    mixed[0].listing.option,
    "FSD"
  );
  assert.equal(
    mixed[0].listing.hasFsd,
    true
  );
  assert.equal(
    genericOnly[0].showTeslaOption,
    false
  );
});

test("Tesla 옵션 충돌은 대표 이벤트 우선순위로 한 기여자를 선택해 원자적으로 병합한다", () => {
  const warnings = [];
  const sensitiveListingId =
    "PRIVATE-LISTING-IDENTIFIER";
  const sensitiveVehicleNo =
    "PRIVATE-VEHICLE-NUMBER";
  const sensitiveUrl =
    `https://example.invalid/private/${sensitiveListingId}?secret=value`;
  const merged = mergeProfileEvents(
    [
      event({
        listingId: sensitiveListingId,
        profile: profile(
          "profile-option-old",
          "이전 옵션 조건",
          "tesla"
        ),
        observedAt:
          "2026-01-01T00:00:00.000Z",
        listingFields: {
          representative: "older-fsd",
          url: sensitiveUrl,
          vehicleNo:
            sensitiveVehicleNo,
          option: "FSD",
          hasFsd: true,
          hasEap: false,
          optionSource: "old-source",
          optionEvidence:
            "old-evidence"
        }
      }),
      event({
        listingId: sensitiveListingId,
        profile: profile(
          "profile-option-new",
          "최신 옵션 조건",
          "tesla"
        ),
        observedAt:
          "2026-01-02T00:00:00.000Z",
        listingFields: {
          representative: "newer-eap",
          url: sensitiveUrl,
          vehicleNo:
            sensitiveVehicleNo,
          option: "EAP",
          hasFsd: false,
          hasEap: true,
          optionSource: "new-source"
        }
      })
    ],
    {
      warn(message) {
        warnings.push(message);
      }
    }
  );

  assert.equal(merged.length, 1);
  assert.equal(
    merged[0].listing.representative,
    "newer-eap"
  );
  assert.equal(
    merged[0].listing.option,
    "EAP"
  );
  assert.equal(
    merged[0].listing.hasFsd,
    false
  );
  assert.equal(
    merged[0].listing.hasEap,
    true
  );
  assert.equal(
    merged[0].listing.optionSource,
    "new-source"
  );
  assert.equal(
    Object.hasOwn(
      merged[0].listing,
      "optionEvidence"
    ),
    false
  );
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /conflicting confirmed Tesla option results/i
  );
  assert.equal(
    warnings[0].includes(
      sensitiveListingId
    ),
    false
  );
  assert.equal(
    warnings[0].includes(
      sensitiveVehicleNo
    ),
    false
  );
  assert.equal(
    warnings[0].includes(sensitiveUrl),
    false
  );
});

test("Tesla 옵션 대표값도 상세 성공을 최신 관측보다 우선한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      listingId:
        "listing-option-detail-priority",
      profile: profile(
        "profile-option-confirmed",
        "상세 성공 옵션",
        "tesla"
      ),
      detailSucceeded: true,
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        option: "FSD",
        hasFsd: true,
        hasEap: false,
        optionSource:
          "confirmed-source",
        optionEvidence:
          "confirmed-evidence"
      }
    }),
    event({
      listingId:
        "listing-option-detail-priority",
      profile: profile(
        "profile-option-failed",
        "상세 실패 옵션",
        "tesla"
      ),
      detailSucceeded: false,
      observedAt:
        "2026-01-10T00:00:00.000Z",
      listingFields: {
        option: "EAP",
        hasFsd: false,
        hasEap: true,
        optionSource: "failed-source",
        optionEvidence:
          "failed-evidence"
      }
    })
  ]);

  assert.equal(
    merged.listing.option,
    "FSD"
  );
  assert.equal(
    merged.listing.optionSource,
    "confirmed-source"
  );
  assert.equal(
    merged.listing.optionEvidence,
    "confirmed-evidence"
  );
});

test("generic 대표 이벤트와 여러 Tesla 기여자를 병합해도 한 Tesla 기여자의 필드만 유지한다", () => {
  const [merged] = mergeProfileEvents([
    event({
      listingId:
        "listing-mixed-three-way",
      profile: profile(
        "profile-tesla-failed",
        "상세 실패 옵션",
        "tesla"
      ),
      detailSucceeded: false,
      observedAt:
        "2026-01-03T00:00:00.000Z",
      listingFields: {
        option: "FSD",
        hasFsd: true,
        hasEap: false,
        optionSource: "failed-source",
        optionEvidence:
          "failed-evidence"
      }
    }),
    event({
      listingId:
        "listing-mixed-three-way",
      profile: profile(
        "profile-generic-new",
        "최신 일반 조건",
        "generic"
      ),
      detailSucceeded: true,
      observedAt:
        "2026-01-04T00:00:00.000Z",
      listingFields: {
        representative:
          "generic-representative"
      }
    }),
    event({
      listingId:
        "listing-mixed-three-way",
      profile: profile(
        "profile-tesla-confirmed",
        "상세 성공 옵션",
        "tesla"
      ),
      detailSucceeded: true,
      observedAt:
        "2026-01-01T00:00:00.000Z",
      listingFields: {
        option: "EAP",
        hasEap: true,
        optionSource:
          "confirmed-source"
      }
    })
  ]);

  assert.equal(
    merged.listing.representative,
    "generic-representative"
  );
  assert.equal(
    merged.showTeslaOption,
    true
  );
  assert.equal(
    merged.listing.option,
    "EAP"
  );
  assert.equal(
    merged.listing.hasEap,
    true
  );
  assert.equal(
    Object.hasOwn(
      merged.listing,
      "hasFsd"
    ),
    false
  );
  assert.equal(
    merged.listing.optionSource,
    "confirmed-source"
  );
  assert.equal(
    Object.hasOwn(
      merged.listing,
      "optionEvidence"
    ),
    false
  );
});
