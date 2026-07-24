import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRepresentativeState,
  needsVehicleIdentityResolution,
  reconcileListingDeletions,
  selectRepresentativeCandidates
} from "../src/lib.mjs";

const firstSeenAt =
  "2026-07-18T00:00:00.000Z";

const lastSeenAt =
  "2026-07-20T00:00:00.000Z";

const now =
  "2026-07-22T00:00:00.000Z";

function listing(overrides = {}) {
  const id = String(
    overrides.id ?? "42023180"
  );

  return {
    id,
    title:
      "모델 3 롱 레인지 AWD",
    url: `https://fem.encar.com/cars/detail/${id}`,
    yearMonth: "2022-09",
    mileageKm: 92000,
    priceKrw: 38500000,
    region: "서울",
    contracted: false,
    vehicleNo: "12가3456",
    ...overrides,
    id
  };
}

function stateRecord(overrides = {}) {
  return {
    ...listing(overrides),
    firstSeenAt,
    lastSeenAt,
    telegramMessageId: 12345,
    telegramSentAt:
      "2026-07-20T00:01:00.000Z",
    ...overrides
  };
}

function cloneListings(listings) {
  return Object.fromEntries(
    Object.entries(listings).map(
      ([listingId, record]) => [
        listingId,
        { ...record }
      ]
    )
  );
}

function listingMap(...listings) {
  return new Map(
    listings.map((item) => [
      String(item.id),
      item
    ])
  );
}

function reconcile({
  stateListings,
  previousListings =
    cloneListings(stateListings),
  currentListings,
  representatives = [],
  identityResolutionComplete =
    true,
  runMode = "normal",
  wasInitialized = true
}) {
  return reconcileListingDeletions({
    stateListings,
    previousListings,
    currentListings,
    representatives,
    identityResolutionComplete,
    now,
    runMode,
    wasInitialized
  });
}

test("이전 활성 대표가 현재 검색 결과에서 사라지면 삭제 이벤트를 한 번 만들고 상태를 보존한다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    previousListings: {
      [previous.id]: previous
    },
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    )
  });

  assert.equal(
    result.events.length,
    1
  );
  assert.equal(
    result.events[0].type,
    "deleted"
  );
  assert.equal(
    result.events[0].listing.id,
    previous.id
  );
  assert.equal(
    result.events[0]
      .stateListingId,
    previous.id
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    now
  );
  assert.equal(
    stateListings[previous.id]
      .priceKrw,
    previous.priceKrw
  );
  assert.equal(
    stateListings[previous.id]
      .vehicleNo,
    previous.vehicleNo
  );
  assert.equal(
    stateListings[previous.id]
      .firstSeenAt,
    previous.firstSeenAt
  );
  assert.equal(
    stateListings[previous.id].url,
    previous.url
  );
  assert.equal(
    stateListings[previous.id]
      .telegramMessageId,
    previous.telegramMessageId
  );
  assert.equal(
    stateListings[previous.id]
      .telegramSentAt,
    previous.telegramSentAt
  );
});

test("이전 대표 ID가 현재 검색 결과에 그대로 있으면 삭제하지 않는다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing()
    )
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    undefined
  );
});

test("이미 deletedAt이 기록된 매물은 삭제 이벤트를 반복하지 않는다", () => {
  const deleted = stateRecord({
    deletedAt:
      "2026-07-21T00:00:00.000Z"
  });
  const stateListings = {
    [deleted.id]: { ...deleted }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    )
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[deleted.id]
      .deletedAt,
    deleted.deletedAt
  );
});

test("send_current에서만 기록된 매물은 이후 normal 삭제 대상이 아니다", () => {
  const previewOnly =
    stateRecord({
      deletionTracked: false
    });
  const stateListings = {
    [previewOnly.id]: {
      ...previewOnly
    }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    )
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previewOnly.id]
      .deletedAt,
    undefined
  );
  assert.equal(
    needsVehicleIdentityResolution({
      previousListings: {
        [previewOnly.id]:
          previewOnly
      },
      currentListings: listingMap(
        listing({
          id: "43000000",
          vehicleNo: null
        })
      )
    }),
    false
  );
});

test("삭제된 동일 ID가 현재 검색 결과에 다시 나타나면 deletedAt을 해제한다", () => {
  const deleted = stateRecord({
    deletedAt:
      "2026-07-21T00:00:00.000Z"
  });
  const stateListings = {
    [deleted.id]: { ...deleted }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing()
    )
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[deleted.id]
      .deletedAt,
    undefined
  );
  assert.deepEqual(
    result.restoredListingIds,
    [deleted.id]
  );
  assert.equal(
    stateListings[deleted.id]
      .telegramMessageId,
    deleted.telegramMessageId
  );
});

test("삭제된 차량이 새 ID의 같은 차량번호 대표로 다시 나타나면 현재 키로 복구한다", () => {
  const deleted = stateRecord({
    deletedAt:
      "2026-07-21T00:00:00.000Z"
  });
  const current = listing({
    id: "43000000"
  });
  const stateListings = {
    [deleted.id]: { ...deleted }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      current
    ),
    representatives: [
      {
        listing: current,
        detailSucceeded: true,
        stateRecord: {
          ...deleted,
          ...current,
          previousListingId:
            deleted.id,
          firstSeenAt:
            deleted.firstSeenAt,
          lastSeenAt: now
        }
      }
    ]
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[deleted.id],
    undefined
  );
  assert.equal(
    stateListings[current.id]
      .deletedAt,
    undefined
  );
  assert.equal(
    stateListings[current.id]
      .previousListingId,
    deleted.id
  );
  assert.deepEqual(
    result.restoredListingIds,
    [current.id]
  );
});

test("listingId가 바뀌어도 현재 대표의 차량번호가 같으면 삭제하지 않는다", () => {
  const previous = stateRecord();
  const current = listing({
    id: "43000000"
  });
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: current.id,
        vehicleNo: null
      })
    ),
    representatives: [
      {
        listing: current,
        detailSucceeded: true
      }
    ]
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    undefined
  );
});

test("현재 검색 결과에서 새 ID로 재등록된 동일 차량은 현재 대표 상태로 승계한다", () => {
  const previous = stateRecord();
  const current = listing({
    id: "43000000",
    mileageKm: 151000
  });
  const stateListings = {
    [previous.id]: { ...previous }
  };
  const currentCandidate = {
    listing: current,
    detailSucceeded: true,
    stateRecord: {
      ...previous,
      ...current,
      listPriceKrw:
        current.priceKrw,
      firstSeenAt:
        previous.firstSeenAt,
      lastSeenAt: now
    }
  };

  applyRepresentativeState(
    stateListings,
    currentCandidate
  );

  const result = reconcile({
    stateListings,
    previousListings: {
      [previous.id]: previous
    },
    currentListings: listingMap(
      current
    ),
    representatives: [
      currentCandidate
    ]
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id],
    undefined
  );
  assert.equal(
    stateListings[current.id]
      .previousListingId,
    previous.id
  );
  assert.equal(
    stateListings[current.id]
      .deletedAt,
    undefined
  );
});

test("동일 차량 중복 매물의 대표 ID만 바뀌어도 삭제하지 않는다", () => {
  const previous = stateRecord();
  const replacement = listing({
    id: "43000000"
  });
  const selected =
    selectRepresentativeCandidates([
      {
        listing: listing(),
        detailSucceeded: false
      },
      {
        listing: replacement,
        detailSucceeded: true
      }
    ]);
  const stateListings = {
    [previous.id]: { ...previous }
  };

  assert.equal(
    selected.representatives[0]
      .listing.id,
    replacement.id
  );

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing(),
      replacement
    ),
    representatives:
      selected.representatives
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    undefined
  );
});

test("상세 조회에 실패해도 현재 검색 결과에 ID가 있으면 삭제하지 않는다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing()
    ),
    representatives: [
      {
        listing: listing(),
        detailSucceeded: false
      }
    ]
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    undefined
  );
});

test("새 ID의 차량 동일성을 확인하지 못한 실행은 기존 차량의 삭제를 보류한다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    ),
    representatives: [
      {
        listing: listing({
          id: "43000000",
          vehicleNo: null
        }),
        detailSucceeded: false
      }
    ],
    identityResolutionComplete:
      false
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    undefined
  );
});

test("차량번호가 없는 이전 매물은 다른 차량의 동일성 확인 실패와 무관하게 ID로 삭제한다", () => {
  const previous = stateRecord({
    vehicleNo: null
  });
  const stateListings = {
    [previous.id]: { ...previous }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    ),
    identityResolutionComplete:
      false
  });

  assert.equal(
    result.events.length,
    1
  );
  assert.equal(
    stateListings[previous.id]
      .deletedAt,
    now
  );
  assert.equal(
    needsVehicleIdentityResolution({
      previousListings: {
        [previous.id]: previous
      },
      currentListings: listingMap(
        listing({
          id: "43000000",
          vehicleNo: null
        })
      )
    }),
    false
  );
});

test("최초 기준점 생성 실행에서는 삭제를 판정하지 않는다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };
  const before =
    cloneListings(stateListings);

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    ),
    wasInitialized: false
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.deepEqual(
    stateListings,
    before
  );
});

for (const runMode of [
  "send_current",
  "telegram_test"
]) {
  test(`${runMode} 모드에서는 삭제를 판정하지 않는다`, () => {
    const previous = stateRecord();
    const stateListings = {
      [previous.id]: {
        ...previous
      }
    };
    const before =
      cloneListings(
        stateListings
      );

    const result = reconcile({
      stateListings,
      currentListings: listingMap(
        listing({
          id: "43000000",
          vehicleNo: null
        })
      ),
      runMode
    });

    assert.deepEqual(
      result.events,
      []
    );
    assert.deepEqual(
      stateListings,
      before
    );
  });
}

test("현재 검색 결과가 빈 경우 방어적으로 삭제 상태와 이벤트를 만들지 않는다", () => {
  const previous = stateRecord();
  const stateListings = {
    [previous.id]: { ...previous }
  };
  const before =
    cloneListings(stateListings);

  const result = reconcile({
    stateListings,
    currentListings: new Map()
  });

  assert.deepEqual(
    result.events,
    []
  );
  assert.deepEqual(
    result.deletedListingIds,
    []
  );
  assert.deepEqual(
    stateListings,
    before
  );
});

test("동일 차량의 활성 중복 그룹은 한 번 알리고 모든 레코드를 삭제 상태로 만든다", () => {
  const older = stateRecord({
    id: "41000000",
    lastSeenAt:
      "2026-07-19T00:00:00.000Z"
  });
  const latest = stateRecord();
  const stateListings = {
    [older.id]: { ...older },
    [latest.id]: { ...latest }
  };

  const result = reconcile({
    stateListings,
    currentListings: listingMap(
      listing({
        id: "43000000",
        vehicleNo: null
      })
    )
  });

  assert.equal(
    result.events.length,
    1
  );
  assert.equal(
    result.events[0].type,
    "deleted"
  );
  assert.equal(
    result.events[0].listing.id,
    latest.id
  );
  assert.equal(
    stateListings[older.id]
      .deletedAt,
    now
  );
  assert.equal(
    stateListings[latest.id]
      .deletedAt,
    now
  );
  assert.deepEqual(
    new Set(
      result.deletedListingIds
    ),
    new Set([
      older.id,
      latest.id
    ])
  );
});

test("동일 차량 중복 중 한 ID가 현재 검색 결과에 있으면 차량 동일성 추가 확인이 필요 없다", () => {
  const current = stateRecord({
    id: "41000000"
  });
  const missingDuplicate =
    stateRecord();

  assert.equal(
    needsVehicleIdentityResolution({
      previousListings: {
        [current.id]: current,
        [missingDuplicate.id]:
          missingDuplicate
      },
      currentListings: listingMap(
        listing({
          id: current.id
        })
      ),
      representatives: []
    }),
    false
  );
});

test("이전 대표 ID가 사라졌을 때 현재 대표의 차량번호 확인 여부를 판정한다", () => {
  const previous = stateRecord();
  const replacement = listing({
    id: "43000000"
  });
  const currentListings =
    listingMap(
      listing({
        ...replacement,
        vehicleNo: null
      })
    );

  assert.equal(
    needsVehicleIdentityResolution({
      previousListings: {
        [previous.id]: previous
      },
      currentListings,
      representatives: []
    }),
    true
  );

  assert.equal(
    needsVehicleIdentityResolution({
      previousListings: {
        [previous.id]: previous
      },
      currentListings,
      representatives: [
        {
          listing: replacement,
          detailSucceeded: true
        }
      ]
    }),
    false
  );
});
