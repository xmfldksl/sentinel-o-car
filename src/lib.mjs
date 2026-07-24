import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import {
  normalizeEncarSearchUrl
} from "./search-url.mjs";

export {
  normalizeEncarSearchUrl
};

function singleLine(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function resolveTitleFilter(profile) {
  return {
    requiredAll:
      normalizeFilterTerms(
        profile?.titleFilter
          ?.requiredAll
      ),
    requiredAny:
      normalizeFilterTerms(
        profile?.titleFilter
          ?.requiredAny
      ),
    excludedAny:
      normalizeFilterTerms(
        profile?.titleFilter
          ?.excludedAny
      )
  };
}

export function matchesTitleFilter(
  title,
  profile
) {
  const normalizedTitle =
    normalizeFilterText(title);

  const {
    requiredAll,
    requiredAny,
    excludedAny
  } = resolveTitleFilter(profile);

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

export function createSearchUrlFingerprint(urlString) {
  return createHash("sha256")
    .update(urlString, "utf8")
    .digest("hex")
    .slice(0, 12);
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

const VEHICLE_TITLE_MAX_LENGTH = 60;

const PROMOTIONAL_TITLE_PATTERN =
  /[#★☆•●▶♥]|\S*\/\S+\/\S*/u;

function isVehicleTitleLike(value) {
  const normalized =
    typeof value === "string"
      ? singleLine(value)
      : "";

  if (!normalized) {
    return false;
  }

  if (
    normalized.length >
    VEHICLE_TITLE_MAX_LENGTH
  ) {
    return false;
  }

  return !PROMOTIONAL_TITLE_PATTERN.test(
    normalized
  );
}

function asVehicleTitle(value) {
  return isVehicleTitleLike(value)
    ? singleLine(value)
    : null;
}

export function selectListingTitle(
  previousTitle,
  nextTitle
) {
  return (
    asVehicleTitle(nextTitle) ??
    asVehicleTitle(previousTitle) ??
    (typeof nextTitle === "string"
      ? nextTitle
      : previousTitle)
  );
}

const STRUCTURED_TITLE_FULL_FIELDS = [
  "vehicleName",
  "carName"
];

const STRUCTURED_TITLE_PART_FIELDS = [
  ["modelName", "modelGroupName"],
  ["gradeName", "badgeName"],
  [
    "gradeDetailName",
    "badgeDetailName",
    "detailGradeName"
  ]
];

function pickStructuredField(
  source,
  fields
) {
  for (const field of fields) {
    const value = source[field];

    if (typeof value !== "string") {
      continue;
    }

    const normalized =
      singleLine(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveStructuredVehicleTitle(
  source
) {
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    return null;
  }

  const fullName =
    pickStructuredField(
      source,
      STRUCTURED_TITLE_FULL_FIELDS
    );

  if (fullName) {
    return asVehicleTitle(fullName);
  }

  const parts = [];

  for (
    const fields of
    STRUCTURED_TITLE_PART_FIELDS
  ) {
    const value =
      pickStructuredField(
        source,
        fields
      );

    if (
      !value ||
      parts.some((part) =>
        part.includes(value)
      )
    ) {
      continue;
    }

    parts.push(value);
  }

  return asVehicleTitle(
    parts.join(" ")
  );
}

function collectStructuredListTitles(
  value,
  results = new Map()
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStructuredListTitles(
        item,
        results
      );
    }

    return results;
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return results;
  }

  const listingId =
    normalizeListingId(
      value.vehicleId ??
        value.carId ??
        value.listingId ??
        value.id
    );

  if (
    listingId &&
    !results.has(listingId)
  ) {
    const title =
      resolveStructuredVehicleTitle(
        value
      );

    if (title) {
      results.set(
        listingId,
        title
      );
    }
  }

  for (
    const child of
    Object.values(value)
  ) {
    collectStructuredListTitles(
      child,
      results
    );
  }

  return results;
}

const VEHICLE_TITLE_ELEMENT_PATTERN =
  /<(span|strong|em|p|div|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

const VEHICLE_TITLE_CLASS_TOKENS =
  new Set([
    "car_name",
    "carname",
    "car-name",
    "vehicle_name",
    "vehiclename",
    "vehicle-name",
    "model_name",
    "modelname",
    "model-name",
    "product_name",
    "productname",
    "product-name"
  ]);

const VEHICLE_TITLE_ATTRIBUTE_PATTERN =
  /\bitemprop\s*=\s*(['"])\s*name\s*\1|\bdata-(?:vehicle|car|model)-name\b/i;

function hasVehicleTitleMarker(
  attributes
) {
  if (
    VEHICLE_TITLE_ATTRIBUTE_PATTERN.test(
      attributes
    )
  ) {
    return true;
  }

  const classMatch =
    attributes.match(
      /\bclass\s*=\s*(['"])([^'"]*)\1/i
    );

  if (!classMatch) {
    return false;
  }

  return classMatch[2]
    .split(/\s+/)
    .some((token) =>
      VEHICLE_TITLE_CLASS_TOKENS.has(
        token.toLowerCase()
      )
    );
}

function extractVehicleTitleElement(
  html
) {
  for (
    const match of
    String(html).matchAll(
      VEHICLE_TITLE_ELEMENT_PATTERN
    )
  ) {
    if (
      !hasVehicleTitleMarker(
        match[2]
      )
    ) {
      continue;
    }

    const title = asVehicleTitle(
      stripHtml(match[3])
    );

    if (title) {
      return title;
    }
  }

  return null;
}

function isPromotionalToken(token) {
  return (
    token.startsWith("#") ||
    /[★☆•●▶♥]/u.test(token) ||
    (token.match(/\//g)?.length ??
      0) >= 2
  );
}

function extractListTextTitle(value) {
  const chromeStripped = value
    .replace(/^찜하기\s*/, "")
    .replace(
      /^'엔카믿고'는[^]*?제공합니다\s*/,
      ""
    )
    .trim();

  const tokens = chromeStripped
    .split(/\s+/)
    .filter(Boolean);

  const lastPromotionalIndex =
    tokens.findLastIndex(
      isPromotionalToken
    );

  const remaining = tokens.slice(
    lastPromotionalIndex + 1
  );

  return (
    remaining.length > 0
      ? remaining
      : tokens
  )
    .join(" ")
    .trim();
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
  text,
  structuredTitle = null,
  elementTitle = null
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

  const title =
    asVehicleTitle(structuredTitle) ??
    asVehicleTitle(elementTitle) ??
    extractListTextTitle(
      normalized
        .slice(0, dateIndex)
        .trim()
    );

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

  const structuredTitles =
    collectStructuredListTitles(
      parsePreloadedState(html)
    );

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
        ),
        structuredTitle:
          structuredTitles.get(
            idMatch[1]
          ) ?? null,
        elementTitle:
          extractVehicleTitleElement(
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

  const optionData =
    config.isTesla
      ? detectConfirmedOptions(base)
      : {};

  const colorName =
    normalizeColorName(
      base?.spec?.colorName
    );

  return {
    ...listing,
    title:
      asVehicleTitle(listing.title) ??
      resolveDetailVehicleTitle(base) ??
      listing.title,
    listPriceKrw:
      listing.priceKrw,
    ...vehicleData,
    ...saleData,
    ...optionData,
    colorName,
    colorStatus:
      colorName
        ? "확인"
        : "미확인"
  };
}

function resolveDetailVehicleTitle(
  base
) {
  for (const source of [
    base?.category,
    base?.model,
    base?.spec,
    base
  ]) {
    const title =
      resolveStructuredVehicleTitle(
        source
      );

    if (title) {
      return title;
    }
  }

  return null;
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
  profile
) {
  const maxPriceKrw =
    profile.price.maxPriceKrw;

  if (!profile.isTesla) {
    return { maxPriceKrw };
  }

  return {
    maxPriceKrw,
    eap: profile.price.eapMaxPriceKrw,
    fsd: profile.price.fsdMaxPriceKrw
  };
}

export function evaluateListing(
  listing,
  profile
) {
  const option =
    profile.isTesla
      ? resolveConfirmedOption(
          listing
        )
      : null;

  const pricePolicy =
    resolvePricePolicy(profile);

  let selectedMaxPriceKrw =
    pricePolicy.maxPriceKrw;

  if (
    profile.isTesla &&
    option === "FSD"
  ) {
    selectedMaxPriceKrw =
      pricePolicy.fsd;
  } else if (
    profile.isTesla &&
    option === "EAP"
  ) {
    selectedMaxPriceKrw =
      pricePolicy.eap;
  }

  const conditionReasons =
    listing.priceKrw >
      selectedMaxPriceKrw
      ? ["가격 초과"]
      : [];

  const evaluated = {
    ...listing,
    ...(profile.isTesla
      ? {
          option
        }
      : {}),
    conditionStatus:
      conditionReasons.length === 0
        ? "조건 충족"
        : "조건 미충족",
    conditionReasons
  };

  if (!profile.isTesla) {
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
  profile,
  {
    detailSucceeded
  } = {}
) {
  if (detailSucceeded) {
    return {
      ...listing,
      detailFailed: false
    };
  }

  const conditionReasons =
    listing.priceKrw >
      profile.price.maxPriceKrw
      ? ["가격 초과"]
      : [];

  const result = {
    ...listing,
    ...(profile.isTesla
      ? {
          option: "미확인"
        }
      : {}),
    detailFailed: true
  };

  if (!profile.isTesla) {
    delete result.option;
    delete result.hasFsd;
    delete result.hasEap;
    delete result.optionSource;
    delete result.optionEvidence;
  }

  return {
    ...result,
    conditionStatus:
      conditionReasons.length === 0
        ? "조건 충족"
        : "조건 미충족",
    conditionReasons,
    detailFailed: true
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
    priceDropped:
      priceChanged &&
      currentComparisonPriceKrw <
        previousComparisonPriceKrw,
    priceIncreased:
      priceChanged &&
      currentComparisonPriceKrw >
        previousComparisonPriceKrw,
    shouldInspect:
      runMode === "send_current" ||
      isNew ||
      listPriceChanged ||
      Boolean(
        previous
          ?.lastDetailFetchFailedAt
      )
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
          .stateRecord;

      if (!stateRecord) {
        continue;
      }

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

const TESLA_OPTION_STATE_FIELDS = [
  "option",
  "hasFsd",
  "hasEap",
  "optionSource",
  "optionEvidence"
];

function sanitizeListingStateForProfile(
  record,
  isTesla
) {
  if (typeof isTesla !== "boolean") {
    throw new Error(
      "isTesla must be a boolean"
    );
  }

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    return record;
  }

  const sanitized = { ...record };

  if (!isTesla) {
    for (
      const field of
      TESLA_OPTION_STATE_FIELDS
    ) {
      delete sanitized[field];
    }
  }

  return sanitized;
}

export function recordListObservation(
  previous,
  listing,
  now,
  isTesla
) {
  const observedRecord = {
    ...previous,
    id: listing.id,
    title: selectListingTitle(
      previous?.title,
      listing.title
    ),
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

  return sanitizeListingStateForProfile(
    observedRecord,
    isTesla
  );
}

export function recordDetailFailure(
  previous,
  listing,
  now,
  errorMessage,
  isTesla
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

  return sanitizeListingStateForProfile(
    failedRecord,
    isTesla
  );
}

export function recordDetailSuccess(
  previous,
  listing,
  evaluated,
  now,
  isTesla
) {
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
    title: selectListingTitle(
      previous?.title,
      listing.title
    ),
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
    ...(isTesla
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
    lastEvaluatedAt: now
  };

  delete record.lastObservedPriceKrw;
  delete record.lastDetailFetchFailedAt;
  delete record.lastDetailFetchError;

  return sanitizeListingStateForProfile(
    record,
    isTesla
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
    !detailSucceeded
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
    showTeslaOption = false
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

  const colorName =
    typeof listing?.colorName ===
      "string"
      ? singleLine(listing.colorName)
      : "";

  listingFacts.push(
    colorName || "색상 미확인"
  );

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
