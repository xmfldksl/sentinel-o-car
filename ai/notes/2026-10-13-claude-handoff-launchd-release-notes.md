# 인수인계: 릴리즈 노트에 launchd 실행기 추가, README 정리

작성자: claude
날짜: 2026-10-13
대상: claudecode

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: 프로젝트 기존 규칙(CLAUDE.md, REQUIREMENTS.md)을 따름. 규칙이 없으면 작업 전에 사용자에게 확인

## 작업 목적
README의 운영 상세 서술을 걷어내고, Mac launchd 실행기 추가 사실을 릴리즈 노트에 기록한다.

## 문제 현상 (있으면)
- README 실행 절에 수동 실행 결과, Telegram 수신 확인, 미검증 서술, 경로 목록, 확인 명령이 길게 남아 있다.
- launchd 실행기 추가와 GitHub Actions 예약 중지가 릴리즈 노트에 기록되어 있지 않다.

## 먼저 확인할 파일
- README.md: 실행 절과 릴리즈 노트의 위치·형식
- 릴리즈 노트 파일: 위치·형식. 파일이 없으면 만들지 말고 사용자에게 위치를 확인한다.
- local/README.md: 로컬 운영 안내. 경로 목록과 확인 명령이 이미 있는지 확인

## 수정 범위와 제한
- 현재 구현을 먼저 읽고 최소 변경한다.
- 필드명, 함수명, import는 추측하지 않고 코드에서 확인한다.
- 작업 순서:
  1. 현재 README와 릴리즈 노트 파일(위치·형식)을 먼저 읽고 확인한다.
  2. 릴리즈 노트에 기존 형식에 맞춰 2026-10-13 항목을 추가한다.
     - Mac launchd 실행기 추가: 매시 17분·47분에 예약 실행
     - GitHub Actions 예약 중지 (`workflow_dispatch` 수동 실행은 유지)
  3. README에서 "GitHub Actions 예약은 중지됐으며"로 시작해 `local/install.sh` 재실행 금지 문장까지 이어지는 구간(수동 실행 결과, Telegram 수신 확인, 미검증 서술, 경로 목록, 확인 명령 포함)을 아래 한 문단으로 교체한다. 구간 끝에 홀로 남은 `normal` 조각이 있으면 함께 제거한다.
     > Mac launchd 실행기로 운영하며, 매시 17분·47분에 실행됩니다. 경로와 운영 절차는 로컬 운영 안내를 참조하십시오.
  4. 삭제 전에 경로 목록(환경 파일, 외부 상태, 일별 로그, launchd 로그)과 확인 명령(launchctl print, tail)이 로컬 운영 안내 문서에 이미 있는지 확인한다. 없으면 그 문서로 옮긴 뒤 README에서 삭제한다.
- 문서만 수정한다. 코드, workflow, launchd 설정, local/ 스크립트는 건드리지 않는다.
- README의 다른 구간과 기존 링크는 유지한다.

## 금지 작업
- 기존 미완료 변경의 reset, checkout, 삭제
- 기존 테스트 삭제 또는 assertion 약화
- 관련 없는 리팩터링
- `local/install.sh` 실행
- 코드, workflow, launchd 설정, local/ 스크립트 수정

## 테스트 방법
- README diff를 검토해 지정 구간만 교체되고 다른 구간·링크가 유지되는지 확인한다.
- 옮긴 경로 목록과 확인 명령이 로컬 운영 안내에 있는지 확인한다.

## commit 메시지
- 문서 변경: `docs: add launchd runner to release notes, trim README / 릴리즈 노트에 launchd 실행기 추가, README 정리`
- ai/ 문서는 별도 commit: `docs(ai): add handoff and report for release notes / 릴리즈 노트 작업 인수인계 및 보고 추가`

## 완료 시
- ai/notes/2026-10-13-claudecode-report-launchd-release-notes.md 작성
- ai/CONTEXT.md 갱신, 결정이 있으면 ai/DECISIONS.md 추가
- 보고: 변경 파일, git diff 요약, 4번에서 옮긴 내용 유무, branch, commit hash, push 여부를 실제 결과로 적는다.
