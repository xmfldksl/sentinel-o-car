# CONTEXT

최종 갱신: 2026-10-13 / 작성자: codex
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- local/run.sh의 선행 단계 실패 후 계속 실행되는 결함을 최소 수정

## 진행 중 작업
- 실제 실행기를 가짜 npm/node와 임시 경로로 격리한 회귀 테스트 작성
- 수정 전 실패 확인 후 종료 코드·로그·획득한 잠금 정리 검증 예정
- 실제 수집·전송·서비스 조작·상태 변경·push는 승인 범위 밖

## 최근 결정
- Actions 비활성화로 맥 launchd 내재화, 복구 시 환원 (ai/DECISIONS.md 참조)
- 새 설계 결정 없음; 이번 범위는 실패 처리와 직접 관련 테스트·문서

## 미해결 이슈
- run.sh의 `{ ...; } || status=$?` 실패 처리 수정 진행
- 이전 검증 시 .env.local·외부 상태·plist·운영 로그 없음, launchd 미등록
- 로컬 main은 schedule 주석 처리; 이전 fetch의 origin/main은 활성 schedule 유지 (미push)
- STATE_PATH 재정의·직접 실행, 예제 경로 따옴표, 잠금 잔여·bootout 오류 등은 이전 보고 참조

## 다음 할 일
- 격리한 회귀 테스트의 수정 전 실패 → 최소 수정 → 관련·전체 테스트 → 보고 commit

## 최신 문서
- 인수인계: ai/notes/2026-10-13-gpt-handoff-local-runner-failure-fix.md
- 리뷰: 없음
- 보고: ai/notes/2026-10-13-codex-report-local-launchd-review.md (이전 검증)
- 아카이브: 없음
