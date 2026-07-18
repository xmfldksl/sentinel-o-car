import fs from "node:fs/promises";

export const DEFAULT_SEARCH_URL =
  "https://car.encar.com/list/car?page=1&search=%7B%22type%22%3A%22car%22%2C%22action%22%3A%22%28And.Hidden.N._.MultiView2Hidden.N._.MultiViewHidden.N._.%28C.CarType.N._.%28C.Manufacturer.%ED%85%8C%EC%8A%AC%EB%9D%BC._.%28C.ModelGroup.%EB%AA%A8%EB%8D%B8+3._.Model.%EB%AA%A8%EB%8D%B8+3.%29%29%29%29%22%2C%22toggle%22%3A%7B%7D%2C%22layer%22%3A%22%22%2C%22sort%22%3A%22MobileModifiedDate%22%7D";

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
  if (adjustedPriceKrw > limitKrw) excludedReasons.push("가격 기준 초과");

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

export function formatKrw(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatKm(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}㎞`;
}

export function formatTelegramMessage(eventType, listing) {
  const lines = [
    `[Sentinel-o-car ${eventType}]`,
    `${listing.yearMonth.replace("-", "/")} ${listing.title}`,
    `${formatKm(listing.mileageKm)} | ${formatKrw(listing.priceKrw)} | ${listing.region}`,
    `옵션 판정: ${listing.option}`,
    `적용 기준: ${listing.priceRule} ${formatKrw(listing.limitKrw)}`
  ];

  if (listing.rental) lines.push(`렌트 감가 반영 평가가격: ${formatKrw(listing.adjustedPriceKrw)}`);
  if (listing.warnings.length) lines.push(`확인사항: ${listing.warnings.join(" / ")}`);
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
