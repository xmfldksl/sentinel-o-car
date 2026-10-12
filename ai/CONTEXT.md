# CONTEXT

최종 갱신: 2026-10-13 / 작성자: claudecode
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- GitHub Actions 비활성화 기간 동안 맥 launchd로 예약 실행 유지

## 진행 중 작업
- 로컬 실행 전환: local/ 스크립트와 workflow schedule 중지는 commit 완료. launchd 등록(local/install.sh)과 .env.local 값 입력은 사용자 확인 대기.

## 최근 결정
- Actions 비활성화로 맥 launchd 내재화, 복구 시 환원 (ai/DECISIONS.md 참조)
- ai/ 공유 공간 도입 (ai/DECISIONS.md 참조)

## 미해결 이슈
- Actions 복구 시 되돌리기: local/uninstall.sh로 launchd 해제 → 로컬 상태를 data/state.json에 복사·commit → workflow schedule 주석 해제 (local/README.md)
- 맥 잠자기 중에는 예약이 실행되지 않음. 전원 연결 시 잠자기 방지 설정은 사용자가 직접.

## 다음 할 일
- 사용자: .env.local 작성, local/install.sh 실행 허가, 첫 예약 실행 로그 확인
- Claude 프로젝트 지식에 이 저장소의 ai/ 폴더 추가 후 Sync (사용자)

## 최신 문서
- 인수인계: ai/notes/2026-10-12-claude-handoff-local-launchd.md
- 리뷰: 없음
- 보고: ai/notes/2026-10-12-claudecode-report-local-launchd.md
- 아카이브: 없음
