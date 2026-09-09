import assert from "node:assert/strict";
import test from "node:test";

import {
  createTelegramSender
} from "../src/runtime.mjs";

function successfulResponse(
  messageId = 123
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

function connectFetchError(
  code = "ETIMEDOUT"
) {
  const connectError =
    Object.assign(
      new Error(`connect ${code}`),
      {
        code,
        syscall: "connect"
      }
    );
  const aggregate =
    new AggregateError(
      [connectError],
      "connection failed"
    );
  const error = new TypeError(
    "fetch failed"
  );

  error.cause = aggregate;
  return error;
}

test("Telegram 연결 ETIMEDOUT은 재시도 후 성공한다", async () => {
  let attempts = 0;
  const sleeps = [];
  const warnings = [];
  const sender = createTelegramSender({
    token: "token",
    chatId: "chat",
    minIntervalMs: 0,
    maxAttempts: 3,
    fetchImpl: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw connectFetchError();
      }

      return successfulResponse();
    },
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    logger: {
      warn(message) {
        warnings.push(message);
      }
    }
  });

  const result = await sender.send(
    "message"
  );

  assert.equal(
    result.message_id,
    123
  );
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /ETIMEDOUT/
  );
});

test("Telegram 연결 오류는 maxAttempts까지만 재시도한다", async () => {
  let attempts = 0;
  const sleeps = [];
  const sender = createTelegramSender({
    token: "token",
    chatId: "chat",
    minIntervalMs: 0,
    maxAttempts: 3,
    fetchImpl: async () => {
      attempts += 1;
      throw connectFetchError();
    },
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    logger: {
      warn() {}
    }
  });

  await assert.rejects(
    sender.send("message"),
    /fetch failed/
  );
  assert.equal(attempts, 3);
  assert.deepEqual(
    sleeps,
    [2000, 2000]
  );
});

test("Telegram 연결 이후 오류는 자동 재시도하지 않는다", async () => {
  let attempts = 0;
  const sleeps = [];
  const sender = createTelegramSender({
    token: "token",
    chatId: "chat",
    minIntervalMs: 0,
    maxAttempts: 3,
    fetchImpl: async () => {
      attempts += 1;
      throw Object.assign(
        new Error("socket reset"),
        {
          code: "ECONNRESET",
          syscall: "read"
        }
      );
    },
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    logger: {
      warn() {}
    }
  });

  await assert.rejects(
    sender.send("message"),
    /socket reset/
  );
  assert.equal(attempts, 1);
  assert.deepEqual(sleeps, []);
});