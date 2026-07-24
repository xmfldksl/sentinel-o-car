import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  main,
  processProfile
} from "../src/index.mjs";

const listHtml = await fs.readFile(
  new URL(
    "./fixtures/list.html",
    import.meta.url
  ),
  "utf8"
);

function createSyntheticSearchUrl(label) {
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

function rawProfile(
  id,
  {
    enabled = true,
    isTesla = false,
    titleFilter = {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    }
  } = {}
) {
  return {
    id,
    name: id,
    enabled,
    searchUrl:
      createSyntheticSearchUrl(id),
    isTesla,
    titleFilter,
    price: isTesla
      ? {
          maxPriceKrw: 35000000,
          eapMaxPriceKrw: 37000000,
          fsdMaxPriceKrw: 40000000
        }
      : {
          maxPriceKrw: 35000000
        }
  };
}

function rawConfig(profiles) {
  return {
    configVersion: 2,
    notifyPriceIncrease: true,
    maxPages: 2,
    requestDelayMs: 25,
    profiles
  };
}

function stateFor(profiles) {
  return {
    schemaVersion: 2,
    profiles: Object.fromEntries(
      profiles.map((profile) => [
        profile.id,
        {
          initializedAt:
            "2026-07-24T00:00:00.000Z",
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
  return () => ({
    async send(text) {
      sent.push(text);
      return {
        message_id: sent.length
      };
    }
  });
}

function detailHtml(vehicleNo = null) {
  return `<!doctype html>
<html lang="ko">
  <body>
    <script>
      __PRELOADED_STATE__ = ${JSON.stringify({
        cars: {
          base: {
            vehicleNo,
            spec: {
              colorName: "빨간색"
            },
            options: {
              etc: []
            },
            advertisement: {
              oneLineText: null
            },
            photos: []
          }
        }
      })};
    </script>
  </body>
</html>`;
}

const normalizedGenericProfile = {
  id: "profile-a",
  name: "profile-a",
  enabled: true,
  searchUrl:
    createSyntheticSearchUrl(
      "profile-a"
    ),
  searchUrlSource: "config",
  isTesla: false,
  titleFilter: {
    requiredAll: ["롱 레인지"],
    requiredAny: [],
    excludedAny: []
  },
  price: {
    maxPriceKrw: 35000000
  }
};

async function runActualProfile(
  runMode,
  profileState,
  trace = []
) {
  return processProfile({
    profile:
      normalizedGenericProfile,
    profileState,
    runMode,
    maxPages: 1,
    requestDelayMs: 0,
    notifyPriceIncrease: true,
    requestPacer: {
      async wait() {}
    },
    fetchTextImpl: async (url) => {
      trace.push(url);
      return url.includes(
        "car.encar.com/list/car"
      )
        ? listHtml
        : detailHtml();
    },
    nowIso: () =>
      "2026-07-25T00:00:00.000Z"
  });
}

test("main은 enabled 프로필을 순서대로 처리하고 root 실행 설정을 별도로 전달한다", async () => {
  const profiles = [
    rawProfile("first"),
    rawProfile("disabled", {
      enabled: false
    }),
    rawProfile("second")
  ];
  const calls = [];
  let savedState;

  const result = await main({
    environment: {
      RUN_MODE: "normal",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat"
    },
    rawConfig: rawConfig(profiles),
    rawState: stateFor(profiles),
    processProfileImpl: async ({
      profile,
      profileState,
      maxPages,
      requestDelayMs,
      notifyPriceIncrease
    }) => {
      calls.push({
        profile,
        maxPages,
        requestDelayMs,
        notifyPriceIncrease
      });
      return {
        profile,
        state: profileState,
        initializedNow: false,
        listingCount: 0,
        events: []
      };
    },
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async (_path, state) => {
      savedState = state;
    },
    logger: quietLogger(),
    nowIso: () =>
      "2026-07-25T01:00:00.000Z"
  });

  assert.deepEqual(
    calls.map((entry) =>
      entry.profile.id
    ),
    ["first", "second"]
  );
  assert.deepEqual(
    calls.map(
      ({
        maxPages,
        requestDelayMs,
        notifyPriceIncrease
      }) => ({
        maxPages,
        requestDelayMs,
        notifyPriceIncrease
      })
    ),
    [
      {
        maxPages: 2,
        requestDelayMs: 25,
        notifyPriceIncrease: true
      },
      {
        maxPages: 2,
        requestDelayMs: 25,
        notifyPriceIncrease: true
      }
    ]
  );
  assert.equal(
    Object.hasOwn(
      calls[0].profile,
      "maxPages"
    ),
    false
  );
  assert.deepEqual(
    Object.keys(savedState).sort(),
    ["profiles", "schemaVersion"]
  );
  assert.deepEqual(savedState, result.state);
});

test("normal과 send_current는 같은 titleFilter를 적용하고 가격 초과도 출력한다", async () => {
  const initialState = {
    initializedAt:
      "2026-07-24T00:00:00.000Z",
    listings: {}
  };
  const normal = await runActualProfile(
    "normal",
    initialState
  );
  const current = await runActualProfile(
    "send_current",
    initialState
  );

  for (const result of [
    normal,
    current
  ]) {
    assert.deepEqual(
      result.events
        .map((event) =>
          event.listing.id
        )
        .sort(),
      ["42023180", "42383037"]
    );
    assert.deepEqual(
      Object.keys(
        result.state.listings
      ).sort(),
      ["42023180", "42383037"]
    );

    const overPrice =
      result.events.find(
        (event) =>
          event.listing.id ===
          "42383037"
      );

    assert.equal(
      overPrice.listing
        .conditionStatus,
      "조건 미충족"
    );
    assert.deepEqual(
      overPrice.listing
        .conditionReasons,
      ["가격 초과"]
    );
  }

  assert.deepEqual(
    normal.events.map(
      (event) => event.kind
    ),
    ["new", "new"]
  );
  assert.deepEqual(
    current.events.map(
      (event) => event.kind
    ),
    ["current", "current"]
  );
});

test("titleFilter 제외 매물은 identity·상태·삭제 흐름에 다시 들어오지 않는다", async () => {
  const trace = [];
  const previous = {
    id: "previous-listing",
    title: "이전 추적 매물",
    url:
      "https://example.invalid/previous-listing",
    yearMonth: "2022-01",
    mileageKm: 1000,
    priceKrw: 30000000,
    listPriceKrw: 30000000,
    vehicleNo: "12가3456",
    firstSeenAt:
      "2026-07-23T00:00:00.000Z",
    lastSeenAt:
      "2026-07-24T00:00:00.000Z",
    deletionTracked: true
  };

  const result = await processProfile({
    profile: {
      ...normalizedGenericProfile,
      titleFilter: {
        requiredAll: [
          "절대 일치하지 않는 제목"
        ],
        requiredAny: [],
        excludedAny: []
      }
    },
    profileState: {
      initializedAt:
        "2026-07-24T00:00:00.000Z",
      listings: {
        [previous.id]: previous
      }
    },
    runMode: "normal",
    maxPages: 1,
    requestDelayMs: 0,
    notifyPriceIncrease: true,
    requestPacer: {
      async wait() {}
    },
    fetchTextImpl: async (url) => {
      trace.push(url);

      if (
        url.includes(
          "car.encar.com/list/car"
        )
      ) {
        return listHtml;
      }

      throw new Error(
        "titleFilter 제외 매물은 상세 조회하면 안 됩니다"
      );
    },
    nowIso: () =>
      "2026-07-25T00:00:00.000Z"
  });

  assert.equal(trace.length, 1);
  assert.equal(result.events.length, 0);
  assert.deepEqual(
    Object.keys(result.state.listings),
    [previous.id]
  );
  assert.equal(
    result.state.listings[
      previous.id
    ].deletedAt,
    undefined
  );
});

test("상태 정리 직후 실행은 기존 매물을 신규 알림으로 만들지 않는다", async () => {
  const existingState = {
    initializedAt:
      "2026-07-24T00:00:00.000Z",
    listings: {
      "42023180": {
        id: "42023180",
        title:
          "모델 3 롱 레인지 AWD",
        url:
          "https://fem.encar.com/cars/detail/42023180",
        yearMonth: "2022-09",
        mileageKm: 67235,
        priceKrw: 32700000,
        listPriceKrw: 32700000,
        region: "경기",
        contracted: false,
        firstSeenAt:
          "2026-07-20T00:00:00.000Z",
        lastSeenAt:
          "2026-07-24T00:00:00.000Z"
      },
      "42383037": {
        id: "42383037",
        title:
          "모델 3 롱 레인지 AWD",
        url:
          "https://fem.encar.com/cars/detail/42383037",
        yearMonth: "2022-12",
        mileageKm: 28658,
        priceKrw: 48700000,
        listPriceKrw: 48700000,
        region: "대구",
        contracted: false,
        firstSeenAt:
          "2026-07-20T00:00:00.000Z",
        lastSeenAt:
          "2026-07-24T00:00:00.000Z"
      }
    }
  };
  const trace = [];
  const result = await runActualProfile(
    "normal",
    existingState,
    trace
  );

  assert.equal(result.events.length, 0);
  assert.deepEqual(
    Object.keys(
      result.state.listings
    ).sort(),
    ["42023180", "42383037"]
  );
  assert.equal(
    trace.filter((url) =>
      url.includes("/cars/detail/")
    ).length,
    0,
    "정상 상태가 있고 목록 가격이 그대로인 매물은 상세 조회를 생략한다"
  );

  for (const listingId of [
    "42023180",
    "42383037"
  ]) {
    const record =
      result.state.listings[listingId];

    assert.equal(
      record.priceKrw,
      existingState.listings[listingId]
        .priceKrw
    );
    assert.equal(
      record.lastSeenAt,
      "2026-07-25T00:00:00.000Z"
    );
    assert.equal(
      record.deletedAt,
      undefined
    );
  }
});

test("raw 목록에 남아 있는 titleFilter 제외 매물은 삭제로 오판하지 않는다", async () => {
  const trace = [];
  const excludedPrevious = {
    id: "11111111",
    title: "모델 3 RWD",
    url:
      "https://fem.encar.com/cars/detail/11111111",
    yearMonth: "2022-08",
    mileageKm: 95545,
    priceKrw: 30000000,
    listPriceKrw: 30000000,
    vehicleNo: "12가3456",
    firstSeenAt:
      "2026-07-23T00:00:00.000Z",
    lastSeenAt:
      "2026-07-24T00:00:00.000Z",
    deletionTracked: true
  };
  const detailVehicleNos = {
    "42023180": "34나5678",
    "42383037": "56다7890"
  };

  const result = await processProfile({
    profile: normalizedGenericProfile,
    profileState: {
      initializedAt:
        "2026-07-24T00:00:00.000Z",
      listings: {
        [excludedPrevious.id]:
          excludedPrevious
      }
    },
    runMode: "normal",
    maxPages: 1,
    requestDelayMs: 0,
    notifyPriceIncrease: true,
    requestPacer: {
      async wait() {}
    },
    fetchTextImpl: async (url) => {
      trace.push(url);

      if (
        url.includes(
          "car.encar.com/list/car"
        )
      ) {
        return listHtml;
      }

      const listingId = url.match(
        /\/cars\/detail\/(\d+)/
      )?.[1];

      return detailHtml(
        detailVehicleNos[listingId] ??
          null
      );
    },
    nowIso: () =>
      "2026-07-25T00:00:00.000Z"
  });

  assert.equal(
    trace.some((url) =>
      url.includes(
        "/cars/detail/11111111"
      )
    ),
    false,
    "titleFilter 제외 매물은 상세 조회하지 않는다"
  );
  assert.deepEqual(
    result.events
      .map((event) => event.kind)
      .sort(),
    ["new", "new"]
  );
  assert.equal(
    result.state.listings["11111111"]
      .deletedAt,
    undefined,
    "raw 목록에 존재하는 매물은 titleFilter 제외만으로 삭제 처리하지 않는다"
  );
});

test("한 프로필 실패는 그 상태를 보존하고 다음 프로필의 성공 상태는 저장한다", async () => {
  const profiles = [
    rawProfile("failed"),
    rawProfile("succeeded")
  ];
  const originalState =
    stateFor(profiles);
  originalState.profiles.failed
    .listings.keep = {
      id: "keep",
      priceKrw: 1
    };
  let savedState;

  const result = await main({
    environment: {
      RUN_MODE: "normal",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat"
    },
    rawConfig: rawConfig(profiles),
    rawState: originalState,
    processProfileImpl: async ({
      profile,
      profileState
    }) => {
      if (profile.id === "failed") {
        throw new Error("synthetic failure");
      }

      return {
        profile,
        state: {
          ...profileState,
          listings: {
            success: {
              id: "success",
              priceKrw: 2
            }
          }
        },
        initializedNow: false,
        listingCount: 1,
        events: []
      };
    },
    createTelegramSenderImpl:
      telegramFactory([]),
    saveJsonImpl: async (_path, state) => {
      savedState = state;
    },
    logger: quietLogger(),
    nowIso: () =>
      "2026-07-25T01:00:00.000Z"
  });

  assert.equal(
    result.profileFailures.length,
    1
  );
  assert.deepEqual(
    savedState.profiles.failed,
    originalState.profiles.failed
  );
  assert.equal(
    savedState.profiles.succeeded
      .listings.success.id,
    "success"
  );
});

test("telegram_test는 상태를 읽거나 저장하지 않고 한 건만 전송한다", async () => {
  const sent = [];
  let stateLoaded = false;
  let stateSaved = false;

  const result = await main({
    environment: {
      RUN_MODE: "telegram_test",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat"
    },
    rawConfig: rawConfig([
      rawProfile("one")
    ]),
    loadJsonImpl: async () => {
      stateLoaded = true;
      throw new Error(
        "state must not be loaded"
      );
    },
    saveJsonImpl: async () => {
      stateSaved = true;
    },
    createTelegramSenderImpl:
      telegramFactory(sent),
    logger: quietLogger()
  });

  assert.equal(result.telegramTest, true);
  assert.equal(sent.length, 1);
  assert.equal(stateLoaded, false);
  assert.equal(stateSaved, false);
});
