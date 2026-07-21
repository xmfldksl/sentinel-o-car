const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 PersonalListingMonitor/1.0";

const MAX_RESULTS_PER_GROUP = 80;
const MAX_VALUE_LENGTH = 1000;

function singleLine(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maskVehicleNo(value) {
  return String(value).replace(
    /\b(\d{2,3})[\s-]*([가-힣])[\s-]*(\d{4})\b/gu,
    (_, digits, letter) => `${digits}${letter}****`
  );
}

function sanitize(value) {
  return maskVehicleNo(value)
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/giu, "[차대번호 마스킹]")
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/gu, "[휴대전화 마스킹]")
    .replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/gu, "[전화번호 마스킹]")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      "[이메일 마스킹]"
    );
}

function truncate(value, maxLength = MAX_VALUE_LENGTH) {
  const text = sanitize(singleLine(value));
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function parseListingIds() {
  const raw = process.env.LISTING_IDS ?? process.argv.slice(2).join(",");

  const ids = [
    ...new Set(
      String(raw)
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value))
    )
  ];

  if (ids.length === 0) {
    throw new Error(
      "LISTING_IDS에 조사할 엔카 매물 ID를 쉼표로 구분해 입력해야 합니다."
    );
  }

  if (ids.length > 8) {
    throw new Error("한 번에 조사할 수 있는 매물은 최대 8건입니다.");
  }

  return ids;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ko-KR,ko;q=0.9"
      },
      signal: controller.signal,
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parsePreloadedState(html) {
  const match = html.match(
    /<script\b[^>]*>\s*__PRELOADED_STATE__\s*=\s*([\s\S]*?)<\/script>/i
  );

  if (!match) {
    throw new Error("__PRELOADED_STATE__ 스크립트를 찾지 못했습니다.");
  }

  const json = match[1].trim().replace(/;\s*$/, "");
  return JSON.parse(json);
}

function formatPath(parts) {
  return parts
    .map((part) =>
      typeof part === "number" ? `[${part}]` : parts.indexOf(part) === 0 ? part : `.${part}`
    )
    .join("");
}

function summarizeValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return truncate(value);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return "[직렬화 불가]";
  }
}

function collectMatchingKeys(root, pattern) {
  const results = [];

  function visit(value, path = []) {
    if (results.length >= MAX_RESULTS_PER_GROUP) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...path, key];

      if (pattern.test(key)) {
        results.push({
          path: formatPath(nextPath),
          value: summarizeValue(child)
        });

        if (results.length >= MAX_RESULTS_PER_GROUP) return;
      }

      visit(child, nextPath);
      if (results.length >= MAX_RESULTS_PER_GROUP) return;
    }
  }

  visit(root);
  return results;
}

function collectMatchingText(root, pattern) {
  const results = [];

  function visit(value, path = []) {
    if (results.length >= MAX_RESULTS_PER_GROUP) return;

    if (typeof value === "string") {
      if (pattern.test(value)) {
        results.push({
          path: formatPath(path),
          value: truncate(value)
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      visit(child, [...path, key]);
      if (results.length >= MAX_RESULTS_PER_GROUP) return;
    }
  }

  visit(root);
  return results;
}

function getMaskedVehicleNo(state) {
  const value = state?.cars?.base?.vehicleNo;
  return typeof value === "string" && value.trim()
    ? maskVehicleNo(value.trim())
    : "미확인";
}

function buildReport(listingId, state) {
  const colorKeyPattern =
    /color|colour|paint|exterior|bodycolor|body_color|vehiclecolor|vehicle_color|외장|색상|컬러|도장/i;

  const descriptionKeyPattern =
    /description|desc|memo|comment|content|contents|advert|introduc|seller|note|remark|message|설명|소개|메모|내용|특이|옵션/i;

  const optionTextPattern =
    /\bfsd\b|\beap\b|full[\s-]*self[\s-]*driving|enhanced[\s-]*autopilot|완전\s*자율주행|향상된\s*오토파일럿|\bnoa\b/i;

  const redTextPattern =
    /빨강|빨간|레드|red|멀티코트\s*레드|울트라\s*레드/i;

  return {
    listingId,
    vehicleNo: getMaskedVehicleNo(state),
    baseSummary: {
      vehicleId: state?.cars?.base?.vehicleId ?? null,
      queryCarId: state?.cars?.base?.queryCarId ?? null
    },
    colorCandidateFields: collectMatchingKeys(state, colorKeyPattern),
    descriptionCandidateFields: collectMatchingKeys(
      state,
      descriptionKeyPattern
    ),
    fsdEapTextLocations: collectMatchingText(state, optionTextPattern),
    redTextLocations: collectMatchingText(state, redTextPattern)
  };
}

const listingIds = parseListingIds();
let failed = false;

for (const listingId of listingIds) {
  const url = `https://fem.encar.com/cars/detail/${listingId}`;

  console.log(`\n===== 매물 ${listingId} 조사 시작 =====`);

  try {
    const html = await fetchText(url);
    const state = parsePreloadedState(html);
    const report = buildReport(listingId, state);

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    failed = true;
    console.error(
      JSON.stringify(
        {
          listingId,
          error: sanitize(error instanceof Error ? error.message : String(error))
        },
        null,
        2
      )
    );
  }

  console.log(`===== 매물 ${listingId} 조사 종료 =====`);
}

if (failed) {
  process.exitCode = 1;
}