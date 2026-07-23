const CURRENT_ENCAR_HOST = "car.encar.com";
const CURRENT_ENCAR_PATH = "/list/car";

const LEGACY_ENCAR_HOSTS = new Set([
  "www.encar.com",
  "encar.com"
]);

const LEGACY_ENCAR_PATH =
  "/fc/fc_carsearchlist.do";

const ENCAR_SEARCH_URL_GUIDANCE = [
  "지원하지 않는 엔카 검색 URL 형식입니다.",
  "엔카 검색 결과 화면의 주소창 URL 전체를 복사해 등록하십시오."
].join("\n");

function createSearchUrlError(reason) {
  return new Error(
    `${reason}\n${ENCAR_SEARCH_URL_GUIDANCE}`
  );
}

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function normalizePage(value) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return String(value);
  }

  if (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value)
  ) {
    const page = Number(value);

    if (Number.isSafeInteger(page)) {
      return String(page);
    }
  }

  return "1";
}

function parseSearchConditions(
  value,
  invalidJsonReason
) {
  let search;

  try {
    search = JSON.parse(value);
  } catch {
    throw createSearchUrlError(
      invalidJsonReason
    );
  }

  if (!isPlainObject(search)) {
    throw createSearchUrlError(
      "엔카 검색 조건은 JSON 객체여야 합니다."
    );
  }

  if (
    typeof search.action !== "string" ||
    !search.action.trim()
  ) {
    throw createSearchUrlError(
      "엔카 검색 조건에 action이 없습니다."
    );
  }

  return search;
}

function normalizeCurrentUrl(url) {
  const searchValue =
    url.searchParams.get("search");

  if (
    searchValue === null ||
    !searchValue.trim()
  ) {
    throw createSearchUrlError(
      "현재 형식 엔카 검색 URL에 search 쿼리가 없습니다."
    );
  }

  parseSearchConditions(
    searchValue,
    "현재 형식 엔카 검색 URL의 search 쿼리가 올바른 JSON이 아닙니다."
  );

  url.searchParams.set(
    "page",
    normalizePage(
      url.searchParams.get("page")
    )
  );

  url.hash = "";

  return url.toString();
}

function normalizeLegacyUrl(url) {
  if (!url.hash.startsWith("#!")) {
    throw createSearchUrlError(
      "기존 형식 엔카 검색 URL에 #! fragment가 없습니다."
    );
  }

  const rawFragment = url.hash.slice(2);
  let decodedFragment;

  try {
    decodedFragment =
      decodeURIComponent(rawFragment);
  } catch {
    throw createSearchUrlError(
      "기존 형식 엔카 검색 URL의 fragment를 디코딩할 수 없습니다."
    );
  }

  const legacySearch =
    parseSearchConditions(
      decodedFragment,
      "기존 형식 엔카 검색 URL의 fragment가 올바른 JSON이 아닙니다."
    );

  const page = normalizePage(
    legacySearch.page
  );

  const currentSearch = {
    type: "car",
    ...legacySearch
  };

  delete currentSearch.page;
  delete currentSearch.limit;
  delete currentSearch.searchKey;
  delete currentSearch.loginCheck;

  const normalized = new URL(
    `https://${CURRENT_ENCAR_HOST}${CURRENT_ENCAR_PATH}`
  );

  normalized.searchParams.set(
    "page",
    page
  );

  normalized.searchParams.set(
    "search",
    JSON.stringify(currentSearch)
  );

  return normalized.toString();
}

export function normalizeEncarSearchUrl(
  rawUrl
) {
  if (
    typeof rawUrl !== "string" ||
    !rawUrl.trim()
  ) {
    throw createSearchUrlError(
      "엔카 검색 URL 문법이 올바르지 않습니다."
    );
  }

  let url;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw createSearchUrlError(
      "엔카 검색 URL 문법이 올바르지 않습니다."
    );
  }

  const isCurrent =
    url.protocol === "https:" &&
    url.hostname === CURRENT_ENCAR_HOST &&
    url.pathname === CURRENT_ENCAR_PATH;

  if (isCurrent) {
    return normalizeCurrentUrl(url);
  }

  const isLegacy =
    url.protocol === "https:" &&
    LEGACY_ENCAR_HOSTS.has(url.hostname) &&
    url.pathname === LEGACY_ENCAR_PATH;

  if (isLegacy) {
    return normalizeLegacyUrl(url);
  }

  throw createSearchUrlError(
    "엔카 검색 URL의 호스트 또는 경로를 지원하지 않습니다."
  );
}