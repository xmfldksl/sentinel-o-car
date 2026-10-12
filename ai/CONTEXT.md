# CONTEXT

최종 갱신: 2026-10-13 / 작성자: codex
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- 맥 launchd 전환 검증 완료. 운영 시작 전 실행기 실패 차단 결함 수정 필요

## 진행 중 작업
- 문서 검증 완료, 운영 시작 보류: run.sh에서 npm test 실패 후에도 scrape로 진행 가능
- 실제 수집·전송·launchd 조작·상태 변경·push는 이번 승인 범위 밖이며 미실시

## 최근 결정
- Actions 비활성화로 맥 launchd 내재화, 복구 시 환원 (ai/DECISIONS.md 참조)
- 이번 검증에서 새 설계 결정 없음

## 미해결 이슈
- run.sh:55-76의 `{ ...; } || status=$?` 실패 처리 수정과 무전송 검증 필요
- .env.local·기본 외부 상태·plist·로컬 운영 로그 없음; launchd 미등록
- 로컬 main은 schedule 주석 처리, fetch한 origin/main은 활성 schedule 유지 (미push)
- STATE_PATH 재정의·앱 직접 실행은 저장소 상태를 쓸 수 있음; 예제의 공백 경로 따옴표 누락
- 잠금 잔여·오류 구분, 초기 오류 종료 코드 로그, bootout 오류 처리 보완안은 최신 보고 참조
- 재개 시 기존 기준선과 현재 최대 2페이지 비교; 알림 건수 상한 없음, 실제 건수 미확인

## 검증 근거
- npm test 236 pass / 0 fail, 셸 문법·plist 형식 통과
- 기존 네 커밋 및 이번 작업에서 data/state.json 불변, 비밀값 패턴 검사 발견 없음
- 기존 자기호스팅 러너는 running; 조작하지 않음
- StartCalendarInterval은 잠든 동안 놓친 예약을 깨어날 때 한 번으로 합쳐 실행

## 다음 할 일
- 사용자: run.sh의 실패 즉시 종료 결함 수정을 별도 작업으로 요청

## 최신 문서
- 인수인계: ai/notes/2026-10-13-gpt-handoff-local-launchd-review.md
- 리뷰: 없음
- 보고: ai/notes/2026-10-13-codex-report-local-launchd-review.md
- 아카이브: 없음
