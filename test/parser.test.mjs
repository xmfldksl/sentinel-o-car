import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  analyzeDetail,
  evaluateListing,
  matchesBasicCriteria,
  parseListHtml,
  setPage
} from "../src/lib.mjs";

const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url), "utf8"));

test("목록 HTML에서 매물을 파싱하고 중복 ID를 제거한다", async () => {
  const html = await fs.readFile(new URL("./fixtures/list.html", import.meta.url), "utf8");
  const listings = parseListHtml(html);
  assert.equal(listings.length, 3);
  const target = listings.find((item) => item.id === "42023180");
  assert.equal(target.title, "모델 3 롱 레인지 AWD");
  assert.equal(target.yearMonth, "2022-09");
  assert.equal(target.mileageKm, 67235);
  assert.equal(target.priceKrw, 32700000);
});

test("사용자 기본 조건을 적용한다", () => {
  const target = {
    title: "모델 3 롱 레인지 AWD",
    yearMonth: "2022-09",
    mileageKm: 67235
  };
  assert.equal(matchesBasicCriteria(target, config), true);
  assert.equal(matchesBasicCriteria({ ...target, mileageKm: 150001 }, config), false);
  assert.equal(matchesBasicCriteria({ ...target, title: "모델 3 RWD" }, config), false);
});

test("FSD와 렌트 감가를 판정한다", () => {
  const listing = {
    id: "1",
    title: "모델 3 롱 레인지 AWD",
    priceKrw: 36000000,
    contracted: false
  };
  const enriched = analyzeDetail("<html>FSD 포함, 렌터카 사용 이력</html>", listing, config);
  const result = evaluateListing(enriched, config);
  assert.equal(result.hasFsd, true);
  assert.equal(result.rental, true);
  assert.equal(result.adjustedPriceKrw, 39000000);
  assert.equal(result.eligible, true);
});

test("빨간색과 계약중 차량을 제외한다", () => {
  const listing = {
    id: "2",
    title: "모델 3 롱 레인지 AWD",
    priceKrw: 32000000,
    contracted: true
  };
  const enriched = analyzeDetail("<html>외장색상 빨간색</html>", listing, config);
  const result = evaluateListing(enriched, config);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.excludedReasons, ["계약중", "빨간색 계열"]);
});

test("페이지 번호를 URL에 안전하게 반영한다", () => {
  assert.equal(setPage("https://example.com/list?search=x&page=1", 3), "https://example.com/list?search=x&page=3");
});
