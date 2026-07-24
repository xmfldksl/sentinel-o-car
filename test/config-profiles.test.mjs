import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWatcherConfig
} from "../src/runtime.mjs";

function syntheticSearchUrl(label) {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      action: `(And.Synthetic.${label})`,
      title: `Synthetic ${label}`,
      toggle: {},
      layer: "",
      sort: "MobileModifiedDate"
    })
  );

  return url.toString();
}

function titleFilter(overrides = {}) {
  return {
    requiredAll: [],
    requiredAny: [],
    excludedAny: [],
    ...overrides
  };
}

function genericProfile(overrides = {}) {
  return {
    id: "generic-profile",
    name: "Generic profile",
    enabled: true,
    searchUrl:
      syntheticSearchUrl("generic"),
    isTesla: false,
    titleFilter: titleFilter(),
    price: {
      maxPriceKrw: 45000000
    },
    ...overrides
  };
}

function teslaProfile(overrides = {}) {
  return genericProfile({
    id: "tesla-profile",
    name: "Tesla profile",
    searchUrl:
      syntheticSearchUrl("tesla"),
    isTesla: true,
    price: {
      maxPriceKrw: 35000000,
      eapMaxPriceKrw: 37000000,
      fsdMaxPriceKrw: 40000000
    },
    ...overrides
  });
}

function validConfig(
  profiles = [genericProfile()]
) {
  return {
    configVersion: 2,
    notifyPriceIncrease: true,
    maxPages: 2,
    requestDelayMs: 1500,
    profiles
  };
}

function without(object, key) {
  const result = structuredClone(object);
  delete result[key];
  return result;
}

test("generic과 Tesla 프로필을 정확한 v2 계약으로 정규화한다", () => {
  const genericUrl =
    syntheticSearchUrl("normal-generic");
  const teslaUrl =
    syntheticSearchUrl("normal-tesla");
  const rawConfig = validConfig([
    genericProfile({
      name: "  Generic profile  ",
      searchUrl: genericUrl,
      titleFilter: titleFilter({
        requiredAll: [
          "  Alpha   One  "
        ],
        requiredAny: [" AWD ", " 4WD "],
        excludedAny: [" Demo "]
      })
    }),
    teslaProfile({
      searchUrl: undefined,
      searchUrlEnv:
        "SYNTHETIC_TESLA_URL"
    })
  ]);

  delete rawConfig.profiles[1].searchUrl;

  const normalized =
    normalizeWatcherConfig(
      rawConfig,
      {
        SYNTHETIC_TESLA_URL:
          teslaUrl,
        MAX_PAGES: "3"
      }
    );

  assert.deepEqual(
    Object.keys(normalized).sort(),
    [
      "configVersion",
      "maxPages",
      "notifyPriceIncrease",
      "profiles",
      "requestDelayMs"
    ]
  );
  assert.deepEqual(
    {
      ...normalized,
      profiles: undefined
    },
    {
      configVersion: 2,
      notifyPriceIncrease: true,
      maxPages: 3,
      requestDelayMs: 1500,
      profiles: undefined
    }
  );
  assert.equal(
    normalized.profiles.length,
    2
  );

  for (const profile of normalized.profiles) {
    assert.deepEqual(
      Object.keys(profile).sort(),
      [
        "enabled",
        "id",
        "isTesla",
        "name",
        "price",
        "searchUrl",
        "searchUrlSource",
        "titleFilter"
      ]
    );
    assert.deepEqual(
      Object.keys(
        profile.titleFilter
      ).sort(),
      [
        "excludedAny",
        "requiredAll",
        "requiredAny"
      ]
    );
  }

  const [generic, tesla] =
    normalized.profiles;

  assert.deepEqual(generic, {
    id: "generic-profile",
    name: "Generic profile",
    enabled: true,
    searchUrl: genericUrl,
    searchUrlSource: "config",
    isTesla: false,
    titleFilter: {
      requiredAll: ["alpha one"],
      requiredAny: ["awd", "4wd"],
      excludedAny: ["demo"]
    },
    price: {
      maxPriceKrw: 45000000
    }
  });
  assert.deepEqual(
    Object.keys(generic.price),
    ["maxPriceKrw"]
  );

  assert.deepEqual(tesla, {
    id: "tesla-profile",
    name: "Tesla profile",
    enabled: true,
    searchUrl: teslaUrl,
    searchUrlSource:
      "environment:SYNTHETIC_TESLA_URL",
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
  });
  assert.deepEqual(
    Object.keys(tesla.price),
    [
      "maxPriceKrw",
      "eapMaxPriceKrw",
      "fsdMaxPriceKrw"
    ]
  );
});

test("필수 필드, 형식과 모든 계층의 미지원 필드를 거부한다", async (t) => {
  const cases = [
    {
      name: "config object",
      value: null,
      pattern: /config must be an object/
    },
    {
      name: "required root field",
      value: without(
        validConfig(),
        "notifyPriceIncrease"
      ),
      pattern:
        /config\.notifyPriceIncrease is required/
    },
    {
      name: "profiles-less config",
      value: without(
        validConfig(),
        "profiles"
      ),
      pattern:
        /config\.profiles is required/
    },
    {
      name: "unknown root field",
      value: {
        ...validConfig(),
        unexpectedRootField: true
      },
      pattern:
        /config contains unknown field unexpectedRootField/
    },
    {
      name: "configVersion format",
      value: {
        ...validConfig(),
        configVersion: 1
      },
      pattern: /configVersion must be 2/
    },
    {
      name: "root boolean format",
      value: {
        ...validConfig(),
        notifyPriceIncrease: "true"
      },
      pattern:
        /config\.notifyPriceIncrease must be a boolean/
    },
    {
      name: "root maxPages format",
      value: {
        ...validConfig(),
        maxPages: 0
      },
      pattern:
        /config\.maxPages must be a positive integer/
    },
    {
      name: "root requestDelayMs format",
      value: {
        ...validConfig(),
        requestDelayMs: -1
      },
      pattern:
        /config\.requestDelayMs must be a non-negative integer/
    },
    {
      name: "profiles format",
      value: {
        ...validConfig(),
        profiles: {}
      },
      pattern:
        /profiles must be a non-empty array/
    },
    {
      name: "empty profiles",
      value: validConfig([]),
      pattern:
        /profiles must be a non-empty array/
    },
    {
      name: "profile object",
      value: validConfig([null]),
      pattern:
        /profiles\[0\] must be an object/
    },
    {
      name: "required profile field",
      value: validConfig([
        without(
          genericProfile(),
          "isTesla"
        )
      ]),
      pattern:
        /profiles\[0\]\.isTesla is required/
    },
    {
      name: "unknown profile field",
      value: validConfig([
        genericProfile({
          unexpectedProfileField: true
        })
      ]),
      pattern:
        /profiles\[0\] contains unknown field unexpectedProfileField/
    },
    {
      name: "profile id format",
      value: validConfig([
        genericProfile({ id: "  " })
      ]),
      pattern:
        /profiles\[0\]\.id must be a non-empty string/
    },
    {
      name: "reserved default profile id",
      value: validConfig([
        genericProfile({
          id: "default"
        })
      ]),
      pattern:
        /profiles\[0\]\.id must not be "default"/
    },
    {
      name: "profile name format",
      value: validConfig([
        genericProfile({ name: null })
      ]),
      pattern:
        /name must be a non-empty string/
    },
    {
      name: "profile enabled format",
      value: validConfig([
        genericProfile({
          enabled: "true"
        })
      ]),
      pattern:
        /enabled must be a boolean/
    },
    {
      name: "profile isTesla format",
      value: validConfig([
        genericProfile({
          isTesla: "false"
        })
      ]),
      pattern:
        /isTesla must be a boolean/
    },
    {
      name: "missing profile URL",
      value: validConfig([
        without(
          genericProfile(),
          "searchUrl"
        )
      ]),
      pattern:
        /must define exactly one of searchUrl or searchUrlEnv/
    },
    {
      name: "duplicate profile URL sources",
      value: validConfig([
        genericProfile({
          searchUrlEnv:
            "SYNTHETIC_URL"
        })
      ]),
      environment: {
        SYNTHETIC_URL:
          syntheticSearchUrl(
            "duplicate-url-source"
          )
      },
      pattern:
        /must define exactly one of searchUrl or searchUrlEnv/
    },
    {
      name: "missing enabled URL environment",
      value: validConfig([
        genericProfile({
          searchUrl: undefined,
          searchUrlEnv:
            "MISSING_SYNTHETIC_URL"
        })
      ].map((profile) => {
        delete profile.searchUrl;
        return profile;
      })),
      environment: {},
      pattern:
        /references missing environment variable MISSING_SYNTHETIC_URL/
    },
    {
      name: "titleFilter object",
      value: validConfig([
        genericProfile({
          titleFilter: []
        })
      ]),
      pattern:
        /titleFilter must be an object/
    },
    {
      name: "titleFilter required key",
      value: validConfig([
        genericProfile({
          titleFilter: {
            requiredAll: [],
            excludedAny: []
          }
        })
      ]),
      pattern:
        /titleFilter\.requiredAny is required/
    },
    {
      name: "unknown titleFilter field",
      value: validConfig([
        genericProfile({
          titleFilter: {
            ...titleFilter(),
            unexpectedTitleFilterField: []
          }
        })
      ]),
      pattern:
        /titleFilter contains unknown field unexpectedTitleFilterField/
    },
    {
      name: "titleFilter array format",
      value: validConfig([
        genericProfile({
          titleFilter: titleFilter({
            requiredAny: "AWD"
          })
        })
      ]),
      pattern:
        /titleFilter\.requiredAny must be an array of strings/
    },
    {
      name: "titleFilter item format",
      value: validConfig([
        genericProfile({
          titleFilter: titleFilter({
            excludedAny: ["  "]
          })
        })
      ]),
      pattern:
        /titleFilter\.excludedAny\[0\] must be a non-empty string/
    },
    {
      name: "price object",
      value: validConfig([
        genericProfile({ price: null })
      ]),
      pattern:
        /price must be an object/
    },
    {
      name: "required generic price",
      value: validConfig([
        genericProfile({ price: {} })
      ]),
      pattern:
        /price\.maxPriceKrw is required/
    },
    {
      name: "generic price format",
      value: validConfig([
        genericProfile({
          price: {
            maxPriceKrw: -1
          }
        })
      ]),
      pattern:
        /price\.maxPriceKrw must be a non-negative integer/
    },
    {
      name: "generic forbids Tesla price key",
      value: validConfig([
        genericProfile({
          price: {
            maxPriceKrw: 45000000,
            eapMaxPriceKrw:
              47000000
          }
        })
      ]),
      pattern:
        /price contains unknown field eapMaxPriceKrw/
    },
    {
      name: "generic forbids FSD price key",
      value: validConfig([
        genericProfile({
          price: {
            maxPriceKrw: 45000000,
            fsdMaxPriceKrw:
              50000000
          }
        })
      ]),
      pattern:
        /price contains unknown field fsdMaxPriceKrw/
    },
    {
      name: "Tesla requires EAP price",
      value: validConfig([
        teslaProfile({
          price: {
            maxPriceKrw: 35000000,
            fsdMaxPriceKrw:
              40000000
          }
        })
      ]),
      pattern:
        /price\.eapMaxPriceKrw is required/
    },
    {
      name: "Tesla requires FSD price",
      value: validConfig([
        teslaProfile({
          price: {
            maxPriceKrw: 35000000,
            eapMaxPriceKrw:
              37000000
          }
        })
      ]),
      pattern:
        /price\.fsdMaxPriceKrw is required/
    },
    {
      name: "Tesla price format",
      value: validConfig([
        teslaProfile({
          price: {
            maxPriceKrw: 35000000,
            eapMaxPriceKrw: 1.5,
            fsdMaxPriceKrw:
              40000000
          }
        })
      ]),
      pattern:
        /price\.eapMaxPriceKrw must be a non-negative integer/
    },
    {
      name: "unknown price field",
      value: validConfig([
        teslaProfile({
          price: {
            maxPriceKrw: 35000000,
            eapMaxPriceKrw:
              37000000,
            fsdMaxPriceKrw:
              40000000,
            unexpectedPriceField: true
          }
        })
      ]),
      pattern:
        /price contains unknown field unexpectedPriceField/
    },
    {
      name: "duplicate profile id",
      value: validConfig([
        genericProfile(),
        teslaProfile({
          id: "generic-profile"
        })
      ]),
      pattern: /id must be unique/
    },
    {
      name: "at least one enabled profile",
      value: validConfig([
        genericProfile({
          enabled: false
        })
      ]),
      pattern:
        /at least one profile must be enabled/
    }
  ];

  for (const {
    name,
    value,
    environment = {},
    pattern
  } of cases) {
    await t.test(name, () => {
      assert.throws(
        () =>
          normalizeWatcherConfig(
            value,
            environment
          ),
        pattern
      );
    });
  }
});
