# CONTEXT

최종 갱신: 2026-10-28 / 작성자: claudecode
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- GitHub Actions workflow 삭제와 기록 완료; 운영은 Mac launchd 단독

## 최근 결정
- GitHub Actions 삭제 (ai/DECISIONS.md 참조)

## 진행 결과
- 시작 전 fast-forward 동기화: d5645c1 → 579d2ee (local/README.md만 변경)
- .github/workflows/inspect-encar-detail.yml, sentinel-o-car.yml 삭제; .github에 다른 파일 없었음
- test/repository-config.test.mjs에서 workflow 읽기와 Repository Variables 연결 전용 테스트만 제거
- 관련 테스트 4 pass, 전체 npm test 245 pass / 0 fail (이전 246, 감소 1 = 폐기한 workflow 전용 테스트)
- 첫 commit edee6a5 (workflow 삭제 + 테스트 정리), 이후 AI 기록 commit
- Mac launchd 운영 중, 매시 17분·47분, RunAtLoad=false; 자동 예약 실행과 Telegram 수신은 사용자 확인 완료
- 2026-10-13 normal 1회: 활성 Tesla 76건, Done 42 notifications, 종료 코드 0

## 운영 제약
- 실제 수집·Telegram 전송·상태 파일 변경·launchd 설정 변경·kickstart·local/run.sh 실행 금지
- 코드·환경·외부 상태·로그·전원·잠자기·기존 자기호스팅 러너 유지
- 링크·채팅 ID·토큰·인증 URL·API 응답 전문을 로그·AI 문서·Git에 남기지 않음
- 공개 문서(README, local/README, AGENTS.md)의 Actions 설명은 이번에 수정하지 않음

## 검증 근거
- 테스트는 config.json, data/state.json, examples, fixtures만 읽음; 네트워크·자격 증명 미사용
- git diff --cached --check 통과, staged 범위 확인
- 상태: $HOME/Library/Application Support/sentinel-o-car/state.json
- 로그: ~/Library/Logs/sentinel-o-car/YYYY-MM-DD.log
- label: com.xmfldksl.sentinel-o-car, /bin/bash → 저장소 local/run.sh 직접 실행

## 다음 할 일
- 공개 문서에 남은 GitHub Actions 설명 정리 (위치는 최신 보고서 참조)
- AGENTS.md의 삭제된 workflow 읽기 지시 갱신
- GitHub 계정 Actions 제한 여부와 자기호스팅 러너 서비스 정리는 별개 문제로 미확인 유지
- Repository Secrets·Variables 정리 여부는 사용자 결정 대기

## 최신 문서
- workflow 삭제 보고: ai/notes/2026-10-28-claudecode-report-workflow-removal.md
- workflow 삭제 인수인계: ai/notes/2026-10-28-claudecode-handoff-workflow-removal.md
- 릴리즈 노트 보고: ai/notes/2026-10-13-claudecode-report-launchd-release-notes.md
- 실행·등록 보고: ai/notes/2026-10-13-codex-report-local-runner-resume-execute.md
