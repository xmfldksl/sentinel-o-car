import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  analyzeDetail,
  applyRepresentativeState,
  createListingEvent,
  findPreviousListing,
  formatDuplicateListingLog,
  getListingInspection,
  normalizeVehicleNo,
  parsePreloadedVehicleData,
  recordDetailSuccess,
  selectRepresentativeCandidates
} from "../src/lib.mjs";

const config = JSON.parse(
  await fs.readFile(
    new URL("../config.json", import.meta.url),
    "utf8"
  )
);

const detailHtml = await fs.readFile(
  new URL(
    "./fixtures/detail-preloaded.html",
    import.meta.url
  ),
  "utf8"
);

const firstSeenAt =
  "2026-07-18T00:00:00.000Z";

const now =
  "2026-07-20T00:00:00.000Z";

function listing(overrides = {}) {
  return {
    id: "42023180",
    title: "모델 3 롱 레인지 AWD",
    url: "https://fem.encar.com/cars/detail/42023180",
    yearMonth: "2022-09",
    mileageKm: 92000,
    priceKrw: 38500000,
    region: "서울",
    contracted: false,
    vehicleNo: "12가3456",
    option: "FSD",
    rental: false,
    eligible: true,
    ...overrides
  };
}

function previousState(overrides = {}) {
  return {
    ...listing(),
    firstSeenAt,
    lastSeenAt: firstSeenAt,
    lastEvaluatedAt: firstSeenAt,
    ...overrides
  };
}

function eventFor(
  previous,
  current,
  notifyPriceIncrease = true
) {
  const inspection = getListingInspection(
    previous,
    current,
    "normal"
  );

  return createListingEvent({
    runMode: "normal",
    wasInitialized: true,
    inspection,
    previous,
    listing: current,
    detailSucceeded: true,
    notifyPriceIncrease
  });
}

test("__PRELOADED_STATE__에서 차량번호와 매물 ID를 추출한다", () => {
  assert.deepEqual(
    parsePreloadedVehicleData(detailHtml),
    {
      vehicleNo: "12가3456",
      vehicleId: "42023180",
      queryCarId: "42023180"
    }
  );

  const analyzed = analyzeDetail(
    detailHtml,
    listing({
      vehicleNo: undefined
    }),
    config
  );

  assert.equal(
    analyzed.vehicleNo,
    "12가3456"
  );

  assert.equal(
    analyzed.vehicleId,
    "42023180"
  );

  assert.equal(
    analyzed.queryCarId,
    "42023180"
  );
});

test("구조화 색상과 옵션 및 판매자 설명을 함께 분석한다", () => {
  const analyzed = analyzeDetail(
    detailHtml,
    listing(),
    config
  );

  assert.equal(
    analyzed.colorName,
    "검정색"
  );

  assert.equal(
    analyzed.redColor,
    false
  );

  assert.equal(
    analyzed.hasFsd,
    true
  );

  assert.equal(
    analyzed.hasEap,
    true
  );

  assert.equal(
    analyzed.option,
    "FSD"
  );

  assert.equal(
    analyzed.optionSource,
    "판매자 설명"
  );
});

test("차량번호의 공백과 하이픈을 제거해 정규화한다", () => {
  assert.equal(
    normalizeVehicleNo(" 12가 3456 "),
    "12가3456"
  );

  assert.equal(
    normalizeVehicleNo("123가-4567"),
    "123가4567"
  );
});

test("차량번호가 없거나 형식이 잘못되면 null을 반환한다", () => {
  assert.equal(
    parsePreloadedVehicleData(
      "<html></html>"
    ).vehicleNo,
    null
  );

  assert.equal(
    normalizeVehicleNo("차량번호 없음"),
    null
  );

  assert.equal(
    normalizeVehicleNo("12가345"),
    null
  );
});

test("잘못된 __PRELOADED_STATE__ JSON이면 본문 문구만으로 옵션을 확정하지 않는다", () => {
  const html =
    "<html><body>FSD 포함, EAP, 빨간색</body><script>__PRELOADED_STATE__ = {잘못된 JSON}</script></html>";

  const analyzed = analyzeDetail(
    html,
    listing({
      vehicleNo: undefined
    }),
    config
  );

  assert.equal(
    analyzed.vehicleNo,
    null
  );

  assert.equal(
    analyzed.vehicleId,
    null
  );

  assert.equal(
    analyzed.queryCarId,
    null
  );

  assert.equal(
    analyzed.colorName,
    null
  );

  assert.equal(
    analyzed.redColor,
    false
  );

  assert.equal(
    analyzed.hasFsd,
    false
  );

  assert.equal(
    analyzed.hasEap,
    false
  );

  assert.equal(
    analyzed.option,
    "미확인"
  );
});

test("현재 매물 ID와 일치하는 상태를 차량번호보다 먼저 연결한다", () => {
  const exact = previousState({
    vehicleNo: "34나5678"
  });

  const other = previousState({
    id: "41000000",
    vehicleNo: "12가3456"
  });

  const match = findPreviousListing(
    {
      "42023180": exact,
      "41000000": other
    },
    listing({
      vehicleNo: "12가3456"
    })
  );

  assert.equal(
    match.matchedBy,
    "listingId"
  );

  assert.equal(
    match.previous,
    exact
  );
});

test("다른 매물 ID라도 차량번호가 같으면 기존 상태로 연결한다", () => {
  const previous = previousState();

  const current = listing({
    id: "43000000",
    url: "https://fem.encar.com/cars/detail/43000000"
  });

  const match = findPreviousListing(
    {
      "42023180": previous
    },
    current
  );

  const inspection = getListingInspection(
    match.previous,
    current,
    "normal"
  );

  assert.equal(
    match.matchedBy,
    "vehicleNo"
  );

  assert.equal(
    match.previousListingId,
    "42023180"
  );

  assert.equal(
    inspection.isNew,
    false
  );
});

test("같은 차량번호 재등록의 가격이 같으면 알림을 만들지 않는다", () => {
  const previous = previousState();

  const current = listing({
    id: "43000000"
  });

  assert.equal(
    eventFor(previous, current),
    null
  );
});

test("같은 차량번호 재등록의 가격이 낮아지면 기존 가격과 비교해 인하 알림을 만든다", () => {
  const previous = previousState({
    priceKrw: 39000000
  });

  const current = listing({
    id: "43000000",
    url: "https://fem.encar.com/cars/detail/43000000",
    priceKrw: 38500000
  });

  const event = eventFor(
    previous,
    current
  );

  const record = recordDetailSuccess(
    previous,
    current,
    current,
    now
  );

  assert.match(
    event.type,
    /^가격 인하/
  );

  assert.equal(
    record.id,
    "43000000"
  );

  assert.equal(
    record.url,
    current.url
  );

  assert.equal(
    record.previousListingId,
    "42023180"
  );

  assert.equal(
    record.firstSeenAt,
    firstSeenAt
  );
});

test("같은 차량번호 재등록의 가격이 높아지면 설정에 따라 인상 알림을 만든다", () => {
  const previous = previousState({
    priceKrw: 38000000
  });

  const current = listing({
    id: "43000000",
    priceKrw: 38500000
  });

  assert.match(
    eventFor(
      previous,
      current,
      true
    ).type,
    /^가격 인상/
  );

  assert.equal(
    eventFor(
      previous,
      current,
      false
    ),
    null
  );
});

test("같은 실행의 동일 차량은 우선순위에 따른 대표 한 건만 남긴다", () => {
  const failed = {
    order: 0,
    listing: listing({
      id: "1"
    }),
    detailSucceeded: false,
    event: {
      type: "신규"
    }
  };

  const contracted = {
    order: 1,
    listing: listing({
      id: "2",
      contracted: true
    }),
    detailSucceeded: true,
    event: {
      type: "신규"
    }
  };

  const representative = {
    order: 2,
    listing: listing({
      id: "3"
    }),
    detailSucceeded: true,
    event: {
      type: "신규"
    }
  };

  const selected =
    selectRepresentativeCandidates([
      failed,
      contracted,
      representative
    ]);

  assert.equal(
    selected.representatives.length,
    1
  );

  assert.equal(
    selected.representatives[0]
      .listing.id,
    "3"
  );

  assert.equal(
    selected.representatives.filter(
      (item) => item.event
    ).length,
    1
  );

  assert.equal(
    selected.duplicates.length,
    2
  );
});

test("동일 우선순위의 중복은 검색 결과에서 먼저 나온 매물을 대표로 선택한다", () => {
  const first = {
    listing: listing({
      id: "1"
    }),
    detailSucceeded: true
  };

  const second = {
    listing: listing({
      id: "2"
    }),
    detailSucceeded: true
  };

  const selected =
    selectRepresentativeCandidates([
      first,
      second
    ]);

  assert.equal(
    selected.representatives[0]
      .listing.id,
    "1"
  );
});

test("차량번호 미확인 매물은 서로 다른 매물 ID 기준으로 각각 처리한다", () => {
  const selected =
    selectRepresentativeCandidates([
      {
        listing: listing({
          id: "1",
          vehicleNo: null
        }),
        detailSucceeded: true
      },
      {
        listing: listing({
          id: "2",
          vehicleNo: null
        }),
        detailSucceeded: true
      }
    ]);

  assert.equal(
    selected.representatives.length,
    2
  );

  assert.equal(
    selected.duplicates.length,
    0
  );
});

test("중복 로그에는 차량번호 전체를 노출하지 않는다", () => {
  const representative = {
    listing: listing({
      id: "1"
    })
  };

  const duplicate = {
    listing: listing({
      id: "2"
    })
  };

  const log =
    formatDuplicateListingLog(
      representative,
      duplicate
    );

  assert.match(
    log,
    /12가\*{4}/
  );

  assert.doesNotMatch(
    log,
    /12가3456/
  );
});

test("다른 매물 ID로 재등록된 동일 차량은 이전 키를 삭제하고 현재 키만 저장한다", () => {
  const listings = {
    "42023180": previousState()
  };

  const current = listing({
    id: "43000000"
  });

  applyRepresentativeState(
    listings,
    {
      listing: current,
      stateRecord: previousState({
        ...current,
        previousListingId: "42023180"
      })
    }
  );

  assert.deepEqual(
    Object.keys(listings),
    ["43000000"]
  );

  assert.equal(
    listings["42023180"],
    undefined
  );
});

test("삭제된 이전 매물 ID를 current record의 previousListingId로 보존한다", () => {
  const listings = {
    "42023180": previousState()
  };

  const current = listing({
    id: "43000000"
  });

  const result =
    applyRepresentativeState(
      listings,
      {
        listing: current,
        stateRecord:
          previousState(current)
      }
    );

  assert.deepEqual(
    result.removedListingIds,
    ["42023180"]
  );

  assert.equal(
    result.stateRecord
      .previousListingId,
    "42023180"
  );

  assert.equal(
    listings["43000000"]
      .previousListingId,
    "42023180"
  );
});

test("동일 차량번호의 과거 상태가 여러 개여도 현재 대표 한 건만 남긴다", () => {
  const listings = {
    "41000000": previousState({
      id: "41000000",
      lastSeenAt:
        "2026-07-18T00:00:00.000Z"
    }),
    "42023180": previousState({
      lastSeenAt:
        "2026-07-19T00:00:00.000Z"
    })
  };

  const current = listing({
    id: "43000000"
  });

  applyRepresentativeState(
    listings,
    {
      listing: current,
      stateRecord:
        previousState(current)
    }
  );

  assert.deepEqual(
    Object.keys(listings),
    ["43000000"]
  );

  assert.equal(
    listings["43000000"]
      .previousListingId,
    "42023180"
  );
});

test("대표와 다른 차량번호의 상태는 유지한다", () => {
  const other = previousState({
    id: "44000000",
    vehicleNo: "34나5678"
  });

  const listings = {
    "42023180": previousState(),
    "44000000": other
  };

  const current = listing({
    id: "43000000"
  });

  applyRepresentativeState(
    listings,
    {
      listing: current,
      stateRecord:
        previousState(current)
    }
  );

  assert.equal(
    listings["42023180"],
    undefined
  );

  assert.equal(
    listings["44000000"],
    other
  );

  assert.ok(
    listings["43000000"]
  );
});

test("vehicleNo가 null인 서로 다른 매물 ID는 모두 유지한다", () => {
  const first = listing({
    id: "1",
    vehicleNo: null
  });

  const second = listing({
    id: "2",
    vehicleNo: null
  });

  const listings = {};

  applyRepresentativeState(
    listings,
    {
      listing: first,
      stateRecord: first
    }
  );

  applyRepresentativeState(
    listings,
    {
      listing: second,
      stateRecord: second
    }
  );

  assert.deepEqual(
    Object.keys(listings),
    ["1", "2"]
  );
});

test("같은 실행의 중복 후보는 선택된 대표만 상태에 저장한다", () => {
  const first = listing({
    id: "1"
  });

  const representative = listing({
    id: "2"
  });

  const selected =
    selectRepresentativeCandidates([
      {
        listing: first,
        stateRecord: first,
        detailSucceeded: false
      },
      {
        listing: representative,
        stateRecord: representative,
        detailSucceeded: true
      }
    ]);

  const listings = {};

  for (
    const candidate of
    selected.representatives
  ) {
    applyRepresentativeState(
      listings,
      candidate
    );
  }

  assert.deepEqual(
    Object.keys(listings),
    ["2"]
  );

  assert.equal(
    listings["1"],
    undefined
  );
});