import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileListingDeletions
} from "../src/lib.mjs";
import {
  normalizeWatcherConfig,
  normalizeWatcherState
} from "../src/runtime.mjs";

const observedAt =
  "2026-01-02T00:00:00.000Z";
const deletionTime =
  "2026-01-03T00:00:00.000Z";

function profile({
  id,
  name,
  enabled = true
}) {
  return {
    id,
    name,
    enabled,
    searchUrl:
      `https://example.test/search/${id}`,
    optionMode: "generic",
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    minYear: 2020,
    maxYear: 2026,
    maxMileageKm: 100000,
    excludedColors: [],
    excludeContractPending: true,
    price: {
      maxPriceKrw: 50000000
    },
    rentalHistoryDiscountKrw: 0
  };
}

function normalizedProfiles({
  legacyStateProfileId,
  includeSecond = true
} = {}) {
  return normalizeWatcherConfig({
    configVersion: 2,
    ...(legacyStateProfileId
      ? { legacyStateProfileId }
      : {}),
    profiles: [
      profile({
        id: "condition-a",
        name: "Condition A"
      }),
      ...(includeSecond
        ? [
            profile({
              id: "condition-b",
              name: "Condition B",
              enabled: false
            })
          ]
        : [])
    ]
  });
}

function stateListing(overrides = {}) {
  return {
    id: "shared-listing",
    title: "Anonymous vehicle",
    yearMonth: "2024-01",
    mileageKm: 10000,
    priceKrw: 30000000,
    listPriceKrw: 30000000,
    vehicleNo: null,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    deletionTracked: true,
    ...overrides
  };
}

function legacySearchUrl() {
  const url = new URL(
    "https://example.test/legacy-search"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      action: "(And.Year.range(202201..202212))"
    })
  );

  return url.toString();
}

function normalizedLegacyConfig() {
  return normalizeWatcherConfig(
    {
      requiredTitleTerms: [],
      yearMonthMin: "2022-01",
      yearMonthMax: "2022-12",
      maxMileageKm: 150000,
      priceLimitsKrw: {
        base: 35000000,
        eap: 37000000,
        fsd: 40000000,
        unknownOptionHardMax:
          35000000
      },
      rentalPenaltyKrw: 0,
      excludedColorTerms: [],
      excludeContracted: true,
      maxPages: 1,
      requestDelayMs: 0
    },
    {
      GITHUB_ACTIONS: "true",
      ENCAR_SEARCH_URL:
        legacySearchUrl()
    }
  );
}

test("v2 상태는 프로필 네임스페이스를 분리하고 disabled 및 미설정 네임스페이스를 보존한다", () => {
  const normalized =
    normalizeWatcherState(
      {
        schemaVersion: 2,
        profiles: {
          "condition-a": {
            initializedAt: observedAt,
            listings: {
              "shared-listing":
                stateListing({
                  title:
                    "Profile A vehicle"
                })
            }
          },
          "condition-b": {
            initializedAt: observedAt,
            listings: {
              "shared-listing":
                stateListing({
                  title:
                    "Profile B vehicle",
                  priceKrw: 31000000
                })
            }
          },
          archived: {
            customMetadata: "preserved",
            listings: {
              "archived-listing":
                stateListing({
                  id:
                    "archived-listing"
                })
            }
          }
        }
      },
      normalizedProfiles()
    );

  assert.deepEqual(
    Object.keys(normalized.profiles),
    [
      "condition-a",
      "condition-b",
      "archived"
    ]
  );
  assert.equal(
    normalized.profiles["condition-a"]
      .listings["shared-listing"]
      .title,
    "Profile A vehicle"
  );
  assert.equal(
    normalized.profiles["condition-b"]
      .listings["shared-listing"]
      .title,
    "Profile B vehicle"
  );
  assert.notStrictEqual(
    normalized.profiles["condition-a"]
      .listings,
    normalized.profiles["condition-b"]
      .listings
  );
  assert.equal(
    normalized.profiles.archived
      .customMetadata,
    "preserved"
  );
});

test("v2 비활성 프로필 상태는 legacy 마이그레이션으로 다시 쓰지 않는다", () => {
  const disabledState = {
    initializedAt: observedAt,
    customMetadata: "preserved",
    listings: {
      "disabled-listing": {
        ...stateListing({
          id: "disabled-listing",
          priceKrw: 30000000
        }),
        adjustedPriceKrw: 33000000,
        rentalUsageHistory: true,
        totalLossHistory: false,
        rental: true
      }
    }
  };
  const normalized = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        "condition-a": {
          listings: {}
        },
        "condition-b": disabledState
      }
    },
    normalizedProfiles()
  );

  assert.deepEqual(
    normalized.profiles["condition-b"],
    disabledState
  );
  assert.notEqual(
    normalized.profiles["condition-b"],
    disabledState
  );
});

test("한 프로필의 삭제 판정은 같은 listing id를 가진 다른 프로필 상태를 변경하지 않는다", () => {
  const state = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        "condition-a": {
          initializedAt: observedAt,
          listings: {
            "shared-listing":
              stateListing()
          }
        },
        "condition-b": {
          initializedAt: observedAt,
          listings: {
            "shared-listing":
              stateListing()
          }
        }
      }
    },
    normalizedProfiles()
  );
  const profileA =
    state.profiles["condition-a"];
  const previousListings =
    Object.fromEntries(
      Object.entries(
        profileA.listings
      ).map(([id, record]) => [
        id,
        { ...record }
      ])
    );

  const result =
    reconcileListingDeletions({
      stateListings:
        profileA.listings,
      previousListings,
      currentListings: new Map([
        [
          "other-listing",
          {
            id: "other-listing",
            vehicleNo: null
          }
        ]
      ]),
      representatives: [],
      identityResolutionComplete: true,
      now: deletionTime,
      runMode: "normal",
      wasInitialized: true
    });

  assert.deepEqual(
    result.deletedListingIds,
    ["shared-listing"]
  );
  assert.equal(
    profileA.listings["shared-listing"]
      .deletedAt,
    deletionTime
  );
  assert.equal(
    state.profiles["condition-b"]
      .listings["shared-listing"]
      .deletedAt,
    undefined
  );
});

test("구형 단일 config와 flat state는 default 네임스페이스로 승계한다", () => {
  const normalized =
    normalizeWatcherState(
      {
        initializedAt: observedAt,
        updatedAt: observedAt,
        listings: {
          "legacy-listing":
            stateListing({
              id: "legacy-listing"
            })
        }
      },
      normalizedLegacyConfig()
    );

  assert.equal(
    normalized.schemaVersion,
    2
  );
  assert.deepEqual(
    Object.keys(normalized.profiles),
    ["default"]
  );
  assert.equal(
    normalized.profiles.default
      .initializedAt,
    observedAt
  );
  assert.ok(
    normalized.profiles.default
      .listings["legacy-listing"]
  );
  assert.equal(normalized.listings, undefined);
});

test("명시한 legacyStateProfileId 하나에만 구형 flat state를 승계한다", () => {
  const normalized =
    normalizeWatcherState(
      {
        initializedAt: observedAt,
        listings: {
          "legacy-listing":
            stateListing({
              id: "legacy-listing"
            })
        }
      },
      normalizedProfiles({
        legacyStateProfileId:
          "condition-b"
      })
    );

  assert.deepEqual(
    Object.keys(
      normalized.profiles["condition-a"]
        .listings
    ),
    []
  );
  assert.deepEqual(
    Object.keys(
      normalized.profiles["condition-b"]
        .listings
    ),
    ["legacy-listing"]
  );
  assert.equal(
    Object.values(normalized.profiles)
      .filter(
        (profileState) =>
          profileState.listings[
            "legacy-listing"
          ]
      ).length,
    1
  );
});

test("새 config가 단일 프로필이면 명시값 없이 구형 flat state를 그 프로필에 승계한다", () => {
  const normalized =
    normalizeWatcherState(
      {
        initializedAt: observedAt,
        listings: {
          "legacy-listing":
            stateListing({
              id: "legacy-listing"
            })
        }
      },
      normalizedProfiles({
        includeSecond: false
      })
    );

  assert.deepEqual(
    Object.keys(
      normalized.profiles["condition-a"]
        .listings
    ),
    ["legacy-listing"]
  );
});

test("여러 프로필과 의미 있는 구형 flat state에 승계 대상이 없으면 오류를 낸다", () => {
  assert.throws(
    () =>
      normalizeWatcherState(
        {
          initializedAt: observedAt,
          listings: {
            "legacy-listing":
              stateListing({
                id:
                  "legacy-listing"
              })
          }
        },
        normalizedProfiles()
      ),
    /legacy state requires legacyStateProfileId when multiple profiles are configured/
  );
});

test("v2 default 네임스페이스는 명시한 대상에 한 번만 이동하고 복제하지 않는다", () => {
  const watcherConfig =
    normalizedProfiles({
      legacyStateProfileId:
        "condition-a"
    });
  const first = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        default: {
          initializedAt: observedAt,
          listings: {
            "legacy-listing":
              stateListing({
                id: "legacy-listing"
              })
          }
        }
      }
    },
    watcherConfig
  );

  assert.equal(
    Object.hasOwn(first.profiles, "default"),
    false
  );
  assert.deepEqual(
    Object.keys(
      first.profiles["condition-a"]
        .listings
    ),
    ["legacy-listing"]
  );
  assert.deepEqual(
    Object.keys(
      first.profiles["condition-b"]
        .listings
    ),
    []
  );
  assert.equal(
    Object.values(first.profiles).filter(
      (profileState) =>
        profileState.listings[
          "legacy-listing"
        ]
    ).length,
    1
  );

  const second = normalizeWatcherState(
    first,
    watcherConfig
  );

  assert.equal(
    Object.hasOwn(second.profiles, "default"),
    false
  );
  assert.deepEqual(second, first);
});

test("flat 상태를 구형 config로 default v2에 저장한 뒤 새 지정 프로필로 2단계 이동한다", () => {
  const flatState = {
    initializedAt: observedAt,
    listings: {
      "legacy-listing": stateListing({
        id: "legacy-listing"
      })
    }
  };
  const defaultV2 = normalizeWatcherState(
    flatState,
    normalizedLegacyConfig()
  );
  const moved = normalizeWatcherState(
    defaultV2,
    normalizedProfiles({
      legacyStateProfileId:
        "condition-a"
    })
  );

  assert.equal(
    Object.hasOwn(moved.profiles, "default"),
    false
  );
  assert.ok(
    moved.profiles["condition-a"]
      .listings["legacy-listing"]
  );
  assert.equal(
    Object.values(moved.profiles).filter(
      (profileState) =>
        profileState.listings[
          "legacy-listing"
        ]
    ).length,
    1
  );
});

test("default가 실제 프로필 id여도 완료 표식 이후 운영 상태를 다시 이동하지 않는다", () => {
  const watcherConfig =
    normalizeWatcherConfig({
      configVersion: 2,
      legacyStateProfileId:
        "condition-a",
      profiles: [
        profile({
          id: "default",
          name: "Default condition"
        }),
        profile({
          id: "condition-a",
          name: "Migration target"
        })
      ]
    });
  const first = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        default: {
          initializedAt: observedAt,
          listings: {
            "legacy-listing":
              stateListing({
                id: "legacy-listing"
              })
          }
        }
      }
    },
    watcherConfig
  );

  assert.equal(
    first.legacyStateMigratedToProfileId,
    "condition-a"
  );
  assert.deepEqual(
    Object.keys(
      first.profiles.default.listings
    ),
    []
  );

  first.profiles.default = {
    initializedAt:
      "2026-01-04T00:00:00.000Z",
    listings: {
      "default-profile-listing":
        stateListing({
          id: "default-profile-listing"
        })
    }
  };

  const second = normalizeWatcherState(
    first,
    watcherConfig
  );

  assert.ok(
    second.profiles.default.listings[
      "default-profile-listing"
    ]
  );
  assert.ok(
    second.profiles["condition-a"]
      .listings["legacy-listing"]
  );
  assert.equal(
    Object.values(second.profiles).filter(
      (profileState) =>
        profileState.listings[
          "legacy-listing"
        ]
    ).length,
    1
  );
});

test("flat 상태를 직접 지정 프로필로 옮길 때도 실제 default 프로필의 후속 상태를 보호한다", () => {
  const watcherConfig =
    normalizeWatcherConfig({
      configVersion: 2,
      legacyStateProfileId:
        "condition-a",
      profiles: [
        profile({
          id: "default",
          name: "Default condition"
        }),
        profile({
          id: "condition-a",
          name: "Migration target"
        })
      ]
    });
  const first = normalizeWatcherState(
    {
      initializedAt: observedAt,
      listings: {
        "legacy-listing": stateListing({
          id: "legacy-listing"
        })
      }
    },
    watcherConfig
  );

  first.profiles.default = {
    initializedAt:
      "2026-01-04T00:00:00.000Z",
    listings: {
      "default-profile-listing":
        stateListing({
          id: "default-profile-listing"
        })
    }
  };

  const second = normalizeWatcherState(
    first,
    watcherConfig
  );

  assert.equal(
    second.legacyStateMigratedToProfileId,
    "condition-a"
  );
  assert.ok(
    second.profiles.default.listings[
      "default-profile-listing"
    ]
  );
  assert.ok(
    second.profiles["condition-a"]
      .listings["legacy-listing"]
  );
});

test("v2 default 상태는 disabled 마이그레이션 대상에도 안전하게 이동한다", () => {
  const normalized = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        default: {
          initializedAt: observedAt,
          listings: {
            "legacy-listing":
              stateListing({
                id: "legacy-listing"
              })
          }
        }
      }
    },
    normalizedProfiles({
      legacyStateProfileId:
        "condition-b"
    })
  );

  assert.equal(
    Object.hasOwn(
      normalized.profiles,
      "default"
    ),
    false
  );
  assert.ok(
    normalized.profiles["condition-b"]
      .listings["legacy-listing"]
  );
  assert.deepEqual(
    Object.keys(
      normalized.profiles["condition-a"]
        .listings
    ),
    []
  );
});

test("v2 default와 마이그레이션 대상에 모두 의미 있는 상태가 있으면 충돌로 중단한다", () => {
  assert.throws(
    () =>
      normalizeWatcherState(
        {
          schemaVersion: 2,
          profiles: {
            default: {
              initializedAt: observedAt,
              listings: {
                "default-listing":
                  stateListing({
                    id:
                      "default-listing"
                  })
              }
            },
            "condition-a": {
              initializedAt: observedAt,
              listings: {
                "target-listing":
                  stateListing({
                    id:
                      "target-listing"
                  })
              }
            }
          }
        },
        normalizedProfiles({
          legacyStateProfileId:
            "condition-a"
        })
      ),
    /state\.profiles\.default and state\.profiles\.condition-a both contain state; refusing legacy state move/
  );
});

test("비어 있는 v2 default는 기존 대상 상태를 덮어쓰지 않고 제거한다", () => {
  const normalized = normalizeWatcherState(
    {
      schemaVersion: 2,
      profiles: {
        default: {
          listings: {}
        },
        "condition-a": {
          initializedAt: observedAt,
          listings: {
            "target-listing":
              stateListing({
                id: "target-listing"
              })
          }
        }
      }
    },
    normalizedProfiles({
      legacyStateProfileId:
        "condition-a"
    })
  );

  assert.equal(
    Object.hasOwn(
      normalized.profiles,
      "default"
    ),
    false
  );
  assert.deepEqual(
    Object.keys(
      normalized.profiles["condition-a"]
        .listings
    ),
    ["target-listing"]
  );
});

test("특수 프로필 id도 고유 상태 키로 안전하게 직렬화한다", () => {
  for (const profileId of [
    "__proto__",
    "constructor"
  ]) {
    const watcherConfig =
      normalizeWatcherConfig({
        configVersion: 2,
        profiles: [
          profile({
            id: profileId,
            name:
              "Prototype-safe profile"
          })
        ]
      });
    const normalized =
      normalizeWatcherState(
        {
          schemaVersion: 2,
          profiles: {}
        },
        watcherConfig
      );

    assert.equal(
      Object.hasOwn(
        normalized.profiles,
        profileId
      ),
      true
    );
    assert.equal(
      JSON.parse(
        JSON.stringify(normalized)
      ).profiles[profileId]
        .listings !== undefined,
      true
    );
  }
});
