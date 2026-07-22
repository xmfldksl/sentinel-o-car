import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export const DEFAULT_SEARCH_URL =
  "https://car.encar.com/list/car?page=1&search=%7B%22type%22%3A%22car%22%2C%22action%22%3A%22%28And.Hidden.N._.MultiView2Hidden.N._.MultiViewHidden.N._.%28C.CarType.N._.%28C.Manufacturer.%ED%85%8C%EC%8A%AC%EB%9D%BC._.%28C.ModelGroup.%EB%AA%A8%EB%8D%B8+3._.Model.%EB%AA%A8%EB%8D%B8+3.%29%29%29%29%22%2C%22toggle%22%3A%7B%7D%2C%22layer%22%3A%22%22%2C%22sort%22%3A%22MobileModifiedDate%22%7D";

function singleLine(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSearchUrlFingerprint(urlString) {
  return createHash("sha256")
    .update(urlString, "utf8")
    .digest("hex")
    .slice(0, 12);
}

export function summarizeSearchUrl(urlString) {
  let url;

  try {
    url = new URL(urlString);
  } catch {
    throw new Error(
      "ENCAR_SEARCH_URL이 올바른 URL이 아닙니다."
    );
  }

  const encodedSearch =
    url.searchParams.get("search");

  if (encodedSearch === null) {
    throw new Error(
      "ENCAR_SEARCH_URL에 search 파라미터가 없습니다."
    );
  }

  let search;

  try {
    search = JSON.parse(encodedSearch);
  } catch {
    throw new Error(
      "ENCAR_SEARCH_URL의 search 파라미터가 올바른 JSON이 아닙니다."
    );
  }

  if (
    !search ||
    typeof search !== "object" ||
    Array.isArray(search)
  ) {
    throw new Error(
      "ENCAR_SEARCH_URL의 search 파라미터는 JSON 객체여야 합니다."
    );
  }

  const action =
    typeof search.action === "string"
      ? search.action
      : "";

  const yearRange =
    action.match(
      /Year\.range\([^)]*\)/
    )?.[0] ?? "없음";

  const title =
    typeof search.title === "string" &&
    search.title.trim()
      ? singleLine(search.title)
      : "없음";

  const normalizedUrl =
    url.toString();

  return {
    url: normalizedUrl,
    host: url.host,
    page:
      url.searchParams.get("page") ??
      "없음",
    title,
    yearRange,
    fingerprint:
      createSearchUrlFingerprint(
        normalizedUrl
      )
  };
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
    ...summarizeSearchUrl(
      hasConfiguredUrl
        ? configuredUrl.trim()
        : DEFAULT_SEARCH_URL
    )
  };
}

export function formatSearchUrlSummary(
  searchUrl
) {
  return [
    `검색 URL 출처: ${searchUrl.source}`,
    `검색 URL 호스트: ${searchUrl.host}`,
    `검색 URL page: ${searchUrl.page}`,
    `검색 조건 title: ${searchUrl.title}`,
    `검색 조건 연식 범위: ${searchUrl.yearRange}`,
    `검색 URL 지문: ${searchUrl.fingerprint}`
  ].join("\n");
}

const HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "]
]);

export function decodeHtml(value) {
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

export function stripHtml(value) {
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

export function maskVehicleNo(value) {
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

  return (
    config.excludedColorTerms ?? []
  ).some((term) =>
    normalizedColor.includes(
      String(term).toLowerCase()
    )
  );
}

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

  const afterMileage =
    normalized.slice(
      (mileageMatch.index ?? 0) +
        mileageMatch[0].length
    );

  const regionMatch =
    afterMileage.match(
      /전기\s+([가-힣]{2,4})/
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
      regionMatch?.[1] ??
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

  const optionData =
    detectConfirmedOptions(base);

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
  const titleOk =
    config.requiredTitleTerms.every(
      (term) =>
        listing.title
          .toLowerCase()
          .includes(
            term.toLowerCase()
          )
    );

  return (
    titleOk &&
    listing.yearMonth >=
      config.yearMonthMin &&
    listing.yearMonth <=
      config.yearMonthMax &&
    listing.mileageKm <=
      config.maxMileageKm
  );
}

export function getBasicCriteriaFailureReasons(
  listing,
  config
) {
  const reasons = [];

  const titleOk =
    config.requiredTitleTerms.every(
      (term) =>
        listing.title
          .toLowerCase()
          .includes(
            term.toLowerCase()
          )
    );

  if (!titleOk) {
    reasons.push(
      "차종/트림 불일치"
    );
  }

  if (
    listing.yearMonth <
      config.yearMonthMin ||
    listing.yearMonth >
      config.yearMonthMax
  ) {
    reasons.push(
      "연월 범위 초과"
    );
  }

  if (
    listing.mileageKm >
    config.maxMileageKm
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

export function evaluateListing(
  listing,
  config
) {
  const option =
    resolveConfirmedOption(
      listing
    );

  const hasRentalUsageHistory =
    listing.rentalUsageHistory ===
    true;

  const adjustedPriceKrw =
    listing.priceKrw +
    (hasRentalUsageHistory
      ? config.rentalPenaltyKrw
      : 0);

  let limitKrw =
    config.priceLimitsKrw.base;

  let reason =
    "일반 차량 기준";

  if (option === "FSD") {
    limitKrw =
      config.priceLimitsKrw.fsd;

    reason =
      "FSD 기준";
  } else if (
    option === "EAP"
  ) {
    limitKrw =
      config.priceLimitsKrw.eap;

    reason =
      "EAP 기준";
  }

  const excludedReasons = [];

  if (
    config.excludeContracted &&
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
      hasRentalUsageHistory
        ? "렌트 감가 후 가격 초과"
        : "가격 초과"
    );
  }

  const warnings = [];

  if (
    option === "미확인" &&
    adjustedPriceKrw >
      config.priceLimitsKrw.base
  ) {
    warnings.push(
      "EAP 또는 FSD 포함 여부 확인 필요"
    );
  }

  if (hasRentalUsageHistory) {
    warnings.push(
      `렌트 이력 감가 ${formatKrw(
        config.rentalPenaltyKrw
      )} 반영`
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

  return {
    ...listing,
    option,
    hasFsd:
      option === "FSD",
    hasEap:
      option === "EAP",
    adjustedPriceKrw,
    limitKrw,
    priceRule: reason,
    eligible:
      excludedReasons.length === 0,
    excludedReasons,
    warnings
  };
}

export function prepareSendCurrentListing(
  listing,
  config,
  {
    detailSucceeded,
    errorMessage
  } = {}
) {
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
      config.excludeContracted &&
      listing.contracted
    ) {
      reasons.push(
        "계약중"
      );
    }

    if (
      listing.priceKrw >
      config.priceLimitsKrw
        .unknownOptionHardMax
    ) {
      reasons.push(
        "가격 초과"
      );
    }

    reasons.push(
      "상세 확인 실패"
    );

    if (
      listing.priceKrw >
      config.priceLimitsKrw.base
    ) {
      reasons.push(
        "옵션 미확인"
      );
    }

    result = {
      ...listing,
      option:
        "상세 확인 실패",
      adjustedPriceKrw:
        listing.priceKrw,
      limitKrw:
        config.priceLimitsKrw
          .unknownOptionHardMax,
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

export function createDeletedListingEvent(
  listing,
  stateListingId
) {
  const listingId = String(
    stateListingId ?? listing?.id
  );

  return {
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

export function recordDetailFailure(
  previous,
  listing,
  now,
  errorMessage
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

  return {
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
}

export function recordListObservation(
  previous,
  listing,
  now
) {
  return {
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
    option:
      evaluated.option,
    hasFsd:
      evaluated.hasFsd,
    hasEap:
      evaluated.hasEap,
    optionSource:
      evaluated.optionSource,
    optionEvidence:
      evaluated.optionEvidence,
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

  return record;
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
      type:
        "현재 검색 결과",
      listing
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
      type: "신규",
      listing
    };
  }

  if (
    wasInitialized &&
    inspection.priceDropped
  ) {
    return {
      type: `가격 인하 ${previous.priceKrw.toLocaleString(
        "ko-KR"
      )}원 → ${listing.priceKrw.toLocaleString(
        "ko-KR"
      )}원`,
      listing
    };
  }

  if (
    wasInitialized &&
    inspection.priceIncreased &&
    notifyPriceIncrease
  ) {
    return {
      type: `가격 인상 ${previous.priceKrw.toLocaleString(
        "ko-KR"
      )}원 → ${listing.priceKrw.toLocaleString(
        "ko-KR"
      )}원`,
      listing
    };
  }

  return null;
}

export function formatKrw(value) {
  return `${Math.round(
    value
  ).toLocaleString(
    "ko-KR"
  )}원`;
}

export function formatKm(value) {
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

function formatDeletedTelegramMessage(
  listing
) {
  const lines = [
    "[매물삭제]"
  ];

  const title =
    typeof listing?.title ===
      "string"
      ? singleLine(listing.title)
      : "";

  if (title) {
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
        : null;

    lines.push(
      yearMonth
        ? `${yearMonth} ${title}`
        : title
    );
  }

  const vehicleNo =
    normalizeVehicleNo(
      listing?.vehicleNo
    );

  if (vehicleNo) {
    lines.push(
      `차량번호: ${vehicleNo}`
    );
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

  if (listingFacts.length > 0) {
    lines.push(
      listingFacts.join(" | ")
    );
  }

  const hasStoredUrl =
    typeof listing?.url ===
      "string" &&
    listing.url.trim().length > 0;

  if (hasStoredUrl) {
    const url =
      formatListingUrl(listing);

    if (url) {
      lines.push(url);
    }
  }

  return lines.join("\n");
}

export function formatTelegramMessage(
  eventType,
  listing
) {
  if (
    eventType === "deleted" ||
    eventType === "매물삭제"
  ) {
    return formatDeletedTelegramMessage(
      listing
    );
  }

  const lines = [
    `[${eventType}]`,
    `${listing.yearMonth.replace(
      "-",
      "/"
    )} ${listing.title}`,
    `차량번호: ${
      normalizeVehicleNo(
        listing.vehicleNo
      ) ?? "미확인"
    }`,
    ...(listing.conditionStatus
      ? [
          `판정: ${listing.conditionStatus}`,
          ...(listing.conditionReasons
            ?.length
            ? [
                `사유: ${listing.conditionReasons.join(
                  ", "
                )}`
              ]
            : [])
        ]
      : []),
    `${formatKm(
      listing.mileageKm
    )} | ${formatKrw(
      listing.priceKrw
    )} | ${listing.region}`,
    formatTelegramOption(
      listing.option
    )
  ];

  if (listing.saleType === "LEASE") {
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
    listing.saleType === "RENT"
  ) {
    lines.push("판매방식: 렌트");
  }

  if (
    listing.detailFailed
  ) {
    lines.push(
      "상세: 상세 확인 실패"
    );
  }

  if (
    listing.rentalUsageHistory ===
    true
  ) {
    lines.push(
      `렌트 감가 반영 평가가격: ${formatKrw(
        listing.adjustedPriceKrw
      )}`
    );
  }

  lines.push(
    formatListingUrl(listing)
  );

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
