import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export const DEFAULT_SEARCH_URL =
  "https://car.encar.com/list/car?page=1&search=%7B%22type%22%3A%22car%22%2C%22action%22%3A%22%28And.Hidden.N._.MultiView2Hidden.N._.MultiViewHidden.N._.%28C.CarType.N._.%28C.Manufacturer.%ED%85%8C%EC%8A%AC%EB%9D%BC._.%28C.ModelGroup.%EB%AA%A8%EB%8D%B8+3._.Model.%EB%AA%A8%EB%8D%B8+3.%29%29%29%29%22%2C%22toggle%22%3A%7B%7D%2C%22layer%22%3A%22%22%2C%22sort%22%3A%22MobileModifiedDate%22%7D";

function singleLine(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function createSearchUrlFingerprint(urlString) {
  return createHash("sha256").update(urlString, "utf8").digest("hex").slice(0, 12);
}

export function summarizeSearchUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("ENCAR_SEARCH_URL이 올바른 URL이 아닙니다.");
  }

  const encodedSearch = url.searchParams.get("search");
  if (encodedSearch === null) {
    throw new Error("ENCAR_SEARCH_URL에 search 파라미터가 없습니다.");
  }

  let search;
  try {
    search = JSON.parse(encodedSearch);
  } catch {
    throw new Error("ENCAR_SEARCH_URL의 search 파라미터가 올바른 JSON이 아닙니다.");
  }

  if (!search || typeof search !== "object" || Array.isArray(search)) {
    throw new Error("ENCAR_SEARCH_URL의 search 파라미터는 JSON 객체여야 합니다.");
  }

  const action = typeof search.action === "string" ? search.action : "";
  const yearRange = action.match(/Year\.range\([^)]*\)/)?.[0] ?? "없음";
  const title =
    typeof search.title === "string" && search.title.trim() ? singleLine(search.title) : "없음";
  const normalizedUrl = url.toString();

  return {
    url: normalizedUrl,
    host: url.host,
    page: url.searchParams.get("page") ?? "없음",
    title,
    yearRange,
    fingerprint: createSearchUrlFingerprint(normalizedUrl)
  };
}

export function resolveSearchUrl(environment = process.env) {
  const configuredUrl = environment.ENCAR_SEARCH_URL;
  const hasConfiguredUrl = typeof configuredUrl === "string" && configuredUrl.trim().length > 0;

  if (environment.GITHUB_ACTIONS === "true" && !hasConfiguredUrl) {
    throw new Error("GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다.");
  }

  const source = hasConfiguredUrl ? "repository variable" : "default";
  return {
    source,
    ...summarizeSearchUrl(hasConfiguredUrl ? configuredUrl.trim() : DEFAULT_SEARCH_URL)
  };
}

export function formatSearchUrlSummary(searchUrl) {
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES.get(name.toLowerCase()) ?? match);
}

export function stripHtml(value) {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVehicleNo(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s-]+/g, "");
  return /^\d{2,3}[가-힣]\d{4}$/u.test(normalized) ? normalized : null;
}

function normalizeListingId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return null;
}

export function parsePreloadedVehicleData(html) {
  const unknown = { vehicleNo: null, vehicleId: null, queryCarId: null };
  if (typeof html !== "string") return unknown;

  const match = html.match(
    /<script\b[^>]*>\s*__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/i
  );
  if (!match) return unknown;

  try {
    const json = match[1].trim().replace(/;\s*$/, "");
    const base = JSON.parse(json)?.cars?.base;
    return {
      vehicleNo: normalizeVehicleNo(base?.vehicleNo),
      vehicleId: normalizeListingId(base?.vehicleId),
      queryCarId: normalizeListingId(base?.queryCarId)
    };
  } catch {
    return unknown;
  }
}

export function maskVehicleNo(value) {
  const normalized = normalizeVehicleNo(value);
  return normalized ? normalized.replace(/\d{4}$/, "****") : "미확인";
}

export function parseListingText({ id, href, text }) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const dateMatch = normalized.match(/(\d{2})\/(\d{2})식/);
  const mileageMatch = normalized.match(/([\d,]+)\s*km/i);
  const priceMatches = [...normalized.matchAll(/([\d,]+)\s*만원/g)];

  if (!dateMatch || !mileageMatch || priceMatches.length === 0) return null;

  const dateIndex = dateMatch.index ?? 0;
  let title = normalized.slice(0, dateIndex).trim();
  title = title
    .replace(/^찜하기\s*/, "")
    .replace(/^'엔카믿고'는[^]*?제공합니다\s*/, "")
    .replace(/^(스마트키|내비게이션|열선시트|통풍시트|후방카메라|외장컬러|#[^\s]+)\s*/g, "")
    .trim();

  const year = 2000 + Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const mileageKm = Number(mileageMatch[1].replaceAll(",", ""));
  const priceManwon = Number(priceMatches.at(-1)[1].replaceAll(",", ""));
  const priceKrw = priceManwon * 10000;
  const contracted = /계약중/.test(normalized);

  const afterMileage = normalized.slice((mileageMatch.index ?? 0) + mileageMatch[0].length);
  const regionMatch = afterMileage.match(/전기\s+([가-힣]{2,4})/);

  return {
    id,
    url: new URL(href, "https://fem.encar.com").toString(),
    title,
    year,
    month,
    yearMonth: `${year}-${String(month).padStart(2, "0")}`,
    mileageKm,
    priceKrw,
    region: regionMatch?.[1] ?? "미확인",
    contracted,
    listText: normalized
  };
}

export function parseListHtml(html) {
  const results = new Map();
  const anchorPattern = /<a\b[^>]*href=(['"])([^'"]*\/cars\/detail\/\d+[^'"]*)\1[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtml(match[2]);
    const idMatch = href.match(/\/cars\/detail\/(\d+)/);
    if (!idMatch) continue;

    const parsed = parseListingText({
      id: idMatch[1],
      href,
      text: stripHtml(match[3])
    });
    if (!parsed) continue;

    const existing = results.get(parsed.id);
    if (!existing || parsed.listText.length < existing.listText.length) {
      results.set(parsed.id, parsed);
    }
  }

  return [...results.values()];
}

export function analyzeDetail(html, listing, config) {
  const text = stripHtml(html);
  const vehicleData = parsePreloadedVehicleData(html);
  const lower = text.toLowerCase();
  const hasFsd = /\bfsd\b|full self[- ]driving|완전\s*자율주행/i.test(text);
  const hasEap = /\beap\b|enhanced autopilot|향상된\s*오토파일럿|\bnoa\b/i.test(text);
  const rentalNegated = /렌트\s*(이력|용도)?\s*(없|무)|대여용도\s*(없|무)/i.test(text);
  const rental = !rentalNegated && /렌트|렌터카|대여용도/i.test(text);
  const smokingNegated = /비흡연|흡연\s*(없|무)|담배\s*(없|무)/i.test(text);
  const smokingWarning = !smokingNegated && /흡연|담배/i.test(text);
  const tuningWarning = /사제|튜닝|서스펜션|다운스프링|휠\s*교체|조명\s*튜닝/i.test(text);
  const redColor = config.excludedColorTerms.some((term) => lower.includes(term.toLowerCase()));

  return {
    ...listing,
    ...vehicleData,
    option: hasFsd ? "FSD" : hasEap ? "EAP" : "미확인",
    hasFsd,
    hasEap,
    rental,
    smokingWarning,
    tuningWarning,
    redColor,
    detailTextSample: text.slice(0, 500)
  };
}

export function matchesBasicCriteria(listing, config) {
  const titleOk = config.requiredTitleTerms.every((term) =>
    listing.title.toLowerCase().includes(term.toLowerCase())
  );
  return (
    titleOk &&
    listing.yearMonth >= config.yearMonthMin &&
    listing.yearMonth <= config.yearMonthMax &&
    listing.mileageKm <= config.maxMileageKm
  );
}

export function getBasicCriteriaFailureReasons(listing, config) {
  const reasons = [];
  const titleOk = config.requiredTitleTerms.every((term) =>
    listing.title.toLowerCase().includes(term.toLowerCase())
  );

  if (!titleOk) reasons.push("차종/트림 불일치");
  if (listing.yearMonth < config.yearMonthMin || listing.yearMonth > config.yearMonthMax) {
    reasons.push("연월 범위 초과");
  }
  if (listing.mileageKm > config.maxMileageKm) reasons.push("주행거리 초과");

  return reasons;
}

export function evaluateListing(listing, config) {
  const adjustedPriceKrw = listing.priceKrw + (listing.rental ? config.rentalPenaltyKrw : 0);
  let limitKrw = config.priceLimitsKrw.base;
  let reason = "일반 차량 기준";

  if (listing.hasFsd) {
    limitKrw = config.priceLimitsKrw.fsd;
    reason = "FSD 기준";
  } else if (listing.hasEap) {
    limitKrw = config.priceLimitsKrw.eap;
    reason = "EAP 기준";
  } else if (adjustedPriceKrw > config.priceLimitsKrw.base) {
    limitKrw = config.priceLimitsKrw.unknownOptionHardMax;
    reason = "옵션 확인 필요 기준";
  }

  const excludedReasons = [];
  if (config.excludeContracted && listing.contracted) excludedReasons.push("계약중");
  if (listing.redColor) excludedReasons.push("빨간색 계열");
  if (adjustedPriceKrw > limitKrw) {
    excludedReasons.push(listing.rental ? "렌트 감가 후 가격 초과" : "가격 초과");
  }

  const warnings = [];
  if (listing.option === "미확인" && adjustedPriceKrw > config.priceLimitsKrw.base) {
    warnings.push("EAP 또는 FSD 포함 여부 확인 필요");
  }
  if (listing.rental) warnings.push(`렌트 이력 감가 ${formatKrw(config.rentalPenaltyKrw)} 반영`);
  if (listing.smokingWarning) warnings.push("흡연 관련 문구 확인 필요");
  if (listing.tuningWarning) warnings.push("튜닝 관련 문구 확인 필요");

  return {
    ...listing,
    adjustedPriceKrw,
    limitKrw,
    priceRule: reason,
    eligible: excludedReasons.length === 0,
    excludedReasons,
    warnings
  };
}

export function prepareSendCurrentListing(listing, config, { detailSucceeded, errorMessage } = {}) {
  const reasons = [...getBasicCriteriaFailureReasons(listing, config)];
  let result = listing;

  if (detailSucceeded) {
    reasons.push(...(listing.excludedReasons ?? []));
  } else {
    const listText = `${listing.title} ${listing.listText ?? ""}`.toLowerCase();
    const listShowsRedColor = config.excludedColorTerms.some((term) =>
      listText.includes(term.toLowerCase())
    );

    if (config.excludeContracted && listing.contracted) reasons.push("계약중");
    if (listShowsRedColor) reasons.push("빨간색 계열");
    if (listing.priceKrw > config.priceLimitsKrw.unknownOptionHardMax) reasons.push("가격 초과");
    reasons.push("상세 확인 실패");
    if (listing.priceKrw > config.priceLimitsKrw.base) reasons.push("옵션 미확인");
    result = {
      ...listing,
      option: "상세 확인 실패",
      adjustedPriceKrw: listing.priceKrw,
      limitKrw: config.priceLimitsKrw.unknownOptionHardMax,
      priceRule: "상세 확인 실패",
      eligible: false,
      excludedReasons: [],
      warnings: errorMessage ? [`상세 확인 실패: ${errorMessage}`] : ["상세 확인 실패"],
      detailFailed: true
    };
  }

  const conditionReasons = [...new Set(reasons)];
  return {
    ...result,
    conditionStatus: conditionReasons.length === 0 ? "조건 충족" : "조건 미충족",
    conditionReasons,
    detailFailed: !detailSucceeded
  };
}

export function getListingInspection(previous, listing, runMode) {
  const hasConfirmedState = Number.isFinite(previous?.priceKrw);
  const isNew = !hasConfirmedState;
  const priceChanged = hasConfirmedState && previous.priceKrw !== listing.priceKrw;

  return {
    isNew,
    priceChanged,
    priceDropped: priceChanged && listing.priceKrw < previous.priceKrw,
    priceIncreased: priceChanged && listing.priceKrw > previous.priceKrw,
    shouldInspect: runMode === "send_current" || isNew || priceChanged
  };
}

export function findPreviousListing(listings, listing) {
  const exact = listings?.[listing.id];
  if (exact) {
    return { previous: exact, previousListingId: listing.id, matchedBy: "listingId" };
  }

  const vehicleNo = normalizeVehicleNo(listing.vehicleNo);
  if (!vehicleNo) return { previous: undefined, previousListingId: null, matchedBy: null };

  const matches = Object.entries(listings ?? {})
    .filter(([, previous]) => normalizeVehicleNo(previous?.vehicleNo) === vehicleNo)
    .sort(([, left], [, right]) =>
      String(right?.lastSeenAt ?? "").localeCompare(String(left?.lastSeenAt ?? ""))
    );
  const [match] = matches;
  if (!match) return { previous: undefined, previousListingId: null, matchedBy: null };

  return { previous: match[1], previousListingId: match[0], matchedBy: "vehicleNo" };
}

function isBetterRepresentative(candidate, current) {
  if (Boolean(candidate.detailSucceeded) !== Boolean(current.detailSucceeded)) {
    return Boolean(candidate.detailSucceeded);
  }
  if (Boolean(candidate.listing?.contracted) !== Boolean(current.listing?.contracted)) {
    return !candidate.listing?.contracted;
  }
  return candidate.order < current.order;
}

export function selectRepresentativeCandidates(candidates) {
  const groups = new Map();

  for (const [index, candidate] of candidates.entries()) {
    const order = candidate.order ?? index;
    const vehicleNo = normalizeVehicleNo(candidate.listing?.vehicleNo);
    const key = vehicleNo ? `vehicle:${vehicleNo}` : `listing:${candidate.listing.id}`;
    const normalizedCandidate = { ...candidate, order };
    const group = groups.get(key) ?? [];
    group.push(normalizedCandidate);
    groups.set(key, group);
  }

  const representatives = [];
  const duplicates = [];
  for (const group of groups.values()) {
    const representative = group.reduce((current, candidate) =>
      isBetterRepresentative(candidate, current) ? candidate : current
    );
    representatives.push(representative);
    for (const candidate of group) {
      if (candidate !== representative) duplicates.push({ representative, duplicate: candidate });
    }
  }

  representatives.sort((left, right) => left.order - right.order);
  duplicates.sort((left, right) => left.duplicate.order - right.duplicate.order);
  return { representatives, duplicates };
}

export function applyRepresentativeState(listings, candidate) {
  const currentListingId = String(candidate.listing.id);
  const vehicleNo = normalizeVehicleNo(candidate.listing.vehicleNo);
  const stateRecord = {
    ...candidate.stateRecord,
    id: currentListingId,
    vehicleNo
  };

  if (!vehicleNo) {
    listings[currentListingId] = stateRecord;
    return { stateRecord, removedListingIds: [] };
  }

  const matchingPreviousEntries = Object.entries(listings)
    .filter(
      ([listingId, previous]) =>
        listingId !== currentListingId && normalizeVehicleNo(previous?.vehicleNo) === vehicleNo
    )
    .sort(([, left], [, right]) =>
      String(right?.lastSeenAt ?? "").localeCompare(String(left?.lastSeenAt ?? ""))
    );
  const removedListingIds = matchingPreviousEntries.map(([listingId]) => listingId);

  for (const listingId of removedListingIds) delete listings[listingId];

  const recordedPreviousListingId = candidate.stateRecord?.previousListingId
    ? String(candidate.stateRecord.previousListingId)
    : null;
  const previousListingId = removedListingIds.includes(recordedPreviousListingId)
    ? recordedPreviousListingId
    : (removedListingIds[0] ?? recordedPreviousListingId);
  if (previousListingId && previousListingId !== currentListingId) {
    stateRecord.previousListingId = previousListingId;
  }

  listings[currentListingId] = stateRecord;
  return { stateRecord, removedListingIds };
}

export function formatDuplicateListingLog(representative, duplicate) {
  return `Duplicate listing suppressed: vehicle=${maskVehicleNo(representative.listing.vehicleNo)}, representative=${representative.listing.id}, duplicate=${duplicate.listing.id}`;
}

export function recordDetailFailure(previous, listing, now, errorMessage) {
  const { priceKrw: observedPriceKrw, listText: _listText, ...observation } = listing;
  const record = previous
    ? { ...previous }
    : {
        ...observation,
        firstSeenAt: now
      };

  return {
    ...record,
    vehicleNo: normalizeVehicleNo(listing.vehicleNo) ?? normalizeVehicleNo(previous?.vehicleNo),
    lastSeenAt: now,
    lastObservedPriceKrw: observedPriceKrw,
    lastDetailFetchFailedAt: now,
    lastDetailFetchError: errorMessage
  };
}

export function recordListObservation(previous, listing, now) {
  return {
    ...previous,
    id: listing.id,
    title: listing.title,
    url: listing.url,
    yearMonth: listing.yearMonth,
    mileageKm: listing.mileageKm,
    priceKrw: listing.priceKrw,
    region: listing.region,
    contracted: listing.contracted,
    vehicleNo: normalizeVehicleNo(listing.vehicleNo) ?? normalizeVehicleNo(previous?.vehicleNo),
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now
  };
}

export function recordDetailSuccess(previous, listing, evaluated, now) {
  const previousId = previous?.id ? String(previous.id) : null;
  const previousListingId =
    previousId && previousId !== String(listing.id)
      ? previousId
      : previous?.previousListingId;
  const record = {
    ...(previous ?? {}),
    id: listing.id,
    title: listing.title,
    url: listing.url,
    yearMonth: listing.yearMonth,
    mileageKm: listing.mileageKm,
    priceKrw: listing.priceKrw,
    region: listing.region,
    contracted: listing.contracted,
    vehicleNo:
      normalizeVehicleNo(evaluated.vehicleNo) ?? normalizeVehicleNo(previous?.vehicleNo),
    ...(previousListingId ? { previousListingId } : {}),
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now,
    option: evaluated.option,
    rental: evaluated.rental,
    eligible: evaluated.eligible,
    lastEvaluatedAt: now
  };

  delete record.lastObservedPriceKrw;
  delete record.lastDetailFetchFailedAt;
  delete record.lastDetailFetchError;
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
  if (runMode === "send_current") {
    return {
      type: `현재 검색 결과 · ${listing.conditionStatus ?? (listing.eligible ? "조건 충족" : "조건 미충족")}`,
      listing
    };
  }
  if (!detailSucceeded || !listing.eligible) return null;
  if (wasInitialized && inspection.isNew) return { type: "신규", listing };
  if (wasInitialized && inspection.priceDropped) {
    return {
      type: `가격 인하 ${previous.priceKrw.toLocaleString("ko-KR")}원 → ${listing.priceKrw.toLocaleString("ko-KR")}원`,
      listing
    };
  }
  if (wasInitialized && inspection.priceIncreased && notifyPriceIncrease) {
    return {
      type: `가격 인상 ${previous.priceKrw.toLocaleString("ko-KR")}원 → ${listing.priceKrw.toLocaleString("ko-KR")}원`,
      listing
    };
  }
  return null;
}

export function formatKrw(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatKm(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}㎞`;
}

export function createTelegramMessageRequest(chatId, text) {
  return {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true }
  };
}

function formatTelegramOption(option) {
  if (option === "FSD") return "옵션: FSD 확인";
  if (option === "EAP") return "옵션: EAP 확인";
  return "옵션: 미확인";
}

export function formatTelegramMessage(eventType, listing) {
  const lines = [
    `[${eventType}]`,
    `${listing.yearMonth.replace("-", "/")} ${listing.title}`,
    `차량번호: ${normalizeVehicleNo(listing.vehicleNo) ?? "미확인"}`,
    ...(listing.conditionStatus
      ? [
          `판정: ${listing.conditionStatus}`,
          ...(listing.conditionReasons?.length ? [`사유: ${listing.conditionReasons.join(", ")}`] : [])
        ]
      : []),
    `${formatKm(listing.mileageKm)} | ${formatKrw(listing.priceKrw)} | ${listing.region}`,
    formatTelegramOption(listing.option)
  ];

  if (listing.detailFailed) lines.push("상세: 상세 확인 실패");
  if (listing.rental) lines.push(`렌트 감가 반영 평가가격: ${formatKrw(listing.adjustedPriceKrw)}`);
  lines.push(listing.url);
  return lines.join("\n");
}

export function setPage(urlString, page) {
  const url = new URL(urlString);
  url.searchParams.set("page", String(page));
  return url.toString();
}

export async function loadJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

export async function saveJson(path, value) {
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
