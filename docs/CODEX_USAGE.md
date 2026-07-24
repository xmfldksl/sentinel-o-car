# 맥북의 Codex로 Sentinel-o-car 열기

## 가장 간단한 실행

터미널에서 압축을 푼 프로젝트 폴더로 이동한 뒤 실행한다.

```bash
npm run doctor
npm run codex
```

`npm run codex`는 프로젝트 루트를 Codex 작업 폴더로 지정하고 `CODEX_START_PROMPT.md`를 첫 지시로 전달한다.

## 일반 대화형 실행

```bash
codex --cd .
```

Codex는 저장소 루트의 `AGENTS.md`를 자동으로 읽는다.

## Codex 설치 상태 진단

```bash
codex doctor
```

## 변경 전 자동 검토

```bash
npm run codex:review
```

이 명령은 현재 커밋되지 않은 변경을 Codex의 코드 리뷰 기능으로 검사한다.

## 비대화형 점검

```bash
codex exec --cd . - < CODEX_START_PROMPT.md
```

비대화형 실행은 결과를 출력하고 종료하므로, 자동 점검이나 기록이 필요한 경우에 적합하다.

## 권장 첫 작업

처음에는 코드 수정을 맡기지 말고 현재 구현 검토만 수행한다. Codex의 문제 목록을 확인한 뒤 작업을 하나씩 지시한다.

예시 지시:

```text
가장 심각한 문제 한 개만 수정해라. 수정 전 재현 방법을 설명하고, 테스트를 추가한 뒤 npm test를 실행해라. 다른 기능은 변경하지 마라.
```

## 비밀값 처리

텔레그램 토큰과 채팅 ID는 터미널 환경변수로 전달한다. 로컬 `.env`를 사용한다면 실행 전에 셸 환경으로 명시적으로 불러와야 하며, 프로젝트 명령은 `.env`를 자동으로 읽지 않는다. Codex 채팅에 토큰을 붙여넣거나 저장소 파일에 기록하지 않는다.
