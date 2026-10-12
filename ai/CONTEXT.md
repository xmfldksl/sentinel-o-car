# CONTEXT

최종 갱신: 2026-10-13 / 작성자: codex
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- 로컬 실행기 실패 처리 수정 완료; 운영 전환은 별도 준비·승인 필요

## 진행 중 작업
- run.sh의 조건부 명령 묶음 제거, EXIT 코드 기록·획득한 잠금 정리 완료
- 실제 수집·전송·서비스 조작·운영 상태 변경·push는 미실시

## 최근 결정
- Actions 비활성화로 맥 launchd 내재화, 복구 시 환원 (ai/DECISIONS.md 참조)
- 이번 수정에서 새 설계 결정 없음

## 검증 근거
- 실제 run.sh를 임시 저장소에 그대로 복사하고 가짜 npm/node로 실행
- 수정 전 회귀 5 pass / 5 fail → 수정 후 10 pass / 0 fail
- 전체 npm test 246 pass / 0 fail, 셸·테스트 문법·diff 검사 통과
- 정상·실패 시 획득한 잠금 정리, 기존 잠금 보존, 더미 비밀값 미노출 확인
- 저장소·실제 기본 외부 상태 불변; 실제 .env.local·기본 외부 상태는 없음

## 미해결 이슈
- 코드 수정 완료와 운영 전환 완료는 별개: 환경·상태 준비, 등록·실제 실행 미실시
- 로컬 main은 schedule 주석 처리; 이전 fetch의 origin/main은 활성 schedule 유지 (미push)
- 이전 검증 시 launchd 미등록·자기호스팅 러너 running; 이번에 서비스 조회 반복·조작 안 함
- STATE_PATH 재정의·직접 실행, 예제 경로 따옴표, 잠금 잔여·bootout 오류는 이전 보고 참조
- 재개 시 기존 기준선과 현재 최대 2페이지 비교; 알림 건수 상한 없음

## 다음 할 일
- 별도 운영 준비에서 환경·상태 및 원격 예약 중복 방지를 확인한 후 등록·실제 실행 승인

## 최신 문서
- 인수인계: ai/notes/2026-10-13-gpt-handoff-local-runner-failure-fix.md
- 리뷰: 없음
- 보고: ai/notes/2026-10-13-codex-report-local-runner-failure-fix.md
- 운영 검증: ai/notes/2026-10-13-codex-report-local-launchd-review.md
- 아카이브: 없음
