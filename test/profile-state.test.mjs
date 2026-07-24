import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWatcherState
} from "../src/runtime.mjs";

function normalizedConfig(
  profileIds = [
    "configured-a",
    "configured-b"
  ]
) {
  return {
    profiles: profileIds.map((id) => ({
      id
    }))
  };
}

function listingRecord(
  id,
  overrides = {}
) {
  return {
    id,
    title: `Synthetic ${id}`,
    priceKrw: 30000000,
    ...overrides
  };
}

function validState() {
  return {
    schemaVersion: 2,
    profiles: {
      "configured-a": {
        initializedAt:
          "2026-07-24T00:00:00.000Z",
        updatedAt:
          "2026-07-25T00:00:00.000Z",
        listings: {
          "listing-a": listingRecord(
            "listing-a"
          )
        }
      }
    }
  };
}

test("v2 상태는 현재 namespace를 보존하고 누락된 구성 namespace만 생성한다", () => {
  const rawState = validState();

  rawState.profiles.archived = {
    initializedAt:
      "2026-07-23T00:00:00.000Z",
    updatedAt:
      "2026-07-24T00:00:00.000Z",
    listings: {
      "archived-listing":
        listingRecord(
          "archived-listing",
          {
            priceKrw: 31000000
          }
        )
    }
  };

  const before = structuredClone(
    rawState
  );
  const normalized =
    normalizeWatcherState(
      rawState,
      normalizedConfig()
    );

  assert.deepEqual(rawState, before);
  assert.notEqual(normalized, rawState);
  assert.equal(
    normalized.schemaVersion,
    2
  );
  assert.deepEqual(
    Object.keys(normalized).sort(),
    ["profiles", "schemaVersion"]
  );
  assert.deepEqual(
    Object.keys(normalized.profiles),
    [
      "configured-a",
      "archived",
      "configured-b"
    ]
  );
  assert.deepEqual(
    normalized.profiles[
      "configured-a"
    ],
    rawState.profiles[
      "configured-a"
    ]
  );
  assert.notEqual(
    normalized.profiles[
      "configured-a"
    ],
    rawState.profiles[
      "configured-a"
    ]
  );
  assert.deepEqual(
    normalized.profiles.archived,
    rawState.profiles.archived
  );
  assert.notEqual(
    normalized.profiles.archived,
    rawState.profiles.archived
  );
  assert.deepEqual(
    normalized.profiles[
      "configured-b"
    ],
    { listings: {} }
  );
});

test("v2가 아닌 상태와 손상된 namespace를 명확하게 거부한다", async (t) => {
  const cases = [
    {
      name: "state object",
      value: null,
      pattern: /state must be an object/
    },
    {
      name: "missing schemaVersion",
      value: {
        profiles: {}
      },
      pattern:
        /state\.schemaVersion is required/
    },
    {
      name: "wrong schemaVersion",
      value: {
        schemaVersion: 1,
        profiles: {}
      },
      pattern:
        /state\.schemaVersion must be 2/
    },
    {
      name: "non-object profiles",
      value: {
        schemaVersion: 2,
        profiles: []
      },
      pattern:
        /state\.profiles must be an object/
    },
    {
      name: "flat listings",
      value: {
        schemaVersion: 2,
        profiles: {},
        listings: {}
      },
      pattern:
        /state contains unknown field listings/
    },
    {
      name: "default namespace",
      value: {
        schemaVersion: 2,
        profiles: {
          default: {
            listings: {}
          }
        }
      },
      pattern:
        /state\.profiles\.default is not supported/
    },
    {
      name: "removed root updatedAt",
      value: {
        schemaVersion: 2,
        profiles: {},
        updatedAt:
          "2026-07-25T00:00:00.000Z"
      },
      pattern:
        /state contains unknown field updatedAt/
    },
    {
      name: "corrupt profile namespace",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": null
        }
      },
      pattern:
        /state\.profiles\.configured-a must be an object/
    },
    {
      name: "unknown profile field",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {
            listings: {},
            unexpectedProfileField: true
          }
        }
      },
      pattern:
        /state\.profiles\.configured-a contains unknown field unexpectedProfileField/
    },
    {
      name: "missing listings object",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {}
        }
      },
      pattern:
        /state\.profiles\.configured-a\.listings is required/
    },
    {
      name: "invalid initializedAt",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {
            initializedAt: " ",
            listings: {}
          }
        }
      },
      pattern:
        /state\.profiles\.configured-a\.initializedAt must be a valid ISO timestamp string/
    },
    {
      name: "invalid updatedAt",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {
            updatedAt:
              "2026-02-30T00:00:00.000Z",
            listings: {}
          }
        }
      },
      pattern:
        /state\.profiles\.configured-a\.updatedAt must be a valid ISO timestamp string/
    },
    {
      name: "corrupt listings object",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {
            listings: []
          }
        }
      },
      pattern:
        /state\.profiles\.configured-a\.listings must be an object/
    },
    {
      name: "corrupt listing record",
      value: {
        schemaVersion: 2,
        profiles: {
          "configured-a": {
            listings: {
              "listing-a": null
            }
          }
        }
      },
      pattern:
        /state\.profiles\.configured-a\.listings\.listing-a must be an object/
    }
  ];

  for (const {
    name,
    value,
    pattern
  } of cases) {
    await t.test(name, () => {
      assert.throws(
        () =>
          normalizeWatcherState(
            value,
            normalizedConfig([
              "configured-a"
            ])
          ),
        pattern
      );
    });
  }
});
