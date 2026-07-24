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
  loadJson,
  matchesTitleFilter,
  needsVehicleIdentityResolution,
  normalizeVehicleNo,
  parseListHtml,
  prepareSendCurrentListing,
  recordDetailFailure,
  recordDetailSuccess,
  recordListObservation,
  reconcileListingDeletions,
  recordTelegramDelivery,
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

function logProfileSearch(profile) {
  const url = new URL(profile.searchUrl);

  console.log(
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
    nowMs = Date.now
  } = {}
) {
  const listingsById = new Map();
  const requestPacer =
    providedRequestPacer ??
    createEncarRequestPacer({
      sleepImpl,
      nowMs
    });

  logProfileSearch(profile);

  for (
    let page = 1;
    page <= maxPages;
    page += 1
  ) {
    const pageUrl = setPage(
      profile.searchUrl,
      page
    );

    console.log(
      `${profileLabel(profile)} Fetching list page ${page}.`
    );

    await requestPacer.wait(
      requestDelayMs
    );
    const html = await fetchTextImpl(
      pageUrl
    );
    const parsed = parseListHtml(html);

    console.log(
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

  return listingsById;
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

  const collectedListingsById =
    await collectProfileListings(
      profile,
      {
        fetchTextImpl,
        requestPacer,
        maxPages,
        requestDelayMs
      }
    );
  const listingsById = new Map(
    [...collectedListingsById].filter(
      ([, listing]) =>
        matchesTitleFilter(
          listing.title,
          profile
        )
    )
  );
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

  for (const listing of listingsById.values()) {
    const order = listingOrder;
    listingOrder += 1;

    let { previous } = findPreviousListing(
      previousListings,
      listing
    );
    let inspection = getListingInspection(
      previous,
      listing,
      runMode
    );

    if (!inspection.shouldInspect) {
      const observedListing = {
        ...listing,
        vehicleNo:
          previous?.vehicleNo ?? null
      };

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
      console.warn(
        `${profileLabel(profile)} Detail fetch failed for ${listing.id}:`,
        error.message
      );

      const failedListing = {
        ...listing,
        vehicleNo:
          previous?.vehicleNo ?? null
      };
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

    const enriched = analyzeDetail(
      detailHtml,
      listing,
      profile
    );

    ({ previous } = findPreviousListing(
      previousListings,
      enriched
    ));
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
    console.log(
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
          event.showTeslaOption
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
