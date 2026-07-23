import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEARCH_URL,
  createSearchUrlFingerprint,
  formatSearchUrlSummary,
  normalizeEncarSearchUrl,
  resolveSearchUrl,
  setPage
} from "../src/lib.mjs";

function createSearchConditions(
  label = "sample",
  overrides = {}
) {
  return {
    type: "car",
    title: `합성 검색 ${label}`,
    action:
      `(And.Year.range(202104..)._.Mileage.range(..150000)._.` +
      `(C.CarType.N._.(C.Manufacturer.합성브랜드._.` +
      `(C.ModelGroup.합성모델._.Model.합성모델 1세대.)))_.` +
      `SeatingCapacity.7인승._.Condition.InspectionDirect.)`,
    toggle: {},
    layer: "",
    sort: "MobileModifiedDate",
    ...overrides
  };
}

function createCurrentUrl(
  label = "current",
  {
    page = 1,
    searchOverrides = {},
    includePage = true
  } = {}
) {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  if (includePage) {
    url.searchParams.set(
      "page",
      String(page)
    );
  }

  url.searchParams.set(
    "search",
    JSON.stringify(
      createSearchConditions(
        label,
        searchOverrides
      )
    )
  );

  return url.toString();
}

function createLegacyUrl(
  label = "legacy",
  {
    host = "www.encar.com",
    page = 1,
    searchOverrides = {}
  } = {}
) {
  const fragment = {
    ...createSearchConditions(
      label,
      searchOverrides
    ),
    page,
    limit: 20,
    searchKey: "",
    loginCheck: false
  };

  return [
    `https://${host}/fc/fc_carsearchlist.do?carType=for`,
    "#!",
    encodeURIComponent(
      JSON.stringify(fragment)
    )
  ].join("");
}

function readSearchConditions(urlString) {
  const url = new URL(urlString);
  const searchValue =
    url.searchParams.get("search");

  assert.ok(searchValue);

  return JSON.parse(searchValue);
}

const currentSearch = createSearchConditions(
  "tesla-regression",
  {
    title:
      "테슬라 모델 3 롱 레인지 AWD",
    action:
      "(And.(C.Manufacturer.테슬라._.Year.range(202205..202212)))"
  }
);

const currentUrl = createCurrentUrl(
  "tesla-regression",
  {
    page: 3,
    searchOverrides: currentSearch
  }
);

test("GitHub Actions 환경에서 ENCAR_SEARCH_URL 누락 시 오류", () => {
  assert.throws(
    () =>
      resolveSearchUrl({
        GITHUB_ACTIONS: "true"
      }),
    /GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다/
  );
});

test("GitHub Actions 환경에서 ENCAR_SEARCH_URL이 공백이면 오류", () => {
  assert.throws(
    () =>
      resolveSearchUrl({
        GITHUB_ACTIONS: "true",
        ENCAR_SEARCH_URL: "  \t\n"
      }),
    /GitHub Actions에서는 ENCAR_SEARCH_URL repository variable이 필요합니다/
  );
});

test("현재 형식 URL은 검색조건과 정상 page를 유지한다", () => {
  const normalized =
    normalizeEncarSearchUrl(
      currentUrl
    );
  const normalizedUrl =
    new URL(normalized);

  assert.equal(
    normalizedUrl.hostname,
    "car.encar.com"
  );
  assert.equal(
    normalizedUrl.pathname,
    "/list/car"
  );
  assert.equal(
    normalizedUrl.searchParams.get(
      "page"
    ),
    "3"
  );
  assert.deepEqual(
    readSearchConditions(normalized),
    currentSearch
  );
});

test("현재 형식 URL에 page가 없으면 page=1을 추가한다", () => {
  const normalized =
    normalizeEncarSearchUrl(
      createCurrentUrl(
        "missing-page",
        {
          includePage: false
        }
      )
    );

  assert.equal(
    new URL(normalized)
      .searchParams.get("page"),
    "1"
  );
});

test("현재 형식 URL의 page가 비정상이면 page=1로 정규화한다", () => {
  for (const page of [
    "0",
    "-1",
    "abc",
    "1.5",
    ""
  ]) {
    const normalized =
      normalizeEncarSearchUrl(
        createCurrentUrl(
          `invalid-page-${page}`,
          { page }
        )
      );

    assert.equal(
      new URL(normalized)
        .searchParams.get("page"),
      "1"
    );
  }
});

test("기존 www.encar.com #! URL을 현재 형식으로 변환한다", () => {
  const legacyConditions =
    createSearchConditions(
      "legacy-www"
    );
  const legacyUrl =
    createLegacyUrl(
      "legacy-www"
    );
  const normalized =
    normalizeEncarSearchUrl(
      legacyUrl
    );
  const normalizedUrl =
    new URL(normalized);
  const normalizedSearch =
    readSearchConditions(normalized);

  assert.equal(
    normalizedUrl.protocol,
    "https:"
  );
  assert.equal(
    normalizedUrl.hostname,
    "car.encar.com"
  );
  assert.equal(
    normalizedUrl.pathname,
    "/list/car"
  );
  assert.equal(
    normalizedUrl.searchParams.get(
      "page"
    ),
    "1"
  );
  assert.ok(
    normalizedUrl.searchParams.has(
      "search"
    )
  );

  assert.equal(
    normalizedSearch.action,
    legacyConditions.action
  );
  assert.equal(
    normalizedSearch.sort,
    legacyConditions.sort
  );
  assert.deepEqual(
    normalizedSearch.toggle,
    legacyConditions.toggle
  );
  assert.equal(
    normalizedSearch.layer,
    legacyConditions.layer
  );
  assert.match(
    normalizedSearch.action,
    /Year\.range\(202104\.\.\)/
  );
  assert.match(
    normalizedSearch.action,
    /Mileage\.range\(\.\.150000\)/
  );
  assert.match(
    normalizedSearch.action,
    /Manufacturer\.합성브랜드/
  );
  assert.match(
    normalizedSearch.action,
    /ModelGroup\.합성모델/
  );
  assert.match(
    normalizedSearch.action,
    /SeatingCapacity\.7인승/
  );

  assert.equal(
    Object.hasOwn(
      normalizedSearch,
      "page"
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      normalizedSearch,
      "limit"
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      normalizedSearch,
      "searchKey"
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      normalizedSearch,
      "loginCheck"
    ),
    false
  );
});

test("기존 encar.com URL도 현재 형식으로 변환한다", () => {
  const normalized =
    normalizeEncarSearchUrl(
      createLegacyUrl(
        "legacy-root-host",
        {
          host: "encar.com",
          page: 4
        }
      )
    );
  const normalizedUrl =
    new URL(normalized);

  assert.equal(
    normalizedUrl.hostname,
    "car.encar.com"
  );
  assert.equal(
    normalizedUrl.searchParams.get(
      "page"
    ),
    "4"
  );
});

test("기존 형식의 비정상 page는 page=1로 정규화한다", () => {
  const normalized =
    normalizeEncarSearchUrl(
      createLegacyUrl(
        "legacy-invalid-page",
        {
          page: "not-a-page"
        }
      )
    );

  assert.equal(
    new URL(normalized)
      .searchParams.get("page"),
    "1"
  );
});

test("변환된 URL은 페이지 순회 시 page만 변경할 수 있다", () => {
  const normalized =
    normalizeEncarSearchUrl(
      createLegacyUrl(
        "pagination"
      )
    );
  const originalSearch =
    new URL(normalized)
      .searchParams.get("search");
  const pageTwo =
    setPage(normalized, 2);
  const pageTwoUrl =
    new URL(pageTwo);

  assert.equal(
    pageTwoUrl.searchParams.get(
      "page"
    ),
    "2"
  );
  assert.equal(
    pageTwoUrl.searchParams.get(
      "search"
    ),
    originalSearch
  );
});

test("resolveSearchUrl은 기존 형식도 정규화된 요약과 지문으로 반환한다", () => {
  const legacyUrl =
    createLegacyUrl(
      "resolve-legacy",
      { page: 2 }
    );
  const result =
    resolveSearchUrl({
      GITHUB_ACTIONS: "true",
      ENCAR_SEARCH_URL: legacyUrl
    });
  const log =
    formatSearchUrlSummary(result);

  assert.equal(
    result.source,
    "repository variable"
  );
  assert.equal(
    result.host,
    "car.encar.com"
  );
  assert.equal(
    result.page,
    "2"
  );
  assert.equal(
    result.fingerprint,
    createSearchUrlFingerprint(
      result.url
    )
  );
  assert.equal(
    log.includes(legacyUrl),
    false
  );
  assert.equal(
    log.includes(result.url),
    false
  );
});

test("정상 현재 URL에서 디코딩된 title과 Year.range를 추출한다", () => {
  const result =
    resolveSearchUrl({
      GITHUB_ACTIONS: "true",
      ENCAR_SEARCH_URL: currentUrl
    });
  const log =
    formatSearchUrlSummary(result);

  assert.equal(
    result.source,
    "repository variable"
  );
  assert.equal(
    result.host,
    "car.encar.com"
  );
  assert.equal(
    result.page,
    "3"
  );
  assert.equal(
    result.title,
    currentSearch.title
  );
  assert.equal(
    result.yearRange,
    "Year.range(202205..202212)"
  );
  assert.match(
    log,
    /검색 URL 출처: repository variable/
  );
  assert.match(
    log,
    /검색 조건 title: 테슬라 모델 3 롱 레인지 AWD/
  );
  assert.match(
    log,
    /검색 조건 연식 범위: Year\.range\(202205\.\.202212\)/
  );
  assert.equal(
    log.includes(currentUrl),
    false
  );
  assert.equal(
    log.includes(result.url),
    false
  );
});

test("현재 형식 URL에서 search 쿼리가 없으면 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://car.encar.com/list/car?page=1"
      ),
    /현재 형식 엔카 검색 URL에 search 쿼리가 없습니다/
  );
});

test("현재 형식 URL에서 search 쿼리가 공백이면 명확한 오류", () => {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set("search", " ");

  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        url.toString()
      ),
    /현재 형식 엔카 검색 URL에 search 쿼리가 없습니다/
  );
});

test("현재 형식 URL에서 search가 잘못된 JSON이면 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://car.encar.com/list/car?page=1&search=%7Binvalid"
      ),
    /search 쿼리가 올바른 JSON이 아닙니다/
  );
});

test("현재 형식 URL에서 action이 없으면 명확한 오류", () => {
  const url = new URL(
    "https://car.encar.com/list/car"
  );

  url.searchParams.set("page", "1");
  url.searchParams.set(
    "search",
    JSON.stringify({
      type: "car",
      toggle: {}
    })
  );

  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        url.toString()
      ),
    /엔카 검색 조건에 action이 없습니다/
  );
});

test("기존 형식 URL에 #! fragment가 없으면 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://www.encar.com/fc/fc_carsearchlist.do?carType=for"
      ),
    /기존 형식 엔카 검색 URL에 #! fragment가 없습니다/
  );
});

test("기존 형식 URL의 fragment 디코딩 실패는 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://www.encar.com/fc/fc_carsearchlist.do#!%E0%A4%A"
      ),
    /fragment를 디코딩할 수 없습니다/
  );
});

test("기존 형식 URL의 fragment가 JSON이 아니면 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://www.encar.com/fc/fc_carsearchlist.do#!not-json"
      ),
    /fragment가 올바른 JSON이 아닙니다/
  );
});

test("기존 형식 URL의 fragment에 action이 없으면 명확한 오류", () => {
  const fragment =
    encodeURIComponent(
      JSON.stringify({
        type: "car",
        page: 1
      })
    );

  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        `https://www.encar.com/fc/fc_carsearchlist.do#!${fragment}`
      ),
    /엔카 검색 조건에 action이 없습니다/
  );
});

test("지원하지 않는 URL은 네트워크 요청 전에 명확한 오류", () => {
  assert.throws(
    () =>
      normalizeEncarSearchUrl(
        "https://example.test/list/car?page=1"
      ),
    /엔카 검색 URL의 호스트 또는 경로를 지원하지 않습니다/
  );
});

test("URL 문법 오류는 공통 사용자 안내를 포함하고 원문을 노출하지 않는다", () => {
  const rawUrl =
    "not a valid URL with private-condition";
  let error;

  try {
    normalizeEncarSearchUrl(rawUrl);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof Error);
  assert.match(
    error.message,
    /지원하지 않는 엔카 검색 URL 형식입니다/
  );
  assert.match(
    error.message,
    /엔카 검색 결과 화면의 주소창 URL 전체를 복사해 등록하십시오/
  );
  assert.equal(
    error.message.includes(rawUrl),
    false
  );
  assert.equal(
    error.message.includes(
      "private-condition"
    ),
    false
  );
});

test("Tesla와 Toyota 합성 URL은 서로 섞이지 않는다", () => {
  const teslaUrl =
    createCurrentUrl(
      "tesla-isolated",
      {
        searchOverrides: {
          action:
            "(And.(C.Manufacturer.테슬라._.Model.모델 3.))"
        }
      }
    );
  const toyotaUrl =
    createLegacyUrl(
      "toyota-isolated",
      {
        searchOverrides: {
          action:
            "(And.(C.Manufacturer.도요타._.Model.시에나.))"
        }
      }
    );

  const teslaResult =
    resolveSearchUrl({
      GITHUB_ACTIONS: "true",
      ENCAR_SEARCH_URL: teslaUrl
    });
  const toyotaResult =
    resolveSearchUrl({
      GITHUB_ACTIONS: "true",
      ENCAR_SEARCH_URL: toyotaUrl
    });

  const teslaConditions =
    readSearchConditions(
      teslaResult.url
    );
  const toyotaConditions =
    readSearchConditions(
      toyotaResult.url
    );

  assert.match(
    teslaConditions.action,
    /Manufacturer\.테슬라/
  );
  assert.doesNotMatch(
    teslaConditions.action,
    /Manufacturer\.도요타/
  );
  assert.match(
    toyotaConditions.action,
    /Manufacturer\.도요타/
  );
  assert.doesNotMatch(
    toyotaConditions.action,
    /Manufacturer\.테슬라/
  );
});

test("로컬 환경에서는 정규화된 기본 URL을 사용할 수 있다", () => {
  const result =
    resolveSearchUrl({});

  assert.equal(
    result.source,
    "default"
  );
  assert.equal(
    result.url,
    normalizeEncarSearchUrl(
      DEFAULT_SEARCH_URL
    )
  );
});

test("URL 지문은 SHA-256 앞 12자리로 안정적으로 생성된다", () => {
  assert.equal(
    createSearchUrlFingerprint(
      "https://example.com/search?page=1"
    ),
    "b8435fa99f14"
  );
  assert.equal(
    createSearchUrlFingerprint(
      currentUrl
    ),
    createSearchUrlFingerprint(
      currentUrl
    )
  );
  assert.match(
    createSearchUrlFingerprint(
      currentUrl
    ),
    /^[0-9a-f]{12}$/
  );
});
