import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectProfileListings,
  processProfile
} from "../src/index.mjs";
import {
  createEncarRequestPacer
} from "../src/request-pacer.mjs";
import {
  createTelegramSender
} from "../src/runtime.mjs";

const listHtml = await readFile(
  new URL(
    "./fixtures/list.html",
    import.meta.url
  ),
  "utf8"
);
const detailHtml = await readFile(
  new URL(
    "./fixtures/detail-preloaded.html",
    import.meta.url
  ),
  "utf8"
);

function normalizedProfile(
  overrides = {}
) {
  return {
    id: "pacing-profile",
    name: "Pacing profile",
    enabled: true,
    searchUrl:
      "https://example.test/search",
    searchUrlSource: "config",
    optionMode: "generic",
    titleFilter: {
      requiredAll: [],
      requiredAny: [],
      excludedAny: []
    },
    yearMonthMin: "2020-01",
    yearMonthMax: "2030-12",
    maxMileageKm: 200000,
    excludedColorTerms: [],
    excludeContracted: true,
    price: {
      maxPriceKrw: 50000000
    },
    notifyPriceIncrease: true,
    maxPages: 1,
    requestDelayMs: 25,
    ...overrides
  };
}

function tracingRequestPacer(trace) {
  return {
    async wait(delay) {
      trace.push({
        kind: "wait",
        delay
      });
    }
  };
}

function assertEveryFetchWasPaced(
  trace,
  expectedDelay
) {
  const fetchIndexes = trace
    .map((entry, index) =>
      entry.kind === "fetch"
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  assert.ok(fetchIndexes.length > 0);

  for (const index of fetchIndexes) {
    assert.deepEqual(
      trace[index - 1],
      {
        kind: "wait",
        delay: expectedDelay
      }
    );
  }

  assert.equal(
    trace.filter(
      (entry) => entry.kind === "wait"
    ).length,
    fetchIndexes.length
  );
}

test("Encar pacer는 첫 요청을 즉시 시작하고 요청 시작 시각 간 최소 간격을 유지한다", async () => {
  let clock = 1000;
  const sleeps = [];
  const starts = [];
  const pacer = createEncarRequestPacer({
    nowMs: () => clock,
    sleepImpl: async (delay) => {
      sleeps.push(delay);
      clock += delay;
    }
  });

  await pacer.wait(1500);
  starts.push(clock);

  clock += 400;
  await pacer.wait(1500);
  starts.push(clock);

  clock += 2000;
  await pacer.wait(500);
  starts.push(clock);

  assert.deepEqual(starts, [
    1000,
    2500,
    4500
  ]);
  assert.deepEqual(sleeps, [1100]);
});

test("Encar와 Telegram pacer는 서로의 clock과 sleep 상태에 영향을 주지 않는다", async () => {
  let encarClock = 1000;
  let telegramClock = 9000;
  const encarSleeps = [];
  const telegramSleeps = [];
  let telegramRequests = 0;
  const encarPacer =
    createEncarRequestPacer({
      nowMs: () => encarClock,
      sleepImpl: async (delay) => {
        encarSleeps.push(delay);
        encarClock += delay;
      }
    });
  const telegramSender =
    createTelegramSender({
      token: "UNIT_TEST_TOKEN",
      chatId: "UNIT_TEST_CHAT",
      now: () => telegramClock,
      sleepImpl: async (delay) => {
        telegramSleeps.push(delay);
        telegramClock += delay;
      },
      fetchImpl: async () => {
        telegramRequests += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ok: true,
              result: {
                message_id:
                  telegramRequests
              }
            };
          }
        };
      }
    });

  await encarPacer.wait(500);
  await telegramSender.send("first");

  telegramClock += 100;

  await encarPacer.wait(500);
  await telegramSender.send("second");

  assert.deepEqual(encarSleeps, [500]);
  assert.deepEqual(
    telegramSleeps,
    [1000]
  );
  assert.equal(encarClock, 1500);
  assert.equal(telegramClock, 10100);
  assert.equal(telegramRequests, 2);
});

test("모든 목록 페이지 fetch는 공유 pacer 대기 직후 시작한다", async () => {
  const trace = [];
  const profile = normalizedProfile({
    maxPages: 2,
    requestDelayMs: 31
  });

  await collectProfileListings(profile, {
    requestPacer:
      tracingRequestPacer(trace),
    fetchTextImpl: async () => {
      trace.push({ kind: "fetch" });
      return listHtml;
    }
  });

  assertEveryFetchWasPaced(trace, 31);
  assert.equal(
    trace.filter(
      (entry) => entry.kind === "fetch"
    ).length,
    2
  );
});

test("일반 상세 fetch는 목록과 같은 pacer를 사용한다", async () => {
  const trace = [];
  let fetchCount = 0;
  const profile = normalizedProfile({
    requestDelayMs: 37
  });

  await processProfile({
    profile,
    profileState: {
      listings: {}
    },
    runMode: "send_current",
    requestPacer:
      tracingRequestPacer(trace),
    fetchTextImpl: async () => {
      trace.push({ kind: "fetch" });
      fetchCount += 1;
      return fetchCount === 1
        ? listHtml
        : detailHtml;
    },
    nowIso: () =>
      "2026-01-02T00:00:00.000Z"
  });

  assertEveryFetchWasPaced(trace, 37);
  assert.ok(fetchCount > 1);
});

test("차량번호 식별 fetch도 목록과 같은 pacer를 사용한다", async () => {
  const trace = [];
  let fetchCount = 0;
  const profile = normalizedProfile({
    requestDelayMs: 41,
    titleFilter: {
      requiredAll: [
        "never matching title"
      ],
      requiredAny: [],
      excludedAny: []
    }
  });

  await processProfile({
    profile,
    profileState: {
      initializedAt:
        "2026-01-01T00:00:00.000Z",
      listings: {
        previous: {
          id: "previous",
          title: "Previous vehicle",
          priceKrw: 30000000,
          listPriceKrw: 30000000,
          vehicleNo: "00가 0000",
          firstSeenAt:
            "2026-01-01T00:00:00.000Z",
          lastSeenAt:
            "2026-01-01T00:00:00.000Z",
          deletionTracked: true
        }
      }
    },
    runMode: "normal",
    requestPacer:
      tracingRequestPacer(trace),
    fetchTextImpl: async () => {
      trace.push({ kind: "fetch" });
      fetchCount += 1;
      return fetchCount === 1
        ? listHtml
        : detailHtml;
    },
    nowIso: () =>
      "2026-01-02T00:00:00.000Z"
  });

  assertEveryFetchWasPaced(trace, 41);
  assert.ok(fetchCount > 1);
});
