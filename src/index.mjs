import {
  analyzeDetail,
  applyRepresentativeState,
  createListingEvent,
  createSearchUrlFingerprint,
  evaluateListing,
  findPreviousListing,
  formatDuplicateListingLog,
  formatTelegramMessage,
  getListingInspection,
  isTrustedTitleSource,
  loadJson,
  matchesTitleFilter,
  needsTitleResolution,
  needsVehicleIdentityResolution,
  normalizeVehicleNo,
  parseListHtml,
  prepareSendCurrentListing,
  recordDetailFailure,
  recordDetailSuccess,
  recordListObservation,
  reconcileListingDeletions,
  recordTelegramDelivery,
  resolveListingTitle,
  saveJson,
  selectRepresentativeCandidates,
  setPage,
  sleep
} from "./lib.mjs";
import {
  createTelegramSender,
  mergeProfileEvents,
  normalizeWatcherConfig,
  normalizeWatcherState,
  runProfilesSequentially
} from "./runtime.mjs";
import {
  createEncarRequestPacer
} from "./request-pacer.mjs";
import { pathToFileURL } from "node:url";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 PersonalListingMonitor/1.0";

const SUPPORTED_RUN_MODES = new Set([
  "normal",
  "send_current",
  "telegram_test"
]);

const LIST_PAGE_MAX_ATTEMPTS = 3;

function profileLabel(profile) {
  return `[${profile.id} | ${profile.name}]`;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    30000
  );

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableListPageError(
  error
) {
  const status = Number(
    /\bHTTP (\d{3})\b/.exec(
      error?.message ?? ""
    )?.[1]
  );

  if (!Number.isFinite(status)) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  return (
    status === 408 || status === 429
  );
}

async function fetchListPageWithRetry({
  profile,
  page,
  pageUrl,
  fetchTextImpl,
  requestPacer,
  requestDelayMs,
  maxAttempts = LIST_PAGE_MAX_ATTEMPTS,
  logger
}) {
  let attempts = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts += 1;

    await requestPacer.wait(
      requestDelayMs
    );

    try {
      return {
        ok: true,
        attempts,
        html: await fetchTextImpl(
          pageUrl
        )
      };
    } catch (error) {
      lastError = error;

      if (
        !isRetryableListPageError(
          error
        ) ||
        attempts >= maxAttempts
      ) {
        break;
      }

      logger.warn(
        `${profileLabel(profile)} List page ${page} fetch failed (attempt ${attempts}/${maxAttempts}): ${error.message}. Retrying.`
      );
    }
  }

  return {
    ok: false,
    attempts,
    error: lastError
  };
}

function logProfileSearch(
  profile,
  logger = console
) {
  const url = new URL(profile.searchUrl);

  logger.log(
    [
      `${profileLabel(profile)} 검색 URL 출처: ${profile.searchUrlSource}`,
      `${profileLabel(profile)} 검색 URL 호스트: ${url.host}`,
      `${profileLabel(profile)} 검색 URL page: ${url.searchParams.get("page") ?? "없음"}`,
      `${profileLabel(profile)} 검색 URL 지문: ${createSearchUrlFingerprint(profile.searchUrl)}`
    ].join("\n")
  );
}

async function collectProfileListings(
  profile,
  {
    maxPages,
    requestDelayMs,
    fetchTextImpl = fetchText,
    requestPacer: providedRequestPacer,
    sleepImpl = sleep,
    nowMs = Date.now,
    maxPageAttempts = LIST_PAGE_MAX_ATTEMPTS,
    logger = console
  } = {}
) {
  const listingsById = new Map();
  const requestPacer =
    providedRequestPacer ??
    createEncarRequestPacer({
      sleepImpl,
      nowMs
    });
  let partial = false;
  let failedPage = null;
  let failedPageAttempts = 0;

  logProfileSearch(profile, logger);

  for (
    let page = 1;
    page <= maxPages;
    page += 1
  ) {
    const pageUrl = setPage(
      profile.searchUrl,
      page
    );

    logger.log(
      `${profileLabel(profile)} Fetching list page ${page}.`
    );

    const pageResult =
      await fetchListPageWithRetry({
        profile,
        page,
        pageUrl,
        fetchTextImpl,
        requestPacer,
        requestDelayMs,
        maxAttempts: maxPageAttempts,
        logger
      });

    if (!pageResult.ok) {
      if (page === 1) {
        throw pageResult.error;
      }

      partial = true;
      failedPage = page;
      failedPageAttempts =
        pageResult.attempts;

      logger.warn(
        `${profileLabel(profile)} List page ${page} failed after ${pageResult.attempts} attempt(s): ${pageResult.error.message}. Continuing with ${listingsById.size} collected listing(s); deletion reconciliation is suppressed for this partial crawl.`
      );
      break;
    }

    const parsed = parseListHtml(
      pageResult.html
    );

    logger.log(
      `${profileLabel(profile)} Parsed ${parsed.length} unique listings from page ${page}.`
    );

    for (const listing of parsed) {
      listingsById.set(listing.id, listing);
    }
  }

  if (listingsById.size === 0) {
    throw new Error(
      "엔카 목록에서 매물을 하나도 추출하지 못했습니다. 페이지 구조 변경 또는 접근 제한 가능성이 있습니다."
    );
  }

  return {
    listingsById,
    partial,
    failedPage,
    failedPageAttempts
  };
}

function createProfileEventEnvelope(
  event,
  profile,
  observedAt
) {
  const stateListingId = String(
    event.stateListingId ??
      event.listing.id
  );

  return {
    ...event,
    profile: {
      id: profile.id,
      name: profile.name,
      isTesla: profile.isTesla
    },
    profileId: profile.id,
    profileName: profile.name,
    profileNames: [profile.name],
    observedAt,
    stateTargets: [
      {
        profileId: profile.id,
        stateListingId
      }
    ]
  };
}

async function processProfile({
  profile,
  profileState,
  runMode,
  maxPages,
  requestDelayMs,
  notifyPriceIncrease,
  fetchTextImpl = fetchText,
  sleepImpl = sleep,
  requestPacer: providedRequestPacer,
  nowMs = Date.now,
  maxPageAttempts = LIST_PAGE_MAX_ATTEMPTS,
  logger = console,
  nowIso = () =>
    new Date().toISOString()
}) {
  const requestPacer =
    providedRequestPacer ??
    createEncarRequestPacer({
      sleepImpl,
      nowMs
    });
  const state =
    structuredClone(profileState);

  const {
    listingsById: collectedListingsById,
    partial: partialCrawl,
    failedPage: failedListPage,
    failedPageAttempts:
      failedListPageAttempts
  } = await collectProfileListings(
    profile,
    {
      fetchTextImpl,
      requestPacer,
      maxPages,
      requestDelayMs,
      maxPageAttempts,
      logger
    }
  );
  const listingsById = new Map();
  const now = nowIso();
  const wasInitialized = Boolean(
    state.initializedAt
  );
  const isSendCurrent =
    runMode === "send_current";
  const events = [];
  const previousListings = {
    ...state.listings
  };
  const candidates = [];
  let listingOrder = 0;

  for (const listing of collectedListingsById.values()) {
    const order = listingOrder;
    listingOrder += 1;

    let { previous } = findPreviousListing(
      previousListings,
      listing
    );
    const listTitle = resolveListingTitle(
      previous,
      listing
    );

    if (
      isTrustedTitleSource(
        listTitle.titleSource
      ) &&
      !matchesTitleFilter(
        listTitle.title,
        profile
      )
    ) {
      continue;
    }

    const mustResolveTitle =
      needsTitleResolution(
        previous,
        listing
      );
    let inspection = getListingInspection(
      previous,
      listing,
      runMode
    );

    if (
      !inspection.shouldInspect &&
      !mustResolveTitle
    ) {
      const observedListing = {
        ...listing,
        ...listTitle,
        vehicleNo:
          previous?.vehicleNo ?? null
      };

      listingsById.set(
        listing.id,
        observedListing
      );
      candidates.push({
        order,
        listing: observedListing,
        detailSucceeded: false,
        stateRecord: recordListObservation(
          previous,
          observedListing,
          now,
          profile.isTesla
        ),
        event: null
      });
      continue;
    }

    await requestPacer.wait(
      requestDelayMs
    );

    let detailHtml;

    try {
      detailHtml = await fetchTextImpl(
        listing.url
      );
    } catch (error) {
      logger.warn(
        `${profileLabel(profile)} Detail fetch failed for ${listing.id}: ${error.message}`
      );

      const failedListing = {
        ...listing,
        ...listTitle,
        vehicleNo:
          previous?.vehicleNo ?? null,
        colorName:
          previous?.colorName ?? null
      };

      if (
        !matchesTitleFilter(
          failedListing.title,
          profile
        )
      ) {
        continue;
      }

      listingsById.set(
        listing.id,
        failedListing
      );

      const eventListing = isSendCurrent
        ? prepareSendCurrentListing(
            failedListing,
            profile,
            {
              detailSucceeded: false
            }
          )
        : failedListing;
      const event = createListingEvent({
        runMode,
        wasInitialized,
        inspection,
        previous,
        listing: eventListing,
        detailSucceeded: false,
        notifyPriceIncrease:
          notifyPriceIncrease
      });

      candidates.push({
        order,
        listing: eventListing,
        detailSucceeded: false,
        stateRecord: recordDetailFailure(
          previous,
          failedListing,
          now,
          error.message,
          profile.isTesla
        ),
        event
      });
      continue;
    }

    const analyzed = analyzeDetail(
      detailHtml,
      listing,
      profile
    );

    ({ previous } = findPreviousListing(
      previousListings,
      analyzed
    ));

    const enriched = {
      ...analyzed,
      ...resolveListingTitle(
        previous,
        analyzed
      )
    };

    if (
      !matchesTitleFilter(
        enriched.title,
        profile
      )
    ) {
      continue;
    }

    listingsById.set(
      listing.id,
      enriched
    );

    inspection = getListingInspection(
      previous,
      enriched,
      runMode
    );

    const evaluated = evaluateListing(
      enriched,
      profile
    );
    const eventListing = isSendCurrent
      ? prepareSendCurrentListing(
          evaluated,
          profile,
          { detailSucceeded: true }
        )
      : evaluated;

    const event = createListingEvent({
      runMode,
      wasInitialized,
      inspection,
      previous,
      listing: eventListing,
      detailSucceeded: true,
      notifyPriceIncrease:
        notifyPriceIncrease
    });

    candidates.push({
      order,
      listing: eventListing,
      detailSucceeded: true,
      stateRecord: recordDetailSuccess(
        previous,
        enriched,
        evaluated,
        now,
        profile.isTesla
      ),
      event
    });
  }

  const {
    representatives,
    duplicates
  } = selectRepresentativeCandidates(
    candidates
  );

  for (
    const {
      representative,
      duplicate
    } of duplicates
  ) {
    logger.log(
      `${profileLabel(profile)} ${formatDuplicateListingLog(
        representative,
        duplicate
      )}`
    );
  }

  const needsIdentityResolution =
    runMode === "normal" &&
    wasInitialized &&
    needsVehicleIdentityResolution({
      previousListings,
      currentListings:
        collectedListingsById,
      representatives
    });
  const identityResolutionComplete =
    !needsIdentityResolution ||
    (listingsById.size ===
      collectedListingsById.size &&
      candidates.every((candidate) =>
        Boolean(
          normalizeVehicleNo(
            candidate.listing.vehicleNo
          )
        )
      ));

  for (const candidate of representatives) {
    const previousMatch = findPreviousListing(
      previousListings,
      candidate.listing
    ).previous;
    const deletionTracked = isSendCurrent
      ? Boolean(previousMatch) &&
        previousMatch.deletionTracked !== false
      : true;

    applyRepresentativeState(
      state.listings,
      {
        ...candidate,
        stateRecord: {
          ...candidate.stateRecord,
          deletionTracked
        }
      }
    );

    if (candidate.event) {
      events.push(candidate.event);
    }
  }

  const deletionResult =
    reconcileListingDeletions({
      stateListings: state.listings,
      previousListings,
      currentListings:
        collectedListingsById,
      representatives,
      identityResolutionComplete,
      deletionSuppressed: partialCrawl,
      now,
      runMode,
      wasInitialized
    });

  events.push(...deletionResult.events);

  const initializedNow =
    !wasInitialized && !isSendCurrent;

  if (initializedNow) {
    state.initializedAt = now;
  }

  state.updatedAt = now;

  return {
    profile,
    state,
    initializedNow,
    partialCrawl,
    failedListPage,
    failedListPageAttempts,
    listingCount:
      Object.keys(state.listings).length,
    events: events.map((event) =>
      createProfileEventEnvelope(
        event,
        profile,
        now
      )
    )
  };
}

function createInitializationMessage(results) {
  const initializedResults =
    results.filter(
      (result) => result.initializedNow
    );

  if (initializedResults.length === 0) {
    return null;
  }

  const profileNames = initializedResults.map(
    (result) => result.profile.name
  );
  const listingCount = initializedResults.reduce(
    (sum, result) =>
      sum + result.listingCount,
    0
  );

  return [
    "매물 감시를 시작했습니다.",
    `검색 조건: ${profileNames.join(", ")}`,
    `현재 검색 결과 ${listingCount}건을 기준점으로 저장했습니다.`,
    "이후 신규 매물과 가격 변경, 매물삭제를 알립니다."
  ].join("\n");
}

async function main({
  environment = process.env,
  rawConfig: providedConfig,
  rawState: providedState,
  loadJsonImpl = loadJson,
  saveJsonImpl = saveJson,
  createTelegramSenderImpl =
    createTelegramSender,
  processProfileImpl = processProfile,
  requestSleepImpl = sleep,
  requestNowMs = Date.now,
  nowIso = () =>
    new Date().toISOString(),
  logger = console
} = {}) {
  const rawConfig =
    providedConfig ??
    await loadJsonImpl(
      new URL(
        "../config.json",
        import.meta.url
      )
    );
  const config = normalizeWatcherConfig(
    rawConfig,
    environment
  );
  const runMode =
    environment.RUN_MODE || "normal";

  if (!SUPPORTED_RUN_MODES.has(runMode)) {
    throw new Error(
      `지원하지 않는 RUN_MODE입니다: ${runMode}`
    );
  }

  const telegram =
    createTelegramSenderImpl({
      token:
        environment
          .TELEGRAM_BOT_TOKEN,
      chatId:
        environment.TELEGRAM_CHAT_ID
    });

  if (runMode === "telegram_test") {
    await telegram.send(
      "텔레그램 연결 테스트가 성공했습니다."
    );
    logger.log("Telegram test sent.");
    return {
      telegramTest: true,
      notificationCount: 1
    };
  }

  const statePath =
    environment.STATE_PATH ||
    "data/state.json";
  const state = normalizeWatcherState(
    providedState ??
      await loadJsonImpl(statePath),
    config
  );
  const requestPacer =
    createEncarRequestPacer({
      sleepImpl: requestSleepImpl,
      nowMs: requestNowMs
    });

  const {
    results,
    profileFailures
  } = await runProfilesSequentially(
    config.profiles,
    async (profile) => {
      const result = await processProfileImpl({
        profile,
        profileState:
          state.profiles[profile.id],
        runMode,
        requestPacer,
        maxPages: config.maxPages,
        requestDelayMs:
          config.requestDelayMs,
        notifyPriceIncrease:
          config.notifyPriceIncrease
      });

      state.profiles[profile.id] =
        result.state;
      return result;
    },
    {
      onError: (error, profile) => {
        logger.warn(
          `${profileLabel(profile)} Profile processing failed: ${error.message}`
        );
      }
    }
  );

  if (profileFailures.length > 0) {
    logger.warn(
      `${profileFailures.length} profile(s) failed; successful profile state will still be saved.`
    );
  }

  const initializationMessage =
    createInitializationMessage(results);

  if (initializationMessage) {
    await telegram.send(
      initializationMessage
    );
  }

  const mergedEvents = mergeProfileEvents(
    results.flatMap(
      (result) => result.events
    ),
    {
      warn: (message) =>
        logger.warn(message)
    }
  );

  for (const event of mergedEvents) {
    const text = formatTelegramMessage(
      event.type,
      event.listing,
      {
        profileNames:
          event.profileNames,
        showTeslaOption:
          event.showTeslaOption,
        relistedPriceChange:
          event.relistedPriceChange,
        previousPriceKrw:
          event.previousPriceKrw,
        currentPriceKrw:
          event.currentPriceKrw
      }
    );
    const message = await telegram.send(text);

    if (runMode !== "send_current") {
      for (
        const target of
        event.stateTargets
      ) {
        const profileState =
          state.profiles[
            target.profileId
          ];
        const stateRecord =
          profileState?.listings?.[
            target.stateListingId
          ];

        if (stateRecord) {
          profileState.listings[
            target.stateListingId
          ] = recordTelegramDelivery(
            stateRecord,
            message,
            nowIso()
          );
        }
      }
    }
  }

  await saveJsonImpl(statePath, state);

  logger.log(
    `Done. ${mergedEvents.length} notification(s).`
  );

  return {
    state,
    results,
    profileFailures,
    events: mergedEvents,
    notificationCount:
      mergedEvents.length +
      (initializationMessage ? 1 : 0)
  };
}

const isDirectExecution = Boolean(
  process.argv[1] &&
    import.meta.url ===
      pathToFileURL(
        process.argv[1]
      ).href
);

if (isDirectExecution) {
  await main();
}

export {
  collectProfileListings,
  main,
  processProfile
};
