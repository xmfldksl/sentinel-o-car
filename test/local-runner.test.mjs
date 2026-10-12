import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const runner = path.join(repository, "local/run.sh");
const protectedStatePaths = [
  path.join(repository, "data/state.json"),
  path.join(homedir(), "Library/Application Support/sentinel-o-car/state.json")
];
const dummyToken = "UNIT_TEST_RUNNER_TOKEN";
const dummyChat = "UNIT_TEST_RUNNER_CHAT";

function snapshot(file) {
  try {
    return {
      hash: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      modified: fs.statSync(file, { bigint: true }).mtimeNs.toString()
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function writeExecutable(file, contents) {
  fs.writeFileSync(file, contents, { mode: 0o700 });
}

function createFixture(t, options) {
  const protectedBefore = protectedStatePaths.map(snapshot);
  const directory = fs.mkdtempSync(path.join(tmpdir(), "sentinel-runner-test-"));
  t.after(() => {
    try {
      assert.deepEqual(
        protectedStatePaths.map(snapshot),
        protectedBefore,
        "repository and real external state must remain unchanged"
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  const fixtureRepo = path.join(directory, "repository with spaces");
  const bin = path.join(directory, "bin");
  const logs = path.join(directory, "logs");
  const temporary = path.join(directory, "tmp");
  for (const target of [path.join(fixtureRepo, "local"), bin, temporary]) {
    fs.mkdirSync(target, { recursive: true });
  }

  // Run the actual repository script, copied byte-for-byte so its relative
  // repository lookup and dependency-install condition stay fully isolated.
  // Never copy production app code, configuration, credentials, or state.
  const fixtureRunner = path.join(fixtureRepo, "local/run.sh");
  fs.copyFileSync(runner, fixtureRunner);
  assert.ok(fs.readFileSync(runner).equals(fs.readFileSync(fixtureRunner)));
  fs.writeFileSync(path.join(fixtureRepo, "package.json"), '{"private":true}\n');
  if (options.lockfile !== false) {
    fs.writeFileSync(path.join(fixtureRepo, "package-lock.json"), "{}\n");
  }
  if (options.nodeModules) {
    fs.mkdirSync(path.join(fixtureRepo, "node_modules"));
  }

  const state = path.join(directory, "external state", "state.json");
  fs.mkdirSync(path.dirname(state));
  if (!options.missingState) fs.writeFileSync(state, '{"testOnly":true}\n');
  const stateBefore = snapshot(state);
  const environmentFile = path.join(directory, "runner.env");
  if (!options.missingEnvironment) {
    fs.writeFileSync(environmentFile, [
      `TELEGRAM_BOT_TOKEN='${dummyToken}'`,
      `TELEGRAM_CHAT_ID='${dummyChat}'`,
      ...(options.sourceFailure ? ["return 44"] : []),
      ""
    ].join("\n"), { mode: 0o600 });
  }

  const trace = path.join(directory, "npm-calls");
  // No real npm, node, or application can be launched by these substitutes.
  // Unexpected invocations fail closed instead of delegating to a real binary.
  writeExecutable(path.join(bin, "npm"), `#!/bin/bash
set -euo pipefail
[[ "$PWD" == "$FIXTURE_REPOSITORY" ]] || exit 90
[[ "$STATE_PATH" == "$FIXTURE_STATE" ]] || exit 91
[[ "$TELEGRAM_BOT_TOKEN" == "$EXPECTED_TOKEN" ]] || exit 92
[[ "$TELEGRAM_CHAT_ID" == "$EXPECTED_CHAT" ]] || exit 93
[[ -d "$TMPDIR/sentinel-o-car.lock" ]] || exit 94
printf '%s\\n' "$*" >> "$FAKE_NPM_TRACE"
case "$*" in
  ci) exit "$FAKE_CI_STATUS" ;;
  test) exit "$FAKE_TEST_STATUS" ;;
  "run scrape") exit "$FAKE_SCRAPE_STATUS" ;;
  *) exit 95 ;;
esac
`);
  writeExecutable(path.join(bin, "node"), `#!/bin/bash
set -euo pipefail
[[ "$#" == 1 && "$1" == --version ]] || exit 96
printf 'test-node\\n'
`);

  const lock = path.join(temporary, "sentinel-o-car.lock");
  if (options.existingLock) fs.mkdirSync(lock);
  const originalLockInode = options.existingLock ? fs.statSync(lock).ino : null;

  return {
    execute() {
      return spawnSync("/bin/bash", [fixtureRunner], {
        cwd: fixtureRepo,
        // Do not inherit BASH_ENV, NODE_OPTIONS, real credentials, or npm
        // settings. HOME retains its real value; all write paths are explicit.
        env: {
          HOME: homedir(),
          PATH: `${bin}:/usr/bin:/bin`,
          TMPDIR: temporary,
          ENV_FILE: environmentFile,
          LOG_DIR: logs,
          STATE_PATH: state,
          NODE_BIN_DIR: bin,
          RUN_MODE: "normal",
          FIXTURE_REPOSITORY: fixtureRepo,
          FIXTURE_STATE: state,
          EXPECTED_TOKEN: dummyToken,
          EXPECTED_CHAT: dummyChat,
          FAKE_NPM_TRACE: trace,
          FAKE_CI_STATUS: String(options.ciStatus ?? 0),
          FAKE_TEST_STATUS: String(options.testStatus ?? 0),
          FAKE_SCRAPE_STATUS: String(options.scrapeStatus ?? 0)
        },
        encoding: "utf8",
        timeout: 10000
      });
    },
    inspect() {
      const calls = fs.existsSync(trace)
        ? fs.readFileSync(trace, "utf8").trim().split("\n") : [];
      const log = fs.readdirSync(logs).filter((name) => name.endsWith(".log"))
        .map((name) => fs.readFileSync(path.join(logs, name), "utf8")).join("");
      assert.deepEqual(snapshot(state), stateBefore, "temporary state must remain unchanged");
      if (options.existingLock) {
        assert.ok(fs.existsSync(lock), "another process's lock must remain");
        assert.equal(fs.statSync(lock).ino, originalLockInode, "existing lock must not be replaced");
      } else {
        assert.equal(fs.existsSync(lock), false, "acquired lock must be released");
      }
      return { calls, log };
    }
  };
}

const cases = [
  {
    name: "의존성 설치 실패는 테스트와 수집을 막고 원래 코드를 반환한다",
    ciStatus: 41, expectedStatus: 41, calls: ["ci"]
  },
  {
    name: "테스트 실패는 수집을 막고 원래 코드를 반환한다",
    testStatus: 42, expectedStatus: 42, calls: ["ci", "test"]
  },
  {
    name: "수집 실패는 원래 코드와 로그를 남긴다",
    scrapeStatus: 43, expectedStatus: 43, calls: ["ci", "test", "run scrape"]
  },
  {
    name: "성공하면 설치·테스트·수집 순서로 실행하고 0을 기록한다",
    expectedStatus: 0, calls: ["ci", "test", "run scrape"]
  },
  {
    name: "package-lock이 없으면 설치만 생략한다",
    lockfile: false, expectedStatus: 0, calls: ["test", "run scrape"]
  },
  {
    name: "node_modules가 있으면 설치만 생략한다",
    nodeModules: true, expectedStatus: 0, calls: ["test", "run scrape"]
  },
  {
    name: "기존 빈 잠금은 삭제하거나 교체하지 않고 모든 단계를 생략한다",
    existingLock: true, expectedStatus: 0, calls: []
  },
  {
    name: "환경 파일 누락은 코드 78을 기록하고 잠금을 해제한다",
    missingEnvironment: true, expectedStatus: 78, calls: []
  },
  {
    name: "환경 파일 로드 실패는 원래 코드와 로그를 남기고 잠금을 해제한다",
    sourceFailure: true, expectedStatus: 44, calls: []
  },
  {
    name: "상태 파일 누락은 수집 없이 코드 66을 기록하고 잠금을 해제한다",
    missingState: true, expectedStatus: 66, calls: ["ci", "test"]
  }
];

for (const scenario of cases) {
  test(`local/run.sh: ${scenario.name}`, (t) => {
    const fixture = createFixture(t, scenario);
    const result = fixture.execute();
    assert.equal(result.error, undefined, "runner must finish before timeout");
    assert.equal(result.signal, null);
    const { calls, log } = fixture.inspect();
    for (const output of [log, result.stdout, result.stderr]) {
      assert.equal(output.includes(dummyToken), false, "dummy token must not be logged");
      assert.equal(output.includes(dummyChat), false, "dummy chat must not be logged");
    }
    assert.deepEqual(calls, scenario.calls, "no stage may run after a failure");
    assert.equal(result.status, scenario.expectedStatus);
    if (scenario.existingLock) {
      assert.match(log, /이전 실행이 진행 중이어 건너뜁니다/);
    } else {
      const exitCodes = [...log.matchAll(/종료 코드=(\d+)/g)].map((match) => Number(match[1]));
      assert.deepEqual(exitCodes, [scenario.expectedStatus], "log the original exit code exactly once");
    }
  });
}
