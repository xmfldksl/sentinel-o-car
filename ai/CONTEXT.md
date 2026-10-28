# CONTEXT

최종 갱신: 2026-10-29 / 작성자: claudecode
(덮어쓰는 유일한 파일. 50줄 이내 유지.)

## 현재 목표
- GitHub Actions workflow 삭제 후 공개 문서·에이전트 지침 정리 완료; 운영은 Mac launchd 단독

## 최근 결정
- GitHub Actions 삭제 (ai/DECISIONS.md 2026-10-28). 이번 문서 정리는 그 결정의 파생 작업이라 새 결정 없음

## 진행 결과
- 시작 HEAD d28ddf2 = origin/main, 작업 트리 clean
- README.md(영·한), local/README.md, AGENTS.md, CODEX_START_PROMPT.md, package.json description, local/run.sh 주석, .env.local.example 주석에서 Actions 실행 전제 설명 제거 또는 로컬 방식으로 교체
- local/README.md "GitHub Actions로 전환" 절 삭제; AGENTS.md·CODEX_START_PROMPT.md의 삭제된 workflow 읽기 지시를 local/README.md, local/run.sh로 교체
- README 릴리즈 노트에 2026-10-28 workflow 삭제 항목 추가; 과거 릴리즈 노트의 Actions 언급은 보존
- 검증: bash -n, test/local-runner.test.mjs 10 pass, JSON 유효, run.sh 권한 유지, diff --check 통과. 전체 npm test는 주석·문서만 변경이라 미반복(직전 245 pass)
- 첫 commit 84275de (문서·지침·주석), 이후 AI 기록 commit
- Mac launchd 운영 중, 매시 17분·47분, RunAtLoad=false; 자동 예약 실행과 Telegram 수신은 사용자 확인 완료

## 운영 제약
- 실제 수집·Telegram 전송·상태 파일 변경·launchd 설정 변경·kickstart·local/run.sh 실행 금지
- 코드·환경·외부 상태·로그·전원·잠자기·기존 자기호스팅 러너 유지
- 링크·채팅 ID·토큰·인증 URL·API 응답 전문을 로그·AI 문서·Git에 남기지 않음

## 검증 근거
- 테스트는 config.json, data/state.json, examples, fixtures만 읽음; 네트워크·자격 증명 미사용
- 상태: $HOME/Library/Application Support/sentinel-o-car/state.json
- 로그: ~/Library/Logs/sentinel-o-car/YYYY-MM-DD.log
- label: com.xmfldksl.sentinel-o-car, /bin/bash → 저장소 local/run.sh 직접 실행

## 다음 할 일
- plist 템플릿 주석의 "workflow cron과 동일" 문구는 launchd 설정 원본이라 미수정; 필요 시 별도 결정
- GitHub 계정 Actions 제한 여부와 자기호스팅 러너 서비스 정리는 별개 문제로 미확인 유지
- Repository Secrets·Variables 정리 여부는 사용자 결정 대기

## 최신 문서
- Actions 잔존 설명 정리 보고: ai/notes/2026-10-29-claudecode-report-actions-reference-cleanup.md
- Actions 잔존 설명 정리 인수인계: ai/notes/2026-10-29-claudecode-handoff-actions-reference-cleanup.md
- workflow 삭제 보고: ai/notes/2026-10-28-claudecode-report-workflow-removal.md
- 릴리즈 노트 보고: ai/notes/2026-10-13-claudecode-report-launchd-release-notes.md
