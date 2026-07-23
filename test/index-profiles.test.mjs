import assert from "node:assert/strict";
import test from "node:test";
import {
  main,
  processProfile
} from "../src/index.mjs";

function createSyntheticSearchUrl(
  label
) {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      action:
        `(And.Synthetic.${label})`,
      toggle: {},
      layer: "",
      sort: "MobileModifiedDate"
    })
  );

  return url.toString();
}

function profile(
  id,
  name,
  searchKey,
  enabled = true
) {
  return {
    id,
    name,
    enabled,
    searchUrl:
      createSyntheticSearchUrl(
        searchKey
      ),
    searchUrlSource: "config",
    optionMode: "generic",
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    minYear: 2020,
    maxYear: 2030,
    maxMileageKm: 200000,
    excludedColors: [],
    excludeContractPending: true,
    price: {
      maxPriceKrw: 50000000
    },
    rentalHistoryDiscountKrw: 0
  };
}

function config(profiles) {
  return {
    configVersion: 2,
    notifyPriceIncrease: true,
    maxPages: 1,
    requestDelayMs: 0,
    profiles
  };
}

function stateFor(profiles) {
  return {
    schemaVersion: 2,
    profiles: Object.fromEntries(
      profiles.map((item) => [
        item.id,
        {
          initializedAt:
            "2026-01-01T00:00:00.000Z",
          listings: {}
        }
      ])
    )
  };
}

function quietLogger() {
  return {
    log() {},
    warn() {}
  };
}

function telegramFactory(sent) {
  return ({ token, chatId }) => ({
    async send(text) {
      sent.push({ token, chatId, text });
      return {
        message_id: sent.length
      };
    }
  });
}

function successfulResult(
  profileValue,
  profileState,
  overrides = {}
) {
  return {
    profile: profileValue,
    state: {
      ...profileState,
      listings: {
        ...profileState.listings
      },
      updatedAt:
        "2026-01-02T00:00:00.000Z"
    },
    initializedNow: false,
    listingCount:
      Object.keys(
        profileState.listings
      ).length,
    events: [],
    ...overrides
  };
}

test("main은 enabled 프로필을 순서대로 각 searchUrl과 함께 처리한다", async () => {
  const profiles = [
    profile(
      "first",
      "첫 조건",
      "first"
    ),
    profile(
      "disabled",
      "꺼진 조건",
      "disabled",
      false
    ),
    profile(
      "second",
      "둘째 조건",
      "second"
    )
  ];
  const calls = [];
  let savedState;

  await main({
    environment: {
      RUN_MODE: "normal"
    },
    rawConfig: config(profiles),
    rawState: stateFor(profiles),
    processProfileImpl: async ({
      profile: current,
      profileState
    }) => {
      calls.push([
        current.id,
        current.searchUrl
      ]);
      return successfulResult(
        current,
        profileState
      );
    },
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async (_path, value) => {
      savedState = value;
    },
    sleepImpl: async () => {},
    nowIso: () =>
      "2026-01-02T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.deepEqual(calls, [
    [
      "first",
      createSyntheticSearchUrl(
        "first"
      )
    ],
    [
      "second",
      createSyntheticSearchUrl(
        "second"
      )
    ]
  ]);
  assert.ok(
    savedState.profiles.disabled
  );
});

test("main의 공유 Encar pacer는 실패한 프로필 뒤에도 다음 프로필의 지연을 유지한다", async () => {
  const profiles = [
    {
      ...profile(
        "failed",
        "실패 조건",
        "failed"
      ),
      requestDelayMs: 100
    },
    {
      ...profile(
        "success",
        "성공 조건",
        "success"
      ),
      requestDelayMs: 250
    }
  ];
  let clock = 1000;
  const requestStarts = [];
  const requestSleeps = [];
  const pacers = [];

  const result = await main({
    environment: {
      RUN_MODE: "normal"
    },
    rawConfig: config(profiles),
    rawState: stateFor(profiles),
    processProfileImpl: async ({
      profile: current,
      profileState,
      requestPacer
    }) => {
      pacers.push(requestPacer);
      await requestPacer.wait(
        current.requestDelayMs
      );
      requestStarts.push({
        profileId: current.id,
        startedAt: clock
      });

      if (current.id === "failed") {
        throw new Error("request failed");
      }

      return successfulResult(
        current,
        profileState
      );
    },
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async () => {},
    sleepImpl: async () => {},
    requestSleepImpl: async (delay) => {
      requestSleeps.push(delay);
      clock += delay;
    },
    requestNowMs: () => clock,
    nowIso: () =>
      "2026-01-02T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.equal(
    pacers[0],
    pacers[1]
  );
  assert.deepEqual(requestStarts, [
    {
      profileId: "failed",
      startedAt: 1000
    },
    {
      profileId: "success",
      startedAt: 1250
    }
  ]);
  assert.deepEqual(
    requestSleeps,
    [250]
  );
  assert.equal(
    result.profileFailures.length,
    1
  );
});

test("main의 실제 profile 처리는 실패한 상세 요청 뒤 다음 profile 목록에도 공유 pacing을 적용한다", async () => {
  const profiles = [
    {
      ...profile(
        "first",
        "첫 조건",
        "first"
      ),
      requestDelayMs: 100
    },
    {
      ...profile(
        "second",
        "둘째 조건",
        "second"
      ),
      requestDelayMs: 250
    }
  ];
  const anonymousListHtml = `
    <a href="/cars/detail/1001">
      익명 차량 24/01식 1,000 km 서울 3,000만원
    </a>
  `;
  let clock = 1000;
  const requestSleeps = [];
  const requestStarts = [];

  await main({
    environment: {
      RUN_MODE: "normal"
    },
    rawConfig: config(profiles),
    rawState: stateFor(profiles),
    processProfileImpl: async (args) =>
      processProfile({
        ...args,
        fetchTextImpl: async (url) => {
          const kind = url.includes(
            "/cars/detail/"
          )
            ? "detail"
            : "list";

          requestStarts.push({
            profileId: args.profile.id,
            kind,
            startedAt: clock
          });

          if (
            args.profile.id === "first" &&
            kind === "detail"
          ) {
            throw new Error(
              "anonymous detail failure"
            );
          }

          return kind === "list"
            ? anonymousListHtml
            : "<html></html>";
        },
        nowIso: () =>
          "2026-01-02T00:00:00.000Z"
      }),
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async () => {},
    sleepImpl: async () => {},
    requestSleepImpl: async (delay) => {
      requestSleeps.push(delay);
      clock += delay;
    },
    requestNowMs: () => clock,
    nowIso: () =>
      "2026-01-02T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.deepEqual(
    requestStarts.slice(0, 3),
    [
      {
        profileId: "first",
        kind: "list",
        startedAt: 1000
      },
      {
        profileId: "first",
        kind: "detail",
        startedAt: 1100
      },
      {
        profileId: "second",
        kind: "list",
        startedAt: 1350
      }
    ]
  );
  assert.deepEqual(
    requestSleeps.slice(0, 2),
    [100, 250]
  );
});

test("실제 프로필 목록 조회 실패는 입력 상태를 변경하거나 삭제 판정하지 않는다", async () => {
  const currentProfile = {
    ...profile(
      "failed",
      "실패 조건",
      "fail"
    ),
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    yearMonthMin: "2020-01",
    yearMonthMax: "2030-12",
    excludedColorTerms: [],
    excludeContracted: true,
    rentalPenaltyKrw: 0,
    notifyPriceIncrease: true,
    maxPages: 1,
    requestDelayMs: 0
  };
  const profileState = {
    initializedAt:
      "2026-01-01T00:00:00.000Z",
    listings: {
      keep: {
        id: "keep",
        priceKrw: 10000000,
        deletionTracked: true,
        optionMode: "tesla",
        option: "FSD",
        hasFsd: true,
        hasEap: false,
        optionSource: "old-source",
        optionEvidence: "old-evidence"
      }
    }
  };
  const before = structuredClone(
    profileState
  );

  await assert.rejects(
    processProfile({
      profile: currentProfile,
      profileState,
      runMode: "normal",
      fetchTextImpl: async () => {
        throw new Error("list failed");
      },
      sleepImpl: async () => {},
      nowIso: () =>
        "2026-01-02T00:00:00.000Z"
    }),
    /list failed/
  );

  assert.deepEqual(profileState, before);
  assert.equal(
    profileState.listings.keep
      .deletedAt,
    undefined
  );
  assert.equal(
    profileState.listings.keep.option,
    "FSD"
  );
});

test("generic 프로필의 목록 관측은 같은 id의 기존 Tesla 옵션 상태를 정리한다", async () => {
  const listingId = "900000001";
  const listingUrl =
    `https://fem.encar.com/cars/detail/${listingId}`;
  const currentProfile = {
    ...profile(
      "generic-transition",
      "일반 조건",
      "generic-transition"
    ),
    yearMonthMin: "2020-01",
    yearMonthMax: "2030-12",
    excludedColorTerms: [],
    excludeContracted: true,
    rentalPenaltyKrw: 0,
    notifyPriceIncrease: true,
    maxPages: 1,
    requestDelayMs: 0
  };
  const previous = {
    id: listingId,
    title: "일반 차량",
    url: listingUrl,
    yearMonth: "2022-06",
    mileageKm: 10000,
    priceKrw: 34000000,
    listPriceKrw: 34000000,
    region: "서울",
    contracted: false,
    vehicleNo: null,
    saleType: "NORMAL",
    rentalUsageHistory: false,
    totalLossHistory: false,
    firstSeenAt:
      "2026-01-01T00:00:00.000Z",
    lastSeenAt:
      "2026-01-01T00:00:00.000Z",
    lastEvaluatedAt:
      "2026-01-01T00:00:00.000Z",
    deletionTracked: true,
    commonMarker: "preserved",
    optionMode: "tesla",
    option: "FSD",
    hasFsd: true,
    hasEap: false,
    optionSource: "old-source",
    optionEvidence: "old-evidence"
  };
  let fetchCount = 0;

  const result = await processProfile({
    profile: currentProfile,
    profileState: {
      initializedAt:
        "2026-01-01T00:00:00.000Z",
      listings: {
        [listingId]: previous
      }
    },
    runMode: "normal",
    fetchTextImpl: async () => {
      fetchCount += 1;
      return `<a href="/cars/detail/${listingId}">일반 차량 22/06식 10,000km 서울 3,400만원</a>`;
    },
    sleepImpl: async () => {},
    nowIso: () =>
      "2026-01-02T00:00:00.000Z"
  });

  const stored =
    result.state.listings[listingId];

  assert.equal(fetchCount, 1);
  assert.equal(stored.optionMode, "generic");
  assert.equal(
    stored.commonMarker,
    "preserved"
  );
  assert.equal(stored.saleType, "NORMAL");
  assert.equal(
    stored.rentalUsageHistory,
    false
  );
  assert.equal(
    stored.totalLossHistory,
    false
  );

  for (const field of [
    "option",
    "hasFsd",
    "hasEap",
    "optionSource",
    "optionEvidence"
  ]) {
    assert.equal(
      Object.hasOwn(stored, field),
      false
    );
  }
});

test("한 프로필 실패는 그 상태를 보존하고 다음 성공 상태 저장을 막지 않는다", async () => {
  const profiles = [
    profile(
      "failed",
      "실패 조건",
      "fail"
    ),
    profile(
      "success",
      "성공 조건",
      "success"
    ),
    profile(
      "disabled",
      "비활성 조건",
      "disabled",
      false
    )
  ];
  const rawState = stateFor(profiles);
  rawState.profiles.failed.listings.keep = {
    priceKrw: 10000000,
    adjustedPriceKrw: 13000000,
    rentalUsageHistory: true,
    rental: true
  };
  rawState.profiles.disabled.listings.keep = {
    priceKrw: 20000000,
    adjustedPriceKrw: 23000000,
    rentalUsageHistory: true,
    rental: true
  };
  const failedBefore = structuredClone(
    rawState.profiles.failed
  );
  const disabledBefore = structuredClone(
    rawState.profiles.disabled
  );
  let savedState;

  const result = await main({
    environment: {
      RUN_MODE: "normal"
    },
    rawConfig: config(profiles),
    rawState,
    processProfileImpl: async ({
      profile: current,
      profileState
    }) => {
      if (current.id === "failed") {
        throw new Error("list failed");
      }

      return successfulResult(
        current,
        profileState,
        {
          state: {
            ...profileState,
            listings: {
              saved: {
                priceKrw: 20000000
              }
            }
          }
        }
      );
    },
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async (_path, value) => {
      savedState = value;
    },
    sleepImpl: async () => {},
    nowIso: () =>
      "2026-01-02T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.equal(
    result.profileFailures.length,
    1
  );
  assert.deepEqual(
    savedState.profiles.failed,
    failedBefore
  );
  assert.deepEqual(
    savedState.profiles.disabled,
    disabledBefore
  );
  assert.ok(
    savedState.profiles.success
      .listings.saved
  );
});

test("모든 enabled 프로필 실패 시 상태를 저장하지 않는다", async () => {
  const profiles = [
    profile(
      "one",
      "조건 하나",
      "one"
    ),
    profile(
      "two",
      "조건 둘",
      "two"
    )
  ];
  let saveCalled = false;

  await assert.rejects(
    main({
      environment: {
        RUN_MODE: "normal"
      },
      rawConfig: config(profiles),
      rawState: stateFor(profiles),
      processProfileImpl: async () => {
        throw new Error("list failed");
      },
      createTelegramSenderImpl:
        telegramFactory([]),
      saveJsonImpl: async () => {
        saveCalled = true;
      },
      logger: quietLogger()
    }),
    /All enabled profiles failed/
  );

  assert.equal(saveCalled, false);
});

test("동일 신규 이벤트는 한 메시지로 병합하고 양쪽 상태에 전송 결과를 기록한다", async () => {
  const profiles = [
    profile(
      "one",
      "조건 하나",
      "one"
    ),
    profile(
      "two",
      "조건 둘",
      "two"
    )
  ];
  const rawState = stateFor(profiles);
  const sent = [];
  let savedState;

  for (const item of profiles) {
    rawState.profiles[item.id]
      .listings["100"] = {
        id: "100",
        title: "테스트 차량",
        priceKrw: 30000000
      };
  }

  await main({
    environment: {
      RUN_MODE: "normal",
      TELEGRAM_BOT_TOKEN:
        "test-token",
      TELEGRAM_CHAT_ID:
        "test-chat"
    },
    rawConfig: config(profiles),
    rawState,
    processProfileImpl: async ({
      profile: current,
      profileState
    }) => successfulResult(
      current,
      profileState,
      {
        events: [
          {
            kind: "new",
            type: "신규",
            listing: {
              id: "100",
              title: "테스트 차량",
              yearMonth: "2024-01",
              mileageKm: 10000,
              priceKrw: 30000000,
              region: "미확인",
              vehicleNo: null,
              saleType: "NORMAL",
              optionMode: "generic",
              url:
                "https://example.test/cars/detail/100"
            },
            detailSucceeded: true,
            profile: current,
            profileId: current.id,
            profileName: current.name,
            optionMode: "generic",
            showTeslaOption: false,
            stateListingId: "100"
          }
        ]
      }
    ),
    createTelegramSenderImpl:
      telegramFactory(sent),
    saveJsonImpl: async (_path, value) => {
      savedState = value;
    },
    sleepImpl: async () => {},
    nowIso: () =>
      "2026-01-02T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.equal(sent.length, 1);
  assert.match(
    sent[0].text,
    /검색 조건: 조건 하나, 조건 둘/
  );
  assert.doesNotMatch(
    sent[0].text,
    /FSD|EAP|옵션: 미확인/
  );
  assert.equal(
    savedState.profiles.one
      .listings["100"]
      .telegramMessageId,
    1
  );
  assert.equal(
    savedState.profiles.two
      .listings["100"]
      .telegramMessageId,
    1
  );
});

test("동일 삭제 이벤트는 한 메시지로 병합하고 모든 프로필 상태에 전송 결과를 기록한다", async () => {
  const profiles = [
    profile(
      "delete-one",
      "삭제 조건 하나",
      "delete-one"
    ),
    profile(
      "delete-two",
      "삭제 조건 둘",
      "delete-two"
    )
  ];
  const rawState = stateFor(profiles);
  const listingId = "deleted-synthetic";
  const sent = [];
  let savedState;

  for (const item of profiles) {
    rawState.profiles[item.id]
      .listings[listingId] = {
        id: listingId,
        title: "삭제 확인 차량",
        yearMonth: "2024-01",
        mileageKm: 10000,
        priceKrw: 30000000,
        region: "미확인",
        vehicleNo: null,
        saleType: "NORMAL",
        optionMode: "generic",
        url:
          "https://example.test/cars/detail/deleted-synthetic",
        deletedAt:
          "2026-01-02T00:00:00.000Z"
      };
  }

  await main({
    environment: {
      RUN_MODE: "normal",
      TELEGRAM_BOT_TOKEN:
        "test-token",
      TELEGRAM_CHAT_ID:
        "test-chat"
    },
    rawConfig: config(profiles),
    rawState,
    processProfileImpl: async ({
      profile: current,
      profileState
    }) => successfulResult(
      current,
      profileState,
      {
        events: [
          {
            kind: "deleted",
            type: "deleted",
            listing: {
              ...profileState.listings[
                listingId
              ]
            },
            profile: current,
            profileId: current.id,
            profileName: current.name,
            optionMode: "generic",
            showTeslaOption: false,
            stateListingId: listingId
          }
        ]
      }
    ),
    createTelegramSenderImpl:
      telegramFactory(sent),
    saveJsonImpl: async (_path, value) => {
      savedState = value;
    },
    sleepImpl: async () => {},
    nowIso: () =>
      "2026-01-03T00:00:00.000Z",
    logger: quietLogger()
  });

  assert.equal(sent.length, 1);
  assert.match(
    sent[0].text,
    /검색 조건: 삭제 조건 하나, 삭제 조건 둘/
  );

  for (const item of profiles) {
    assert.equal(
      savedState.profiles[item.id]
        .listings[listingId]
        .telegramMessageId,
      1
    );
  }
});

test("telegram_test는 프로필 수와 무관하게 테스트 메시지 한 건만 전송한다", async () => {
  const profiles = [
    profile(
      "one",
      "조건 하나",
      "one"
    ),
    profile(
      "two",
      "조건 둘",
      "two"
    )
  ];
  const sent = [];
  let profileCalls = 0;
  let saveCalled = false;

  const result = await main({
    environment: {
      RUN_MODE: "telegram_test",
      TELEGRAM_BOT_TOKEN:
        "test-token",
      TELEGRAM_CHAT_ID:
        "test-chat"
    },
    rawConfig: config(profiles),
    processProfileImpl: async () => {
      profileCalls += 1;
    },
    createTelegramSenderImpl:
      telegramFactory(sent),
    saveJsonImpl: async () => {
      saveCalled = true;
    },
    logger: quietLogger()
  });

  assert.equal(result.telegramTest, true);
  assert.equal(sent.length, 1);
  assert.equal(profileCalls, 0);
  assert.equal(saveCalled, false);
});
