import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  normalizeEncarSearchUrl
} from "./search-url.mjs";

export {
  normalizeEncarSearchUrl
};

export const DEFAULT_SEARCH_URL =
  "https://car.encar.com/list/car?page=1&search=%7B%22type%22%3A%22car%22%2C%22action%22%3A%22%28And.Hidden.N._.MultiView2Hidden.N._.MultiViewHidden.N._.%28C.CarType.N._.%28C.Manufacturer.%ED%85%8C%EC%8A%AC%EB%9D%BC._.%28C.ModelGroup.%EB%AA%A8%EB%8D%B8+3._.Model.%EB%AA%A8%EB%8D%B8+3.%29%29%29%29%22%2C%22toggle%22%3A%7B%7D%2C%22layer%22%3A%22%22%2C%22sort%22%3A%22MobileModifiedDate%22%7D";

function singleLine(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveVehicleConfig(config) {
  if (Array.isArray(config?.profiles)) {
    return (
      config.profiles.find(
        (profile) =>
          profile?.enabled !== false
      ) ??
      config.profiles[0] ??
      config
    );
  }

  return config;
}

function getOptionMode(config) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  return vehicleConfig?.optionMode ===
    "generic"
    ? "generic"
    : "tesla";
}

function normalizeFilterText(value) {
  return singleLine(value).toLowerCase();
}

function normalizeFilterTerms(
  values
) {
  return Array.isArray(values)
    ? values.map(normalizeFilterText)
    : [];
}

function resolveTitleFilter(config) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  if (
    vehicleConfig?.titleFilter &&
    typeof vehicleConfig.titleFilter ===
      "object" &&
    !Array.isArray(
      vehicleConfig.titleFilter
    )
  ) {
    return {
      requiredAll:
        normalizeFilterTerms(
          vehicleConfig.titleFilter
            .requiredAll
        ),
      requiredAny:
        normalizeFilterTerms(
          vehicleConfig.titleFilter
            .requiredAny
        ),
      excludedAny:
        normalizeFilterTerms(
          vehicleConfig.titleFilter
            .excludedAny
        )
    };
  }

  return {
    requiredAll:
      normalizeFilterTerms(
        vehicleConfig
          ?.requiredTitleTerms
      ),
    requiredAny: [],
    excludedAny: []
  };
}

function matchesTitleFilter(
  title,
  config
) {
  const normalizedTitle =
    normalizeFilterText(title);

  const {
    requiredAll,
    requiredAny,
    excludedAny
  } = resolveTitleFilter(config);

  return (
    requiredAll.every((term) =>
      normalizedTitle.includes(term)
    ) &&
    (
      requiredAny.length === 0 ||
      requiredAny.some((term) =>
        normalizedTitle.includes(term)
      )
    ) &&
    !excludedAny.some((term) =>
      normalizedTitle.includes(term)
    )
  );
}

function resolveYearMonthBounds(
  config
) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  const yearMonthMin =
    vehicleConfig?.yearMonthMin ??
    (
      Number.isInteger(
        vehicleConfig?.minYear
      )
        ? `${vehicleConfig.minYear}-01`
        : null
    );

  const yearMonthMax =
    vehicleConfig?.yearMonthMax ??
    (
      Number.isInteger(
        vehicleConfig?.maxYear
      )
        ? `${vehicleConfig.maxYear}-12`
        : null
    );

  return {
    yearMonthMin,
    yearMonthMax
  };
}

export function createSearchUrlFingerprint(urlString) {
  return createHash("sha256")
    .update(urlString, "utf8")
    .digest("hex")
    .slice(0, 12);
}

export function resolveSearchUrl(
  environment = process.env
) {
  const configuredUrl =
    environment.ENCAR_SEARCH_URL;

  const hasConfiguredUrl =
    typeof configuredUrl === "string" &&
    configuredUrl.trim().length > 0;

  if (
    environment.GITHUB_ACTIONS ===
      "true" &&
    !hasConfiguredUrl
  ) {
    throw new Error(
      "GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다."
    );
  }

  const source = hasConfiguredUrl
    ? "repository variable"
    : "default";

  return {
    source,
    url: normalizeEncarSearchUrl(
      hasConfiguredUrl
        ? configuredUrl.trim()
        : DEFAULT_SEARCH_URL
    )
  };
}

const HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "]
]);

function decodeHtml(value) {
  return value
    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCodePoint(Number(n))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCodePoint(
          Number.parseInt(n, 16)
        )
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) =>
        HTML_ENTITIES.get(
          name.toLowerCase()
        ) ?? match
    );
}

function stripHtml(value) {
  return decodeHtml(
    String(value)
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVehicleNo(
  value
) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[\s-]+/g, "");

  return /^\d{2,3}[가-힣]\d{4}$/u.test(
    normalized
  )
    ? normalized
    : null;
}

function normalizeListingId(value) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value);
  }

  if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    return value.trim();
  }

  return null;
}

function parsePreloadedState(html) {
  if (typeof html !== "string") {
    return null;
  }

  const match = html.match(
    /<script\b[^>]*>\s*__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/i
  );

  if (!match) {
    return null;
  }

  try {
    const json = match[1]
      .trim()
      .replace(/;\s*$/, "");

    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractVehicleData(base) {
  return {
    vehicleNo:
      normalizeVehicleNo(
        base?.vehicleNo
      ),
    vehicleId:
      normalizeListingId(
        base?.vehicleId
      ),
    queryCarId:
      normalizeListingId(
        base?.queryCarId
      )
  };
}

function convertManwonToKrw(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.round(value * 10000);
}

function normalizeSaleTypeValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  return normalized || null;
}

function resolveStructuredSaleType(
  leaseRentType,
  advertisementType
) {
  const values = [
    leaseRentType,
    advertisementType
  ]
    .map(normalizeSaleTypeValue)
    .filter(Boolean);

  if (
    values.some((value) =>
      /(?:^|_)LEASE(?:_|$)/.test(
        value
      )
    )
  ) {
    return "LEASE";
  }

  if (
    values.some((value) =>
      /(?:^|_)RENT(?:_|$)/.test(
        value
      )
    )
  ) {
    return "RENT";
  }

  return "NORMAL";
}

function extractStructuredSaleData(
  cars,
  fallbackPriceKrw
) {
  const base = cars?.base;
  const advertisement =
    base?.advertisement;
  const leaseRentInfo =
    base?.leaseRentInfo;

  const saleType =
    resolveStructuredSaleType(
      cars?.detailFlags
        ?.leaseRentType,
      base?.advertisementType
    );

  const structuredPriceKrw =
    convertManwonToKrw(
      advertisement?.price
    );

  const monthlyFeeKrw =
    convertManwonToKrw(
      leaseRentInfo?.monthlyFee
    );

  return {
    saleType,
    monthlyFeeKrw:
      saleType === "NORMAL"
        ? null
        : monthlyFeeKrw,
    priceKrw:
      structuredPriceKrw ??
      fallbackPriceKrw,
    rentalUsageHistory: null,
    totalLossHistory: null
  };
}

export function parsePreloadedVehicleData(
  html
) {
  const state =
    parsePreloadedState(html);

  return extractVehicleData(
    state?.cars?.base
  );
}

function maskVehicleNo(value) {
  const normalized =
    normalizeVehicleNo(value);

  return normalized
    ? normalized.replace(
        /\d{4}$/,
        "****"
      )
    : "미확인";
}

function formatListingUrl(listing) {
  const idFromListing =
    normalizeListingId(
      listing?.id
    );

  const idFromUrl =
    typeof listing?.url === "string"
      ? listing.url.match(
          /\/cars\/detail\/(\d+)/
        )?.[1] ?? null
      : null;

  const listingId =
    idFromListing ?? idFromUrl;

  if (listingId) {
    return `https://fem.encar.com/cars/detail/${listingId}`;
  }

  const rawUrl =
    typeof listing?.url === "string"
      ? listing.url.trim()
      : "";

  return rawUrl.split(
    /[?#]/,
    1
  )[0];
}

function collectStringValues(
  value,
  results = []
) {
  if (typeof value === "string") {
    const normalized = singleLine(
      stripHtml(value)
    );

    if (normalized) {
      results.push(normalized);
    }

    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(
        item,
        results
      );
    }

    return results;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (
      const child of
      Object.values(value)
    ) {
      collectStringValues(
        child,
        results
      );
    }
  }

  return results;
}

function collectSellerTextSegments(
  base
) {
  const rawValues = [
    base?.advertisement?.oneLineText,
    base?.contents,
    ...(Array.isArray(base?.photos)
      ? base.photos.map(
          (photo) => photo?.desc
        )
      : [])
  ];

  const segments = [];

  for (const value of rawValues) {
    if (
      typeof value !== "string"
    ) {
      continue;
    }

    const normalized =
      stripHtml(value);

    for (
      const segment of
      normalized.split(
        /[\n\r.。!！?？★•·|]+/u
      )
    ) {
      const text =
        singleLine(segment);

      if (text) {
        segments.push(text);
      }
    }
  }

  return [...new Set(segments)];
}

const OPTION_TERM_PATTERNS = {
  FSD:
    /\bfsd\b|full\s*self[-\s]*driving|완전\s*자율주행/i,
  EAP:
    /\beap\b|enhanced\s*autopilot|향상된\s*오토파일럿/i
};

const OPTION_NON_OWNERSHIP_PATTERN =
  /lite|라이트|가능|지원|예정|업그레이드|추가\s*구매|구독|사용\s*가능|적용\s*가능|구매\s*가능|선택\s*가능|활성화\s*가능/i;

const OPTION_OWNERSHIP_PATTERN =
  /보유|구매\s*(?:완료|함|됨|한|완료함)?|적용|포함|장착|설치|결제\s*(?:완료)?|옵션\s*(?:포함|적용|구매|장착)?/i;

function detectStructuredOption(
  optionValues,
  type
) {
  const termPattern =
    OPTION_TERM_PATTERNS[type];

  for (const value of optionValues) {
    if (!termPattern.test(value)) {
      continue;
    }

    if (
      OPTION_NON_OWNERSHIP_PATTERN.test(
        value
      )
    ) {
      continue;
    }

    return {
      confirmed: true,
      source: "구조화 옵션",
      evidence: "cars.base.options"
    };
  }

  return {
    confirmed: false,
    source: null,
    evidence: null
  };
}

function detectSellerOption(
  sellerSegments,
  type
) {
  const termPattern =
    OPTION_TERM_PATTERNS[type];

  for (
    const segment of
    sellerSegments
  ) {
    if (
      !termPattern.test(segment)
    ) {
      continue;
    }

    if (
      OPTION_NON_OWNERSHIP_PATTERN.test(
        segment
      )
    ) {
      continue;
    }

    if (
      !OPTION_OWNERSHIP_PATTERN.test(
        segment
      )
    ) {
      continue;
    }

    return {
      confirmed: true,
      source: "판매자 설명",
      evidence:
        "cars.base.advertisement/contents/photos"
    };
  }

  return {
    confirmed: false,
    source: null,
    evidence: null
  };
}

function detectConfirmedOptions(base) {
  const structuredValues = [
    ...new Set(
      collectStringValues(
        base?.options
      )
    )
  ];

  const sellerSegments =
    collectSellerTextSegments(base);

  const fsdStructured =
    detectStructuredOption(
      structuredValues,
      "FSD"
    );

  const fsdSeller =
    detectSellerOption(
      sellerSegments,
      "FSD"
    );

  const eapStructured =
    detectStructuredOption(
      structuredValues,
      "EAP"
    );

  const eapSeller =
    detectSellerOption(
      sellerSegments,
      "EAP"
    );

  const hasFsd =
    fsdStructured.confirmed ||
    fsdSeller.confirmed;

  const hasEap =
    eapStructured.confirmed ||
    eapSeller.confirmed;

  const option = hasFsd
    ? "FSD"
    : hasEap
      ? "EAP"
      : "미확인";

  const selectedEvidence =
    hasFsd
      ? fsdStructured.confirmed
        ? fsdStructured
        : fsdSeller
      : hasEap
        ? eapStructured.confirmed
          ? eapStructured
          : eapSeller
        : null;

  return {
    option,
    hasFsd,
    hasEap,
    optionSource:
      selectedEvidence?.source ??
      "미확인",
    optionEvidence:
      selectedEvidence?.evidence ??
      null
  };
}

function normalizeColorName(value) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    singleLine(value);

  return normalized || null;
}

function isExcludedColor(
  colorName,
  config
) {
  if (!colorName) {
    return false;
  }

  const normalizedColor =
    colorName.toLowerCase();

  const vehicleConfig =
    resolveVehicleConfig(config);

  return (
    vehicleConfig
      .excludedColorTerms ??
    vehicleConfig.excludedColors ??
    []
  ).some((term) =>
    normalizedColor.includes(
      String(term).toLowerCase()
    )
  );
}

const LISTING_REGION_LABELS = new Set([
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주"
]);

export function parseListingText({
  id,
  href,
  text
}) {
  const normalized = text
    .replace(/\s+/g, " ")
    .trim();

  const dateMatch =
    normalized.match(
      /(\d{2})\/(\d{2})식/
    );

  const mileageMatch =
    normalized.match(
      /([\d,]+)\s*km/i
    );

  const priceMatches = [
    ...normalized.matchAll(
      /([\d,]+)\s*만원/g
    )
  ];

  if (
    !dateMatch ||
    !mileageMatch ||
    priceMatches.length === 0
  ) {
    return null;
  }

  const dateIndex =
    dateMatch.index ?? 0;

  let title = normalized
    .slice(0, dateIndex)
    .trim();

  title = title
    .replace(
      /^찜하기\s*/,
      ""
    )
    .replace(
      /^'엔카믿고'는[^]*?제공합니다\s*/,
      ""
    )
    .replace(
      /^(스마트키|내비게이션|열선시트|통풍시트|후방카메라|외장컬러|#[^\s]+)\s*/g,
      ""
    )
    .trim();

  const year =
    2000 + Number(dateMatch[1]);

  const month =
    Number(dateMatch[2]);

  const mileageKm =
    Number(
      mileageMatch[1].replaceAll(
        ",",
        ""
      )
    );

  const priceManwon =
    Number(
      priceMatches
        .at(-1)[1]
        .replaceAll(",", "")
    );

  const priceKrw =
    priceManwon * 10000;

  const contracted =
    /계약중/.test(normalized);

  const priceStart =
    priceMatches.at(-1).index ??
    normalized.length;

  const listingMetadata =
    normalized.slice(
      (mileageMatch.index ?? 0) +
        mileageMatch[0].length,
      priceStart
    );

  const region = listingMetadata
    .split(/\s+/)
    .findLast((token) =>
      LISTING_REGION_LABELS.has(
        token
      )
    );

  return {
    id,
    url: new URL(
      href,
      "https://fem.encar.com"
    ).toString(),
    title,
    year,
    month,
    yearMonth: `${year}-${String(
      month
    ).padStart(2, "0")}`,
    mileageKm,
    priceKrw,
    region:
      region ??
      "미확인",
    contracted,
    listText: normalized
  };
}

export function parseListHtml(html) {
  const results = new Map();

  const anchorPattern =
    /<a\b[^>]*href=(['"])([^'"]*\/cars\/detail\/\d+[^'"]*)\1[^>]*>([\s\S]*?)<\/a>/gi;

  for (
    const match of
    html.matchAll(anchorPattern)
  ) {
    const href =
      decodeHtml(match[2]);

    const idMatch =
      href.match(
        /\/cars\/detail\/(\d+)/
      );

    if (!idMatch) {
      continue;
    }

    const parsed =
      parseListingText({
        id: idMatch[1],
        href,
        text: stripHtml(
          match[3]
        )
      });

    if (!parsed) {
      continue;
    }

    const existing =
      results.get(parsed.id);

    if (
      !existing ||
      parsed.listText.length <
        existing.listText.length
    ) {
      results.set(
        parsed.id,
        parsed
      );
    }
  }

  return [...results.values()];
}

export function analyzeDetail(
  html,
  listing,
  config
) {
  const text =
    stripHtml(html);

  const state =
    parsePreloadedState(html);

  const cars = state?.cars;

  const base =
    cars?.base;

  const vehicleData =
    extractVehicleData(base);

  const saleData =
    extractStructuredSaleData(
      cars,
      listing.priceKrw
    );

  const optionMode =
    getOptionMode(config);

  const optionData =
    optionMode === "tesla"
      ? detectConfirmedOptions(base)
      : {};

  const colorName =
    normalizeColorName(
      base?.spec?.colorName
    );

  const redColor =
    isExcludedColor(
      colorName,
      config
    );

  const smokingNegated =
    /비흡연|흡연\s*(없|무)|담배\s*(없|무)/i.test(
      text
    );

  const smokingWarning =
    !smokingNegated &&
    /흡연|담배/i.test(text);

  const tuningWarning =
    /사제|튜닝|서스펜션|다운스프링|휠\s*교체|조명\s*튜닝/i.test(
      text
    );

  return {
    ...listing,
    listPriceKrw:
      listing.priceKrw,
    ...vehicleData,
    ...saleData,
    ...optionData,
    optionMode,
    colorName,
    colorStatus:
      colorName
        ? "확인"
        : "미확인",
    redColor,
    smokingWarning,
    tuningWarning,
    detailTextSample:
      text.slice(0, 500)
  };
}

export function matchesBasicCriteria(
  listing,
  config
) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  const titleOk =
    matchesTitleFilter(
      listing.title,
      config
    );

  const {
    yearMonthMin,
    yearMonthMax
  } = resolveYearMonthBounds(
    config
  );

  return (
    titleOk &&
    listing.yearMonth >=
      yearMonthMin &&
    listing.yearMonth <=
      yearMonthMax &&
    listing.mileageKm <=
      vehicleConfig.maxMileageKm
  );
}

export function getBasicCriteriaFailureReasons(
  listing,
  config
) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  const reasons = [];

  const titleOk =
    matchesTitleFilter(
      listing.title,
      config
    );

  const {
    yearMonthMin,
    yearMonthMax
  } = resolveYearMonthBounds(
    config
  );

  if (!titleOk) {
    reasons.push(
      "차종/트림 불일치"
    );
  }

  if (
    listing.yearMonth <
      yearMonthMin ||
    listing.yearMonth >
      yearMonthMax
  ) {
    reasons.push(
      "연월 범위 초과"
    );
  }

  if (
    listing.mileageKm >
    vehicleConfig.maxMileageKm
  ) {
    reasons.push(
      "주행거리 초과"
    );
  }

  return reasons;
}

function resolveConfirmedOption(
  listing
) {
  if (
    listing.hasFsd === true
  ) {
    return "FSD";
  }

  if (
    listing.hasEap === true
  ) {
    return "EAP";
  }

  return "미확인";
}

function resolvePricePolicy(
  config,
  optionMode = getOptionMode(config)
) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  if (
    vehicleConfig?.price &&
    typeof vehicleConfig.price ===
      "object" &&
    !Array.isArray(vehicleConfig.price)
  ) {
    const maxPriceKrw =
      vehicleConfig.price
        .maxPriceKrw;

    if (optionMode !== "tesla") {
      return { maxPriceKrw };
    }

    const optionLimits =
      vehicleConfig.price
        .teslaOptionLimitsKrw ?? {};

    return {
      maxPriceKrw,
      eap:
        optionLimits.eap ??
        maxPriceKrw,
      fsd:
        optionLimits.fsd ??
        maxPriceKrw,
      unknownOptionHardMax:
        optionLimits
          .unknownOptionHardMax ??
        maxPriceKrw
    };
  }

  const maxPriceKrw =
    vehicleConfig
      ?.priceLimitsKrw?.base;

  if (optionMode !== "tesla") {
    return { maxPriceKrw };
  }

  return {
    maxPriceKrw,
    eap:
      vehicleConfig
        ?.priceLimitsKrw?.eap,
    fsd:
      vehicleConfig
        ?.priceLimitsKrw?.fsd,
    unknownOptionHardMax:
      vehicleConfig
        ?.priceLimitsKrw
        ?.unknownOptionHardMax ??
      vehicleConfig
        ?.priceLimitsKrw?.base
  };
}

function shouldExcludeContracted(
  config
) {
  const vehicleConfig =
    resolveVehicleConfig(config);

  return (
    vehicleConfig
      ?.excludeContractPending ??
    vehicleConfig?.excludeContracted ??
    false
  );
}

export function evaluateListing(
  listing,
  config
) {
  const optionMode =
    getOptionMode(config);

  const option =
    optionMode === "tesla"
      ? resolveConfirmedOption(
          listing
        )
      : null;

  const pricePolicy =
    resolvePricePolicy(
      config,
      optionMode
    );

  const adjustedPriceKrw =
    listing.priceKrw;

  let limitKrw =
    pricePolicy.maxPriceKrw;

  let reason =
    optionMode === "generic"
      ? "단일 최대가격 기준"
      : "일반 차량 기준";

  if (
    optionMode === "tesla" &&
    option === "FSD"
  ) {
    limitKrw =
      pricePolicy.fsd;

    reason =
      "FSD 기준";
  } else if (
    optionMode === "tesla" &&
    option === "EAP"
  ) {
    limitKrw =
      pricePolicy.eap;

    reason =
      "EAP 기준";
  }

  const excludedReasons = [];

  if (
    shouldExcludeContracted(
      config
    ) &&
    listing.contracted
  ) {
    excludedReasons.push(
      "계약중"
    );
  }

  if (listing.redColor) {
    excludedReasons.push(
      "빨간색 계열"
    );
  }

  if (
    adjustedPriceKrw >
    limitKrw
  ) {
    excludedReasons.push(
      "가격 초과"
    );
  }

  const warnings = [];

  if (
    optionMode === "tesla" &&
    option === "미확인" &&
    adjustedPriceKrw >
      pricePolicy.maxPriceKrw
  ) {
    warnings.push(
      "EAP 또는 FSD 포함 여부 확인 필요"
    );
  }

  if (
    listing.smokingWarning
  ) {
    warnings.push(
      "흡연 관련 문구 확인 필요"
    );
  }

  if (
    listing.tuningWarning
  ) {
    warnings.push(
      "튜닝 관련 문구 확인 필요"
    );
  }

  const evaluated = {
    ...listing,
    optionMode,
    ...(optionMode === "tesla"
      ? {
          option,
          hasFsd:
            option === "FSD",
          hasEap:
            option === "EAP"
        }
      : {}),
    adjustedPriceKrw,
    limitKrw,
    priceRule: reason,
    eligible:
      excludedReasons.length === 0,
    excludedReasons,
    warnings
  };

  if (optionMode === "generic") {
    delete evaluated.option;
    delete evaluated.hasFsd;
    delete evaluated.hasEap;
    delete evaluated.optionSource;
    delete evaluated.optionEvidence;
  }

  return evaluated;
}

export function prepareSendCurrentListing(
  listing,
  config,
  {
    detailSucceeded,
    errorMessage
  } = {}
) {
  const optionMode =
    getOptionMode(config);

  const pricePolicy =
    resolvePricePolicy(
      config,
      optionMode
    );

  const failureLimitKrw =
    optionMode === "tesla"
      ? pricePolicy
          .unknownOptionHardMax
      : pricePolicy.maxPriceKrw;

  const reasons = [
    ...getBasicCriteriaFailureReasons(
      listing,
      config
    )
  ];

  let result = listing;

  if (detailSucceeded) {
    reasons.push(
      ...(
        listing.excludedReasons ??
        []
      )
    );
  } else {
    if (
      shouldExcludeContracted(
        config
      ) &&
      listing.contracted
    ) {
      reasons.push(
        "계약중"
      );
    }

    if (
      listing.priceKrw >
      failureLimitKrw
    ) {
      reasons.push(
        "가격 초과"
      );
    }

    reasons.push(
      "상세 확인 실패"
    );

    if (
      optionMode === "tesla" &&
      listing.priceKrw >
      pricePolicy.maxPriceKrw
    ) {
      reasons.push(
        "옵션 미확인"
      );
    }

    result = {
      ...listing,
      optionMode,
      ...(optionMode === "tesla"
        ? {
            option:
              "상세 확인 실패"
          }
        : {}),
      adjustedPriceKrw:
        listing.priceKrw,
      limitKrw:
        failureLimitKrw,
      priceRule:
        "상세 확인 실패",
      eligible: false,
      excludedReasons: [],
      warnings: errorMessage
        ? [
            `상세 확인 실패: ${errorMessage}`
          ]
        : [
            "상세 확인 실패"
          ],
      detailFailed: true
    };

    if (optionMode === "generic") {
      delete result.option;
      delete result.hasFsd;
      delete result.hasEap;
      delete result.optionSource;
      delete result.optionEvidence;
    }
  }

  const conditionReasons = [
    ...new Set(reasons)
  ];

  return {
    ...result,
    conditionStatus:
      conditionReasons.length === 0
        ? "조건 충족"
        : "조건 미충족",
    conditionReasons,
    detailFailed:
      !detailSucceeded
  };
}

export function getListingInspection(
  previous,
  listing,
  runMode
) {
  const hasConfirmedState =
    Number.isFinite(
      previous?.priceKrw
    );

  const isNew =
    !hasConfirmedState;

  const previousListPriceKrw =
    Number.isFinite(
      previous?.listPriceKrw
    )
      ? previous.listPriceKrw
      : previous?.priceKrw;

  const currentListPriceKrw =
    Number.isFinite(
      listing?.listPriceKrw
    )
      ? listing.listPriceKrw
      : listing.priceKrw;

  const listPriceChanged =
    hasConfirmedState &&
    previousListPriceKrw !==
      currentListPriceKrw;

  const hasDetailPrice =
    Number.isFinite(
      listing?.listPriceKrw
    );

  const previousComparisonPriceKrw =
    hasDetailPrice
      ? previous?.priceKrw
      : previousListPriceKrw;

  const currentComparisonPriceKrw =
    hasDetailPrice
      ? listing.priceKrw
      : currentListPriceKrw;

  const priceChanged =
    hasConfirmedState &&
    previousComparisonPriceKrw !==
      currentComparisonPriceKrw;

  return {
    isNew,
    priceChanged,
    priceDropped:
      priceChanged &&
      currentComparisonPriceKrw <
        previousComparisonPriceKrw,
    priceIncreased:
      priceChanged &&
      currentComparisonPriceKrw >
        previousComparisonPriceKrw,
    shouldInspect:
      runMode ===
      "send_current" ||
      isNew ||
      listPriceChanged
  };
}

export function findPreviousListing(
  listings,
  listing
) {
  const exact =
    listings?.[listing.id];

  const vehicleNo =
    normalizeVehicleNo(
      listing.vehicleNo
    );

  const matches = vehicleNo
    ? Object.entries(
        listings ?? {}
      )
      .filter(
        ([, previous]) =>
          normalizeVehicleNo(
            previous?.vehicleNo
          ) === vehicleNo
      )
      .sort(
        (
          [, left],
          [, right]
        ) =>
          String(
            right?.lastSeenAt ??
              ""
          ).localeCompare(
            String(
              left?.lastSeenAt ??
                ""
            )
          )
      )
    : [];

  const confirmedVehicleMatch =
    matches.find(
      ([listingId, previous]) =>
        listingId !==
          String(listing.id) &&
        Number.isFinite(
          previous?.priceKrw
        )
    );

  if (
    exact &&
    !Number.isFinite(
      exact.priceKrw
    ) &&
    confirmedVehicleMatch
  ) {
    return {
      previous:
        confirmedVehicleMatch[1],
      previousListingId:
        confirmedVehicleMatch[0],
      matchedBy: "vehicleNo"
    };
  }

  if (exact) {
    return {
      previous: exact,
      previousListingId:
        listing.id,
      matchedBy:
        "listingId"
    };
  }

  const [match] = matches;

  if (!match) {
    return {
      previous: undefined,
      previousListingId: null,
      matchedBy: null
    };
  }

  return {
    previous: match[1],
    previousListingId:
      match[0],
    matchedBy:
      "vehicleNo"
  };
}

function isBetterRepresentative(
  candidate,
  current
) {
  if (
    Boolean(
      candidate.detailSucceeded
    ) !==
    Boolean(
      current.detailSucceeded
    )
  ) {
    return Boolean(
      candidate.detailSucceeded
    );
  }

  if (
    Boolean(
      candidate.listing
        ?.contracted
    ) !==
    Boolean(
      current.listing
        ?.contracted
    )
  ) {
    return !candidate.listing
      ?.contracted;
  }

  return (
    candidate.order <
    current.order
  );
}

export function selectRepresentativeCandidates(
  candidates
) {
  const groups = new Map();

  for (
    const [
      index,
      candidate
    ] of candidates.entries()
  ) {
    const order =
      candidate.order ?? index;

    const vehicleNo =
      normalizeVehicleNo(
        candidate.listing
          ?.vehicleNo
      );

    const key = vehicleNo
      ? `vehicle:${vehicleNo}`
      : `listing:${candidate.listing.id}`;

    const normalizedCandidate = {
      ...candidate,
      order
    };

    const group =
      groups.get(key) ?? [];

    group.push(
      normalizedCandidate
    );

    groups.set(
      key,
      group
    );
  }

  const representatives = [];
  const duplicates = [];

  for (
    const group of
    groups.values()
  ) {
    const representative =
      group.reduce(
        (
          current,
          candidate
        ) =>
          isBetterRepresentative(
            candidate,
            current
          )
            ? candidate
            : current
      );

    representatives.push(
      representative
    );

    for (
      const candidate of
      group
    ) {
      if (
        candidate !==
        representative
      ) {
        duplicates.push({
          representative,
          duplicate: candidate
        });
      }
    }
  }

  representatives.sort(
    (left, right) =>
      left.order -
      right.order
  );

  duplicates.sort(
    (left, right) =>
      left.duplicate.order -
      right.duplicate.order
  );

  return {
    representatives,
    duplicates
  };
}

function hasDeletedAt(record) {
  return (
    typeof record?.deletedAt ===
      "string" &&
    record.deletedAt.trim().length >
      0
  );
}

function collectCurrentListingIds(
  currentListings
) {
  if (currentListings instanceof Map) {
    return new Set(
      [...currentListings.keys()].map(
        String
      )
    );
  }

  if (Array.isArray(currentListings)) {
    return new Set(
      currentListings
        .map((listing) =>
          normalizeListingId(
            listing?.id
          )
        )
        .filter(Boolean)
    );
  }

  if (
    currentListings &&
    typeof currentListings ===
      "object"
  ) {
    return new Set(
      Object.keys(currentListings)
    );
  }

  return new Set();
}

export function needsVehicleIdentityResolution({
  previousListings,
  currentListings,
  representatives = []
}) {
  const currentListingIds =
    collectCurrentListingIds(
      currentListings
    );

  const currentVehicleNos =
    new Set(
      representatives
        .map((candidate) =>
          normalizeVehicleNo(
            candidate.listing
              ?.vehicleNo
          )
        )
        .filter(Boolean)
    );

  const groups = new Map();

  for (
    const [listingId, record] of
    Object.entries(
      previousListings ?? {}
    )
  ) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      hasDeletedAt(record) ||
      record.deletionTracked ===
        false
    ) {
      continue;
    }

    const vehicleNo =
      normalizeVehicleNo(
        record.vehicleNo
      );

    const groupKey = vehicleNo
      ? `vehicle:${vehicleNo}`
      : `listing:${listingId}`;

    const group =
      groups.get(groupKey) ?? {
        vehicleNo,
        listingIds: []
      };

    group.listingIds.push(
      String(listingId)
    );

    groups.set(groupKey, group);
  }

  return [...groups.values()].some(
    (group) =>
      Boolean(group.vehicleNo) &&
      !group.listingIds.some(
        (listingId) =>
          currentListingIds.has(
            listingId
          )
      ) &&
      !(
        group.vehicleNo &&
        currentVehicleNos.has(
          group.vehicleNo
        )
      )
  );
}

function selectLatestStateEntry(
  entries
) {
  return entries.reduce(
    (latest, entry) =>
      String(
        entry.record?.lastSeenAt ??
          ""
      ).localeCompare(
        String(
          latest.record
            ?.lastSeenAt ?? ""
        )
      ) > 0
        ? entry
        : latest
  );
}

function createDeletedListingEvent(
  listing,
  stateListingId
) {
  const listingId = String(
    stateListingId ?? listing?.id
  );

  return {
    kind: "deleted",
    type: "deleted",
    listing: {
      ...listing,
      id: listingId
    },
    stateListingId: listingId
  };
}

export function reconcileListingDeletions({
  stateListings,
  previousListings,
  currentListings,
  representatives,
  identityResolutionComplete = true,
  now,
  runMode,
  wasInitialized
}) {
  const result = {
    events: [],
    deletedListingIds: [],
    restoredListingIds: []
  };

  if (
    runMode !== "normal" ||
    !wasInitialized
  ) {
    return result;
  }

  const currentListingIds =
    collectCurrentListingIds(
      currentListings
    );

  if (
    currentListingIds.size === 0
  ) {
    return result;
  }

  const currentRepresentativesByVehicleNo =
    new Map();

  for (
    const candidate of
    representatives ?? []
  ) {
    const vehicleNo =
      normalizeVehicleNo(
        candidate.listing
          ?.vehicleNo
      );

    if (
      vehicleNo &&
      !currentRepresentativesByVehicleNo.has(
        vehicleNo
      )
    ) {
      currentRepresentativesByVehicleNo.set(
        vehicleNo,
        candidate
      );
    }
  }

  const currentVehicleNos =
    new Set(
      currentRepresentativesByVehicleNo.keys()
    );

  for (
    const [listingId, record] of
    Object.entries(
      stateListings ?? {}
    )
  ) {
    if (!hasDeletedAt(record)) {
      continue;
    }

    const normalizedListingId =
      String(listingId);

    const isPresentByListingId =
      currentListingIds.has(
        normalizedListingId
      );

    const vehicleNo =
      normalizeVehicleNo(
        record.vehicleNo
      );

    const currentRepresentative =
      vehicleNo
        ? currentRepresentativesByVehicleNo.get(
            vehicleNo
          )
        : null;

    const representativeListingId =
      normalizeListingId(
        currentRepresentative
          ?.listing?.id
      );

    const isPresentByVehicleNo =
      Boolean(
        representativeListingId &&
          currentListingIds.has(
            representativeListingId
          )
      );

    if (
      !isPresentByListingId &&
      !isPresentByVehicleNo
    ) {
      continue;
    }

    let restoredListingId =
      normalizedListingId;

    if (
      !isPresentByListingId &&
      currentRepresentative
    ) {
      restoredListingId =
        representativeListingId;

      const stateRecord =
        stateListings[
          restoredListingId
        ] ??
        currentRepresentative
          .stateRecord ??
        recordListObservation(
          record,
          currentRepresentative.listing,
          now
        );

      applyRepresentativeState(
        stateListings,
        {
          ...currentRepresentative,
          stateRecord
        }
      );
    }

    const restored = {
      ...stateListings[
        restoredListingId
      ],
      lastSeenAt: now
    };

    delete restored.deletedAt;

    stateListings[
      restoredListingId
    ] =
      restored;

    result.restoredListingIds.push(
      restoredListingId
    );
  }

  const previousGroups =
    new Map();

  for (
    const [listingId, record] of
    Object.entries(
      previousListings ?? {}
    )
  ) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      hasDeletedAt(record) ||
      record.deletionTracked ===
        false
    ) {
      continue;
    }

    const vehicleNo =
      normalizeVehicleNo(
        record.vehicleNo
      );

    const groupKey = vehicleNo
      ? `vehicle:${vehicleNo}`
      : `listing:${listingId}`;

    const group =
      previousGroups.get(
        groupKey
      ) ?? {
        vehicleNo,
        entries: []
      };

    group.entries.push({
      listingId:
        String(listingId),
      record
    });

    previousGroups.set(
      groupKey,
      group
    );
  }

  for (
    const group of
    previousGroups.values()
  ) {
    const isPresentByListingId =
      group.entries.some(
        ({ listingId }) =>
          currentListingIds.has(
            listingId
          )
      );

    const isPresentByVehicleNo =
      Boolean(
        group.vehicleNo &&
          currentVehicleNos.has(
            group.vehicleNo
          )
      );

    if (
      isPresentByListingId ||
      isPresentByVehicleNo
    ) {
      continue;
    }

    if (
      group.vehicleNo &&
      !identityResolutionComplete
    ) {
      continue;
    }

    const markedEntries = [];

    for (
      const entry of group.entries
    ) {
      const currentRecord =
        stateListings?.[
          entry.listingId
        ];

      if (
        !currentRecord ||
        typeof currentRecord !==
          "object" ||
        Array.isArray(
          currentRecord
        ) ||
        hasDeletedAt(
          currentRecord
        )
      ) {
        continue;
      }

      const deletedRecord = {
        ...currentRecord,
        deletedAt: now
      };

      stateListings[
        entry.listingId
      ] = deletedRecord;

      result.deletedListingIds.push(
        entry.listingId
      );

      markedEntries.push({
        listingId:
          entry.listingId,
        record: deletedRecord
      });
    }

    if (
      markedEntries.length === 0
    ) {
      continue;
    }

    const eventEntry =
      selectLatestStateEntry(
        markedEntries
      );

    result.events.push(
      createDeletedListingEvent(
        eventEntry.record,
        eventEntry.listingId
      )
    );
  }

  return result;
}

export function applyRepresentativeState(
  listings,
  candidate
) {
  const currentListingId =
    String(
      candidate.listing.id
    );

  const vehicleNo =
    normalizeVehicleNo(
      candidate.listing
        .vehicleNo
    );

  const stateRecord = {
    ...candidate.stateRecord,
    id: currentListingId,
    vehicleNo
  };

  if (!vehicleNo) {
    listings[
      currentListingId
    ] = stateRecord;

    return {
      stateRecord,
      removedListingIds: []
    };
  }

  const matchingPreviousEntries =
    Object.entries(listings)
      .filter(
        (
          [
            listingId,
            previous
          ]
        ) =>
          listingId !==
            currentListingId &&
          normalizeVehicleNo(
            previous?.vehicleNo
          ) === vehicleNo
      )
      .sort(
        (
          [, left],
          [, right]
        ) =>
          String(
            right?.lastSeenAt ??
              ""
          ).localeCompare(
            String(
              left?.lastSeenAt ??
                ""
            )
          )
      );

  const removedListingIds =
    matchingPreviousEntries.map(
      ([listingId]) =>
        listingId
    );

  for (
    const listingId of
    removedListingIds
  ) {
    delete listings[listingId];
  }

  const recordedPreviousListingId =
    candidate.stateRecord
      ?.previousListingId
      ? String(
          candidate.stateRecord
            .previousListingId
        )
      : null;

  const previousListingId =
    removedListingIds.includes(
      recordedPreviousListingId
    )
      ? recordedPreviousListingId
      : (
          removedListingIds[0] ??
          recordedPreviousListingId
        );

  if (
    previousListingId &&
    previousListingId !==
      currentListingId
  ) {
    stateRecord.previousListingId =
      previousListingId;
  }

  listings[
    currentListingId
  ] = stateRecord;

  return {
    stateRecord,
    removedListingIds
  };
}

export function formatDuplicateListingLog(
  representative,
  duplicate
) {
  return `Duplicate listing suppressed: vehicle=${maskVehicleNo(
    representative.listing
      .vehicleNo
  )}, representative=${
    representative.listing.id
  }, duplicate=${
    duplicate.listing.id
  }`;
}

export const TESLA_OPTION_STATE_FIELDS = [
  "option",
  "hasFsd",
  "hasEap",
  "optionSource",
  "optionEvidence"
];

export function sanitizeListingStateForOptionMode(
  record,
  optionMode
) {
  if (
    optionMode !== "generic" &&
    optionMode !== "tesla"
  ) {
    throw new Error(
      "optionMode must be generic or tesla"
    );
  }

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    return record;
  }

  const sanitized = {
    ...record,
    optionMode
  };

  if (optionMode === "generic") {
    for (
      const field of
      TESLA_OPTION_STATE_FIELDS
    ) {
      delete sanitized[field];
    }
  }

  return sanitized;
}

export function recordDetailFailure(
  previous,
  listing,
  now,
  errorMessage,
  optionMode
) {
  const {
    priceKrw:
      observedPriceKrw,
    listText: _listText,
    ...observation
  } = listing;

  const record = previous
    ? {
        ...previous
      }
    : {
        ...observation,
        firstSeenAt: now
      };

  const failedRecord = {
    ...record,
    vehicleNo:
      normalizeVehicleNo(
        listing.vehicleNo
      ) ??
      normalizeVehicleNo(
        previous?.vehicleNo
      ),
    lastSeenAt: now,
    lastObservedPriceKrw:
      observedPriceKrw,
    lastDetailFetchFailedAt:
      now,
    lastDetailFetchError:
      errorMessage
  };

  return optionMode === undefined
    ? failedRecord
    : sanitizeListingStateForOptionMode(
        failedRecord,
        optionMode
      );
}

export function recordListObservation(
  previous,
  listing,
  now,
  optionMode
) {
  const observedRecord = {
    ...previous,
    id: listing.id,
    title: listing.title,
    url: listing.url,
    yearMonth:
      listing.yearMonth,
    mileageKm:
      listing.mileageKm,
    priceKrw:
      Number.isFinite(
        previous?.priceKrw
      )
        ? previous.priceKrw
        : listing.priceKrw,
    listPriceKrw:
      listing.priceKrw,
    region:
      listing.region,
    contracted:
      listing.contracted,
    vehicleNo:
      normalizeVehicleNo(
        listing.vehicleNo
      ) ??
      normalizeVehicleNo(
        previous?.vehicleNo
      ),
    firstSeenAt:
      previous?.firstSeenAt ??
      now,
    lastSeenAt: now
  };

  return optionMode === undefined
    ? observedRecord
    : sanitizeListingStateForOptionMode(
        observedRecord,
        optionMode
      );
}

export function migrateLegacyState(
  state
) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    !state.listings ||
    typeof state.listings !==
      "object" ||
    Array.isArray(state.listings)
  ) {
    return state;
  }

  const listings = {};

  for (
    const [listingId, record] of
    Object.entries(state.listings)
  ) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record)
    ) {
      listings[listingId] = record;
      continue;
    }

    const {
      rental: _legacyRental,
      ...migratedRecord
    } = record;

    migratedRecord.rentalUsageHistory =
      migratedRecord
        .rentalUsageHistory ?? null;

    migratedRecord.totalLossHistory =
      migratedRecord
        .totalLossHistory ?? null;

    if (
      Number.isFinite(
        migratedRecord.priceKrw
      )
    ) {
      migratedRecord.adjustedPriceKrw =
        migratedRecord.priceKrw;
    }

    listings[listingId] =
      migratedRecord;
  }

  return {
    ...state,
    listings
  };
}

export function recordDetailSuccess(
  previous,
  listing,
  evaluated,
  now
) {
  const optionMode =
    evaluated?.optionMode ===
      "generic"
      ? "generic"
      : "tesla";

  const previousId =
    previous?.id
      ? String(previous.id)
      : null;

  const previousListingId =
    previousId &&
    previousId !==
      String(listing.id)
      ? previousId
      : previous
          ?.previousListingId;

  const saleType =
    evaluated.saleType === "LEASE" ||
    evaluated.saleType === "RENT"
      ? evaluated.saleType
      : "NORMAL";

  const record = {
    ...(previous ?? {}),
    id: listing.id,
    title: listing.title,
    url: listing.url,
    yearMonth:
      listing.yearMonth,
    mileageKm:
      listing.mileageKm,
    priceKrw:
      listing.priceKrw,
    listPriceKrw:
      Number.isFinite(
        listing.listPriceKrw
      )
        ? listing.listPriceKrw
        : listing.priceKrw,
    region:
      listing.region,
    contracted:
      listing.contracted,
    vehicleNo:
      normalizeVehicleNo(
        evaluated.vehicleNo
      ) ??
      normalizeVehicleNo(
        previous?.vehicleNo
      ),
    ...(previousListingId
      ? {
          previousListingId
        }
      : {}),
    firstSeenAt:
      previous?.firstSeenAt ??
      now,
    lastSeenAt: now,
    optionMode,
    ...(optionMode === "tesla"
      ? {
          option:
            evaluated.option,
          hasFsd:
            evaluated.hasFsd,
          hasEap:
            evaluated.hasEap,
          optionSource:
            evaluated.optionSource,
          optionEvidence:
            evaluated.optionEvidence
        }
      : {}),
    colorName:
      evaluated.colorName,
    colorStatus:
      evaluated.colorStatus,
    redColor:
      evaluated.redColor,
    saleType,
    monthlyFeeKrw:
      saleType === "NORMAL"
        ? null
        : Number.isFinite(
              evaluated.monthlyFeeKrw
            )
          ? evaluated.monthlyFeeKrw
          : null,
    rentalUsageHistory:
      evaluated
        .rentalUsageHistory ?? null,
    totalLossHistory:
      evaluated.totalLossHistory ??
      null,
    adjustedPriceKrw:
      evaluated.adjustedPriceKrw,
    limitKrw:
      evaluated.limitKrw,
    priceRule:
      evaluated.priceRule,
    eligible:
      evaluated.eligible,
    lastEvaluatedAt: now
  };

  delete record.lastObservedPriceKrw;
  delete record.lastDetailFetchFailedAt;
  delete record.lastDetailFetchError;
  delete record.rental;

  return sanitizeListingStateForOptionMode(
    record,
    optionMode
  );
}

export function createListingEvent({
  runMode,
  wasInitialized,
  inspection,
  previous,
  listing,
  detailSucceeded,
  notifyPriceIncrease = false
}) {
  if (
    runMode === "send_current"
  ) {
    return {
      kind: "current",
      type:
        "현재 검색 결과",
      listing,
      detailSucceeded
    };
  }

  if (
    !detailSucceeded ||
    !listing.eligible
  ) {
    return null;
  }

  if (
    wasInitialized &&
    inspection.isNew
  ) {
    return {
      kind: "new",
      type: "신규",
      listing,
      detailSucceeded
    };
  }

  if (
    wasInitialized &&
    inspection.priceDropped
  ) {
    return {
      kind: "price_decrease",
      type: `가격 인하 ${previous.priceKrw.toLocaleString(
        "ko-KR"
      )}원 → ${listing.priceKrw.toLocaleString(
        "ko-KR"
      )}원`,
      listing,
      previousPriceKrw:
        previous.priceKrw,
      newPriceKrw:
        listing.priceKrw,
      detailSucceeded
    };
  }

  if (
    wasInitialized &&
    inspection.priceIncreased &&
    notifyPriceIncrease
  ) {
    return {
      kind: "price_increase",
      type: `가격 인상 ${previous.priceKrw.toLocaleString(
        "ko-KR"
      )}원 → ${listing.priceKrw.toLocaleString(
        "ko-KR"
      )}원`,
      listing,
      previousPriceKrw:
        previous.priceKrw,
      newPriceKrw:
        listing.priceKrw,
      detailSucceeded
    };
  }

  return null;
}

function formatKrw(value) {
  return `${Math.round(
    value
  ).toLocaleString(
    "ko-KR"
  )}원`;
}

function formatKm(value) {
  return `${Math.round(
    value
  ).toLocaleString(
    "ko-KR"
  )}㎞`;
}

export function createTelegramMessageRequest(
  chatId,
  text
) {
  return {
    chat_id: chatId,
    text,
    link_preview_options: {
      is_disabled: true
    }
  };
}

export function recordTelegramDelivery(
  record,
  message,
  sentAt
) {
  const messageId =
    Number(message?.message_id);

  if (
    !Number.isSafeInteger(messageId) ||
    messageId <= 0
  ) {
    throw new Error(
      "텔레그램 응답에 유효한 message_id가 없습니다."
    );
  }

  if (
    typeof sentAt !== "string" ||
    !sentAt.trim()
  ) {
    throw new Error(
      "텔레그램 발송 시각이 필요합니다."
    );
  }

  return {
    ...record,
    telegramMessageId:
      messageId,
    telegramSentAt:
      sentAt
  };
}

function formatTelegramOption(
  option
) {
  if (option === "FSD") {
    return "옵션: FSD 확인";
  }

  if (option === "EAP") {
    return "옵션: EAP 확인";
  }

  return "옵션: 미확인";
}

function normalizeProfileNames(
  profileNames
) {
  if (!Array.isArray(profileNames)) {
    return [];
  }

  return [
    ...new Set(
      profileNames
        .map((name) =>
          typeof name === "string"
            ? singleLine(name)
            : ""
        )
        .filter(Boolean)
    )
  ];
}

function appendProfileLine(
  lines,
  profileNames
) {
  const names =
    normalizeProfileNames(
      profileNames
    );

  if (names.length > 0) {
    lines.push(
      `검색 조건: ${names.join(", ")}`
    );
  }
}

export function formatTelegramMessage(
  eventType,
  listing,
  {
    profileNames =
      listing?.profileNames ?? [],
    showTeslaOption =
      listing?.optionMode !==
        "generic"
  } = {}
) {
  const displayEventType =
    eventType === "deleted" ||
    eventType === "매물삭제"
      ? "매물삭제"
      : eventType;

  const lines = [
    `[${displayEventType}]`
  ];

  appendProfileLine(
    lines,
    profileNames
  );

  const title =
    typeof listing?.title ===
      "string"
      ? singleLine(listing.title)
      : "";

  const yearMonth =
    typeof listing?.yearMonth ===
      "string" &&
    /^\d{4}-\d{2}$/.test(
      listing.yearMonth
    )
      ? listing.yearMonth.replace(
          "-",
          "/"
        )
      : "";

  if (title || yearMonth) {
    lines.push(
      [yearMonth, title]
        .filter(Boolean)
        .join(" ")
    );
  }

  lines.push(
    `차량번호: ${
      normalizeVehicleNo(
        listing?.vehicleNo
      ) ?? "미확인"
    }`
  );

  if (listing?.conditionStatus) {
    lines.push(
      `판정: ${listing.conditionStatus}`
    );

    if (
      listing.conditionReasons
        ?.length
    ) {
      lines.push(
        `사유: ${listing.conditionReasons.join(
          ", "
        )}`
      );
    }
  }

  const listingFacts = [];

  if (
    Number.isFinite(
      listing?.mileageKm
    )
  ) {
    listingFacts.push(
      formatKm(listing.mileageKm)
    );
  }

  if (
    Number.isFinite(
      listing?.priceKrw
    )
  ) {
    listingFacts.push(
      formatKrw(listing.priceKrw)
    );
  }

  const region =
    typeof listing?.region ===
      "string"
      ? singleLine(listing.region)
      : "";

  if (region) {
    listingFacts.push(region);
  }

  if (listingFacts.length > 0) {
    lines.push(
      listingFacts.join(" | ")
    );
  }

  if (showTeslaOption) {
    lines.push(
      formatTelegramOption(
        listing?.option
      )
    );
  }

  if (
    listing?.saleType === "LEASE"
  ) {
    lines.push(
      Number.isFinite(
        listing.monthlyFeeKrw
      )
        ? `판매방식: 리스 | 월 납입금: ${formatKrw(
            listing.monthlyFeeKrw
          )}`
        : "판매방식: 리스"
    );
  } else if (
    listing?.saleType === "RENT"
  ) {
    lines.push("판매방식: 렌트");
  } else if (
    !showTeslaOption &&
    listing?.saleType === "NORMAL"
  ) {
    lines.push("판매방식: 일반");
  }

  if (
    listing?.detailFailed
  ) {
    lines.push(
      "상세: 상세 확인 실패"
    );
  }

  const url =
    formatListingUrl(listing);

  if (url) {
    lines.push(url);
  }

  return lines.join("\n");
}

export function setPage(
  urlString,
  page
) {
  const url =
    new URL(urlString);

  url.searchParams.set(
    "page",
    String(page)
  );

  return url.toString();
}

export async function loadJson(
  path
) {
  return JSON.parse(
    await fs.readFile(
      path,
      "utf8"
    )
  );
}

export async function saveJson(
  path,
  value
) {
  await fs.writeFile(
    path,
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    "utf8"
  );
}

export const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
