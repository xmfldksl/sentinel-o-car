import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEARCH_URL,
  createSearchUrlFingerprint,
  formatSearchUrlSummary,
  resolveSearchUrl
} from "../src/lib.mjs";

const search = {
  title: "테슬라 모델 3 롱 레인지 AWD",
  action: "(And.(C.Manufacturer.테슬라._.Year.range(202205..202212)))"
};
const validUrl = `https://car.encar.com/list/car?page=3&search=${encodeURIComponent(JSON.stringify(search))}`;

test("GitHub Actions 환경에서 ENCAR_SEARCH_URL 누락 시 오류", () => {
  assert.throws(
    () => resolveSearchUrl({ GITHUB_ACTIONS: "true" }),
    /GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다/
  );
});

test("GitHub Actions 환경에서 ENCAR_SEARCH_URL이 공백이면 오류", () => {
  assert.throws(
    () => resolveSearchUrl({ GITHUB_ACTIONS: "true", ENCAR_SEARCH_URL: "  \t\n" }),
    /GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다/
  );
});

test("정상 URL에서 디코딩된 title과 Year.range를 추출한다", () => {
  const result = resolveSearchUrl({ GITHUB_ACTIONS: "true", ENCAR_SEARCH_URL: validUrl });
  const log = formatSearchUrlSummary(result);

  assert.equal(result.source, "repository variable");
  assert.equal(result.host, "car.encar.com");
  assert.equal(result.page, "3");
  assert.equal(result.title, search.title);
  assert.equal(result.yearRange, "Year.range(202205..202212)");
  assert.match(log, /검색 URL 출처: repository variable/);
  assert.match(log, /검색 조건 title: 테슬라 모델 3 롱 레인지 AWD/);
  assert.match(log, /검색 조건 연식 범위: Year\.range\(202205\.\.202212\)/);
  assert.equal(log.includes(validUrl), false);
});

test("GitHub Actions 환경에서 search 파라미터가 없으면 오류", () => {
  assert.throws(
    () =>
      resolveSearchUrl({
        GITHUB_ACTIONS: "true",
        ENCAR_SEARCH_URL: "https://car.encar.com/list/car?page=1"
      }),
    /search 파라미터가 없습니다/
  );
});

test("잘못된 search JSON이면 오류", () => {
  assert.throws(
    () =>
      resolveSearchUrl({
        GITHUB_ACTIONS: "true",
        ENCAR_SEARCH_URL: "https://car.encar.com/list/car?page=1&search=%7Binvalid"
      }),
    /search 파라미터가 올바른 JSON이 아닙니다/
  );
});

test("로컬 환경에서는 기본 URL을 사용할 수 있다", () => {
  const result = resolveSearchUrl({});

  assert.equal(result.source, "default");
  assert.equal(result.url, DEFAULT_SEARCH_URL);
});

test("URL 지문은 SHA-256 앞 12자리로 안정적으로 생성된다", () => {
  assert.equal(createSearchUrlFingerprint("https://example.com/search?page=1"), "b8435fa99f14");
  assert.equal(createSearchUrlFingerprint(validUrl), createSearchUrlFingerprint(validUrl));
  assert.match(createSearchUrlFingerprint(validUrl), /^[0-9a-f]{12}$/);
});
