import assert from "node:assert/strict";
import test from "node:test";
import {
  createTelegramSender,
  runProfilesSequentially
} from "../src/runtime.mjs";

function successfulTelegramResponse(
  messageId
) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        result: {
          message_id: messageId
        }
      };
    }
  };
}

function rateLimitedTelegramResponse({
  status,
  retryAfter
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {
        ok: false,
        error_code: 429,
        parameters: {
          retry_after: retryAfter
        }
      };
    }
  };
}

function unparseableRateLimitedResponse(
  message
) {
  return {
    ok: false,
    status: 429,
    async json() {
      throw new SyntaxError(message);
    }
  };
}

test("enabled profiles run strictly in config order without overlap and disabled profiles are skipped", async () => {
  const profiles = [
    {
      id: "first",
      name: "첫 번째 조건",
      enabled: true,
      searchUrl:
        "https://example.invalid/search/first"
    },
    {
      id: "disabled",
      name: "비활성 조건",
      enabled: false,
      searchUrl:
        "https://example.invalid/search/disabled"
    },
    {
      id: "second",
      name: "두 번째 조건",
      enabled: true,
      searchUrl:
        "https://example.invalid/search/second"
    }
  ];

  let releaseFirst;
  const firstGate = new Promise(
    (resolve) => {
      releaseFirst = resolve;
    }
  );

  let markFirstStarted;
  const firstStarted = new Promise(
    (resolve) => {
      markFirstStarted = resolve;
    }
  );

  let activeHandlers = 0;
  let maxActiveHandlers = 0;
  const trace = [];

  const execution =
    runProfilesSequentially(
      profiles,
      async (profile) => {
        activeHandlers += 1;
        maxActiveHandlers = Math.max(
          maxActiveHandlers,
          activeHandlers
        );
        trace.push(
          `start:${profile.id}:${profile.searchUrl}`
        );

        if (profile.id === "first") {
          markFirstStarted();
          await firstGate;
        } else {
          await Promise.resolve();
        }

        trace.push(`end:${profile.id}`);
        activeHandlers -= 1;

        return {
          profileId: profile.id,
          searchUrl: profile.searchUrl
        };
      }
    );

  await firstStarted;
  await Promise.resolve();

  const traceBeforeRelease = [
    ...trace
  ];
  releaseFirst();

  const result = await execution;

  assert.deepEqual(
    traceBeforeRelease,
    [
      "start:first:https://example.invalid/search/first"
    ]
  );
  assert.equal(maxActiveHandlers, 1);
  assert.deepEqual(trace, [
    "start:first:https://example.invalid/search/first",
    "end:first",
    "start:second:https://example.invalid/search/second",
    "end:second"
  ]);
  assert.deepEqual(
    result.results,
    [
      {
        profileId: "first",
        searchUrl:
          "https://example.invalid/search/first"
      },
      {
        profileId: "second",
        searchUrl:
          "https://example.invalid/search/second"
      }
    ]
  );
  assert.deepEqual(
    result.profileFailures,
    []
  );
});

test("a failed profile preserves its original state while the next profile succeeds and keeps its update", async () => {
  const profiles = [
    {
      id: "fails",
      name: "실패 조건",
      enabled: true
    },
    {
      id: "succeeds",
      name: "성공 조건",
      enabled: true
    }
  ];

  const originalState = {
    fails: {
      listings: {
        old: {
          priceKrw: 100
        }
      }
    },
    succeeds: {
      listings: {
        old: {
          priceKrw: 200
        }
      }
    }
  };

  const stateByProfile =
    structuredClone(originalState);
  const errors = [];

  const result =
    await runProfilesSequentially(
      profiles,
      async (profile) => {
        const nextState =
          structuredClone(
            stateByProfile[profile.id]
          );

        nextState.listings.current = {
          priceKrw:
            profile.id === "fails"
              ? 300
              : 400
        };

        if (profile.id === "fails") {
          throw new Error(
            "synthetic list failure"
          );
        }

        stateByProfile[profile.id] =
          nextState;

        return {
          profileId: profile.id,
          state: nextState
        };
      },
      {
        onError(error, profile) {
          errors.push({
            message: error.message,
            profileId: profile.id
          });
        }
      }
    );

  assert.deepEqual(
    stateByProfile.fails,
    originalState.fails
  );
  assert.deepEqual(
    stateByProfile.succeeds,
    {
      listings: {
        old: {
          priceKrw: 200
        },
        current: {
          priceKrw: 400
        }
      }
    }
  );
  assert.deepEqual(errors, [
    {
      message:
        "synthetic list failure",
      profileId: "fails"
    }
  ]);
  assert.deepEqual(
    result.results.map(
      ({ profileId }) => profileId
    ),
    ["succeeds"]
  );
  assert.equal(
    result.profileFailures.length,
    1
  );
  assert.equal(
    result.profileFailures[0]
      .profileId,
    "fails"
  );
  assert.equal(
    result.profileFailures[0]
      .profileName,
    "실패 조건"
  );
  assert.match(
    result.profileFailures[0]
      .error.message,
    /synthetic list failure/
  );
});

test("all enabled profile failures throw an AggregateError with profileFailures", async () => {
  const profiles = [
    {
      id: "first-failure",
      name: "첫 실패",
      enabled: true
    },
    {
      id: "ignored",
      name: "비활성",
      enabled: false
    },
    {
      id: "second-failure",
      name: "두 번째 실패",
      enabled: true
    }
  ];

  let caught;

  try {
    await runProfilesSequentially(
      profiles,
      async (profile) => {
        throw new Error(
          `failed:${profile.id}`
        );
      }
    );
  } catch (error) {
    caught = error;
  }

  assert.ok(
    caught instanceof AggregateError
  );
  assert.match(
    caught.message,
    /All enabled profiles failed/
  );
  assert.deepEqual(
    caught.errors.map(
      (error) => error.message
    ),
    [
      "failed:first-failure",
      "failed:second-failure"
    ]
  );
  assert.deepEqual(
    caught.profileFailures.map(
      ({ profileId }) => profileId
    ),
    [
      "first-failure",
      "second-failure"
    ]
  );
});

test("one shared Telegram sender uses global credentials and pacing for every profile message", async () => {
  const globalToken =
    "UNIT_TEST_GLOBAL_TOKEN";
  const globalChatId =
    "UNIT_TEST_GLOBAL_CHAT";
  const requests = [];
  const sleeps = [];
  let clock = 1000;
  let messageId = 10;

  const sender = createTelegramSender({
    token: globalToken,
    chatId: globalChatId,
    now: () => clock,
    sleepImpl: async (delay) => {
      sleeps.push(delay);
      clock += delay;
    },
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        body: JSON.parse(options.body)
      });
      messageId += 1;
      return successfulTelegramResponse(
        messageId
      );
    }
  });

  const profiles = [
    {
      name: "첫 조건",
      text: "첫 프로필 메시지",
      unusedToken:
        "UNUSED_PROFILE_TOKEN_A",
      unusedChatId:
        "UNUSED_PROFILE_CHAT_A"
    },
    {
      name: "둘째 조건",
      text: "둘째 프로필 메시지",
      unusedToken:
        "UNUSED_PROFILE_TOKEN_B",
      unusedChatId:
        "UNUSED_PROFILE_CHAT_B"
    }
  ];

  await Promise.all(
    profiles.map((profile) =>
      sender.send(profile.text)
    )
  );

  assert.deepEqual(sleeps, [1100]);
  assert.equal(requests.length, 2);

  for (const [index, request] of
    requests.entries()) {
    assert.equal(
      request.url,
      `https://api.telegram.org/bot${globalToken}/sendMessage`
    );
    assert.equal(
      request.body.chat_id,
      globalChatId
    );
    assert.equal(
      request.body.text,
      profiles[index].text
    );
    assert.equal(
      JSON.stringify(request).includes(
        profiles[index].unusedToken
      ),
      false
    );
    assert.equal(
      JSON.stringify(request).includes(
        profiles[index].unusedChatId
      ),
      false
    );
  }
});

for (const {
  name,
  firstStatus,
  retryAfter,
  expectedDelay
} of [
  {
    name:
      "Telegram HTTP 429 retries after retry_after plus one second",
    firstStatus: 429,
    retryAfter: 2,
    expectedDelay: 3000
  },
  {
    name:
      "Telegram response-body 429 retries after retry_after plus one second",
    firstStatus: 200,
    retryAfter: 1,
    expectedDelay: 2000
  }
]) {
  test(name, async () => {
    const sleeps = [];
    const warnings = [];
    let requestCount = 0;

    const sender =
      createTelegramSender({
        token:
          "UNIT_TEST_RETRY_TOKEN",
        chatId:
          "UNIT_TEST_RETRY_CHAT",
        now: () => 0,
        sleepImpl: async (delay) => {
          sleeps.push(delay);
        },
        logger: {
          warn(message) {
            warnings.push(message);
          }
        },
        fetchImpl: async () => {
          requestCount += 1;

          if (requestCount === 1) {
            return rateLimitedTelegramResponse({
              status: firstStatus,
              retryAfter
            });
          }

          return successfulTelegramResponse(
            20
          );
        }
      });

    const response = await sender.send(
      "retry test"
    );

    assert.equal(
      response.message_id,
      20
    );
    assert.equal(requestCount, 2);
    assert.deepEqual(
      sleeps,
      [expectedDelay]
    );
    assert.equal(warnings.length, 1);
  });
}

for (const {
  name,
  parseFailure
} of [
  {
    name:
      "Telegram HTTP 429 with a non-JSON body retries with the default delay",
    parseFailure:
      "Unexpected token"
  },
  {
    name:
      "Telegram HTTP 429 with an empty body retries with the default delay",
    parseFailure:
      "Unexpected end of JSON input"
  }
]) {
  test(name, async () => {
    const sleeps = [];
    const warnings = [];
    let requestCount = 0;

    const sender = createTelegramSender({
      token:
        "UNIT_TEST_INVALID_429_TOKEN",
      chatId:
        "UNIT_TEST_INVALID_429_CHAT",
      now: () => 0,
      sleepImpl: async (delay) => {
        sleeps.push(delay);
      },
      logger: {
        warn(message) {
          warnings.push(message);
        }
      },
      fetchImpl: async () => {
        requestCount += 1;

        if (requestCount === 1) {
          return unparseableRateLimitedResponse(
            parseFailure
          );
        }

        return successfulTelegramResponse(
          30
        );
      }
    });

    const response = await sender.send(
      "unparseable rate limit"
    );

    assert.equal(
      response.message_id,
      30
    );
    assert.equal(requestCount, 2);
    assert.deepEqual(sleeps, [6000]);
    assert.equal(warnings.length, 1);
  });
}

test("Telegram HTTP 429 with an unparseable body uses the default five attempts", async () => {
  const sleeps = [];
  let requestCount = 0;

  const sender = createTelegramSender({
    token:
      "UNIT_TEST_DEFAULT_ATTEMPTS_TOKEN",
    chatId:
      "UNIT_TEST_DEFAULT_ATTEMPTS_CHAT",
    now: () => 0,
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    logger: {
      warn() {}
    },
    fetchImpl: async () => {
      requestCount += 1;
      return unparseableRateLimitedResponse(
        "empty response"
      );
    }
  });

  await assert.rejects(
    sender.send(
      "always unparseable and limited"
    ),
    /텔레그램 전송 실패/
  );

  assert.equal(requestCount, 5);
  assert.deepEqual(sleeps, [
    6000,
    6000,
    6000,
    6000
  ]);
});

test("Telegram sender stops at maxAttempts and throws", async () => {
  const sleeps = [];
  let requestCount = 0;

  const sender = createTelegramSender({
    token: "UNIT_TEST_LIMIT_TOKEN",
    chatId: "UNIT_TEST_LIMIT_CHAT",
    maxAttempts: 3,
    now: () => 0,
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    logger: {
      warn() {}
    },
    fetchImpl: async () => {
      requestCount += 1;
      return rateLimitedTelegramResponse({
        status: 429,
        retryAfter: 1
      });
    }
  });

  await assert.rejects(
    sender.send("always limited"),
    /텔레그램 전송 실패/
  );

  assert.equal(requestCount, 3);
  assert.deepEqual(
    sleeps,
    [2000, 2000]
  );
});
