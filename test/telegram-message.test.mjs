import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  analyzeDetail,
  createTelegramMessageRequest,
  evaluateListing,
  formatTelegramMessage,
  recordTelegramDelivery
} from "../src/lib.mjs";

const config = JSON.parse(
  await fs.readFile(
    new URL("../config.json", import.meta.url),
    "utf8"
  )
);

const leaseDetailHtml =
  await fs.readFile(
    new URL(
      "./fixtures/detail-lease-preloaded.html",
      import.meta.url
    ),
    "utf8"
  );

const baseListing = {
  id: "42023180",
  title: "모델 3 롱 레인지 AWD",
  url: "https://fem.encar.com/cars/detail/42023180?advClickPosition=mweb_normal&type=detail#photos",
  yearMonth: "2022-09",
  mileageKm: 92000,
  priceKrw: 38500000,
  region: "서울",
  option: "미확인",
  vehicleNo: "12가3456",
  saleType: "NORMAL",
  monthlyFeeKrw: null,
  rentalUsageHistory: null,
  totalLossHistory: null,
  warnings: [
    "옵션 확인 필요",
    "흡연 여부 확인",
    "튜닝 여부 확인"
  ],
  priceRule: "FSD 기준",
  limitKrw: 40000000
};

function detailHtml(base) {
  return `<!doctype html>
<html lang="ko">
  <body>
    <script>
      __PRELOADED_STATE__ = ${JSON.stringify({
        cars: { base }
      })};
    </script>
  </body>
</html>`;
}

test("텔레그램 요청은 메시지 복사와 전달을 제한하지 않는다", () => {
  const request = createTelegramMessageRequest(
    "chat-id",
    "message"
  );

  assert.deepEqual(request, {
    chat_id: "chat-id",
    text: "message",
    link_preview_options: {
      is_disabled: true
    }
  });

  assert.equal(
    Object.hasOwn(request, "protect_content"),
    false
  );

  assert.equal(
    Object.hasOwn(request, "protectContent"),
    false
  );
});

test("텔레그램 전송 결과의 메시지 ID와 발송 시각을 상태에 기록한다", () => {
  const previous = {
    id: "42023180",
    title: "모델 3 롱 레인지 AWD"
  };

  const recorded =
    recordTelegramDelivery(
      previous,
      {
        message_id: 12345
      },
      "2026-07-21T13:45:00.000Z"
    );

  assert.deepEqual(
    recorded,
    {
      ...previous,
      telegramMessageId: 12345,
      telegramSentAt:
        "2026-07-21T13:45:00.000Z"
    }
  );

  assert.equal(
    Object.hasOwn(
      previous,
      "telegramMessageId"
    ),
    false
  );
});

test("매물삭제 전송 결과는 삭제 상태와 기존 매물 정보를 보존한다", () => {
  const deletedRecord = {
    id: "42023180",
    title: "모델 3 롱 레인지 AWD",
    priceKrw: 38500000,
    url: "https://fem.encar.com/cars/detail/42023180",
    firstSeenAt: "2026-07-20T02:00:00.000Z",
    deletedAt: "2026-07-22T02:00:00.000Z",
    telegramMessageId: 12345,
    telegramSentAt: "2026-07-20T02:01:00.000Z"
  };

  const recorded =
    recordTelegramDelivery(
      deletedRecord,
      {
        message_id: 67890
      },
      "2026-07-22T02:01:00.000Z"
    );

  assert.deepEqual(
    recorded,
    {
      ...deletedRecord,
      telegramMessageId: 67890,
      telegramSentAt:
        "2026-07-22T02:01:00.000Z"
    }
  );
});

test("매물 메시지는 앱 이름과 내부 가격 기준 및 확인사항을 출력하지 않는다", () => {
  const message = formatTelegramMessage(
    "신규",
    {
      ...baseListing,
      option: "FSD"
    }
  );

  assert.equal(
    message.split("\n")[0],
    "[신규]"
  );

  assert.doesNotMatch(
    message,
    /Sentinel-o-car|sentinel-o-car|sentinel-0-car/i
  );

  assert.doesNotMatch(
    message,
    /적용 기준|가격 기준|허용 가격|확인사항/
  );

  assert.doesNotMatch(
    message,
    /옵션 확인 필요|흡연 여부 확인|튜닝 여부 확인/
  );

  assert.doesNotMatch(
    message,
    /판매방식:|렌트 이력: 미확인|전손 이력: 미확인/
  );

  assert.match(
    message,
    /2022\/09 모델 3 롱 레인지 AWD/
  );

  assert.equal(
    message.split("\n")[2],
    "차량번호: 12가3456"
  );

  assert.match(
    message,
    /92,000㎞ \| 38,500,000원 \| 서울/
  );

  assert.match(
    message,
    /옵션: FSD 확인/
  );

  assert.match(
    message,
    /https:\/\/fem\.encar\.com\/cars\/detail\/42023180$/
  );

  assert.doesNotMatch(
    message,
    /advClickPosition|view_type|type=detail|#photos/
  );
});

test("매물삭제 메시지는 신규 알림과 제목을 제외한 상세 본문을 동일하게 출력한다", () => {
  const listing = {
    ...baseListing,
    option: "FSD",
    profileNames: [
      "Model 3 롱레인지"
    ],
    conditionStatus: "조건 충족",
    conditionReasons: [],
    detailFailed: false
  };

  const newMessage =
    formatTelegramMessage(
      "신규",
      listing
    );

  const deletedMessage =
    formatTelegramMessage(
      "deleted",
      listing
    );

  const newLines =
    newMessage.split("\n");
  const deletedLines =
    deletedMessage.split("\n");

  assert.equal(
    newLines[0],
    "[신규]"
  );
  assert.equal(
    deletedLines[0],
    "[매물삭제]"
  );
  assert.deepEqual(
    deletedLines.slice(1),
    newLines.slice(1)
  );
  assert.match(
    deletedMessage,
    /검색 조건: Model 3 롱레인지/
  );
  assert.match(
    deletedMessage,
    /옵션: FSD 확인/
  );
  assert.match(
    deletedMessage,
    /92,000㎞ \| 38,500,000원 \| 서울/
  );
  assert.match(
    deletedMessage,
    /https:\/\/fem\.encar\.com\/cars\/detail\/42023180$/
  );
});

test("정보가 적은 구형 매물삭제 레코드도 안전한 기본 문구로 출력한다", () => {
  let teslaMessage;
  let genericMessage;

  assert.doesNotThrow(() => {
    teslaMessage =
      formatTelegramMessage(
        "deleted",
        {
          deletedAt:
            "2026-07-22T02:00:00.000Z"
        }
      );

    genericMessage =
      formatTelegramMessage(
        "deleted",
        {
          optionMode: "generic",
          deletedAt:
            "2026-07-22T02:00:00.000Z"
        }
      );
  });

  assert.deepEqual(
    teslaMessage.split("\n"),
    [
      "[매물삭제]",
      "차량번호: 미확인",
      "옵션: 미확인"
    ]
  );

  assert.deepEqual(
    genericMessage.split("\n"),
    [
      "[매물삭제]",
      "차량번호: 미확인"
    ]
  );

  for (const message of [
    teslaMessage,
    genericMessage
  ]) {
    assert.doesNotMatch(
      message,
      /undefined|NaN/
    );
  }
});

test("신규와 삭제 알림 모두 FSD, EAP, 미확인 옵션을 같은 문구로 출력한다", () => {
  const cases = [
    ["FSD", /옵션: FSD 확인/],
    ["EAP", /옵션: EAP 확인/],
    ["미확인", /옵션: 미확인/]
  ];

  for (const [
    option,
    pattern
  ] of cases) {
    const listing = {
      ...baseListing,
      option
    };

    assert.match(
      formatTelegramMessage(
        "신규",
        listing
      ),
      pattern
    );

    assert.match(
      formatTelegramMessage(
        "deleted",
        listing
      ),
      pattern
    );
  }
});

test("차량번호 미확인은 정해진 문구로 출력한다", () => {
  const message = formatTelegramMessage(
    "신규",
    {
      ...baseListing,
      vehicleNo: null
    }
  );

  assert.equal(
    message.split("\n")[2],
    "차량번호: 미확인"
  );
});

test("구조화 EAP와 명시적 FSD 구매가 함께 확인되면 FSD 표시를 우선한다", () => {
  const html = detailHtml({
    vehicleNo: "12가3456",
    spec: {
      colorName: "검정색"
    },
    options: {
      etc: [
        "향상된 오토파일럿 (EAP)"
      ]
    },
    advertisement: {
      oneLineText:
        "완전무사고. FSD 구매완료."
    },
    photos: []
  });

  const analyzed = analyzeDetail(
    html,
    baseListing,
    {
      excludedColorTerms: []
    }
  );

  const message = formatTelegramMessage(
    "신규",
    analyzed
  );

  assert.equal(
    analyzed.hasFsd,
    true
  );

  assert.equal(
    analyzed.hasEap,
    true
  );

  assert.equal(
    analyzed.option,
    "FSD"
  );

  assert.match(
    message,
    /옵션: FSD 확인/
  );

  assert.doesNotMatch(
    message,
    /옵션: EAP 확인/
  );
});

test("매물 URL은 쿼리 문자열과 해시를 제거하고 매물번호까지만 출력한다", () => {
  const message = formatTelegramMessage(
    "신규",
    baseListing
  );

  const lastLine = message
    .split("\n")
    .at(-1);

  assert.equal(
    lastLine,
    "https://fem.encar.com/cars/detail/42023180"
  );

  assert.doesNotMatch(
    lastLine,
    /[?#]/
  );
});

test("normal과 send_current 알림은 같은 출력 규칙을 사용한다", () => {
  const messages = [
    formatTelegramMessage(
      "가격 인하 39,000,000원 → 38,500,000원",
      {
        ...baseListing,
        option: "EAP"
      }
    ),
    formatTelegramMessage(
      "현재 검색 결과",
      {
        ...baseListing,
        option: "EAP",
        conditionStatus: "조건 충족",
        conditionReasons: []
      }
    )
  ];

  for (const message of messages) {
    assert.match(
      message,
      /^\[(?:가격 인하|현재 검색 결과)/
    );

    assert.match(
      message,
      /옵션: EAP 확인/
    );

    assert.match(
      message,
      /차량번호: 12가3456/
    );

    assert.match(
      message,
      /모델 3 롱 레인지 AWD/
    );

    assert.match(
      message,
      /38,500,000원/
    );

    assert.match(
      message,
      /92,000㎞/
    );

    assert.match(
      message,
      /https:\/\/fem\.encar\.com\/cars\/detail\/42023180$/
    );

    assert.doesNotMatch(
      message,
      /[?&]advClickPosition|view_type|type=detail|#photos/
    );

    assert.doesNotMatch(
      message,
      /Sentinel-o-car|적용 기준|확인사항/
    );
  }
});

test("리스 메시지는 매매가격과 월 납입금을 분리하고 렌트 감가 평가가격을 출력하지 않는다", () => {
  const analyzed = analyzeDetail(
    leaseDetailHtml,
    {
      ...baseListing,
      priceKrw: 31000000
    },
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  const message = formatTelegramMessage(
    "신규",
    evaluated
  );

  assert.equal(evaluated.saleType, "LEASE");
  assert.ok(
    message
      .split("\n")
      .includes(
        "92,000㎞ | 29,000,000원 | 서울"
      )
  );
  assert.ok(
    message
      .split("\n")
      .includes(
        "판매방식: 리스 | 월 납입금: 620,000원"
      )
  );
  assert.doesNotMatch(
    message,
    /92,000㎞ \| 620,000원/
  );
  assert.doesNotMatch(
    message,
    /렌트 감가 반영 평가가격/
  );
});

test("현재 판매방식이 RENT이면 월 납입금 없이 렌트로 표시한다", () => {
  const message = formatTelegramMessage(
    "신규",
    {
      ...baseListing,
      saleType: "RENT",
      monthlyFeeKrw: 620000,
      rentalUsageHistory: null
    }
  );

  assert.ok(
    message
      .split("\n")
      .includes("판매방식: 렌트")
  );
  assert.doesNotMatch(
    message,
    /월 납입금|렌트 감가 반영 평가가격/
  );
});

test("generic 매물삭제 알림은 Tesla 옵션을 제외하고 일반 판매방식을 출력한다", () => {
  const listing = {
    ...baseListing,
    optionMode: "generic",
    saleType: "NORMAL"
  };

  const newMessage =
    formatTelegramMessage(
      "신규",
      listing
    );

  const deletedMessage =
    formatTelegramMessage(
      "deleted",
      listing
    );

  assert.deepEqual(
    deletedMessage
      .split("\n")
      .slice(1),
    newMessage
      .split("\n")
      .slice(1)
  );
  assert.match(
    deletedMessage,
    /판매방식: 일반/
  );
  assert.doesNotMatch(
    deletedMessage,
    /옵션:/
  );
});

test("과거 렌트 이력과 구형 감가 설정은 평가가격과 텔레그램 문구에 영향을 주지 않는다", () => {
  const evaluated =
    evaluateListing(
      {
        ...baseListing,
        optionMode: "generic",
        priceKrw: 38000000,
        rentalUsageHistory: true,
        redColor: false,
        contracted: false,
        smokingWarning: false,
        tuningWarning: false
      },
      {
        optionMode: "generic",
        price: {
          maxPriceKrw: 38000000
        },
        rentalHistoryDiscountKrw:
          5000000,
        rentalPenaltyKrw:
          5000000,
        excludeContractPending:
          true
      }
    );

  const message =
    formatTelegramMessage(
      "신규",
      evaluated
    );

  assert.equal(
    evaluated.adjustedPriceKrw,
    38000000
  );
  assert.equal(
    evaluated.eligible,
    true
  );
  assert.deepEqual(
    evaluated.excludedReasons,
    []
  );
  assert.equal(
    evaluated.warnings.some(
      (warning) =>
        /렌트.*감가/.test(
          warning
        )
    ),
    false
  );
  assert.doesNotMatch(
    message,
    /렌트 감가|평가가격/
  );
});

test("판매자 자유 문구의 렌트X는 텔레그램에 렌트 감가 평가가격을 추가하지 않는다", () => {
  const analyzed = analyzeDetail(
    detailHtml({
      vehicleNo: "12가3456",
      spec: {
        colorName: "검정색"
      },
      options: {
        etc: []
      },
      advertisement: {
        oneLineText: "렌트X"
      },
      photos: [],
      contents: null
    }),
    {
      ...baseListing,
      priceKrw: 32000000,
      listText: "렌트X"
    },
    config
  );

  const evaluated = evaluateListing(
    analyzed,
    config
  );

  const message = formatTelegramMessage(
    "신규",
    evaluated
  );

  assert.equal(evaluated.saleType, "NORMAL");
  assert.equal(
    evaluated.rentalUsageHistory,
    null
  );
  assert.doesNotMatch(
    message,
    /판매방식:|렌트 감가 반영 평가가격/
  );
});
