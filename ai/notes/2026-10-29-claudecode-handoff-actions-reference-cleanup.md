# 인수인계: Actions 잔존 설명 정리

작성자: claudecode
날짜: 2026-10-29
대상: claudecode

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main (시작 HEAD d28ddf2, origin/main과 일치, 작업 트리 clean)

## 작업 목적
2026-10-28 workflow 삭제(edee6a5) 이후 공개 문서·에이전트 지침·메타데이터·주석에 남은 GitHub Actions 실행 전제 설명을 현재 Mac launchd 로컬 실행 방식에 맞게 정리한다.

## 문제 현상 (있으면)
- AGENTS.md와 CODEX_START_PROMPT.md가 삭제된 `.github/workflows/sentinel-o-car.yml`을 필수로 읽으라고 지시했다.
- README.md가 "유지된 수동 GitHub Actions workflow", Actions Secrets·Repository Variables 설정을 현행 절차처럼 안내했다.
- local/README.md에 "GitHub Actions로 전환" 절이 남아 삭제된 workflow의 schedule을 활성화하라고 안내했다.
- package.json description, local/run.sh 주석, .env.local.example 섹션 주석이 workflow를 기준으로 설명했다.

## 먼저 확인할 파일
- ai/CONTEXT.md, ai/README.md, CLAUDE.md, AGENTS.md
- ai/notes/2026-10-28-claudecode-report-workflow-removal.md (남은 위치 목록)
- README.md, local/README.md, CODEX_START_PROMPT.md, package.json, local/run.sh, .env.local.example

## 수정 범위와 제한
- 현재 구현을 먼저 읽고 최소 변경한다.
- 필드명, 함수명, import는 추측하지 않고 코드에서 확인한다.
- 문서·지침·description·주석만 수정한다. 버전, scripts, 실행 로직, 잠금, 경로, 예약 동작은 변경하지 않는다.
- 릴리즈 노트 등 역사적 사실을 설명하는 Actions 언급은 보존한다.
- ai/notes, ai/chats, ai/DECISIONS.md의 과거 기록은 치환하거나 삭제하지 않는다.
- plist 템플릿은 launchd 설정 원본이므로 주석도 수정하지 않는다.

## 금지 작업
- 기존 미완료 변경의 reset, checkout, 삭제
- 기존 테스트 삭제 또는 assertion 약화
- 관련 없는 리팩터링
- 실제 수집, Telegram 전송, local/run.sh 실행, kickstart, launchd 설치·해제
- 환경 파일·상태 파일·운영 로그·자격 증명 읽기 또는 수정
- workflow 복원 또는 신규 생성, Secrets·Variables·자기호스팅 러너 변경

## 테스트 방법
- `bash -n local/run.sh` (구문 검사)
- `node --test test/local-runner.test.mjs` (임시 경로와 가짜 npm·node 사용, 운영 앱·자격 증명 미사용)
- `node -e 'require("./package.json")'` (JSON 유효성)
- `git diff --check`, 실행 권한 유지 확인
- 설명·주석만 변경하므로 전체 `npm test`는 반복하지 않는다.

## commit 메시지
- docs: align guides with local-only execution / 로컬 전용 실행 방식으로 안내 정리
- docs(ai): record Actions reference cleanup / Actions 잔존 설명 정리 기록

## 완료 시
- ai/notes/2026-10-29-claudecode-report-actions-reference-cleanup.md 작성
- ai/CONTEXT.md 갱신. 기존 결정에서 파생된 정리이므로 DECISIONS.md에는 추가하지 않는다.
- 보고: 변경 파일, 주요 정리 내용, 보존한 Actions 언급, 검증 결과, 두 commit hash, push 결과
