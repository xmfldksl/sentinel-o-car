import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import {
  normalizeWatcherConfig,
  normalizeWatcherState
} from "../src/runtime.mjs";

const configText = await fs.readFile(
  new URL("../config.json", import.meta.url),
  "utf8"
);
const rawConfig = JSON.parse(configText);
const stateText = await fs.readFile(
  new URL(
    "../data/state.json",
    import.meta.url
  ),
  "utf8"
);
const rawState = JSON.parse(stateText);
const workflowText = await fs.readFile(
  new URL(
    "../.github/workflows/sentinel-o-car.yml",
    import.meta.url
  ),
  "utf8"
);
const readmeText = await fs.readFile(
  new URL("../README.md", import.meta.url),
  "utf8"
);
const agentsText = await fs.readFile(
  new URL("../AGENTS.md", import.meta.url),
  "utf8"
);
const exampleConfigText =
  await fs.readFile(
    new URL(
      "../examples/config.multi.example.json",
      import.meta.url
    ),
    "utf8"
  );
const exampleConfig = JSON.parse(
  exampleConfigText
);

const TESLA_PROFILE_ID =
  "tesla-model3-long-range";
const TOYOTA_PROFILE_ID =
  "toyota-sienna";
const TESLA_URL_ENV =
  "ENCAR_SEARCH_URL_TESLA_MODEL3";
const TOYOTA_URL_ENV =
  "ENCAR_SEARCH_URL_TOYOTA_SIENNA";
const EMPTY_TITLE_FILTER = {
  requiredAll: [],
  requiredAny: [],
  excludedAny: []
};
const ROOT_CONFIG_KEYS = [
  "configVersion",
  "maxPages",
  "notifyPriceIncrease",
  "profiles",
  "requestDelayMs"
];
const RAW_PROFILE_KEYS = [
  "enabled",
  "id",
  "isTesla",
  "name",
  "price",
  "searchUrlEnv",
  "titleFilter"
];
const NORMALIZED_PROFILE_KEYS = [
  "enabled",
  "id",
  "isTesla",
  "name",
  "price",
  "searchUrl",
  "searchUrlSource",
  "titleFilter"
];
const TITLE_FILTER_KEYS = [
  "excludedAny",
  "requiredAll",
  "requiredAny"
];
const GENERIC_PRICE_KEYS = [
  "maxPriceKrw"
];
const TESLA_PRICE_KEYS = [
  "eapMaxPriceKrw",
  "fsdMaxPriceKrw",
  "maxPriceKrw"
];
const COMMON_STATE_RECORD_KEYS = [
  "colorName",
  "colorStatus",
  "contracted",
  "deletedAt",
  "deletionTracked",
  "firstSeenAt",
  "id",
  "lastDetailFetchError",
  "lastDetailFetchFailedAt",
  "lastEvaluatedAt",
  "lastObservedPriceKrw",
  "lastSeenAt",
  "listPriceKrw",
  "mileageKm",
  "monthlyFeeKrw",
  "previousListingId",
  "priceKrw",
  "region",
  "rentalUsageHistory",
  "saleType",
  "telegramMessageId",
  "telegramSentAt",
  "title",
  "totalLossHistory",
  "url",
  "vehicleNo",
  "yearMonth"
];
const TESLA_STATE_RECORD_KEYS = [
  "hasEap",
  "hasFsd",
  "option",
  "optionEvidence",
  "optionSource"
];
const STATE_PRESERVATION_FIELDS = [
  "id",
  "vehicleNo",
  "previousListingId",
  "firstSeenAt",
  "lastSeenAt",
  "lastEvaluatedAt",
  "deletedAt",
  "telegramMessageId",
  "telegramSentAt"
];
const DISABLED_SLOTS = [
  {
    id: "slot-3",
    name: "검색 조건 3",
    searchUrlEnv:
      "ENCAR_SEARCH_URL_3"
  },
  {
    id: "slot-4",
    name: "검색 조건 4",
    searchUrlEnv:
      "ENCAR_SEARCH_URL_4"
  },
  {
    id: "slot-5",
    name: "검색 조건 5",
    searchUrlEnv:
      "ENCAR_SEARCH_URL_5"
  }
];
const EXPECTED_PROFILE_IDS = [
  TESLA_PROFILE_ID,
  TOYOTA_PROFILE_ID,
  ...DISABLED_SLOTS.map(
    (slot) => slot.id
  )
];
// HEAD:data/state.json 정리 전 projection에서 계산했다.
// root updatedAt과 이번 정리 대상 필드는 digest에 포함하지 않는다.
const EXPECTED_STATE_PRESERVATION = {
  "slot-3": {
    listingCount: 0,
    digest:
      "d8a2557ddd383c2d9995c48fb22262fba6dfa3018560eef828035f4d18b5a2b8"
  },
  "slot-4": {
    listingCount: 0,
    digest:
      "e89ecab51061069ad9775ab529c307b53a6f0c51919995b1238b3193db416ac5"
  },
  "slot-5": {
    listingCount: 0,
    digest:
      "f4e6ea56db08f74ba7ddba5bf2eafea92943d8ec262833a8e04e6f637dc2cda2"
  },
  [TESLA_PROFILE_ID]: {
    listingCount: 26,
    digest:
      "7992e709dff98ec7fe05525f35a60f3a4607deeb0a7b85fa05a9df5e3594d57d"
  },
  [TOYOTA_PROFILE_ID]: {
    listingCount: 72,
    digest:
      "889eb33f510c42a1c59b230d6c7067da54450959bc76afe4d9300a22e8ae3c0a"
  }
};

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function assertExactKeys(
  value,
  expected,
  message
) {
  assert.deepEqual(
    sortedKeys(value),
    [...expected].sort(),
    message
  );
}

function createSyntheticSearchUrl(
  label
) {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      action:
        `(And.Synthetic.${label})`,
      toggle: {},
      layer: "",
      sort: "MobileModifiedDate"
    })
  );

  return url.toString();
}

function normalizeRepositoryConfig() {
  return normalizeWatcherConfig(
    rawConfig,
    {
      [TESLA_URL_ENV]:
        createSyntheticSearchUrl(
          "tesla"
        ),
      [TOYOTA_URL_ENV]:
        createSyntheticSearchUrl(
          "toyota"
        )
    }
  );
}

function findProfile(config, id) {
  return config.profiles.find(
    (profile) => profile.id === id
  );
}

function compareText(left, right) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function createProfileStatePreservationProjection(
  profileId,
  profileState
) {
  const profileTimestamps =
    Object.fromEntries(
      [
        "initializedAt",
        "updatedAt"
      ]
        .filter((field) =>
          Object.hasOwn(
            profileState,
            field
          )
        )
        .map((field) => [
          field,
          profileState[field]
        ])
    );
  const listings = Object.entries(
    profileState.listings
  )
    .sort(([left], [right]) =>
      compareText(left, right)
    )
    .map(
      ([
        listingId,
        record
      ]) => ({
        listingId,
        fields: Object.fromEntries(
          STATE_PRESERVATION_FIELDS
            .filter((field) =>
              Object.hasOwn(
                record,
                field
              )
            )
            .map((field) => [
              field,
              record[field]
            ])
        )
      })
    );

  return {
    profileId,
    profileTimestamps,
    listings
  };
}

function createStateContinuityProjection(
  state
) {
  return Object.fromEntries(
    Object.entries(
      state.profiles
    )
      .sort(([left], [right]) =>
        compareText(left, right)
      )
      .map(
      ([profileId, profileState]) => [
        profileId,
        createProfileStatePreservationProjection(
          profileId,
          profileState
        )
      ]
    )
  );
}

function createStatePreservationSummary(
  state
) {
  return Object.fromEntries(
    Object.entries(
      createStateContinuityProjection(
        state
      )
    ).map(
      ([profileId, projection]) => [
        profileId,
        {
          listingCount:
            projection.listings.length,
          digest: createHash("sha256")
            .update(
              JSON.stringify(projection)
            )
            .digest("hex")
        }
      ]
    )
  );
}

function createStateListingIndex(state) {
  return Object.fromEntries(
    Object.entries(
      state.profiles
    )
      .sort(([left], [right]) =>
        compareText(left, right)
      )
      .map(
      ([profileId, profileState]) => [
        profileId,
        Object.keys(
          profileState.listings
        ).sort(compareText)
      ]
    )
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

test("config.json은 정확한 root와 profile 계약 및 5개 운영 슬롯을 사용한다", () => {
  assertExactKeys(
    rawConfig,
    ROOT_CONFIG_KEYS,
    "config root keys"
  );
  assert.equal(rawConfig.configVersion, 2);
  assert.equal(
    rawConfig.notifyPriceIncrease,
    true
  );
  assert.equal(rawConfig.maxPages, 2);
  assert.equal(
    rawConfig.requestDelayMs,
    1500
  );
  assert.deepEqual(
    rawConfig.profiles.map(
      (profile) => profile.id
    ),
    EXPECTED_PROFILE_IDS
  );

  for (const profile of rawConfig.profiles) {
    assertExactKeys(
      profile,
      RAW_PROFILE_KEYS,
      `${profile.id} raw keys`
    );
    assertExactKeys(
      profile.titleFilter,
      TITLE_FILTER_KEYS,
      `${profile.id} titleFilter keys`
    );
    assert.deepEqual(
      profile.titleFilter,
      EMPTY_TITLE_FILTER
    );
    assert.equal(
      typeof profile.isTesla,
      "boolean"
    );
    assert.equal(
      Object.hasOwn(
        profile,
        "searchUrl"
      ),
      false
    );
  }

  assert.deepEqual(
    findProfile(
      rawConfig,
      TESLA_PROFILE_ID
    ),
    {
      id: TESLA_PROFILE_ID,
      name: "Model 3 AWD",
      enabled: true,
      searchUrlEnv: TESLA_URL_ENV,
      isTesla: true,
      titleFilter: EMPTY_TITLE_FILTER,
      price: {
        maxPriceKrw: 35000000,
        eapMaxPriceKrw: 37000000,
        fsdMaxPriceKrw: 40000000
      }
    }
  );
  assert.deepEqual(
    findProfile(
      rawConfig,
      TOYOTA_PROFILE_ID
    ),
    {
      id: TOYOTA_PROFILE_ID,
      name: "도요타 시에나",
      enabled: true,
      searchUrlEnv: TOYOTA_URL_ENV,
      isTesla: false,
      titleFilter: EMPTY_TITLE_FILTER,
      price: {
        maxPriceKrw: 46000000
      }
    }
  );

  for (const slot of DISABLED_SLOTS) {
    assert.deepEqual(
      findProfile(
        rawConfig,
        slot.id
      ),
      {
        ...slot,
        enabled: false,
        isTesla: false,
        titleFilter:
          EMPTY_TITLE_FILTER,
        price: {
          maxPriceKrw: 0
        }
      }
    );
  }

  assert.doesNotMatch(
    configText,
    /https?:\/\//
  );
});

test("정규화 결과는 runtime URL 필드 외에 profile 계약을 확장하지 않는다", () => {
  const normalized =
    normalizeRepositoryConfig();

  assertExactKeys(
    normalized,
    ROOT_CONFIG_KEYS,
    "normalized root keys"
  );
  assert.equal(
    normalized.configVersion,
    rawConfig.configVersion
  );
  assert.equal(
    normalized.notifyPriceIncrease,
    rawConfig.notifyPriceIncrease
  );
  assert.equal(
    normalized.maxPages,
    rawConfig.maxPages
  );
  assert.equal(
    normalized.requestDelayMs,
    rawConfig.requestDelayMs
  );

  for (const profile of normalized.profiles) {
    assertExactKeys(
      profile,
      NORMALIZED_PROFILE_KEYS,
      `${profile.id} normalized keys`
    );
    assertExactKeys(
      profile.titleFilter,
      TITLE_FILTER_KEYS,
      `${profile.id} normalized titleFilter keys`
    );
    assertExactKeys(
      profile.price,
      profile.isTesla
        ? TESLA_PRICE_KEYS
        : GENERIC_PRICE_KEYS,
      `${profile.id} normalized price keys`
    );
  }

  const tesla = findProfile(
    normalized,
    TESLA_PROFILE_ID
  );
  const toyota = findProfile(
    normalized,
    TOYOTA_PROFILE_ID
  );

  assert.equal(
    tesla.searchUrl,
    createSyntheticSearchUrl("tesla")
  );
  assert.equal(
    tesla.searchUrlSource,
    `environment:${TESLA_URL_ENV}`
  );
  assert.equal(tesla.isTesla, true);
  assert.deepEqual(tesla.price, {
    maxPriceKrw: 35000000,
    eapMaxPriceKrw: 37000000,
    fsdMaxPriceKrw: 40000000
  });

  assert.equal(
    toyota.searchUrl,
    createSyntheticSearchUrl("toyota")
  );
  assert.equal(
    toyota.searchUrlSource,
    `environment:${TOYOTA_URL_ENV}`
  );
  assert.equal(toyota.isTesla, false);
  assert.deepEqual(toyota.price, {
    maxPriceKrw: 46000000
  });

  for (const slot of DISABLED_SLOTS) {
    const profile = findProfile(
      normalized,
      slot.id
    );

    assert.equal(profile.enabled, false);
    assert.equal(profile.isTesla, false);
    assert.equal(profile.searchUrl, null);
    assert.equal(
      profile.searchUrlSource,
      `environment:${slot.searchUrlEnv}`
    );
    assert.deepEqual(profile.price, {
      maxPriceKrw: 0
    });
  }
});

test("워크플로는 5개 searchUrlEnv를 Repository Variables로 연결한다", () => {
  const urlEnvironmentNames = [
    TESLA_URL_ENV,
    TOYOTA_URL_ENV,
    ...DISABLED_SLOTS.map(
      (slot) => slot.searchUrlEnv
    )
  ];

  for (
    const environmentName
    of urlEnvironmentNames
  ) {
    assert.match(
      workflowText,
      new RegExp(
        `${environmentName}:\\s*` +
        `\\$\\{\\{\\s*vars\\.` +
        `${environmentName}` +
        `\\s*\\}\\}`
      )
    );
  }

  assert.doesNotMatch(
    workflowText,
    /\bvars\.ENCAR_SEARCH_URL\b/
  );
  assert.doesNotMatch(
    workflowText,
    /^\s*ENCAR_SEARCH_URL:\s*/m
  );
  assert.doesNotMatch(
    workflowText,
    /secrets\.ENCAR_SEARCH_URL_/
  );
  assert.match(
    workflowText,
    /TELEGRAM_BOT_TOKEN:\s*\$\{\{\s*secrets\.TELEGRAM_BOT_TOKEN\s*\}\}/
  );
  assert.match(
    workflowText,
    /TELEGRAM_CHAT_ID:\s*\$\{\{\s*secrets\.TELEGRAM_CHAT_ID\s*\}\}/
  );
  assert.match(
    workflowText,
    /MAX_PAGES:\s*\$\{\{\s*vars\.MAX_PAGES\s*\}\}/
  );
  assert.doesNotMatch(
    workflowText,
    /https?:\/\/[^\s"]*encar\./i
  );
});

test("README, AGENTS, example은 새 profile 및 동작 계약만 설명한다", () => {
  assert.match(
    readmeText,
    /titleFilter[\s\S]{0,180}only internal inclusion and exclusion/
  );
  assert.match(
    readmeText,
    /Price is used only for the condition status shown in Telegram/
  );
  assert.match(
    readmeText,
    /does not suppress new-listing, price-change, or `send_current` output/
  );
  assert.match(
    readmeText,
    /Generic and Tesla profiles share the same collection, state, event, and notification flow/
  );
  assert.match(
    readmeText,
    /when a purchased option is not confirmed, `maxPriceKrw` applies/
  );
  assert.match(
    readmeText,
    /State uses schema version 2 with profile-id namespaces/
  );
  assert.match(
    readmeText,
    /URL 검색 결과에 적용되는 내부 포함·제외 규칙은 `titleFilter/
  );
  assert.match(
    readmeText,
    /신규·가격변동·`send_current` 출력을 막지 않습니다/
  );

  assert.match(
    agentsText,
    /내부에서 건너뛰는 조건은 `titleFilter/
  );
  assert.match(
    agentsText,
    /가격은 목록, 상태 저장, 신규·가격변동 알림, `send_current` 출력 여부에 영향을 주지 않고/
  );
  assert.match(
    agentsText,
    /프로필 설정은 `isTesla`를 사용한다/
  );
  assert.match(
    agentsText,
    /구형 flat\/default 상태를 마이그레이션하지 않는다/
  );

  assertExactKeys(
    exampleConfig,
    ROOT_CONFIG_KEYS,
    "example root keys"
  );
  assert.equal(
    exampleConfig.profiles.length,
    2
  );

  for (
    const profile
    of exampleConfig.profiles
  ) {
    assertExactKeys(
      profile,
      RAW_PROFILE_KEYS,
      `${profile.id} example keys`
    );
    assertExactKeys(
      profile.titleFilter,
      TITLE_FILTER_KEYS,
      `${profile.id} example titleFilter keys`
    );
    assertExactKeys(
      profile.price,
      profile.isTesla
        ? TESLA_PRICE_KEYS
        : GENERIC_PRICE_KEYS,
      `${profile.id} example price keys`
    );
  }

  assert.equal(
    exampleConfig.profiles.filter(
      (profile) => profile.isTesla
    ).length,
    1
  );
  assert.equal(
    exampleConfig.profiles.filter(
      (profile) => !profile.isTesla
    ).length,
    1
  );
  assert.equal(
    exampleConfig.profiles.every(
      (profile) =>
        Object.hasOwn(
          profile,
          "searchUrlEnv"
        ) &&
        !Object.hasOwn(
          profile,
          "searchUrl"
        )
    ),
    true
  );
});

test("data/state.json은 config profile별 current v2 state invariant를 따른다", () => {
  assertExactKeys(
    rawState,
    [
      "profiles",
      "schemaVersion"
    ],
    "state root keys"
  );
  assert.equal(rawState.schemaVersion, 2);
  assert.equal(
    Object.hasOwn(rawState, "listings"),
    false
  );
  assert.equal(
    Object.hasOwn(
      rawState.profiles,
      "default"
    ),
    false
  );
  assert.deepEqual(
    sortedKeys(rawState.profiles),
    [...rawConfig.profiles]
      .map((profile) => profile.id)
      .sort()
  );

  for (
    const profileConfig
    of rawConfig.profiles
  ) {
    const profileId =
      profileConfig.id;
    const profileState =
      rawState.profiles[profileId];
    const listings =
      profileState.listings;
    const hasInitializedAt =
      Object.hasOwn(
        profileState,
        "initializedAt"
      );
    const hasUpdatedAt =
      Object.hasOwn(
        profileState,
        "updatedAt"
      );

    assert.equal(
      sortedKeys(profileState).every(
        (field) =>
          [
            "initializedAt",
            "listings",
            "updatedAt"
          ].includes(field)
      ),
      true,
      `${profileId} current state keys`
    );
    assert.equal(
      typeof listings === "object" &&
        listings !== null &&
        !Array.isArray(listings),
      true,
      `${profileId} listings shape`
    );
    assert.equal(
      hasInitializedAt,
      hasUpdatedAt,
      `${profileId} lifecycle timestamps`
    );

    if (hasInitializedAt) {
      assert.equal(
        isIsoTimestamp(
          profileState.initializedAt
        ),
        true,
        `${profileId} initializedAt`
      );
      assert.equal(
        isIsoTimestamp(
          profileState.updatedAt
        ),
        true,
        `${profileId} updatedAt`
      );
    }

    let listingPosition = 0;

    for (
      const [
        listingId,
        record
      ] of Object.entries(listings)
    ) {
      const recordLabel =
        `${profileId} listing #${listingPosition}`;

      assert.equal(
        typeof record === "object" &&
          record !== null &&
          !Array.isArray(record),
        true,
        `${recordLabel} record shape`
      );
      assert.equal(
        String(record.id) ===
          String(listingId),
        true,
        `${recordLabel} id continuity`
      );
      assert.equal(
        !Object.hasOwn(
          record,
          "vehicleNo"
        ) ||
          (
            record.vehicleNo === null ||
            (
              typeof record.vehicleNo ===
                "string" &&
              record.vehicleNo.trim()
                .length > 0
            )
          ),
        true,
        `${recordLabel} vehicle identity`
      );
      assert.equal(
        !Object.hasOwn(
          record,
          "previousListingId"
        ) ||
          (
            typeof record
              .previousListingId ===
              "string" &&
            record.previousListingId
              .trim().length > 0
          ),
        true,
        `${recordLabel} previous identity`
      );

      for (const field of [
        "firstSeenAt",
        "lastSeenAt",
        "lastEvaluatedAt"
      ]) {
        assert.equal(
          !Object.hasOwn(
            record,
            field
          ) ||
            isIsoTimestamp(
              record[field]
            ),
          true,
          `${recordLabel} optional ${field}`
        );
      }

      if (
        Object.hasOwn(
          record,
          "firstSeenAt"
        ) &&
        Object.hasOwn(
          record,
          "lastSeenAt"
        )
      ) {
        assert.equal(
          Date.parse(
            record.firstSeenAt
          ) <=
            Date.parse(
              record.lastSeenAt
            ),
          true,
          `${recordLabel} observation order`
        );
      }

      if (
        Object.hasOwn(
          record,
          "lastEvaluatedAt"
        ) &&
        Object.hasOwn(
          record,
          "lastSeenAt"
        )
      ) {
        assert.equal(
          Date.parse(
            record.lastEvaluatedAt
          ) <=
            Date.parse(
              record.lastSeenAt
            ),
          true,
          `${recordLabel} evaluation order`
        );
      }

      const allowedRecordKeys =
        new Set([
          ...COMMON_STATE_RECORD_KEYS,
          ...(profileConfig.isTesla
            ? TESLA_STATE_RECORD_KEYS
            : [])
        ]);

      assert.equal(
        Object.keys(record).every(
          (field) =>
            allowedRecordKeys.has(
              field
            )
        ),
        true,
        `${recordLabel} current field set`
      );

      for (const field of [
        "lastDetailFetchFailedAt",
        "deletedAt",
        "telegramSentAt"
      ]) {
        assert.equal(
          !Object.hasOwn(
            record,
            field
          ) ||
            isIsoTimestamp(
              record[field]
            ),
          true,
          `${recordLabel} optional ${field}`
        );
      }

      assert.equal(
        !Object.hasOwn(
          record,
          "lastObservedPriceKrw"
        ) ||
          (
            Number.isFinite(
              record
                .lastObservedPriceKrw
            ) &&
            record
              .lastObservedPriceKrw >=
              0
          ),
        true,
        `${recordLabel} optional lastObservedPriceKrw`
      );
      assert.equal(
        !Object.hasOwn(
          record,
          "lastDetailFetchError"
        ) ||
          typeof record
            .lastDetailFetchError ===
            "string",
        true,
        `${recordLabel} optional lastDetailFetchError`
      );
      assert.equal(
        !Object.hasOwn(
          record,
          "telegramMessageId"
        ) ||
          (
            Number.isSafeInteger(
              record.telegramMessageId
            ) &&
            record.telegramMessageId >
              0
          ),
        true,
        `${recordLabel} optional telegramMessageId`
      );
      assert.equal(
        Object.hasOwn(
          record,
          "telegramMessageId"
        ),
        Object.hasOwn(
          record,
          "telegramSentAt"
        ),
        `${recordLabel} Telegram delivery pair`
      );

      listingPosition += 1;
    }
  }
});

test("current state 정규화는 ID, identity, 관측 및 delivery metadata를 변경하지 않는다", () => {
  const stateBefore =
    structuredClone(rawState);
  const preservationSummary =
    createStatePreservationSummary(
      rawState
    );
  const beforeProjection =
    createStateContinuityProjection(
      rawState
    );
  const beforeListingIndex =
    createStateListingIndex(rawState);
  const beforeListingCounts =
    Object.fromEntries(
      Object.entries(
        beforeListingIndex
      ).map(([profileId, ids]) => [
        profileId,
        ids.length
      ])
    );
  const normalizedState =
    normalizeWatcherState(
      rawState,
      normalizeRepositoryConfig()
    );
  const normalizedPlainState =
    JSON.parse(
      JSON.stringify(normalizedState)
    );
  const afterProjection =
    createStateContinuityProjection(
      normalizedPlainState
    );
  const afterListingIndex =
    createStateListingIndex(
      normalizedPlainState
    );
  const afterListingCounts =
    Object.fromEntries(
      Object.entries(
        afterListingIndex
      ).map(([profileId, ids]) => [
        profileId,
        ids.length
      ])
    );

  assert.deepEqual(
    preservationSummary,
    EXPECTED_STATE_PRESERVATION,
    "one-time cleanup changed preserved state metadata"
  );
  assert.equal(
    JSON.stringify(rawState) ===
      JSON.stringify(stateBefore),
    true,
    "normalizeWatcherState mutated input"
  );
  assert.equal(
    JSON.stringify(
      normalizedPlainState
    ) === JSON.stringify(rawState),
    true,
    "current state changed during normalization"
  );
  assert.equal(
    JSON.stringify(
      afterListingCounts
    ) ===
      JSON.stringify(
        beforeListingCounts
      ),
    true,
    "profile listing counts changed"
  );
  assert.equal(
    JSON.stringify(afterListingIndex) ===
      JSON.stringify(
        beforeListingIndex
      ),
    true,
    "profile listing ID sets changed"
  );
  assert.equal(
    JSON.stringify(afterProjection) ===
      JSON.stringify(
        beforeProjection
      ),
    true,
    "state continuity projection changed"
  );
});
