import { sleep } from "./lib.mjs";

function requireNonNegativeInteger(
  value,
  name
) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${name} must be a non-negative integer`
    );
  }

  return value;
}

export function createEncarRequestPacer({
  sleepImpl = sleep,
  nowMs = Date.now
} = {}) {
  if (typeof sleepImpl !== "function") {
    throw new Error(
      "sleepImpl must be a function"
    );
  }

  if (typeof nowMs !== "function") {
    throw new Error(
      "nowMs must be a function"
    );
  }

  let lastRequestStartedAt = null;
  let waitQueue = Promise.resolve();

  async function waitInternal(
    requestDelayMs
  ) {
    const minimumIntervalMs =
      requireNonNegativeInteger(
        requestDelayMs,
        "requestDelayMs"
      );

    if (lastRequestStartedAt !== null) {
      const elapsed =
        nowMs() - lastRequestStartedAt;
      const remaining = Math.max(
        0,
        minimumIntervalMs - elapsed
      );

      if (remaining > 0) {
        await sleepImpl(remaining);
      }
    }

    lastRequestStartedAt = nowMs();
  }

  function wait(requestDelayMs) {
    const request = waitQueue.then(() =>
      waitInternal(requestDelayMs)
    );

    waitQueue = request.catch(
      () => undefined
    );

    return request;
  }

  return {
    wait
  };
}
