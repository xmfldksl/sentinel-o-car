# 보고: Actions 잔존 설명 정리

작성자: claudecode
날짜: 2026-10-29
대상: ai/notes/2026-10-29-claudecode-handoff-actions-reference-cleanup.md

## 확인된 원인
- 2026-10-28에 workflow 2개를 삭제했지만 공개 문서·에이전트 지침·메타데이터·주석은 Actions 실행을 전제로 남아 있었다.
- AGENTS.md와 CODEX_START_PROMPT.md는 삭제된 `.github/workflows/sentinel-o-car.yml`을 필수로 읽으라고 지시해 에이전트 시작 절차가 깨진 상태였다.

## 변경 파일
- README.md (영문·한국어 동일 의미로 정리)
- local/README.md
- AGENTS.md
- CODEX_START_PROMPT.md
- package.json (description만)
- local/run.sh (주석 2곳만)
- .env.local.example (섹션 주석 2곳만)

## 수정 내용
- README.md: 요구사항을 "macOS with launchd"로 정리. "유지된 수동 workflow·self-hosted runner" 설명을 "저장소에 workflow 없음, GitHub-hosted runner에서는 수집 차단, 예약·수동 모두 로컬 실행기 사용"으로 교체. Actions Secrets·Repository Variables 설정 안내를 `.env.local` 기준으로 교체. `send_current`와 테스트 절의 workflow 언급을 로컬 실행기로 교체. 릴리즈 노트에 2026-10-28 항목(workflow 삭제) 추가. 기존 2026-10-13과 1.1.0 릴리즈 노트의 Actions·self-hosted runner 언급은 역사적 사실로 보존.
- local/README.md: "GitHub Actions로 전환" 절 전체 삭제(schedule 활성화 안내 포함). 동시 운영 주의와 잠금 범위 설명에서 Actions를 "다른 실행 환경"으로 일반화.
- AGENTS.md: 시작 시 읽을 파일을 `local/README.md`, `local/run.sh`로 교체. 프로젝트 목적을 launchd 로컬 실행기 기준으로 수정. 예약 주기 변경 주의를 plist 템플릿 기준으로 수정. 필수 검증의 "워크플로 수정"을 "로컬 실행기 수정"으로, 정적 검토 항목을 run.sh의 기존 동작(잠금, 단계 실패 중단, 저장소 밖 상태 경로)으로 교체. 보안·Git·AI 공유 공간 규칙은 유지.
- CODEX_START_PROMPT.md: 읽을 파일 목록과 검토 목적을 로컬 실행기 기준으로, "Actions 상태 커밋 충돌" 항목을 "로컬 상태 파일 경로 처리와 중복 실행 방지"로 교체.
- package.json description: "using GitHub Actions and Telegram" → "using macOS launchd and Telegram".
- local/run.sh: 상단 주석의 workflow 단계 비교와 잠금 주석의 "workflow concurrency 대체"를 제거. 로직 변경 없음.
- .env.local.example: "workflow secrets" → "Telegram 인증값", "workflow repository variables" → 엔카 검색 URL과 searchUrlEnv 대응 설명.
- 의도적으로 보존·미수정: README 릴리즈 노트의 Actions 언급, ai/ 과거 기록, docs/CODEX_USAGE.md(Actions 언급 없음), CLAUDE.md(Actions 언급 없음), `local/com.xmfldksl.sentinel-o-car.plist.template`의 "workflow cron과 동일" 주석(launchd 설정 원본이므로 미수정).

## 테스트 결과
- 관련 테스트: `bash -n local/run.sh` 통과, `node --test test/local-runner.test.mjs` 10 pass / 0 fail
- 전체 테스트: 미실행 (설명·주석만 변경, 지시에 따라 반복하지 않음). 직전 기준 245 pass.
- 실행 환경: 로컬. 네트워크·Telegram·자격 증명·상태 파일·운영 로그 미사용.

## Git
- branch: main
- commit: 84275de (docs: align guides with local-only execution / 로컬 전용 실행 방식으로 안내 정리). AI 기록 commit hash는 git log 참조.
- Pull Request: 없음 (main 직접 commit)
- GitHub Actions: 해당 없음 (workflow 없음)
- push: 두 번째 commit 이후 일반 push 예정, 결과는 최종 응답에 보고

## 검증
- 시작 전 origin fetch, 로컬 HEAD d28ddf2 = origin/main, 작업 트리 clean 확인.
- 치환은 각 문자열이 정확히 1회 존재할 때만 적용하는 스크립트로 수행.
- ai/ 제외 전체 검색에서 삭제된 workflow를 현재 필수 파일로 안내하는 참조 없음. 남은 "Actions" 언급은 README 릴리즈 노트와 현재 상태 설명(workflow 없음)뿐.
- 문서 내부 상대 링크 깨짐 없음. package.json JSON 유효. local/run.sh 권한 -rwxr-xr-x 유지, git diff --summary에 mode 변경 없음. git diff --check 통과.

## 남은 제한사항
- plist 템플릿 주석의 "workflow cron과 동일"은 역사적 비교 설명이며 launchd 설정 원본이라 수정하지 않았다. 필요 시 별도 작업으로 다룬다.
- GitHub 계정 Actions 제한 여부, 자기호스팅 러너 서비스, Repository Secrets·Variables 정리는 이번 범위 밖이며 변경하지 않았다.

## 정리
- 임시 파일 또는 workflow 유지/삭제: 임시 치환 스크립트는 세션 scratchpad에만 있고 저장소에 없음. workflow 변경 없음.
