import assert from "node:assert/strict";
import test from "node:test";

import {
  createTelegramMessageRequest,
  formatTelegramMessage,
  recordTelegramDelivery
} from "../src/lib.mjs";

function listing(overrides = {}) {
  return {
    id: "42023180",
    title: "모델 3 롱 레인지 AWD",
    url:
      "https://fem.encar.com/cars/detail/42023180?type=detail#private",
    yearMonth: "2022-09",
    mileageKm: 67235,
    priceKrw: 32700000,
    region: "경기",
    colorName: "검정색",
    vehicleNo: "12가3456",
    conditionStatus: "조건 충족",
    conditionReasons: [],
    option: "FSD",
    saleType: "NORMAL",
    monthlyFeeKrw: null,
    ...overrides
  };
}

test("Telegram 요청은 메시지 복사와 전달을 제한하지 않는다", () => {
  const request =
    createTelegramMessageRequest(
      "chat",
      "message"
    );

  assert.deepEqual(request, {
    chat_id: "chat",
    text: "message",
    link_preview_options: {
      is_disabled: true
    }
  });
  assert.equal(
    Object.hasOwn(
      request,
      "protect_content"
    ),
    false
  );
});

test("Telegram 전달 메타데이터는 기존 상태를 보존해 기록한다", () => {
  const original = listing({
    deletedAt:
      "2026-07-24T00:00:00.000Z"
  });
  const recorded =
    recordTelegramDelivery(
      original,
      {
        message_id: 123
      },
      "2026-07-25T00:00:00.000Z"
    );

  assert.equal(
    recorded.telegramMessageId,
    123
  );
  assert.equal(
    recorded.telegramSentAt,
    "2026-07-25T00:00:00.000Z"
  );
  assert.equal(
    recorded.deletedAt,
    original.deletedAt
  );
});

test("신규·가격변동·현재·삭제 알림은 같은 매물 본문 규칙을 사용한다", () => {
  for (const type of [
    "신규",
    "가격 인하 34,000,000원 → 32,700,000원",
    "가격 인상 31,000,000원 → 32,700,000원",
    "현재 검색 결과",
    "매물삭제"
  ]) {
    const message =
      formatTelegramMessage(
        type,
        listing(),
        {
          profileNames: [
            "Model 3 AWD"
          ],
          showTeslaOption: true
        }
      );

    assert.match(
      message,
      new RegExp(
        `^\\[${type.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\]`
      )
    );
    assert.match(
      message,
      /검색 조건: Model 3 AWD/
    );
    assert.match(
      message,
      /차량번호: 12가3456/
    );
    assert.match(
      message,
      /검정색 \| 67,235㎞ \| 32,700,000원 \| 경기/
    );
    assert.match(
      message,
      /https:\/\/fem\.encar\.com\/cars\/detail\/42023180$/
    );
    assert.doesNotMatch(
      message,
      /\?type=detail|#private/
    );
  }
});

test("매물 정보 행은 색상·주행거리·가격·지역 순서로 표시한다", () => {
  for (const [colorName, expected] of [
    [
      "검정색",
      "검정색 | 31,761㎞ | 54,500,000원 | 경기"
    ],
    [
      " 검정색 ",
      "검정색 | 31,761㎞ | 54,500,000원 | 경기"
    ],
    [
      null,
      "색상 미확인 | 31,761㎞ | 54,500,000원 | 경기"
    ],
    [
      undefined,
      "색상 미확인 | 31,761㎞ | 54,500,000원 | 경기"
    ],
    [
      "",
      "색상 미확인 | 31,761㎞ | 54,500,000원 | 경기"
    ],
    [
      "   ",
      "색상 미확인 | 31,761㎞ | 54,500,000원 | 경기"
    ]
  ]) {
    const message =
      formatTelegramMessage(
        "신규",
        listing({
          colorName,
          mileageKm: 31761,
          priceKrw: 54500000,
          region: "경기"
        })
      );

    assert.equal(
      message
        .split("\n")
        .includes(expected),
      true,
      `${String(colorName)} → ${expected}`
    );
  }
});

test("조건 충족과 가격 초과 판정은 Telegram 본문에 표시된다", () => {
  const below = formatTelegramMessage(
    "신규",
    listing(),
    {
      showTeslaOption: false
    }
  );
  const above = formatTelegramMessage(
    "신규",
    listing({
      priceKrw: 41000000,
      conditionStatus:
        "조건 미충족",
      conditionReasons: [
        "가격 초과"
      ]
    }),
    {
      showTeslaOption: false
    }
  );

  assert.match(below, /판정: 조건 충족/);
  assert.doesNotMatch(below, /사유:/);
  assert.match(
    above,
    /판정: 조건 미충족/
  );
  assert.match(
    above,
    /사유: 가격 초과/
  );
});

test("Tesla 옵션은 실행 컨텍스트가 true일 때만 표시한다", () => {
  for (const [option, expected] of [
    ["FSD", "옵션: FSD 확인"],
    ["EAP", "옵션: EAP 확인"],
    ["미확인", "옵션: 미확인"]
  ]) {
    assert.match(
      formatTelegramMessage(
        "신규",
        listing({ option }),
        {
          showTeslaOption: true
        }
      ),
      new RegExp(expected)
    );
  }

  assert.doesNotMatch(
    formatTelegramMessage(
      "신규",
      listing(),
      {
        showTeslaOption: false
      }
    ),
    /옵션:/
  );
});

test("generic과 Tesla 모두 일반 판매방식을 같은 문구로 표시한다", () => {
  for (const showTeslaOption of [
    false,
    true
  ]) {
    assert.match(
      formatTelegramMessage(
        "신규",
        listing({
          saleType: "NORMAL"
        }),
        { showTeslaOption }
      ),
      /판매방식: 일반/
    );
  }
});

test("리스와 렌트 판매방식은 사실 정보로 표시한다", () => {
  const lease = formatTelegramMessage(
    "신규",
    listing({
      saleType: "LEASE",
      priceKrw: 29000000,
      monthlyFeeKrw: 620000
    })
  );
  const rent = formatTelegramMessage(
    "신규",
    listing({
      saleType: "RENT",
      monthlyFeeKrw: null
    })
  );

  assert.match(
    lease,
    /판매방식: 리스 \| 월 납입금: 620,000원/
  );
  assert.match(rent, /판매방식: 렌트/);
});

test("상세 실패는 가격 판정과 별도로 표시한다", () => {
  const message = formatTelegramMessage(
    "현재 검색 결과",
    listing({
      option: "미확인",
      detailFailed: true
    }),
    {
      showTeslaOption: true
    }
  );

  assert.match(message, /판정: 조건 충족/);
  assert.match(
    message,
    /상세: 상세 확인 실패/
  );
  assert.match(message, /옵션: 미확인/);
});
