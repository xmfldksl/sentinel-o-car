import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  processProfile
} from "../src/index.mjs";
import {
  normalizeWatcherConfig,
  normalizeWatcherState
} from "../src/runtime.mjs";

const configText = await fs.readFile(
  new URL("../config.json", import.meta.url),
  "utf8"
);
const rawConfig = JSON.parse(configText);
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
const listHtml = await fs.readFile(
  new URL(
    "./fixtures/list.html",
    import.meta.url
  ),
  "utf8"
);
const detailHtml = await fs.readFile(
  new URL(
    "./fixtures/detail-preloaded.html",
    import.meta.url
  ),
  "utf8"
);

const TESLA_PROFILE_ID =
  "tesla-model3-long-range";
const TOYOTA_PROFILE_ID =
  "toyota-sienna";
const TESLA_URL_ENV =
  "ENCAR_SEARCH_URL_TESLA_MODEL3";
const TOYOTA_URL_ENV =
  "ENCAR_SEARCH_URL_TOYOTA_SIENNA";
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

test("저장소 config는 URL 중심 활성 프로필 2개와 명시형 비활성 슬롯 3개를 둔다", () => {
  const enabledProfiles =
    rawConfig.profiles.filter(
      (profile) => profile.enabled
    );
  const disabledProfiles =
    rawConfig.profiles.filter(
      (profile) => !profile.enabled
    );
  const tesla = rawConfig.profiles.find(
    (profile) =>
      profile.id === TESLA_PROFILE_ID
  );
  const toyota = rawConfig.profiles.find(
    (profile) =>
      profile.id === TOYOTA_PROFILE_ID
  );

  assert.equal(
    rawConfig.profiles.length,
    5
  );
  assert.equal(enabledProfiles.length, 2);
  assert.equal(disabledProfiles.length, 3);
  assert.equal(
    rawConfig.legacyStateProfileId,
    TESLA_PROFILE_ID
  );

  assert.deepEqual(tesla, {
    id: TESLA_PROFILE_ID,
    name: "Model 3 AWD",
    enabled: true,
    searchUrlEnv: TESLA_URL_ENV,
    optionMode: "tesla",
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    price: {
      maxPriceKrw: 35000000,
      teslaOptionLimitsKrw: {
        eap: 37000000,
        fsd: 40000000,
        unknownOptionHardMax:
          40000000
      }
    }
  });

  assert.deepEqual(toyota, {
    id: TOYOTA_PROFILE_ID,
    name: "도요타 시에나",
    enabled: true,
    searchUrlEnv: TOYOTA_URL_ENV,
    optionMode: "generic",
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    price: {
      maxPriceKrw: 46000000
    }
  });

  assert.deepEqual(
    disabledProfiles,
    DISABLED_SLOTS.map(
      ({
        id,
        name,
        searchUrlEnv
      }) => ({
        id,
        name,
        enabled: false,
        searchUrlEnv,
        optionMode: "generic",
        titleFilter: {
          requiredAll: [],
          requiredAny: [],
          excludedAny: []
        }
      })
    )
  );

  assert.equal(
    rawConfig.profiles.every(
      (profile) =>
        !Object.hasOwn(
          profile,
          "searchUrl"
        )
    ),
    true
  );
  assert.equal(
    rawConfig.profiles.every(
      (profile) =>
        !Object.hasOwn(
          profile,
          "rentalHistoryDiscountKrw"
        ) &&
        !Object.hasOwn(
          profile,
          "rentalPenaltyKrw"
        )
    ),
    true
  );
  assert.equal(
    [
      tesla,
      toyota
    ].every(
      (profile) =>
        !Object.hasOwn(
          profile,
          "yearMonthMin"
        ) &&
        !Object.hasOwn(
          profile,
          "yearMonthMax"
        ) &&
        !Object.hasOwn(
          profile,
          "maxMileageKm"
        ) &&
        !Object.hasOwn(
          profile,
          "excludedColors"
        )
    ),
    true
  );
  assert.doesNotMatch(
    configText,
    /https?:\/\//
  );
});

test("활성 프로필 URL만 제공해도 비활성 슬롯을 포함해 정상 정규화한다", () => {
  const teslaUrl =
    createSyntheticSearchUrl(
      "tesla"
    );
  const toyotaUrl =
    createSyntheticSearchUrl(
      "toyota"
    );
  const normalized =
    normalizeWatcherConfig(
      rawConfig,
      {
        [TESLA_URL_ENV]: teslaUrl,
        [TOYOTA_URL_ENV]:
          toyotaUrl
      }
    );
  const profilesById =
    Object.fromEntries(
      normalized.profiles.map(
        (profile) => [
          profile.id,
          profile
        ]
      )
    );

  assert.equal(
    normalized.profiles.length,
    5
  );
  assert.equal(
    profilesById[TESLA_PROFILE_ID]
      .searchUrl,
    teslaUrl
  );
  assert.equal(
    profilesById[TESLA_PROFILE_ID]
      .searchUrlSource,
    `environment:${TESLA_URL_ENV}`
  );
  assert.equal(
    profilesById[TOYOTA_PROFILE_ID]
      .searchUrl,
    toyotaUrl
  );
  assert.equal(
    profilesById[TOYOTA_PROFILE_ID]
      .searchUrlSource,
    `environment:${TOYOTA_URL_ENV}`
  );

  for (const slot of DISABLED_SLOTS) {
    const profile =
      profilesById[slot.id];

    assert.equal(profile.enabled, false);
    assert.equal(profile.searchUrl, null);
    assert.equal(
      profile.searchUrlSource,
      `environment:${slot.searchUrlEnv}`
    );
    assert.equal(
      profile.optionMode,
      "generic"
    );
    assert.deepEqual(profile.price, {
      maxPriceKrw:
        Number.MAX_SAFE_INTEGER
    });
    assert.equal(
      profile.rentalPenaltyKrw,
      0
    );
  }
});

test("구형 상태는 Tesla에만 승계되고 신규 Toyota 기준점은 빈 상태에서 시작한다", () => {
  const normalizedConfig =
    normalizeWatcherConfig(
      rawConfig,
      {
        [TESLA_URL_ENV]:
          createSyntheticSearchUrl(
            "tesla-state"
          ),
        [TOYOTA_URL_ENV]:
          createSyntheticSearchUrl(
            "toyota-state"
          )
      }
    );
  const initializedAt =
    "2026-07-22T00:00:00.000Z";
  const normalizedState =
    normalizeWatcherState(
      {
        initializedAt,
        listings: {
          "existing-tesla-listing": {
            id:
              "existing-tesla-listing",
            title:
              "기존 Tesla 매물",
            priceKrw: 32000000,
            adjustedPriceKrw:
              32000000,
            firstSeenAt:
              initializedAt,
            lastSeenAt:
              initializedAt,
            previousListingId:
              "previous-tesla-listing",
            deletedAt:
              "2026-07-22T01:00:00.000Z",
            telegramMessageId:
              12345
          }
        }
      },
      normalizedConfig
    );

  assert.equal(
    normalizedState
      .legacyStateMigratedToProfileId,
    TESLA_PROFILE_ID
  );
  assert.equal(
    normalizedState.profiles[
      TESLA_PROFILE_ID
    ].initializedAt,
    initializedAt
  );
  assert.deepEqual(
    Object.keys(
      normalizedState.profiles[
        TESLA_PROFILE_ID
      ].listings
    ),
    ["existing-tesla-listing"]
  );

  const teslaListing =
    normalizedState.profiles[
      TESLA_PROFILE_ID
    ].listings[
      "existing-tesla-listing"
    ];

  assert.equal(
    teslaListing.priceKrw,
    32000000
  );
  assert.equal(
    teslaListing.previousListingId,
    "previous-tesla-listing"
  );
  assert.equal(
    teslaListing.deletedAt,
    "2026-07-22T01:00:00.000Z"
  );
  assert.equal(
    teslaListing.telegramMessageId,
    12345
  );
  assert.deepEqual(
    normalizedState.profiles[
      TOYOTA_PROFILE_ID
    ],
    { listings: {} }
  );

  for (const slot of DISABLED_SLOTS) {
    assert.deepEqual(
      normalizedState.profiles[
        slot.id
      ],
      { listings: {} }
    );
  }
});

test("신규 Toyota 프로필의 첫 정상 실행은 신규 이벤트 없이 기준점만 만든다", async () => {
  const normalizedConfig =
    normalizeWatcherConfig(
      rawConfig,
      {
        [TESLA_URL_ENV]:
          createSyntheticSearchUrl(
            "tesla-baseline"
          ),
        [TOYOTA_URL_ENV]:
          createSyntheticSearchUrl(
            "toyota-baseline"
          )
      }
    );
  const toyota =
    normalizedConfig.profiles.find(
      (profile) =>
        profile.id ===
        TOYOTA_PROFILE_ID
    );
  const now =
    "2026-07-23T00:00:00.000Z";
  const result =
    await processProfile({
      profile: {
        ...toyota,
        maxPages: 1,
        requestDelayMs: 0
      },
      profileState: {
        listings: {}
      },
      runMode: "normal",
      fetchTextImpl: async (url) =>
        String(url).includes(
          "/cars/detail/"
        )
          ? detailHtml
          : listHtml,
      sleepImpl: async () => {},
      nowIso: () => now
    });

  assert.equal(
    result.initializedNow,
    true
  );
  assert.deepEqual(
    result.events,
    []
  );
  assert.ok(
    result.listingCount > 0
  );
  assert.equal(
    result.state.initializedAt,
    now
  );
});

test("워크플로는 5개 검색 URL을 Repository Variables로 연결한다", () => {
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
  assert.doesNotMatch(
    workflowText,
    /https?:\/\/[^\s"]*encar\./i
  );
});

test("README는 URL 중심 설정, 5개 슬롯, 입력값과 렌트 감가 미사용을 설명한다", () => {
  assert.match(
    readmeText,
    /Settings → Secrets and variables → Actions → Variables/
  );
  assert.match(
    readmeText,
    /현재 형식: `https:\/\/car\.encar\.com\/list\/car\?\.\.\.`/
  );
  assert.match(
    readmeText,
    /기존 형식: `https:\/\/www\.encar\.com\/fc\/fc_carsearchlist\.do\?\.\.\.#!\.\.\.`/
  );
  assert.match(
    readmeText,
    /비활성 프로필은 `searchUrlEnv` 이름만 유지하고 대응하는 Repository Variable을 만들지 않아도 됩니다/
  );
  assert.match(
    readmeText,
    /## 5개 프로필 자리/
  );
  assert.match(
    readmeText,
    /6번째 이후 프로필을 추가할 때/
  );
  assert.match(
    readmeText,
    /"searchUrlEnv": "ENCAR_SEARCH_URL_3"/
  );
  assert.match(
    readmeText,
    /`optionMode`: 선택값입니다\. `generic` 또는 `tesla`만 허용/
  );
  assert.match(
    readmeText,
    /판매자: 개인, 딜러, 브랜드 인증 판매/
  );
  assert.match(
    readmeText,
    /판매방식: 일반, 리스, 운용리스, 금융리스, 렌트, 렌트승계/
  );
  assert.match(
    readmeText,
    /과거 렌트 용도 이력에 따른 감가와 별도 표시는 사용하지 않습니다/
  );
  assert.match(
    readmeText,
    /`rentalHistoryDiscountKrw`와 `rentalPenaltyKrw`는 새 설정에 추가하지 마십시오/
  );
});
