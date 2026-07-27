import {
  createTelegramMessageRequest,
  sleep
} from "./lib.mjs";
import {
  normalizeEncarSearchUrl
} from "./search-url.mjs";

const SUPPORTED_CONFIG_VERSION = 2;
const STATE_SCHEMA_VERSION = 2;
const TESLA_OPTION_EVENT_FIELDS = [
  "option",
  "hasFsd",
  "hasEap",
  "optionSource",
  "optionEvidence"
];

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

function requireExactKeys(
  source,
  path,
  {
    required,
    allowed = required
  }
) {
  const allowedKeys = new Set(allowed);
  const unknownKeys = Object.keys(
    source
  ).filter(
    (key) => !allowedKeys.has(key)
  );

  if (unknownKeys.length > 0) {
    throw new Error(
      `${path} contains unknown field ${unknownKeys[0]}`
    );
  }

  for (const key of required) {
    if (!hasOwn(source, key)) {
      throw new Error(
        `${path}.${key} is required`
      );
    }
  }
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

function requireIsoTimestampString(
  value,
  path
) {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      normalized
    );
  let hasValidParts = false;

  if (match) {
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
    const isLeapYear =
      year % 4 === 0 &&
      (
        year % 100 !== 0 ||
        year % 400 === 0
      );
    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
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
    const offsetHour =
      offsetHourText === undefined
        ? 0
        : Number(offsetHourText);
    const offsetMinute =
      offsetMinuteText === undefined
        ? 0
        : Number(offsetMinuteText);

    hasValidParts =
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= daysInMonth[month - 1] &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59 &&
      offsetHour <= 23 &&
      offsetMinute <= 59;
  }

  if (
    !normalized ||
    normalized !== value ||
    !hasValidParts ||
    !Number.isFinite(
      Date.parse(normalized)
    )
  ) {
    throw new Error(
      `${path} must be a valid ISO timestamp string`
    );
  }

  return normalized;
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
    normalize = (item) => item.trim(),
    rejectEmpty = false
  } = {}
) {
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
  if (!isPlainObject(source.titleFilter)) {
    throw new Error(
      `${path}.titleFilter must be an object`
    );
  }

  requireExactKeys(
    source.titleFilter,
    `${path}.titleFilter`,
    {
      required: [
        "requiredAll",
        "requiredAny",
        "excludedAny"
      ]
    }
  );

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

function normalizeProfileSearchUrl(
  source,
  environment,
  path,
  enabled
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
      searchUrl: normalizeEncarSearchUrl(
        requireNonEmptyString(
          source.searchUrl,
          `${path}.searchUrl`
        )
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
    if (!enabled) {
      return {
        searchUrl: null,
        searchUrlSource:
          `environment:${environmentName}`
      };
    }

    throw new Error(
      `${path}.searchUrlEnv references missing environment variable ${environmentName}`
    );
  }

  return {
    searchUrl: normalizeEncarSearchUrl(
      environmentValue.trim()
    ),
    searchUrlSource:
      `environment:${environmentName}`
  };
}

function normalizePrice(
  source,
  isTesla,
  path
) {
  const pricePath = `${path}.price`;
  const priceSource = source.price;

  if (!isPlainObject(priceSource)) {
    throw new Error(
      `${pricePath} must be an object`
    );
  }

  const requiredKeys = isTesla
    ? [
        "maxPriceKrw",
        "eapMaxPriceKrw",
        "fsdMaxPriceKrw"
      ]
    : ["maxPriceKrw"];

  requireExactKeys(
    priceSource,
    pricePath,
    {
      required: requiredKeys
    }
  );

  return {
    maxPriceKrw:
      requireNonNegativeInteger(
        priceSource.maxPriceKrw,
        `${pricePath}.maxPriceKrw`
      ),
    ...(isTesla
      ? {
          eapMaxPriceKrw:
            requireNonNegativeInteger(
              priceSource.eapMaxPriceKrw,
              `${pricePath}.eapMaxPriceKrw`
            ),
          fsdMaxPriceKrw:
            requireNonNegativeInteger(
              priceSource.fsdMaxPriceKrw,
              `${pricePath}.fsdMaxPriceKrw`
            )
        }
      : {})
  };
}

function normalizeProfile(
  source,
  index,
  environment
) {
  const basePath = `profiles[${index}]`;

  requireExactKeys(
    source,
    basePath,
    {
      required: [
        "id",
        "name",
        "enabled",
        "isTesla",
        "titleFilter",
        "price"
      ],
      allowed: [
        "id",
        "name",
        "enabled",
        "searchUrl",
        "searchUrlEnv",
        "isTesla",
        "titleFilter",
        "price"
      ]
    }
  );

  const id = requireNonEmptyString(
    source.id,
    `${basePath}.id`
  );

  if (id === "default") {
    throw new Error(
      `${basePath}.id must not be "default"`
    );
  }

  const path = `${basePath} (${id})`;
  const name = requireNonEmptyString(
    source.name,
    `${path}.name`
  );
  const enabled = requireBoolean(
    source.enabled,
    `${path}.enabled`
  );
  const isTesla = requireBoolean(
    source.isTesla,
    `${path}.isTesla`
  );
  const search = normalizeProfileSearchUrl(
    source,
    environment,
    path,
    enabled
  );
  const titleFilter =
    normalizeTitleFilter(
      source,
      path
    );
  const price = normalizePrice(
    source,
    isTesla,
    path
  );

  return {
    id,
    name,
    enabled,
    ...search,
    isTesla,
    titleFilter,
    price
  };
}

export function normalizeWatcherConfig(
  rawConfig,
  environment = process.env
) {
  if (!isPlainObject(rawConfig)) {
    throw new Error(
      "config must be an object"
    );
  }

  requireExactKeys(
    rawConfig,
    "config",
    {
      required: [
        "configVersion",
        "notifyPriceIncrease",
        "maxPages",
        "requestDelayMs",
        "profiles"
      ]
    }
  );

  if (
    rawConfig.configVersion !==
    SUPPORTED_CONFIG_VERSION
  ) {
    throw new Error(
      `configVersion must be ${SUPPORTED_CONFIG_VERSION}`
    );
  }

  const notifyPriceIncrease =
    requireBoolean(
      rawConfig.notifyPriceIncrease,
      "config.notifyPriceIncrease"
    );
  const configuredMaxPages =
    requirePositiveInteger(
      rawConfig.maxPages,
      "config.maxPages"
    );
  const requestDelayMs =
    requireNonNegativeInteger(
      rawConfig.requestDelayMs,
      "config.requestDelayMs"
    );
  const maxPagesOverride =
    environment?.MAX_PAGES;
  const maxPages =
    typeof maxPagesOverride ===
        "string" &&
      maxPagesOverride.trim()
      ? requirePositiveInteger(
          Number(
            maxPagesOverride
          ),
          "environment.MAX_PAGES"
        )
      : configuredMaxPages;

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
          environment
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

  return {
    configVersion:
      SUPPORTED_CONFIG_VERSION,
    notifyPriceIncrease,
    maxPages,
    requestDelayMs,
    profiles
  };
}

function createEmptyProfileState() {
  return {
    listings: {}
  };
}

function normalizeProfileState(
  value,
  path
) {
  if (!isPlainObject(value)) {
    throw new Error(
      `${path} must be an object`
    );
  }

  requireExactKeys(
    value,
    path,
    {
      required: ["listings"],
      allowed: [
        "listings",
        "initializedAt",
        "updatedAt"
      ]
    }
  );

  if (!isPlainObject(value.listings)) {
    throw new Error(
      `${path}.listings must be an object`
    );
  }

  for (const field of [
    "initializedAt",
    "updatedAt"
  ]) {
    if (hasOwn(value, field)) {
      requireIsoTimestampString(
        value[field],
        `${path}.${field}`
      );
    }
  }

  for (
    const [listingId, record] of
    Object.entries(value.listings)
  ) {
    if (!isPlainObject(record)) {
      throw new Error(
        `${path}.listings.${listingId} must be an object`
      );
    }
  }

  return structuredClone(value);
}

function collectConfiguredProfileIds(
  normalizedConfig
) {
  const configuredIds = new Set();

  for (
    const [index, profile] of
    normalizedConfig.profiles.entries()
  ) {
    if (!isPlainObject(profile)) {
      throw new Error(
        `normalizedConfig.profiles[${index}] must be an object`
      );
    }

    const profileId =
      requireNonEmptyString(
        profile.id,
        `normalizedConfig.profiles[${index}].id`
      );

    if (profileId === "default") {
      throw new Error(
        `normalizedConfig.profiles[${index}].id must not be "default"`
      );
    }

    if (configuredIds.has(profileId)) {
      throw new Error(
        `normalizedConfig.profiles[${index}].id must be unique`
      );
    }

    configuredIds.add(profileId);
  }

  return configuredIds;
}

function rejectDefaultState(state) {
  if (hasOwn(state.profiles, "default")) {
    throw new Error(
      "state.profiles.default is not supported"
    );
  }
}

function normalizeStateProfiles(
  state,
  configuredProfileIds
) {
  const profiles =
    Object.create(null);

  for (
    const [profileId, profileState] of
    Object.entries(state.profiles)
  ) {
    profiles[profileId] =
      normalizeProfileState(
        profileState,
        `state.profiles.${profileId}`
      );
  }

  for (
    const profileId of
    configuredProfileIds
  ) {
    if (!hasOwn(profiles, profileId)) {
      profiles[profileId] =
        createEmptyProfileState();
    }
  }

  return profiles;
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

  const configuredProfileIds =
    collectConfiguredProfileIds(
      normalizedConfig
    );

  if (!isPlainObject(rawState)) {
    throw new Error(
      "state must be an object"
    );
  }

  requireExactKeys(
    rawState,
    "state",
    {
      required: [
        "schemaVersion",
        "profiles"
      ],
      allowed: [
        "schemaVersion",
        "profiles"
      ]
    }
  );

  if (
    rawState.schemaVersion !==
    STATE_SCHEMA_VERSION
  ) {
    throw new Error(
      `state.schemaVersion must be ${STATE_SCHEMA_VERSION}`
    );
  }

  if (!isPlainObject(rawState.profiles)) {
    throw new Error(
      "state.profiles must be an object"
    );
  }

  rejectDefaultState(rawState);

  return {
    schemaVersion:
      STATE_SCHEMA_VERSION,
    profiles: normalizeStateProfiles(
      rawState,
      configuredProfileIds
    )
  };
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
  return String(
    event?.kind ?? "unknown"
  )
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
  return event?.previousPriceKrw ?? null;
}

function getNewPrice(event) {
  return event?.newPriceKrw ?? null;
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
          ...target
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

  return event?.profile?.isTesla === true;
}

const MERGE_KEY_SEPARATOR =
  "\u0000";

const RELISTED_PRICE_CHANGES = new Set([
  "increase",
  "decrease",
  "unchanged",
  "unknown"
]);

function normalizeMergePrice(value) {
  return Number.isFinite(value)
    ? value
    : null;
}

function getRelistedMergeSignature(
  event
) {
  if (
    normalizeEventKind(event) !==
    "relisted"
  ) {
    return null;
  }

  const relistedPriceChange =
    event?.relistedPriceChange;

  return JSON.stringify({
    relistedPriceChange:
      RELISTED_PRICE_CHANGES.has(
        relistedPriceChange
      )
        ? relistedPriceChange
        : "unknown",
    previousPriceKrw:
      normalizeMergePrice(
        event?.previousPriceKrw
      ),
    currentPriceKrw:
      normalizeMergePrice(
        event?.currentPriceKrw
      )
  });
}

function getConditionMergeSignature(
  event
) {
  const conditionStatus =
    event?.listing?.conditionStatus;
  const rawReasons =
    event?.listing?.conditionReasons;
  const conditionReasons =
    Array.isArray(rawReasons)
      ? rawReasons.map((reason) =>
          String(reason).trim()
        )
      : [];

  if (
    (
      typeof conditionStatus !==
        "string" ||
      !conditionStatus.trim()
    ) &&
    conditionReasons.length === 0
  ) {
    return null;
  }

  const isTesla =
    eventShowsTeslaOption(event);
  const rawOption =
    event?.listing?.option;

  return JSON.stringify({
    conditionStatus:
      typeof conditionStatus ===
        "string"
        ? conditionStatus.trim()
        : null,
    conditionReasons,
    isTesla,
    option:
      isTesla &&
      typeof rawOption === "string"
        ? rawOption.trim()
        : null
  });
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
    TESLA_OPTION_EVENT_FIELDS
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

    const relistedSignature =
      getRelistedMergeSignature(
        rawEvent
      );

    if (relistedSignature !== null) {
      key = `${key}${MERGE_KEY_SEPARATOR}relisted:${relistedSignature}`;
    }

    const conditionSignature =
      getConditionMergeSignature(
        rawEvent
      );

    if (conditionSignature !== null) {
      key = `${key}\u0000condition:${conditionSignature}`;
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
