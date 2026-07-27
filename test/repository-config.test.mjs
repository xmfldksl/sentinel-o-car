import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { normalizeWatcherConfig } from "../src/runtime.mjs";

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
  "titleSource",
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
const ALLOWED_TITLE_SOURCES = new Set([
  "detail-structured",
  "structured-list",
  "title-element",
  "previous-trusted",
  "detail-unresolved",
  "untrusted-card-text"
]);
const SUPPORTED_CONFIG_VERSION = 2;
const ENVIRONMENT_NAME_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*$/;

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

// 활성 프로필의 searchUrlEnv 이름을 config에서 읽어
// 가상 environment를 만든다. 실제 변수 이름은 고정하지 않는다.
function createEnabledProfileEnvironment() {
  const environment = {};

  for (const profile of rawConfig.profiles) {
    if (
      !profile.enabled ||
      !Object.hasOwn(
        profile,
        "searchUrlEnv"
      )
    ) {
      continue;
    }

    environment[profile.searchUrlEnv] =
      createSyntheticSearchUrl(
        profile.searchUrlEnv
      );
  }

  return environment;
}

function normalizeRepositoryConfig(
  environment =
    createEnabledProfileEnvironment()
) {
  return normalizeWatcherConfig(
    rawConfig,
    environment
  );
}

function findProfile(config, id) {
  return config.profiles.find(
    (profile) => profile.id === id
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

// 운영 설정(enabled, name, titleFilter, price, 프로필 개수)은
// config.json에서만 관리한다. 여기서는 계약만 검증한다.
test("config.json은 root와 profile 계약을 따른다", () => {
  assertExactKeys(
    rawConfig,
    ROOT_CONFIG_KEYS,
    "config root keys"
  );
  assert.equal(
    rawConfig.configVersion,
    SUPPORTED_CONFIG_VERSION
  );
  assert.equal(
    typeof rawConfig.notifyPriceIncrease,
    "boolean"
  );
  assert.equal(
    Number.isSafeInteger(
      rawConfig.maxPages
    ) && rawConfig.maxPages > 0,
    true,
    "maxPages"
  );
  assert.equal(
    Number.isSafeInteger(
      rawConfig.requestDelayMs
    ) && rawConfig.requestDelayMs >= 0,
    true,
    "requestDelayMs"
  );
  assert.equal(
    Array.isArray(rawConfig.profiles) &&
      rawConfig.profiles.length > 0,
    true,
    "profiles shape"
  );

  const seenIds = new Set();
  const seenEnvironmentNames = new Set();

  for (const profile of rawConfig.profiles) {
    assertExactKeys(
      profile,
      RAW_PROFILE_KEYS,
      `${profile.id} raw keys`
    );

    const id = profile.id;

    assert.equal(
      typeof id === "string" &&
        id.trim() === id &&
        id.length > 0,
      true,
      `${id} id format`
    );
    assert.notEqual(
      id,
      "default",
      "id must not be default"
    );
    assert.equal(
      seenIds.has(id),
      false,
      `${id} id uniqueness`
    );
    seenIds.add(id);

    assert.equal(
      typeof profile.name === "string" &&
        profile.name.trim().length > 0,
      true,
      `${id} name`
    );
    assert.equal(
      typeof profile.enabled,
      "boolean",
      `${id} enabled`
    );
    assert.equal(
      typeof profile.isTesla,
      "boolean",
      `${id} isTesla`
    );

    assert.equal(
      Object.hasOwn(
        profile,
        "searchUrl"
      ),
      false,
      `${id} must not inline searchUrl`
    );
    assert.match(
      profile.searchUrlEnv,
      ENVIRONMENT_NAME_PATTERN,
      `${id} searchUrlEnv format`
    );
    assert.equal(
      seenEnvironmentNames.has(
        profile.searchUrlEnv
      ),
      false,
      `${id} searchUrlEnv uniqueness`
    );
    seenEnvironmentNames.add(
      profile.searchUrlEnv
    );

    assertExactKeys(
      profile.titleFilter,
      TITLE_FILTER_KEYS,
      `${id} titleFilter keys`
    );

    for (const field of TITLE_FILTER_KEYS) {
      const entries =
        profile.titleFilter[field];

      assert.equal(
        Array.isArray(entries),
        true,
        `${id} titleFilter.${field} shape`
      );
      assert.equal(
        entries.every(
          (entry) =>
            typeof entry === "string" &&
            entry.trim().length > 0
        ),
        true,
        `${id} titleFilter.${field} entries`
      );
    }

    assertExactKeys(
      profile.price,
      profile.isTesla
        ? TESLA_PRICE_KEYS
        : GENERIC_PRICE_KEYS,
      `${id} price keys`
    );
    assert.equal(
      Object.values(profile.price).every(
        (amount) =>
          Number.isSafeInteger(amount) &&
          amount >= 0
      ),
      true,
      `${id} price amounts`
    );
  }

  assert.equal(
    rawConfig.profiles.some(
      (profile) => profile.enabled
    ),
    true,
    "at least one enabled profile"
  );
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

    const source = findProfile(
      rawConfig,
      profile.id
    );

    assert.equal(
      profile.enabled,
      source.enabled,
      `${profile.id} enabled passthrough`
    );
    assert.deepEqual(
      profile.price,
      source.price,
      `${profile.id} price passthrough`
    );
    assert.equal(
      profile.searchUrlSource,
      `environment:${source.searchUrlEnv}`,
      `${profile.id} searchUrlSource`
    );

    // 활성 프로필만 URL 변수를 요구한다.
    // 비활성 프로필은 변수 없이도 정상 처리된다.
    assert.equal(
      profile.searchUrl,
      profile.enabled
        ? createSyntheticSearchUrl(
            source.searchUrlEnv
          )
        : null,
      `${profile.id} searchUrl`
    );
  }
});

// 새 searchUrlEnv를 추가할 때만 워크플로 매핑 수정이 필요하다.
// 이름 목록은 config.json에서 동적으로 읽는다.
test("워크플로는 config의 searchUrlEnv를 Repository Variables로 연결한다", () => {
  const urlEnvironmentNames = [
    ...new Set(
      rawConfig.profiles.map(
        (profile) =>
          profile.searchUrlEnv
      )
    )
  ];

  assert.equal(
    urlEnvironmentNames.length > 0,
    true,
    "searchUrlEnv names"
  );

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
  assert.deepEqual(
    [
      ...workflowText.matchAll(
        /\bvars\.([A-Z0-9_]+)\b/g
      )
    ].map((match) => match[1]).sort(),
    [...urlEnvironmentNames].sort()
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
  assert.equal(
    typeof rawState.profiles ===
      "object" &&
      rawState.profiles !== null &&
      !Array.isArray(
        rawState.profiles
      ),
    true,
    "state profiles shape"
  );

  const configProfilesById = new Map(
    rawConfig.profiles.map(
      (profile) => [profile.id, profile]
    )
  );

  // 빈 profiles는 초기화 직후의 정상 상태이므로
  // 모든 config profile namespace를 요구하지 않는다.
  for (
    const [
      profileId,
      profileState
    ] of Object.entries(
      rawState.profiles
    )
  ) {
    const profileConfig =
      configProfilesById.get(profileId);

    assert.notEqual(
      profileConfig,
      undefined,
      `${profileId} is not a config profile`
    );

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

      assert.equal(
        !Object.hasOwn(
          record,
          "titleSource"
        ) ||
          ALLOWED_TITLE_SOURCES.has(
            record.titleSource
          ),
        true,
        `${recordLabel} optional titleSource`
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
