import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDetail,
  createTelegramMessageRequest,
  formatTelegramMessage
} from "../src/lib.mjs";

const baseListing = {
  id: "42023180",
  title: "모델 3 롱 레인지 AWD",
  url: "https://fem.encar.com/cars/detail/42023180",
  yearMonth: "2022-09",
  mileageKm: 92000,
  priceKrw: 38500000,
  region: "서울",
  option: "미확인",
  vehicleNo: "12가3456",
  rental: false,
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
});

test("FSD, EAP, 미확인 옵션은 정해진 세 가지 문구로만 출력한다", () => {
  assert.match(
    formatTelegramMessage(
      "신규",
      {
        ...baseListing,
        option: "FSD"
      }
    ),
    /옵션: FSD 확인/
  );

  assert.match(
    formatTelegramMessage(
      "신규",
      {
        ...baseListing,
        option: "EAP"
      }
    ),
    /옵션: EAP 확인/
  );

  assert.match(
    formatTelegramMessage(
      "신규",
      baseListing
    ),
    /옵션: 미확인/
  );
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
      /Sentinel-o-car|적용 기준|확인사항/
    );
  }
});