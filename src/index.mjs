import {
  analyzeDetail,
  applyRepresentativeState,
  createTelegramMessageRequest,
  createListingEvent,
  evaluateListing,
  findPreviousListing,
  formatDuplicateListingLog,
  formatSearchUrlSummary,
  formatTelegramMessage,
  getListingInspection,
  loadJson,
  matchesBasicCriteria,
  migrateLegacyState,
  parseListHtml,
  prepareSendCurrentListing,
  recordDetailFailure,
  recordListObservation,
  recordDetailSuccess,
  recordTelegramDelivery,
  resolveSearchUrl,
  saveJson,
  selectRepresentativeCandidates,
  setPage,
  sleep
} from "./lib.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 PersonalListingMonitor/1.0";

const TELEGRAM_MIN_INTERVAL_MS = 1100;
const TELEGRAM_MAX_ATTEMPTS = 5;

const searchUrlConfig = resolveSearchUrl();
const searchUrl = searchUrlConfig.url;
console.log(formatSearchUrlSummary(searchUrlConfig));

const config = await loadJson(
  new URL("../config.json", import.meta.url)
);

const statePath =
  process.env.STATE_PATH ||
  "data/state.json";

const state = migrateLegacyState(
  await loadJson(statePath)
);

const runMode =
  process.env.RUN_MODE ||
  "normal";

const maxPages = Number(
  process.env.MAX_PAGES ||
  config.maxPages
);

const token =
  process.env.TELEGRAM_BOT_TOKEN;

const chatId =
  process.env.TELEGRAM_CHAT_ID;

let lastTelegramSentAt = 0;

function requireTelegramSecrets() {
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 필요합니다."
    );
  }
}

async function fetchText(url) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    30000
  );

  try {
    const response = await fetch(
      url,
      {
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml",
          "accept-language":
            "ko-KR,ko;q=0.9"
        },
        signal: controller.signal,
        redirect: "follow"
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForTelegramPacing() {
  const elapsed =
    Date.now() -
    lastTelegramSentAt;

  const delay = Math.max(
    0,
    TELEGRAM_MIN_INTERVAL_MS -
      elapsed
  );

  if (delay > 0) {
    await sleep(delay);
  }
}

async function sendTelegram(text) {
  requireTelegramSecrets();

  if (text.length > 4096) {
    throw new Error(
      "텔레그램 메시지가 4096자를 초과했습니다."
    );
  }

  for (
    let attempt = 1;
    attempt <=
    TELEGRAM_MAX_ATTEMPTS;
    attempt += 1
  ) {
    await waitForTelegramPacing();

    const response = await fetch(
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

    try {
      result =
        await response.json();
    } catch {
      throw new Error(
        `텔레그램 응답 해석 실패: HTTP ${response.status}`
      );
    }

    if (
      response.ok &&
      result.ok
    ) {
      lastTelegramSentAt =
        Date.now();

      return result.result;
    }

    const rateLimited =
      response.status === 429 ||
      result?.error_code === 429;

    const retryAfterValue =
      Number(
        result?.parameters
          ?.retry_after
      );

    const retryAfterSeconds =
      Number.isFinite(
        retryAfterValue
      ) &&
      retryAfterValue > 0
        ? retryAfterValue
        : 5;

    if (
      rateLimited &&
      attempt <
        TELEGRAM_MAX_ATTEMPTS
    ) {
      console.warn(
        "Telegram rate limited. " +
          `${retryAfterSeconds}초 후 재시도합니다. ` +
          `시도 ${attempt}/${TELEGRAM_MAX_ATTEMPTS}`
      );

      await sleep(
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

if (
  runMode ===
  "telegram_test"
) {
  await sendTelegram(
    "텔레그램 연결 테스트가 성공했습니다."
  );

  console.log(
    "Telegram test sent."
  );

  process.exit(0);
}

const listingsById =
  new Map();

for (
  let page = 1;
  page <= maxPages;
  page += 1
) {
  const pageUrl =
    setPage(
      searchUrl,
      page
    );

  console.log(
    `Fetching list page ${page}.`
  );

  const html =
    await fetchText(pageUrl);

  const parsed =
    parseListHtml(html);

  console.log(
    `Parsed ${parsed.length} unique listings from page ${page}.`
  );

  for (
    const listing of parsed
  ) {
    listingsById.set(
      listing.id,
      listing
    );
  }

  if (page < maxPages) {
    await sleep(
      config.requestDelayMs
    );
  }
}

if (
  listingsById.size === 0
) {
  throw new Error(
    "엔카 목록에서 매물을 하나도 추출하지 못했습니다. 페이지 구조 변경 또는 접근 제한 가능성이 있습니다."
  );
}

const now =
  new Date().toISOString();

const wasInitialized =
  Boolean(
    state.initializedAt
  );

const isSendCurrent =
  runMode ===
  "send_current";

const events = [];

const previousListings = {
  ...state.listings
};

const candidates = [];

let listingOrder = 0;

for (
  const listing of
  listingsById.values()
) {
  const order =
    listingOrder;

  listingOrder += 1;

  if (
    !isSendCurrent &&
    !matchesBasicCriteria(
      listing,
      config
    )
  ) {
    continue;
  }

  let { previous } =
    findPreviousListing(
      previousListings,
      listing
    );

  let inspection =
    getListingInspection(
      previous,
      listing,
      runMode
    );

  if (
    !inspection.shouldInspect
  ) {
    const observedListing = {
      ...listing,
      vehicleNo:
        previous?.vehicleNo ??
        null
    };

    candidates.push({
      order,
      listing:
        observedListing,
      detailSucceeded: false,
      stateRecord:
        recordListObservation(
          previous,
          observedListing,
          now
        ),
      event: null
    });

    continue;
  }

  await sleep(
    config.requestDelayMs
  );

  let detailHtml;

  try {
    detailHtml =
      await fetchText(
        listing.url
      );
  } catch (error) {
    console.warn(
      `Detail fetch failed for ${listing.id}:`,
      error.message
    );

    const failedListing = {
      ...listing,
      vehicleNo:
        previous?.vehicleNo ??
        null
    };

    const eventListing =
      isSendCurrent
        ? prepareSendCurrentListing(
            failedListing,
            config,
            {
              detailSucceeded:
                false,
              errorMessage:
                error.message
            }
          )
        : failedListing;

    const event =
      createListingEvent({
        runMode,
        wasInitialized,
        inspection,
        previous,
        listing:
          eventListing,
        detailSucceeded:
          false,
        notifyPriceIncrease:
          config.notifyPriceIncrease
      });

    candidates.push({
      order,
      listing:
        eventListing,
      detailSucceeded: false,
      stateRecord:
        recordDetailFailure(
          previous,
          failedListing,
          now,
          error.message
        ),
      event
    });

    continue;
  }

  const enriched =
    analyzeDetail(
      detailHtml,
      listing,
      config
    );

  ({ previous } =
    findPreviousListing(
      previousListings,
      enriched
    ));

  inspection =
    getListingInspection(
      previous,
      enriched,
      runMode
    );

  const evaluated =
    evaluateListing(
      enriched,
      config
    );

  const eventListing =
    isSendCurrent
      ? prepareSendCurrentListing(
          evaluated,
          config,
          {
            detailSucceeded:
              true
          }
        )
      : evaluated;

  if (
    !isSendCurrent &&
    !evaluated.eligible
  ) {
    console.log(
      `Excluded ${listing.id}: ${evaluated.excludedReasons.join(", ")}`
    );
  }

  const event =
    createListingEvent({
      runMode,
      wasInitialized,
      inspection,
      previous,
      listing:
        eventListing,
      detailSucceeded: true,
      notifyPriceIncrease:
        config.notifyPriceIncrease
    });

  candidates.push({
    order,
    listing:
      eventListing,
    detailSucceeded: true,
    stateRecord:
      recordDetailSuccess(
        previous,
        enriched,
        evaluated,
        now
      ),
    event
  });
}

const {
  representatives,
  duplicates
} =
  selectRepresentativeCandidates(
    candidates
  );

for (
  const {
    representative,
    duplicate
  } of duplicates
) {
  console.log(
    formatDuplicateListingLog(
      representative,
      duplicate
    )
  );
}

for (
  const candidate of
  representatives
) {
  applyRepresentativeState(
    state.listings,
    candidate
  );

  if (candidate.event) {
    events.push(
      candidate.event
    );
  }
}

if (
  !wasInitialized &&
  !isSendCurrent
) {
  state.initializedAt = now;

  await sendTelegram(
    `매물 감시를 시작했습니다.\n현재 조건 대상 ${Object.keys(state.listings).length}건을 기준점으로 저장했습니다.\n이후 신규 매물과 가격 인하를 알립니다.`
  );
} else {
  for (
    const event of events
  ) {
    const text =
      formatTelegramMessage(
        event.type,
        event.listing
      );

    const message =
      await sendTelegram(
        text
      );

    if (!isSendCurrent) {
      const listingId =
        String(
          event.listing.id
        );

      const stateRecord =
        state.listings[
          listingId
        ];

      if (stateRecord) {
        state.listings[
          listingId
        ] =
          recordTelegramDelivery(
            stateRecord,
            message,
            new Date()
              .toISOString()
          );
      }
    }

    await sleep(500);
  }
}

state.updatedAt = now;

await saveJson(
  statePath,
  state
);

console.log(
  `Done. ${events.length} notification(s).`
);