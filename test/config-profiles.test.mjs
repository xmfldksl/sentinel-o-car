import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWatcherConfig
} from "../src/runtime.mjs";

function syntheticSearchUrl(
  label,
  {
    page = 1,
    title = `Synthetic ${label}`,
    action = `(And.Synthetic.${label})`
  } = {}
) {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set(
    "page",
    String(page)
  );
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      action,
      title,
      toggle: {},
      layer: "",
      sort: "MobileModifiedDate"
    })
  );

  return url.toString();
}

function genericProfile(overrides = {}) {
  const result = {
    id: "condition-a",
    name: "Condition A",
    enabled: true,
    searchUrl:
      syntheticSearchUrl(
        "condition-a"
      ),
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
      maxPriceKrw: 45000000
    },
    rentalHistoryDiscountKrw: 0,
    ...overrides
  };

  if (
    Object.prototype.hasOwnProperty.call(
      overrides,
      "searchUrl"
    ) &&
    overrides.searchUrl === undefined
  ) {
    delete result.searchUrl;
  }

  return result;
}

function teslaProfile(overrides = {}) {
  return genericProfile({
    id: "condition-t",
    name: "Condition T",
    searchUrl:
      syntheticSearchUrl(
        "condition-t"
      ),
    optionMode: "tesla",
    price: {
      maxPriceKrw: 35000000,
      teslaOptionLimitsKrw: {
        eap: 37000000,
        fsd: 40000000,
        unknownOptionHardMax:
          35000000
      }
    },
    ...overrides
  });
}

function versionTwoConfig(profiles) {
  return {
    configVersion: 2,
    maxPages: 2,
    requestDelayMs: 1500,
    profiles
  };
}

function legacySearchUrl() {
  return syntheticSearchUrl(
    "legacy-config",
    {
      action:
        "(And.Year.range(202201..202212))",
      title: "Anonymous condition"
    }
  );
}

function legacyConfig() {
  return {
    requiredTitleTerms: [
      "  Example   Model ",
      "AWD"
    ],
    yearMonthMin: "2022-05",
    yearMonthMax: "2022-12",
    maxMileageKm: 150000,
    priceLimitsKrw: {
      base: 35000000,
      eap: 37000000,
      fsd: 40000000,
      unknownOptionHardMax:
        35000000
    },
    rentalPenaltyKrw: 3000000,
    excludedColorTerms: [
      "Excluded color"
    ],
    excludeContracted: true,
    notifyPriceIncrease: true,
    maxPages: 2,
    requestDelayMs: 1500
  };
}

test("지원하지 않는 configVersion과 boolean이 아닌 enabled를 거부한다", () => {
  assert.throws(
    () =>
      normalizeWatcherConfig({
        ...versionTwoConfig([
          genericProfile()
        ]),
        configVersion: 3
      }),
    /configVersion must be 2/
  );

  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            enabled: "true"
          })
        ])
      ),
    /enabled must be a boolean/
  );
});

test("두 프로필의 배열 순서와 서로 다른 직접/환경변수 URL을 보존한다", () => {
  const normalized =
    normalizeWatcherConfig(
      versionTwoConfig([
        genericProfile(),
        teslaProfile({
          searchUrl: undefined,
          searchUrlEnv:
            "CONDITION_T_URL"
        })
      ]),
      {
        CONDITION_T_URL:
          syntheticSearchUrl(
            "from-environment"
          )
      }
    );

  assert.deepEqual(
    normalized.profiles.map(
      (profile) => profile.id
    ),
    ["condition-a", "condition-t"]
  );
  assert.equal(
    normalized.profiles[0].searchUrl,
    syntheticSearchUrl(
      "condition-a"
    )
  );
  assert.equal(
    normalized.profiles[1].searchUrl,
    syntheticSearchUrl(
      "from-environment"
    )
  );
  assert.equal(
    normalized.profiles[1]
      .searchUrlSource,
    "environment:CONDITION_T_URL"
  );
});

test("disabled 프로필은 유지하지만 enabled 프로필이 하나도 없으면 거부한다", () => {
  const normalized =
    normalizeWatcherConfig(
      versionTwoConfig([
        genericProfile({
          id: "disabled-condition",
          enabled: false
        }),
        teslaProfile()
      ])
    );

  assert.deepEqual(
    normalized.profiles.map(
      ({ id, enabled }) => ({
        id,
        enabled
      })
    ),
    [
      {
        id: "disabled-condition",
        enabled: false
      },
      {
        id: "condition-t",
        enabled: true
      }
    ]
  );

  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            enabled: false
          }),
          teslaProfile({
            enabled: false
          })
        ])
      ),
    /at least one profile must be enabled/
  );
});

test("중복 id와 빈 name을 명확한 프로필 경로로 거부한다", () => {
  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile(),
          teslaProfile({
            id: "condition-a"
          })
        ])
      ),
    /profiles\[1\] \(condition-a\)\.id must be unique/
  );

  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            name: "   "
          })
        ])
      ),
    /profiles\[0\] \(condition-a\)\.name must be a non-empty string/
  );
});

test("직접 URL과 환경변수 URL의 누락·중복·프로토콜 오류를 거부한다", async (t) => {
  await t.test(
    "직접 URL 프로토콜",
    () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              genericProfile({
                searchUrl:
                  "ftp://example.test/search"
              })
            ])
          ),
        /엔카 검색 URL의 호스트 또는 경로를 지원하지 않습니다/
      );
    }
  );

  await t.test(
    "환경변수 누락",
    () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              genericProfile({
                searchUrl: undefined,
                searchUrlEnv:
                  "MISSING_SEARCH_URL"
              })
            ]),
            {}
          ),
        /references missing environment variable MISSING_SEARCH_URL/
      );
    }
  );

  await t.test(
    "환경변수 URL 프로토콜",
    () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              genericProfile({
                searchUrl: undefined,
                searchUrlEnv:
                  "CONDITION_URL"
              })
            ]),
            {
              CONDITION_URL:
                "file:///tmp/search"
            }
          ),
        /엔카 검색 URL의 호스트 또는 경로를 지원하지 않습니다/
      );
    }
  );

  await t.test(
    "두 URL 공급 방식 동시 지정",
    () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              genericProfile({
                searchUrlEnv:
                  "CONDITION_URL"
              })
            ]),
            {
              CONDITION_URL:
                syntheticSearchUrl(
                  "from-environment"
                )
            }
          ),
        /must define exactly one of searchUrl or searchUrlEnv/
      );
    }
  );
});

test("지원하지 않는 optionMode를 거부한다", () => {
  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            optionMode: "unknown"
          })
        ])
      ),
    /profiles\[0\] \(condition-a\)\.optionMode must be generic or tesla/
  );
});

test("기본 가격과 구형 base 가격은 0 이상의 유한한 정수여야 한다", async (t) => {
  for (const invalidValue of [
    null,
    -1,
    1.5,
    Number.POSITIVE_INFINITY,
    "35000000"
  ]) {
    await t.test(
      `새 maxPriceKrw ${String(
        invalidValue
      )}`,
      () => {
        assert.throws(
          () =>
            normalizeWatcherConfig(
              versionTwoConfig([
                genericProfile({
                  price: {
                    maxPriceKrw:
                      invalidValue
                  }
                })
              ])
            ),
          /price\.maxPriceKrw must be a non-negative integer/
        );
      }
    );
  }

  await t.test(
    "구형 base",
    () => {
      const profile = genericProfile();
      delete profile.price;
      profile.priceLimitsKrw = {
        base: -1
      };

      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              profile
            ])
          ),
        /priceLimitsKrw\.base must be a non-negative integer/
      );
    }
  );
});

test("테슬라 옵션별 가격은 모두 0 이상의 유한한 정수여야 한다", async (t) => {
  const cases = [
    ["eap", null],
    ["eap", -1],
    ["fsd", 1.25],
    [
      "unknownOptionHardMax",
      Number.POSITIVE_INFINITY
    ]
  ];

  for (const [field, value] of cases) {
    await t.test(
      `${field} ${String(value)}`,
      () => {
        assert.throws(
          () =>
            normalizeWatcherConfig(
              versionTwoConfig([
                teslaProfile({
                  price: {
                    maxPriceKrw:
                      35000000,
                    teslaOptionLimitsKrw: {
                      eap: 37000000,
                      fsd: 40000000,
                      unknownOptionHardMax:
                        35000000,
                      [field]: value
                    }
                  }
                })
              ])
            ),
          new RegExp(
            `teslaOptionLimitsKrw\\.${field} must be a non-negative integer`
          )
        );
      }
    );
  }
});

test("generic 설정 정규화는 Tesla 옵션별 가격 getter를 읽지 않고 경고 후 무시한다", () => {
  const price = {
    maxPriceKrw: 45000000
  };
  const warnings = [];

  Object.defineProperty(
    price,
    "teslaOptionLimitsKrw",
    {
      enumerable: true,
      get() {
        throw new Error(
          "Tesla limits must not be read"
        );
      }
    }
  );

  const normalized = normalizeWatcherConfig(
    versionTwoConfig([
      genericProfile({ price })
    ]),
    {},
    {
      warn(message) {
        warnings.push(message);
      }
    }
  );

  assert.deepEqual(
    normalized.profiles[0].price,
    { maxPriceKrw: 45000000 }
  );
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /teslaOptionLimitsKrw is ignored/
  );
});

test("titleFilter 배열 형식과 비어 있지 않은 항목을 검증한다", () => {
  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            titleFilter: {
              requiredAll: [],
              requiredAny:
                "Condition",
              excludedAny: []
            }
          })
        ])
      ),
    /titleFilter\.requiredAny must be an array of strings/
  );

  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            titleFilter: {
              requiredAll: ["   "],
              requiredAny: [],
              excludedAny: []
            }
          })
        ])
      ),
    /titleFilter\.requiredAll\[0\] must be a non-empty string/
  );
});

test("연식, 주행거리, 제외 색상, 렌트 감가 값을 검증한다", async (t) => {
  await t.test(
    "minYear가 maxYear보다 큼",
    () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            versionTwoConfig([
              genericProfile({
                minYear: 2026,
                maxYear: 2025
              })
            ])
          ),
        /minYear must not be greater than .*maxYear/
      );
    }
  );

  for (const value of [null, -1]) {
    await t.test(
      `주행거리 ${String(value)}`,
      () => {
        assert.throws(
          () =>
            normalizeWatcherConfig(
              versionTwoConfig([
                genericProfile({
                  maxMileageKm: value
                })
              ])
            ),
          /maxMileageKm must be a non-negative integer/
        );
      }
    );
  }

  await t.test("제외 색상", () => {
    assert.throws(
      () =>
        normalizeWatcherConfig(
          versionTwoConfig([
            genericProfile({
              excludedColors:
                "excluded"
            })
          ])
        ),
      /excludedColors must be an array of strings/
    );
  });

  await t.test("렌트 감가", () => {
    assert.throws(
      () =>
        normalizeWatcherConfig(
          versionTwoConfig([
            genericProfile({
              rentalHistoryDiscountKrw:
                -1
            })
          ])
        ),
      /rentalHistoryDiscountKrw must be a non-negative integer/
    );
  });
});

test("명시적으로 null인 사용자 설정 필드는 누락값 기본값으로 처리하지 않는다", async (t) => {
  const cases = [
    {
      name: "configVersion",
      config: {
        ...versionTwoConfig([
          genericProfile()
        ]),
        configVersion: null
      },
      pattern: /configVersion must be 2/
    },
    {
      name: "profile id",
      config: versionTwoConfig([
        genericProfile({ id: null })
      ]),
      pattern: /profiles\[0\]\.id must be a non-empty string/
    },
    {
      name: "profile name",
      config: versionTwoConfig([
        genericProfile({ name: null })
      ]),
      pattern: /name must be a non-empty string/
    },
    {
      name: "enabled",
      config: versionTwoConfig([
        genericProfile({ enabled: null })
      ]),
      pattern: /enabled must be a boolean/
    },
    {
      name: "searchUrl",
      config: versionTwoConfig([
        genericProfile({ searchUrl: null })
      ]),
      pattern: /searchUrl must be a non-empty string/
    },
    {
      name: "searchUrlEnv",
      config: versionTwoConfig([
        genericProfile({
          searchUrl: undefined,
          searchUrlEnv: null
        })
      ]),
      pattern: /searchUrlEnv must be a non-empty string/
    },
    {
      name: "optionMode",
      config: versionTwoConfig([
        genericProfile({
          optionMode: null,
          vehicleProfile: {
            optionMode: "tesla"
          }
        })
      ]),
      pattern: /optionMode must be generic or tesla/
    },
    {
      name: "price",
      config: versionTwoConfig([
        genericProfile({ price: null })
      ]),
      pattern: /price must be an object/
    },
    {
      name: "titleFilter",
      config: versionTwoConfig([
        genericProfile({
          titleFilter: null
        })
      ]),
      pattern: /titleFilter must be an object/
    },
    {
      name: "titleFilter.requiredAll",
      config: versionTwoConfig([
        genericProfile({
          titleFilter: {
            requiredAll: null,
            requiredAny: [],
            excludedAny: []
          }
        })
      ]),
      pattern: /titleFilter\.requiredAll must be an array of strings/
    },
    {
      name: "titleFilter.requiredAny",
      config: versionTwoConfig([
        genericProfile({
          titleFilter: {
            requiredAll: [],
            requiredAny: null,
            excludedAny: []
          }
        })
      ]),
      pattern: /titleFilter\.requiredAny must be an array of strings/
    },
    {
      name: "titleFilter.excludedAny",
      config: versionTwoConfig([
        genericProfile({
          titleFilter: {
            requiredAll: [],
            requiredAny: [],
            excludedAny: null
          }
        })
      ]),
      pattern: /titleFilter\.excludedAny must be an array of strings/
    },
    {
      name: "minYear",
      config: versionTwoConfig([
        genericProfile({ minYear: null })
      ]),
      pattern: /minYear must be a non-negative integer/
    },
    {
      name: "maxYear",
      config: versionTwoConfig([
        genericProfile({ maxYear: null })
      ]),
      pattern: /maxYear must be a non-negative integer/
    },
    {
      name: "excludedColors",
      config: versionTwoConfig([
        genericProfile({
          excludedColors: null
        })
      ]),
      pattern: /excludedColors must be an array of strings/
    },
    {
      name: "excludeContractPending",
      config: versionTwoConfig([
        genericProfile({
          excludeContractPending: null
        })
      ]),
      pattern: /excludeContractPending must be a boolean/
    },
    {
      name: "rentalHistoryDiscountKrw",
      config: versionTwoConfig([
        genericProfile({
          rentalHistoryDiscountKrw: null
        })
      ]),
      pattern: /rentalHistoryDiscountKrw must be a non-negative integer/
    },
    {
      name: "notifyPriceIncrease",
      config: versionTwoConfig([
        genericProfile({
          notifyPriceIncrease: null
        })
      ]),
      pattern: /notifyPriceIncrease must be a boolean/
    },
    {
      name: "maxPages",
      config: versionTwoConfig([
        genericProfile({ maxPages: null })
      ]),
      pattern: /maxPages must be a positive integer/
    },
    {
      name: "requestDelayMs",
      config: versionTwoConfig([
        genericProfile({
          requestDelayMs: null
        })
      ]),
      pattern: /requestDelayMs must be a non-negative integer/
    },
    {
      name: "root maxPages",
      config: {
        ...versionTwoConfig([
          genericProfile({ maxPages: 1 })
        ]),
        maxPages: null
      },
      pattern: /config\.maxPages must be a positive integer/
    },
    {
      name: "root requestDelayMs",
      config: {
        ...versionTwoConfig([
          genericProfile({
            requestDelayMs: 0
          })
        ]),
        requestDelayMs: null
      },
      pattern: /config\.requestDelayMs must be a non-negative integer/
    },
    {
      name: "root notifyPriceIncrease",
      config: {
        ...versionTwoConfig([
          genericProfile({
            notifyPriceIncrease: false
          })
        ]),
        notifyPriceIncrease: null
      },
      pattern: /config\.notifyPriceIncrease must be a boolean/
    },
    {
      name: "legacyStateProfileId",
      config: {
        ...versionTwoConfig([
          genericProfile()
        ]),
        legacyStateProfileId: null
      },
      pattern: /legacyStateProfileId must be a non-empty string/
    }
  ];

  for (const {
    name,
    config,
    pattern
  } of cases) {
    await t.test(name, () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            config,
            {}
          ),
        pattern
      );
    });
  }
});

test("명시적 null은 환경변수 override가 있어도 거부한다", () => {
  assert.throws(
    () =>
      normalizeWatcherConfig(
        {
          ...legacyConfig(),
          maxPages: null
        },
        {
          GITHUB_ACTIONS: "true",
          ENCAR_SEARCH_URL:
            legacySearchUrl(),
          MAX_PAGES: "3"
        }
      ),
    /config\.maxPages must be a positive integer/
  );

  assert.throws(
    () =>
      normalizeWatcherConfig(
        versionTwoConfig([
          genericProfile({
            maxPages: null
          })
        ]),
        { MAX_PAGES: "3" }
      ),
    /profiles\[0\].*maxPages must be a positive integer/
  );
});

test("생략된 선택 필드에만 안전한 기본값을 적용한다", () => {
  const profile = genericProfile();

  delete profile.titleFilter.requiredAll;
  delete profile.titleFilter.requiredAny;
  delete profile.titleFilter.excludedAny;
  delete profile.minYear;
  delete profile.maxYear;
  delete profile.maxMileageKm;
  delete profile.excludedColors;
  delete profile.excludeContractPending;
  delete profile.rentalHistoryDiscountKrw;

  const normalized = normalizeWatcherConfig(
    {
      configVersion: 2,
      profiles: [profile]
    }
  ).profiles[0];

  assert.deepEqual(normalized.titleFilter, {
    requiredAll: [],
    requiredAny: [],
    excludedAny: []
  });
  assert.equal(
    normalized.yearMonthMin,
    "0000-01"
  );
  assert.equal(
    normalized.yearMonthMax,
    "9999-12"
  );
  assert.equal(
    normalized.maxMileageKm,
    Number.MAX_SAFE_INTEGER
  );
  assert.deepEqual(
    normalized.excludedColorTerms,
    []
  );
  assert.equal(
    normalized.excludeContracted,
    true
  );
  assert.equal(
    normalized.rentalPenaltyKrw,
    0
  );
  assert.equal(normalized.maxPages, 1);
  assert.equal(
    normalized.requestDelayMs,
    1500
  );
});

test("legacyStateProfileId는 구성된 disabled 프로필도 가리킬 수 있지만 알 수 없는 id는 거부한다", () => {
  const normalized =
    normalizeWatcherConfig({
      ...versionTwoConfig([
        genericProfile(),
        genericProfile({
          id: "condition-disabled",
          name: "Disabled condition",
          enabled: false,
          searchUrl:
            syntheticSearchUrl(
              "disabled-condition"
            )
        })
      ]),
      legacyStateProfileId:
        "condition-disabled"
    });

  assert.equal(
    normalized.legacyStateProfileId,
    "condition-disabled"
  );

  assert.throws(
    () =>
      normalizeWatcherConfig({
        ...versionTwoConfig([
          genericProfile()
        ]),
        legacyStateProfileId:
          "missing-condition"
      }),
    /legacyStateProfileId must match a configured profile id/
  );
});

test("새 price, titleFilter, 연식 필드는 충돌하거나 잘못된 구형 필드보다 우선한다", () => {
  const normalized =
    normalizeWatcherConfig(
      versionTwoConfig([
        genericProfile({
          titleFilter: {
            requiredAll: [
              "  Example   Model "
            ],
            requiredAny: ["AWD", "4WD"],
            excludedAny: ["Excluded"]
          },
          requiredTitleTerms:
            "invalid legacy value",
          yearMonthMin:
            "invalid legacy value",
          yearMonthMax:
            "invalid legacy value",
          price: {
            maxPriceKrw: 42000000
          },
          priceLimitsKrw:
            "invalid legacy value"
        })
      ])
    );
  const [profile] =
    normalized.profiles;

  assert.deepEqual(profile.price, {
    maxPriceKrw: 42000000
  });
  assert.deepEqual(
    profile.titleFilter,
    {
      requiredAll: ["example model"],
      requiredAny: ["awd", "4wd"],
      excludedAny: ["excluded"]
    }
  );
  assert.equal(
    profile.yearMonthMin,
    "2020-01"
  );
  assert.equal(
    profile.yearMonthMax,
    "2026-12"
  );
});

test("profiles 없는 구형 설정은 default 테슬라 프로필과 기존 필드를 사용한다", () => {
  const url = legacySearchUrl();
  const normalized =
    normalizeWatcherConfig(
      legacyConfig(),
      {
        GITHUB_ACTIONS: "true",
        ENCAR_SEARCH_URL: url
      }
    );
  const [profile] =
    normalized.profiles;

  assert.equal(
    normalized.legacyConfig,
    true
  );
  assert.equal(profile.id, "default");
  assert.equal(profile.name, "Default");
  assert.equal(
    profile.optionMode,
    "tesla"
  );
  assert.equal(profile.searchUrl, url);
  assert.deepEqual(profile.price, {
    maxPriceKrw: 35000000,
    teslaOptionLimitsKrw: {
      eap: 37000000,
      fsd: 40000000,
      unknownOptionHardMax:
        35000000
    }
  });
  assert.deepEqual(
    profile.titleFilter,
    {
      requiredAll: [
        "example model",
        "awd"
      ],
      requiredAny: [],
      excludedAny: []
    }
  );
});
