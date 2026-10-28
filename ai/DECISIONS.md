# DECISIONS

추가만 한다. 한 줄 형식: 날짜 | 작성자 | 결정 | 근거 | 관련 문서

- 2026-09-24 | codex | 4개 도구 공유 공간을 ai/ 폴더로 운영 | 도구 간 대화가 공유되지 않아 저장소를 공용 기억으로 사용 | ai/README.md
- 2026-10-13 | claudecode | Actions 비활성화로 맥 launchd 내재화, 복구 시 환원 | 계정 단위 Actions 비활성화로 예약 실행 중단, 자기호스팅 러너가 이미 맥에 있어 같은 환경에서 대체 가능 | ai/notes/2026-10-12-claude-handoff-local-launchd.md, local/README.md
- 2026-10-28 | claudecode | GitHub Actions workflow 전부 삭제, workflow 파일을 읽던 전용 테스트 함께 정리 | 예약 작업을 Mac launchd로 이전했고 자동 실행과 Telegram 수신을 사용자가 확인함. test/repository-config.test.mjs가 삭제 파일을 최상위에서 읽어 local/run.sh의 npm test 단계가 깨지므로 해당 읽기와 Repository Variables 연결 전용 테스트만 제거 | .github/workflows/, ai/notes/2026-10-28-claudecode-report-workflow-removal.md
