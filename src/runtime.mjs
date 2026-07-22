import {
  createTelegramMessageRequest,
  migrateLegacyState,
  resolveSearchUrl,
  sleep
} from "./lib.mjs";

const SUPPORTED_CONFIG_VERSION = 2;
const STATE_SCHEMA_VERSION = 2;
const LEGACY_STATE_MIGRATION_FIELD =
  "legacyStateMigratedToProfileId";
const DEFAULT_MAX_PAGES = 1;
const DEFAULT_REQUEST_DELAY_MS = 1500;
const UNBOUNDED_YEAR_MONTH_MIN = "0000-01";
const UNBOUNDED_YEAR_MONTH_MAX = "9999-12";

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(
    object,
    key
  );
}

function requireNonEmptyString(value, path) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${path} must be a non-empty string`
    );
  }

  return value.trim();
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") {
    throw new Error(
      `${path} must be a boolean`
    );
  }

  return value;
}

function requireNonNegativeInteger(
  value,
  path
) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${path} must be a non-negative integer`
    );
  }

  return value;
}

function requirePositiveInteger(
  value,
  path
) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${path} must be a positive integer`
    );
  }

  return value;
}

function normalizeComparableText(value) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeStringArray(
  value,
  path,
  {
    defaultValue = [],
    normalize = (item) => item.trim(),
    rejectEmpty = false
  } = {}
) {
  if (value === undefined) {
    return [...defaultValue];
  }

  if (!Array.isArray(value)) {
    throw new Error(
      `${path} must be an array of strings`
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(
        `${path}[${index}] must be a string`
      );
    }

    const normalized = normalize(item);

    if (
      rejectEmpty &&
      !normalized
    ) {
      throw new Error(
        `${path}[${index}] must be a non-empty string`
      );
    }

    return normalized;
  });
}

function normalizeTitleFilter(
  source,
  path
) {
  if (hasOwn(source, "titleFilter")) {
    if (!isPlainObject(source.titleFilter)) {
      throw new Error(
        `${path}.titleFilter must be an object`
      );
    }

    return {
      requiredAll: normalizeStringArray(
        source.titleFilter.requiredAll,
        `${path}.titleFilter.requiredAll`,
        {
          normalize:
            normalizeComparableText,
          rejectEmpty: true
        }
      ),
      requiredAny: normalizeStringArray(
        source.titleFilter.requiredAny,
        `${path}.titleFilter.requiredAny`,
        {
          normalize:
            normalizeComparableText,
          rejectEmpty: true
        }
      ),
      excludedAny: normalizeStringArray(
        source.titleFilter.excludedAny,
        `${path}.titleFilter.excludedAny`,
        {
          normalize:
            normalizeComparableText,
          rejectEmpty: true
        }
      )
    };
  }

  return {
    requiredAll: normalizeStringArray(
      source.requiredTitleTerms,
      `${path}.requiredTitleTerms`,
      {
        normalize:
          normalizeComparableText,
        rejectEmpty: true
      }
    ),
    requiredAny: [],
    excludedAny: []
  };
}

function normalizeYearMonth(value, path) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(
      value
    )
  ) {
    throw new Error(
      `${path} must use YYYY-MM`
    );
  }

  return value;
}

function normalizeYearRange(source, path) {
  const hasMinYear = hasOwn(
    source,
    "minYear"
  );
  const hasMaxYear = hasOwn(
    source,
    "maxYear"
  );

  if (hasMinYear || hasMaxYear) {
    if (!hasMinYear || !hasMaxYear) {
      throw new Error(
        `${path}.minYear and ${path}.maxYear must be provided together`
      );
    }

    const minYear =
      requireNonNegativeInteger(
        source.minYear,
        `${path}.minYear`
      );
    const maxYear =
      requireNonNegativeInteger(
        source.maxYear,
        `${path}.maxYear`
      );

    if (minYear > maxYear) {
      throw new Error(
        `${path}.minYear must not be greater than ${path}.maxYear`
      );
    }

    if (minYear > 9999 || maxYear > 9999) {
      throw new Error(
        `${path}.minYear and ${path}.maxYear must not exceed 9999`
      );
    }

    return {
      yearMonthMin: `${String(
        minYear
      ).padStart(4, "0")}-01`,
      yearMonthMax: `${String(
        maxYear
      ).padStart(4, "0")}-12`
    };
  }

  const hasYearMonthMin = hasOwn(
    source,
    "yearMonthMin"
  );
  const hasYearMonthMax = hasOwn(
    source,
    "yearMonthMax"
  );

  if (
    hasYearMonthMin ||
    hasYearMonthMax
  ) {
    if (
      !hasYearMonthMin ||
      !hasYearMonthMax
    ) {
      throw new Error(
        `${path}.yearMonthMin and ${path}.yearMonthMax must be provided together`
      );
    }

    const yearMonthMin =
      normalizeYearMonth(
        source.yearMonthMin,
        `${path}.yearMonthMin`
      );
    const yearMonthMax =
      normalizeYearMonth(
        source.yearMonthMax,
        `${path}.yearMonthMax`
      );

    if (yearMonthMin > yearMonthMax) {
      throw new Error(
        `${path}.yearMonthMin must not be greater than ${path}.yearMonthMax`
      );
    }

    return {
      yearMonthMin,
      yearMonthMax
    };
  }

  return {
    yearMonthMin:
      UNBOUNDED_YEAR_MONTH_MIN,
    yearMonthMax:
      UNBOUNDED_YEAR_MONTH_MAX
  };
}

function normalizeHttpUrl(value, path) {
  const rawUrl =
    requireNonEmptyString(value, path);

  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      `${path} must be a valid HTTP or HTTPS URL`
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      `${path} must be a valid HTTP or HTTPS URL`
    );
  }

  return url.toString();
}

function normalizeProfileSearchUrl(
  source,
  environment,
  path
) {
  const hasSearchUrl = hasOwn(
    source,
    "searchUrl"
  );
  const hasSearchUrlEnv = hasOwn(
    source,
    "searchUrlEnv"
  );

  if (hasSearchUrl === hasSearchUrlEnv) {
    throw new Error(
      `${path} must define exactly one of searchUrl or searchUrlEnv`
    );
  }

  if (hasSearchUrl) {
    return {
      searchUrl: normalizeHttpUrl(
        source.searchUrl,
        `${path}.searchUrl`
      ),
      searchUrlSource: "config"
    };
  }

  const environmentName =
    requireNonEmptyString(
      source.searchUrlEnv,
      `${path}.searchUrlEnv`
    );
  const environmentValue =
    environment?.[environmentName];

  if (
    typeof environmentValue !==
      "string" ||
    !environmentValue.trim()
  ) {
    throw new Error(
      `${path}.searchUrlEnv references missing environment variable ${environmentName}`
    );
  }

  return {
    searchUrl: normalizeHttpUrl(
      environmentValue.trim(),
      `${path}.searchUrlEnv (${environmentName})`
    ),
    searchUrlSource:
      `environment:${environmentName}`
  };
}

function normalizeOptionMode(
  value,
  path,
  defaultValue
) {
  const optionMode =
    value === undefined
      ? defaultValue
      : value;

  if (
    optionMode !== "generic" &&
    optionMode !== "tesla"
  ) {
    throw new Error(
      `${path} must be generic or tesla`
    );
  }

  return optionMode;
}

function normalizePrice(
  source,
  optionMode,
  path,
  warn
) {
  const hasNewPrice = hasOwn(
    source,
    "price"
  );
  const priceSource = hasNewPrice
    ? source.price
    : source.priceLimitsKrw;
  const pricePath = hasNewPrice
    ? `${path}.price`
    : `${path}.priceLimitsKrw`;

  if (!isPlainObject(priceSource)) {
    throw new Error(
      `${pricePath} must be an object`
    );
  }

  const maxPriceKrw =
    requireNonNegativeInteger(
      hasNewPrice
        ? priceSource.maxPriceKrw
        : priceSource.base,
      hasNewPrice
        ? `${pricePath}.maxPriceKrw`
        : `${pricePath}.base`
    );

  if (optionMode === "generic") {
    const hasIgnoredLimits = hasNewPrice
      ? hasOwn(
          priceSource,
          "teslaOptionLimitsKrw"
        )
      : [
          "eap",
          "fsd",
          "unknownOptionHardMax"
        ].some((key) =>
          hasOwn(priceSource, key)
        );

    if (hasIgnoredLimits) {
      warn(
        `${pricePath}.teslaOptionLimitsKrw is ignored because ${path}.optionMode is generic`
      );
    }

    return {
      maxPriceKrw
    };
  }

  const optionLimits = hasNewPrice
    ? priceSource.teslaOptionLimitsKrw
    : priceSource;

  const limitsPath = hasNewPrice
    ? `${pricePath}.teslaOptionLimitsKrw`
    : pricePath;

  if (!isPlainObject(optionLimits)) {
    throw new Error(
      `${limitsPath} must be an object in tesla mode`
    );
  }

  return {
    maxPriceKrw,
    teslaOptionLimitsKrw: {
      eap: requireNonNegativeInteger(
        optionLimits.eap,
        `${limitsPath}.eap`
      ),
      fsd: requireNonNegativeInteger(
        optionLimits.fsd,
        `${limitsPath}.fsd`
      ),
      unknownOptionHardMax:
        requireNonNegativeInteger(
          optionLimits.unknownOptionHardMax,
          `${limitsPath}.unknownOptionHardMax`
        )
    }
  };
}

function resolveAliasedValue(
  source,
  preferredKey,
  legacyKey,
  fallback
) {
  if (hasOwn(source, preferredKey)) {
    return source[preferredKey];
  }

  if (hasOwn(source, legacyKey)) {
    return source[legacyKey];
  }

  return fallback;
}

function normalizeRuntimeInteger(
  profile,
  rootConfig,
  environment,
  key,
  defaultValue,
  path,
  { positive = false } = {}
) {
  let value;

  if (hasOwn(profile, key)) {
    if (positive) {
      requirePositiveInteger(
        profile[key],
        path
      );
    } else {
      requireNonNegativeInteger(
        profile[key],
        path
      );
    }
  }

  if (
    key === "maxPages" &&
    typeof environment?.MAX_PAGES ===
      "string" &&
    environment.MAX_PAGES.trim()
  ) {
    value = Number(
      environment.MAX_PAGES
    );
  } else if (hasOwn(profile, key)) {
    value = profile[key];
  } else if (hasOwn(rootConfig, key)) {
    value = rootConfig[key];
  } else {
    value = defaultValue;
  }

  return positive
    ? requirePositiveInteger(value, path)
    : requireNonNegativeInteger(
        value,
        path
      );
}

function normalizeProfile(
  source,
  index,
  rootConfig,
  environment,
  warn,
  { legacy = false } = {}
) {
  const basePath = legacy
    ? "config"
    : `profiles[${index}]`;
  const id = legacy
    ? "default"
    : requireNonEmptyString(
        source.id,
        `${basePath}.id`
      );
  const path = legacy
    ? basePath
    : `${basePath} (${id})`;
  const name = legacy
    ? "Default"
    : requireNonEmptyString(
        source.name,
        `${path}.name`
      );
  const enabled = legacy
    ? true
    : requireBoolean(
        source.enabled,
        `${path}.enabled`
      );

  const search = legacy
    ? (() => {
        const resolved =
          resolveSearchUrl(
            environment
          );

        return {
          searchUrl: resolved.url,
          searchUrlSource:
            resolved.source
        };
      })()
    : normalizeProfileSearchUrl(
        source,
        environment,
        path
      );

  const legacyOptionMode =
    source.vehicleProfile
      ?.optionMode;
  const optionMode =
    normalizeOptionMode(
      hasOwn(source, "optionMode")
        ? source.optionMode
        : legacyOptionMode,
      `${path}.optionMode`,
      legacy ? "tesla" : undefined
    );
  const titleFilter =
    normalizeTitleFilter(
      source,
      path
    );
  const yearRange =
    normalizeYearRange(
      source,
      path
    );
  const maxMileageKm =
    requireNonNegativeInteger(
      hasOwn(source, "maxMileageKm")
        ? source.maxMileageKm
        : Number.MAX_SAFE_INTEGER,
      `${path}.maxMileageKm`
    );
  const excludedColorTerms =
    normalizeStringArray(
      resolveAliasedValue(
        source,
        "excludedColors",
        "excludedColorTerms",
        []
      ),
      `${path}.${
        hasOwn(source, "excludedColors")
          ? "excludedColors"
          : "excludedColorTerms"
      }`,
      {
        normalize: (item) =>
          item
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase(),
        rejectEmpty: true
      }
    );
  const excludeContracted =
    requireBoolean(
      resolveAliasedValue(
        source,
        "excludeContractPending",
        "excludeContracted",
        true
      ),
      `${path}.${
        hasOwn(
          source,
          "excludeContractPending"
        )
          ? "excludeContractPending"
          : "excludeContracted"
      }`
    );
  const price = normalizePrice(
    source,
    optionMode,
    path,
    warn
  );
  const rentalPenaltyKrw =
    requireNonNegativeInteger(
      resolveAliasedValue(
        source,
        "rentalHistoryDiscountKrw",
        "rentalPenaltyKrw",
        0
      ),
      `${path}.${
        hasOwn(
          source,
          "rentalHistoryDiscountKrw"
        )
          ? "rentalHistoryDiscountKrw"
          : "rentalPenaltyKrw"
      }`
    );
  const notifyPriceIncrease =
    requireBoolean(
      hasOwn(
        source,
        "notifyPriceIncrease"
      )
        ? source.notifyPriceIncrease
        : hasOwn(
              rootConfig,
              "notifyPriceIncrease"
            )
          ? rootConfig.notifyPriceIncrease
          : false,
      `${path}.notifyPriceIncrease`
    );
  const maxPages =
    normalizeRuntimeInteger(
      source,
      rootConfig,
      environment,
      "maxPages",
      DEFAULT_MAX_PAGES,
      `${path}.maxPages`,
      { positive: true }
    );
  const requestDelayMs =
    normalizeRuntimeInteger(
      source,
      rootConfig,
      environment,
      "requestDelayMs",
      DEFAULT_REQUEST_DELAY_MS,
      `${path}.requestDelayMs`
    );

  return {
    id,
    name,
    enabled,
    ...search,
    optionMode,
    titleFilter,
    ...yearRange,
    maxMileageKm,
    excludedColorTerms,
    excludeContracted,
    price,
    rentalPenaltyKrw,
    notifyPriceIncrease,
    maxPages,
    requestDelayMs
  };
}

export function normalizeWatcherConfig(
  rawConfig,
  environment = process.env,
  { warn = () => {} } = {}
) {
  if (!isPlainObject(rawConfig)) {
    throw new Error(
      "config must be an object"
    );
  }

  if (
    hasOwn(rawConfig, "configVersion") &&
    rawConfig.configVersion !==
      SUPPORTED_CONFIG_VERSION
  ) {
    throw new Error(
      `configVersion must be ${SUPPORTED_CONFIG_VERSION}`
    );
  }

  if (typeof warn !== "function") {
    throw new Error(
      "warn must be a function"
    );
  }

  const hasProfiles = hasOwn(
    rawConfig,
    "profiles"
  );

  if (hasOwn(rawConfig, "maxPages")) {
    requirePositiveInteger(
      rawConfig.maxPages,
      "config.maxPages"
    );
  }

  if (
    hasOwn(
      rawConfig,
      "requestDelayMs"
    )
  ) {
    requireNonNegativeInteger(
      rawConfig.requestDelayMs,
      "config.requestDelayMs"
    );
  }

  if (
    hasOwn(
      rawConfig,
      "notifyPriceIncrease"
    )
  ) {
    requireBoolean(
      rawConfig.notifyPriceIncrease,
      "config.notifyPriceIncrease"
    );
  }

  if (!hasProfiles) {
    if (hasOwn(rawConfig, "configVersion")) {
      throw new Error(
        "profiles must be a non-empty array when configVersion is present"
      );
    }

    return {
      configVersion:
        SUPPORTED_CONFIG_VERSION,
      legacyConfig: true,
      legacyStateProfileId:
        "default",
      profiles: [
        normalizeProfile(
          rawConfig,
          0,
          rawConfig,
          environment,
          warn,
          { legacy: true }
        )
      ]
    };
  }

  if (
    !Array.isArray(rawConfig.profiles) ||
    rawConfig.profiles.length === 0
  ) {
    throw new Error(
      "profiles must be a non-empty array"
    );
  }

  const profiles =
    rawConfig.profiles.map(
      (profile, index) => {
        if (!isPlainObject(profile)) {
          throw new Error(
            `profiles[${index}] must be an object`
          );
        }

        return normalizeProfile(
          profile,
          index,
          rawConfig,
          environment,
          warn
        );
      }
    );
  const seenIds = new Set();

  for (
    const [index, profile] of
    profiles.entries()
  ) {
    if (seenIds.has(profile.id)) {
      throw new Error(
        `profiles[${index}] (${profile.id}).id must be unique`
      );
    }

    seenIds.add(profile.id);
  }

  if (
    !profiles.some(
      (profile) => profile.enabled
    )
  ) {
    throw new Error(
      "at least one profile must be enabled"
    );
  }

  let legacyStateProfileId = null;

  if (
    hasOwn(
      rawConfig,
      "legacyStateProfileId"
    )
  ) {
    legacyStateProfileId =
      requireNonEmptyString(
        rawConfig.legacyStateProfileId,
        "legacyStateProfileId"
      );

    if (!seenIds.has(legacyStateProfileId)) {
      throw new Error(
        "legacyStateProfileId must match a configured profile id"
      );
    }
  }

  return {
    configVersion:
      SUPPORTED_CONFIG_VERSION,
    legacyConfig: false,
    legacyStateProfileId,
    profiles
  };
}

function createEmptyProfileState() {
  return {
    listings: {}
  };
}

function normalizeProfileState(value) {
  if (!isPlainObject(value)) {
    return createEmptyProfileState();
  }

  const cloned = structuredClone(value);

  if (!isPlainObject(cloned.listings)) {
    return {
      ...cloned,
      listings: {}
    };
  }

  return cloned;
}

function normalizeLegacyProfileState(value) {
  return normalizeProfileState(
    migrateLegacyState(value)
  );
}

function hasMeaningfulLegacyState(state) {
  if (!isPlainObject(state)) {
    return false;
  }

  if (
    isPlainObject(state.listings) &&
    Object.keys(state.listings).length >
      0
  ) {
    return true;
  }

  return [
    state.initializedAt,
    state.updatedAt
  ].some(
    (value) =>
      typeof value === "string" &&
      value.trim()
  );
}

export function normalizeWatcherState(
  rawState,
  normalizedConfig
) {
  if (!isPlainObject(normalizedConfig)) {
    throw new Error(
      "normalizedConfig must be an object"
    );
  }

  if (
    !Array.isArray(
      normalizedConfig.profiles
    )
  ) {
    throw new Error(
      "normalizedConfig.profiles must be an array"
    );
  }

  const state = isPlainObject(rawState)
    ? rawState
    : {};

  if (
    hasOwn(state, "schemaVersion") &&
    state.schemaVersion !==
      STATE_SCHEMA_VERSION
  ) {
    throw new Error(
      `state.schemaVersion must be ${STATE_SCHEMA_VERSION}`
    );
  }

  const isVersionTwoState =
    state.schemaVersion ===
      STATE_SCHEMA_VERSION &&
    isPlainObject(state.profiles);

  if (isVersionTwoState) {
    const profiles =
      Object.create(null);

    for (
      const [profileId, profileState] of
      Object.entries(state.profiles)
    ) {
      profiles[profileId] =
        normalizeProfileState(
          profileState
        );
    }

    const legacyStateProfileId =
      normalizedConfig.legacyConfig
        ? null
        : normalizedConfig
            .legacyStateProfileId;
    let completedLegacyStateProfileId =
      typeof state[
        LEGACY_STATE_MIGRATION_FIELD
      ] === "string" &&
      state[
        LEGACY_STATE_MIGRATION_FIELD
      ].trim()
        ? state[
            LEGACY_STATE_MIGRATION_FIELD
          ].trim()
        : null;

    if (
      legacyStateProfileId &&
      legacyStateProfileId !== "default" &&
      !completedLegacyStateProfileId
    ) {
      const hasDefaultState = hasOwn(
        profiles,
        "default"
      );
      const legacyDefaultState =
        hasDefaultState
          ? profiles.default
          : null;
      const targetState = hasOwn(
        profiles,
        legacyStateProfileId
      )
        ? profiles[legacyStateProfileId]
        : null;
      const legacyDefaultMeaningful =
        hasMeaningfulLegacyState(
          legacyDefaultState
        );
      const targetMeaningful =
        hasMeaningfulLegacyState(
          targetState
        );

      if (
        legacyDefaultMeaningful &&
        targetMeaningful
      ) {
        throw new Error(
          `state.profiles.default and state.profiles.${legacyStateProfileId} both contain state; refusing legacy state move`
        );
      }

      if (legacyDefaultMeaningful) {
        profiles[legacyStateProfileId] =
          legacyDefaultState;
      }

      if (
        hasDefaultState &&
        !normalizedConfig.profiles.some(
          (profile) =>
            profile.id === "default"
        )
      ) {
        delete profiles.default;
      } else if (
        hasDefaultState &&
        legacyDefaultMeaningful
      ) {
        delete profiles.default;
      }

      completedLegacyStateProfileId =
        legacyStateProfileId;
    }

    for (
      const profile of
      normalizedConfig.profiles
    ) {
      if (!hasOwn(profiles, profile.id)) {
        profiles[profile.id] =
          createEmptyProfileState();
      }
    }

    const normalizedState = {
      ...state,
      schemaVersion:
        STATE_SCHEMA_VERSION,
      profiles
    };

    if (completedLegacyStateProfileId) {
      normalizedState[
        LEGACY_STATE_MIGRATION_FIELD
      ] = completedLegacyStateProfileId;
    }

    return normalizedState;
  }

  const meaningful =
    hasMeaningfulLegacyState(state);
  let targetProfileId = null;

  if (normalizedConfig.legacyConfig) {
    targetProfileId = "default";
  } else if (
    normalizedConfig
      .legacyStateProfileId
  ) {
    targetProfileId =
      normalizedConfig
        .legacyStateProfileId;
  } else if (
    normalizedConfig.profiles.length ===
      1
  ) {
    targetProfileId =
      normalizedConfig.profiles[0].id;
  } else if (meaningful) {
    throw new Error(
      "legacy state requires legacyStateProfileId when multiple profiles are configured"
    );
  }

  const profiles = Object.create(null);

  for (
    const profile of
    normalizedConfig.profiles
  ) {
    profiles[profile.id] =
      profile.id === targetProfileId &&
      meaningful
        ? normalizeLegacyProfileState(
            state
          )
        : createEmptyProfileState();
  }

  const normalizedState = {
    schemaVersion:
      STATE_SCHEMA_VERSION,
    profiles
  };

  if (
    normalizedConfig
      .legacyStateProfileId &&
    normalizedConfig
      .legacyStateProfileId !== "default"
  ) {
    normalizedState[
      LEGACY_STATE_MIGRATION_FIELD
    ] = normalizedConfig
      .legacyStateProfileId;
  }

  return normalizedState;
}

export async function runProfilesSequentially(
  profiles,
  handler,
  { onError = () => {} } = {}
) {
  if (!Array.isArray(profiles)) {
    throw new Error(
      "profiles must be an array"
    );
  }

  if (typeof handler !== "function") {
    throw new Error(
      "handler must be a function"
    );
  }

  if (typeof onError !== "function") {
    throw new Error(
      "onError must be a function"
    );
  }

  const results = [];
  const profileFailures = [];

  for (const profile of profiles) {
    if (!profile?.enabled) {
      continue;
    }

    try {
      results.push(
        await handler(profile)
      );
    } catch (error) {
      const failure = {
        profile,
        profileId: profile.id,
        profileName: profile.name,
        error
      };

      profileFailures.push(failure);
      onError(error, profile);
    }
  }

  if (
    results.length === 0 &&
    profileFailures.length > 0
  ) {
    const aggregate =
      new AggregateError(
        profileFailures.map(
          (failure) => failure.error
        ),
        "All enabled profiles failed"
      );

    aggregate.profileFailures =
      profileFailures;
    throw aggregate;
  }

  return {
    results,
    profileFailures
  };
}

function normalizeEventKind(event) {
  const rawKind =
    event?.kind ??
    event?.eventKind ??
    event?.type;

  if (rawKind === "신규") {
    return "new";
  }

  if (
    rawKind === "현재 검색 결과"
  ) {
    return "current";
  }

  if (
    rawKind === "deleted" ||
    rawKind === "매물삭제"
  ) {
    return "deleted";
  }

  if (
    typeof rawKind === "string" &&
    rawKind.startsWith("가격 인하")
  ) {
    return "price-decrease";
  }

  if (
    typeof rawKind === "string" &&
    rawKind.startsWith("가격 인상")
  ) {
    return "price-increase";
  }

  return String(rawKind ?? "unknown")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
}

function isPriceEvent(kind) {
  return kind.startsWith("price");
}

function getListingId(event) {
  const value =
    event?.listingId ??
    event?.stateListingId ??
    event?.listing?.id;

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  return String(value);
}

function getPreviousPrice(event) {
  return (
    event?.previousPriceKrw ??
    event?.oldPriceKrw ??
    event?.priceChange
      ?.previousPriceKrw ??
    event?.previous?.priceKrw ??
    null
  );
}

function getNewPrice(event) {
  return (
    event?.newPriceKrw ??
    event?.currentPriceKrw ??
    event?.priceChange?.newPriceKrw ??
    event?.listing?.priceKrw ??
    null
  );
}

function collectProfileNames(event) {
  const values = [];

  if (Array.isArray(event?.profileNames)) {
    values.push(...event.profileNames);
  }

  if (event?.profileName) {
    values.push(event.profileName);
  }

  if (event?.profile?.name) {
    values.push(event.profile.name);
  }

  if (Array.isArray(event?.profiles)) {
    for (const profile of event.profiles) {
      values.push(
        typeof profile === "string"
          ? profile
          : profile?.name
      );
    }
  }

  return [
    ...new Set(
      values
        .filter(
          (value) =>
            typeof value ===
              "string" &&
            value.trim()
        )
        .map((value) =>
          value.trim()
        )
    )
  ];
}

function collectStateTargets(event) {
  const targets = Array.isArray(
    event?.stateTargets
  )
    ? event.stateTargets
        .filter(isPlainObject)
        .map((target) => ({
          ...target,
          ...(target.stateListingId ===
            undefined &&
          target.listingId !== undefined
            ? {
                stateListingId: String(
                  target.listingId
                )
              }
            : {})
        }))
    : [];
  const profileId =
    event?.profileId ??
    event?.profile?.id;
  const stateListingId =
    event?.stateListingId ??
    event?.listingId ??
    event?.listing?.id;

  if (
    profileId !== undefined &&
    profileId !== null &&
    stateListingId !== undefined &&
    stateListingId !== null
  ) {
    targets.push({
      profileId: String(profileId),
      stateListingId:
        String(stateListingId)
    });
  }

  const seen = new Set();

  return targets.filter((target) => {
    const key = `${String(
      target.profileId ?? ""
    )}\u0000${String(
      target.stateListingId ?? ""
    )}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function eventShowsTeslaOption(event) {
  if (event?.showTeslaOption) {
    return true;
  }

  if (
    event?.optionMode === "tesla" ||
    event?.profile?.optionMode ===
      "tesla"
  ) {
    return true;
  }

  if (
    Array.isArray(event?.profiles) &&
    event.profiles.some(
      (profile) =>
        profile?.optionMode ===
        "tesla"
    )
  ) {
    return true;
  }

  return (
    Array.isArray(event?.optionModes) &&
    event.optionModes.includes("tesla")
  );
}

function parseIsoTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/
  );

  if (!match) {
    return null;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(
    offsetHourText ?? 0
  );
  const offsetMinute = Number(
    offsetMinuteText ?? 0
  );
  const leapYear =
    year % 4 === 0 &&
    (year % 100 !== 0 ||
      year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function observedAtValue(event) {
  const values =
    normalizeEventKind(event) === "deleted"
      ? [
          event?.listing
            ?.lastEvaluatedAt,
          event?.listing?.lastSeenAt,
          event?.listing?.updatedAt,
          event?.listing?.firstSeenAt,
          event?.observedAt
        ]
      : [
          event?.observedAt,
          event?.listing
            ?.lastEvaluatedAt,
          event?.listing?.lastSeenAt
        ];

  for (const value of values) {
    const parsed = parseIsoTimestamp(
      value
    );

    if (parsed !== null) {
      return parsed;
    }
  }

  return Number.NEGATIVE_INFINITY;
}

function populatedFieldCount(value) {
  if (!isPlainObject(value)) {
    return 0;
  }

  return Object.values(value).filter(
    (field) => {
      if (
        field === undefined ||
        field === null ||
        field === ""
      ) {
        return false;
      }

      if (Array.isArray(field)) {
        return field.length > 0;
      }

      return true;
    }
  ).length;
}

function isBetterEventRepresentative(
  candidate,
  current
) {
  const candidateDetail = Boolean(
    candidate.detailSucceeded ??
      candidate.listing
        ?.detailSucceeded
  );
  const currentDetail = Boolean(
    current.detailSucceeded ??
      current.listing
        ?.detailSucceeded
  );

  if (candidateDetail !== currentDetail) {
    return candidateDetail;
  }

  const candidateObservedAt =
    observedAtValue(candidate);
  const currentObservedAt =
    observedAtValue(current);

  if (
    candidateObservedAt !==
    currentObservedAt
  ) {
    return (
      candidateObservedAt >
      currentObservedAt
    );
  }

  return (
    populatedFieldCount(
      candidate.listing
    ) >
    populatedFieldCount(
      current.listing
    )
  );
}

const TESLA_OPTION_STATE_FIELDS = [
  "option",
  "hasFsd",
  "hasEap",
  "optionSource",
  "optionEvidence"
];

const TESLA_OPTION_CONTRIBUTOR =
  Symbol("teslaOptionContributor");

function getTeslaOptionContributor(event) {
  return (
    event?.[TESLA_OPTION_CONTRIBUTOR] ??
    (eventShowsTeslaOption(event)
      ? event
      : null)
  );
}

function getConfirmedTeslaOption(event) {
  const option = event?.listing?.option;

  return option === "FSD" || option === "EAP"
    ? option
    : null;
}

function selectTeslaOptionEvent(
  left,
  right
) {
  const leftContributor =
    getTeslaOptionContributor(left);
  const rightContributor =
    getTeslaOptionContributor(right);

  if (!leftContributor) {
    return rightContributor;
  }

  if (!rightContributor) {
    return leftContributor;
  }

  return isBetterEventRepresentative(
    rightContributor,
    leftContributor
  )
    ? rightContributor
    : leftContributor;
}

function mergeTeslaOptionFields(
  representativeListing,
  optionEvent
) {
  if (!optionEvent) {
    return representativeListing;
  }

  const listing = {
    ...representativeListing
  };

  for (
    const field of
    TESLA_OPTION_STATE_FIELDS
  ) {
    delete listing[field];

    if (
      hasOwn(
        optionEvent.listing ?? {},
        field
      )
    ) {
      listing[field] =
        optionEvent.listing[field];
    }
  }

  return listing;
}

function mergeUniqueStrings(left, right) {
  return [
    ...new Set([
      ...left,
      ...right
    ])
  ];
}

function mergeStateTargets(left, right) {
  const targets = [];
  const seen = new Set();

  for (const target of [
    ...left,
    ...right
  ]) {
    const key = `${String(
      target.profileId ?? ""
    )}\u0000${String(
      target.stateListingId ?? ""
    )}`;

    if (!seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  }

  return targets;
}

function normalizeEventEnvelope(
  event,
  kind,
  listingId
) {
  const normalized = {
    ...event,
    kind,
    listingId,
    profileNames:
      collectProfileNames(event),
    stateTargets:
      collectStateTargets(event),
    showTeslaOption:
      eventShowsTeslaOption(event)
  };

  if (normalized.showTeslaOption) {
    normalized[TESLA_OPTION_CONTRIBUTOR] =
      event;
  }

  if (isPriceEvent(kind)) {
    normalized.previousPriceKrw =
      getPreviousPrice(event);
    normalized.newPriceKrw =
      getNewPrice(event);
  }

  return normalized;
}

export function mergeProfileEvents(
  events,
  { warn = () => {} } = {}
) {
  if (!Array.isArray(events)) {
    throw new Error(
      "events must be an array"
    );
  }

  if (typeof warn !== "function") {
    throw new Error(
      "warn must be a function"
    );
  }

  const groups = new Map();
  const priceSignaturesByBaseKey =
    new Map();
  const warnedPriceConflicts =
    new Set();
  const warnedListingPriceConflicts =
    new Set();
  const warnedTeslaOptionConflicts =
    new Set();

  for (
    const [index, rawEvent] of
    events.entries()
  ) {
    if (!isPlainObject(rawEvent)) {
      throw new Error(
        `events[${index}] must be an object`
      );
    }

    const kind =
      normalizeEventKind(rawEvent);
    const listingId =
      getListingId(rawEvent);
    const baseKey = `${kind}\u0000${
      listingId ?? `missing:${index}`
    }`;
    let key = baseKey;

    if (
      isPriceEvent(kind) &&
      listingId
    ) {
      const previousPrice =
        getPreviousPrice(rawEvent);
      const newPrice =
        getNewPrice(rawEvent);
      const signature = `${String(
        previousPrice
      )}\u0000${String(newPrice)}`;
      const signatures =
        priceSignaturesByBaseKey.get(
          baseKey
        ) ?? new Set();

      if (
        signatures.size > 0 &&
        !signatures.has(signature) &&
        !warnedPriceConflicts.has(
          baseKey
        )
      ) {
        warn(
          `Conflicting price-change events for listing ${listingId} were kept separate.`
        );
        warnedPriceConflicts.add(
          baseKey
        );
      }

      signatures.add(signature);
      priceSignaturesByBaseKey.set(
        baseKey,
        signatures
      );
      key = `${baseKey}\u0000${signature}`;
    }

    const event = normalizeEventEnvelope(
      rawEvent,
      kind,
      listingId
    );
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, event);
      continue;
    }

    const existingPrice =
      existing.listing?.priceKrw;
    const incomingPrice =
      event.listing?.priceKrw;

    if (
      Number.isFinite(existingPrice) &&
      Number.isFinite(incomingPrice) &&
      existingPrice !== incomingPrice &&
      !warnedListingPriceConflicts.has(
        key
      )
    ) {
      warn(
        `Conflicting listing prices for listing ${listingId} were resolved using the representative priority.`
      );
      warnedListingPriceConflicts.add(
        key
      );
    }

    const representative =
      isBetterEventRepresentative(
        event,
        existing
      )
        ? event
        : existing;

    const showTeslaOption =
      existing.showTeslaOption ||
      event.showTeslaOption;
    const existingTeslaContributor =
      getTeslaOptionContributor(
        existing
      );
    const incomingTeslaContributor =
      getTeslaOptionContributor(event);
    const existingConfirmedOption =
      getConfirmedTeslaOption(
        existingTeslaContributor
      );
    const incomingConfirmedOption =
      getConfirmedTeslaOption(
        incomingTeslaContributor
      );

    if (
      existingConfirmedOption &&
      incomingConfirmedOption &&
      existingConfirmedOption !==
        incomingConfirmedOption &&
      !warnedTeslaOptionConflicts.has(key)
    ) {
      warn(
        "Conflicting confirmed Tesla option results were resolved using representative priority."
      );
      warnedTeslaOptionConflicts.add(key);
    }

    const teslaOptionContributor =
      showTeslaOption
        ? selectTeslaOptionEvent(
            existing,
            event
          )
        : null;

    const merged = {
      ...representative,
      listing: showTeslaOption
        ? mergeTeslaOptionFields(
            representative.listing,
            teslaOptionContributor
          )
        : representative.listing,
      profileNames:
        mergeUniqueStrings(
          existing.profileNames,
          event.profileNames
        ),
      stateTargets:
        mergeStateTargets(
          existing.stateTargets,
          event.stateTargets
        ),
      showTeslaOption
    };

    if (teslaOptionContributor) {
      merged[TESLA_OPTION_CONTRIBUTOR] =
        teslaOptionContributor;
    }

    groups.set(key, merged);
  }

  return [...groups.values()];
}

export function createTelegramSender({
  token,
  chatId,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  now = Date.now,
  logger = console,
  minIntervalMs = 1100,
  maxAttempts = 5
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "fetchImpl must be a function"
    );
  }

  if (typeof sleepImpl !== "function") {
    throw new Error(
      "sleepImpl must be a function"
    );
  }

  if (typeof now !== "function") {
    throw new Error(
      "now must be a function"
    );
  }

  requireNonNegativeInteger(
    minIntervalMs,
    "minIntervalMs"
  );
  requirePositiveInteger(
    maxAttempts,
    "maxAttempts"
  );

  let lastTelegramSentAt = null;
  let sendQueue = Promise.resolve();

  async function waitForPacing() {
    if (lastTelegramSentAt === null) {
      return;
    }

    const elapsed =
      now() - lastTelegramSentAt;
    const delay = Math.max(
      0,
      minIntervalMs - elapsed
    );

    if (delay > 0) {
      await sleepImpl(delay);
    }
  }

  async function sendInternal(text) {
    if (!token || !chatId) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 필요합니다."
      );
    }

    if (typeof text !== "string") {
      throw new Error(
        "텔레그램 메시지는 문자열이어야 합니다."
      );
    }

    if (text.length > 4096) {
      throw new Error(
        "텔레그램 메시지가 4096자를 초과했습니다."
      );
    }

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      await waitForPacing();

      const response = await fetchImpl(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json"
          },
          body: JSON.stringify(
            createTelegramMessageRequest(
              chatId,
              text
            )
          )
        }
      );

      let result;
      let responseJsonFailed = false;

      try {
        result = await response.json();
      } catch {
        responseJsonFailed = true;
      }

      if (
        responseJsonFailed &&
        response.status !== 429
      ) {
        throw new Error(
          `텔레그램 응답 해석 실패: HTTP ${response.status}`
        );
      }

      if (
        response.ok &&
        result?.ok
      ) {
        lastTelegramSentAt = now();
        return result.result;
      }

      const rateLimited =
        response.status === 429 ||
        result?.error_code === 429;
      const retryAfterValue = Number(
        result?.parameters
          ?.retry_after
      );
      const retryAfterSeconds =
        Number.isFinite(
          retryAfterValue
        ) && retryAfterValue > 0
          ? retryAfterValue
          : 5;

      if (
        rateLimited &&
        attempt < maxAttempts
      ) {
        logger?.warn?.(
          "Telegram rate limited. " +
            `${retryAfterSeconds}초 후 재시도합니다. ` +
            `시도 ${attempt}/${maxAttempts}`
        );

        await sleepImpl(
          (retryAfterSeconds + 1) *
            1000
        );
        continue;
      }

      throw new Error(
        `텔레그램 전송 실패: ${JSON.stringify(
          result
        )}`
      );
    }

    throw new Error(
      "텔레그램 전송 재시도 횟수를 초과했습니다."
    );
  }

  function send(text) {
    const request = sendQueue.then(
      () => sendInternal(text)
    );

    sendQueue = request.catch(
      () => undefined
    );
    return request;
  }

  return {
    send
  };
}
