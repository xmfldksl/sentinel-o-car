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

test("저장소 config는 기존 Tesla 조건을 유지하고 Toyota 프로필을 추가한다", () => {
  const enabledProfiles =
    rawConfig.profiles.filter(
      (profile) => profile.enabled
    );
  const tesla = rawConfig.profiles.find(
    (profile) =>
      profile.id === TESLA_PROFILE_ID
  );
  const toyota = rawConfig.profiles.find(
    (profile) =>
      profile.id === TOYOTA_PROFILE_ID
  );

  assert.equal(enabledProfiles.length, 2);
  assert.equal(
    rawConfig.legacyStateProfileId,
    TESLA_PROFILE_ID
  );
  assert.deepEqual(tesla, {
    id: TESLA_PROFILE_ID,
    name: "Model 3 롱레인지",
    enabled: true,
    searchUrlEnv: TESLA_URL_ENV,
    optionMode: "tesla",
    titleFilter: {
      requiredAll: [
        "모델 3",
        "롱 레인지",
        "AWD"
      ],
      requiredAny: [],
      excludedAny: []
    },
    yearMonthMin: "2022-05",
    yearMonthMax: "2022-12",
    maxMileageKm: 150000,
    excludedColors: [
      "빨간색",
      "적색",
      "레드",
      "red multi-coat",
      "ultra red"
    ],
    excludeContractPending: true,
    price: {
      maxPriceKrw: 35000000,
      teslaOptionLimitsKrw: {
        eap: 37000000,
        fsd: 40000000,
        unknownOptionHardMax:
          40000000
      }
    },
    rentalHistoryDiscountKrw:
      3000000
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
    yearMonthMin: "2021-04",
    yearMonthMax: "9999-12",
    maxMileageKm: 150000,
    excludedColors: [],
    excludeContractPending: true,
    price: {
      maxPriceKrw: 46000000
    },
    rentalHistoryDiscountKrw:
      5000000
  });
  assert.doesNotMatch(
    configText,
    /https?:\/\//
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
});

test("Tesla와 Toyota URL 환경변수는 각 프로필에 독립적으로 정규화된다", () => {
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

test("워크플로는 두 검색 URL을 Repository Variables로 각각 연결한다", () => {
  assert.match(
    workflowText,
    /ENCAR_SEARCH_URL_TESLA_MODEL3:\s*\$\{\{\s*vars\.ENCAR_SEARCH_URL_TESLA_MODEL3\s*\}\}/
  );
  assert.match(
    workflowText,
    /ENCAR_SEARCH_URL_TOYOTA_SIENNA:\s*\$\{\{\s*vars\.ENCAR_SEARCH_URL_TOYOTA_SIENNA\s*\}\}/
  );
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
