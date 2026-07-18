import {
  DEFAULT_SEARCH_URL,
  analyzeDetail,
  evaluateListing,
  formatTelegramMessage,
  loadJson,
  matchesBasicCriteria,
  parseListHtml,
  saveJson,
  setPage,
  sleep
} from "./lib.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 PersonalListingMonitor/1.0";

const config = await loadJson(new URL("../config.json", import.meta.url));
const statePath = process.env.STATE_PATH || "data/state.json";
const state = await loadJson(statePath);
const runMode = process.env.RUN_MODE || "normal";
const searchUrl = process.env.ENCAR_SEARCH_URL || DEFAULT_SEARCH_URL;
const maxPages = Number(process.env.MAX_PAGES || config.maxPages);
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

function requireTelegramSecrets() {
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 필요합니다.");
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9"
      },
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function sendTelegram(text) {
  requireTelegramSecrets();
  if (text.length > 4096) throw new Error("텔레그램 메시지가 4096자를 초과했습니다.");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      protect_content: true,
      link_preview_options: { is_disabled: true }
    })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`텔레그램 전송 실패: ${JSON.stringify(result)}`);
  }
}

if (runMode === "telegram_test") {
  await sendTelegram("Sentinel-o-car 텔레그램 연결 테스트가 성공했습니다.");
  console.log("Telegram test sent.");
  process.exit(0);
}

const listingsById = new Map();
for (let page = 1; page <= maxPages; page += 1) {
  const pageUrl = setPage(searchUrl, page);
  console.log(`Fetching list page ${page}: ${pageUrl}`);
  const html = await fetchText(pageUrl);
  const parsed = parseListHtml(html);
  console.log(`Parsed ${parsed.length} unique listings from page ${page}.`);
  for (const listing of parsed) listingsById.set(listing.id, listing);
  if (page < maxPages) await sleep(config.requestDelayMs);
}

if (listingsById.size === 0) {
  throw new Error(
    "엔카 목록에서 매물을 하나도 추출하지 못했습니다. 페이지 구조 변경 또는 접근 제한 가능성이 있습니다."
  );
}

const now = new Date().toISOString();
const wasInitialized = Boolean(state.initializedAt);
const events = [];

for (const listing of listingsById.values()) {
  if (!matchesBasicCriteria(listing, config)) continue;

  const previous = state.listings[listing.id];
  const isNew = !previous;
  const priceChanged = previous && previous.priceKrw !== listing.priceKrw;
  const priceDropped = priceChanged && listing.priceKrw < previous.priceKrw;
  const priceIncreased = priceChanged && listing.priceKrw > previous.priceKrw;
  const shouldInspect = runMode === "send_current" || isNew || priceChanged;

  state.listings[listing.id] = {
    ...(previous ?? {}),
    id: listing.id,
    title: listing.title,
    url: listing.url,
    yearMonth: listing.yearMonth,
    mileageKm: listing.mileageKm,
    priceKrw: listing.priceKrw,
    region: listing.region,
    contracted: listing.contracted,
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now
  };

  if (!shouldInspect) continue;

  await sleep(config.requestDelayMs);
  let enriched = { ...listing, hasFsd: false, hasEap: false, option: "미확인", rental: false, smokingWarning: false, tuningWarning: false, redColor: false };
  try {
    const detailHtml = await fetchText(listing.url);
    enriched = analyzeDetail(detailHtml, listing, config);
  } catch (error) {
    console.warn(`Detail fetch failed for ${listing.id}:`, error.message);
  }
  const evaluated = evaluateListing(enriched, config);

  state.listings[listing.id] = {
    ...state.listings[listing.id],
    option: evaluated.option,
    rental: evaluated.rental,
    eligible: evaluated.eligible,
    lastEvaluatedAt: now
  };

  if (!evaluated.eligible) {
    console.log(`Excluded ${listing.id}: ${evaluated.excludedReasons.join(", ")}`);
    continue;
  }

  if (runMode === "send_current") {
    events.push({ type: "현재 조건 충족", listing: evaluated });
  } else if (wasInitialized && isNew) {
    events.push({ type: "신규", listing: evaluated });
  } else if (wasInitialized && priceDropped) {
    events.push({ type: `가격 인하 ${previous.priceKrw.toLocaleString("ko-KR")}원 → ${listing.priceKrw.toLocaleString("ko-KR")}원`, listing: evaluated });
  } else if (wasInitialized && priceIncreased && config.notifyPriceIncrease) {
    events.push({ type: `가격 인상 ${previous.priceKrw.toLocaleString("ko-KR")}원 → ${listing.priceKrw.toLocaleString("ko-KR")}원`, listing: evaluated });
  }
}

if (!wasInitialized) {
  state.initializedAt = now;
  await sendTelegram(
    `Sentinel-o-car 매물 감시를 시작했습니다.\n현재 조건 대상 ${Object.keys(state.listings).length}건을 기준점으로 저장했습니다.\n이후 신규 매물과 가격 인하를 알립니다.`
  );
} else {
  for (const event of events) {
    await sendTelegram(formatTelegramMessage(event.type, event.listing));
    await sleep(500);
  }
}

state.updatedAt = now;
await saveJson(statePath, state);
console.log(`Done. ${events.length} notification(s).`);
