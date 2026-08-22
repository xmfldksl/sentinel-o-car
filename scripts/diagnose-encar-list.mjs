// 임시 진단 스크립트: 엔카 목록 0건 원인 파악용.
// 운영 로직(src/index.mjs)은 수정하지 않고, collectProfileListings가
// 실제로 사용하는 fetch 구현만 감싸서 응답 메타데이터만 기록한다.
// 상태 파일 저장, 텔레그램 전송은 하지 않는다.
import {
  collectProfileListings
} from "../src/index.mjs";
import {
  normalizeWatcherConfig
} from "../src/runtime.mjs";
import {
  createSearchUrlFingerprint,
  loadJson
} from "../src/lib.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 PersonalListingMonitor/1.0";

const MARKERS = [
  "restricted by traffic limits",
  "traffic",
  "captcha",
  "Access Denied",
  "__PRELOADED_STATE__",
  "ryvussApi",
  "/cars/detail/"
];

// 검색 조건 전체(쿼리 값, 해시)는 출력하지 않는다.
function describeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const queryKeys = [
      ...new Set(url.searchParams.keys())
    ].sort();

    return [
      `origin+path=${url.origin}${url.pathname}`,
      `queryKeys=${queryKeys.join("|") || "없음"}`,
      `hasHash=${url.hash.length > 0}`,
      `지문=${createSearchUrlFingerprint(rawUrl)}`
    ].join(" ");
  } catch {
    return "[URL 파싱 실패]";
  }
}

function createDiagnosticFetchText(logger) {
  return async function diagnosticFetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      30000
    );

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

      const buffer = Buffer.from(
        await response.arrayBuffer()
      );
      const html = buffer.toString("utf8");
      const markerFlags = MARKERS.map(
        (marker) =>
          `${marker}=${html.includes(marker)}`
      );

      logger.log(
        [
          "[진단] 응답 요약",
          `  status=${response.status} ${response.statusText}`,
          `  contentType=${response.headers.get("content-type") ?? "없음"}`,
          `  bodyBytes=${buffer.byteLength}`,
          `  requestUrl: ${describeUrl(url)}`,
          `  finalUrl:   ${describeUrl(response.url)}`,
          `  redirected=${response.redirected} sameAsRequest=${response.url === url}`,
          `  포함여부: ${markerFlags.join(", ")}`
        ].join("\n")
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return html;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function main() {
  const logger = console;
  const config = normalizeWatcherConfig(
    await loadJson(
      new URL(
        "../config.json",
        import.meta.url
      )
    ),
    process.env
  );
  const profiles = config.profiles.filter(
    (profile) => profile.enabled
  );

  logger.log(
    `[진단] 대상 프로필 ${profiles.length}개, maxPages=${config.maxPages}, requestDelayMs=${config.requestDelayMs}`
  );

  for (const profile of profiles) {
    logger.log(
      `\n===== [${profile.id} | ${profile.name}] 진단 시작 =====`
    );

    try {
      const result = await collectProfileListings(
        profile,
        {
          maxPages: config.maxPages,
          requestDelayMs: config.requestDelayMs,
          fetchTextImpl:
            createDiagnosticFetchText(logger),
          logger
        }
      );

      logger.log(
        `[진단] 결과: 매물 ${result.listingsById.size}건, partial=${result.partial}, failedPage=${result.failedPage ?? "없음"}`
      );
    } catch (error) {
      logger.log(
        `[진단] collectProfileListings 실패: ${error.message}`
      );
    }
  }

  logger.log(
    "\n[진단] 완료. 상태 파일 저장/텔레그램 전송은 수행하지 않았습니다."
  );
}

await main();
