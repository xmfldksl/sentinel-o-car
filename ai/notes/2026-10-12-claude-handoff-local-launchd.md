# 인수인계: sentinel-o-car 맥 launchd 내재화

작성자: claude
날짜: 2026-10-12
대상: claudecode

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main (branch 규칙 없음, main 직접 commit)

## 작업 목적
GitHub 계정의 Actions가 2026-09-24부터 계정 단위로 비활성화되어 예약 workflow가 멈춘 상태다. 이 저장소는 원래 맥의 자기호스팅 러너에서 실행되었으므로, GitHub Actions가 맡던 예약, 비밀값 보관, 상태 파일 commit 세 가지를 맥 안에서 대체해 Actions 없이 같은 주기로 동작하게 한다. 플래그가 풀리면 되돌릴 수 있어야 한다.

## 문제 현상
- Actions 탭에서 Run workflow 시 "Actions has been disabled for this user" 오류. 예약 실행은 #756(2026-09-24 21:18 KST)이 마지막.
- 자기호스팅 러너 서비스는 맥에 설치되어 있으나 작업이 내려오지 않아 유휴 상태(추정).

## 먼저 확인할 파일
- .github/workflows/sentinel-o-car.yml: cron 주기, 실행 단계, secrets 이름, 상태 파일 commit 단계, workflow_dispatch 입력(실행 방식)
- package.json의 scripts, README의 실행 방법
- 상태 파일(data/state.json) 경로가 코드 어디서 정해지는지, 환경변수로 바꿀 수 있는지
- 테스트 모드나 dry-run이 있는지(README의 "실행 방식" 입력, 회귀 테스트 후 수집 구조)
- .gitignore, ai/CONTEXT.md

## 수정 범위와 제한
- 현재 구현을 먼저 읽고 최소 변경한다. 필드명, 함수명, 환경변수명은 추측하지 않고 코드에서 확인한다.
- local/ 폴더를 새로 만들고 다음을 둔다.
  - local/run.sh: 저장소 경로로 이동, .env.local을 읽어 환경변수로 노출(set -a; source; set +a), node 경로를 PATH에 포함, workflow의 단계를 같은 순서로 실행(의존성 설치는 필요할 때만, 회귀 테스트, 본 실행), 로그를 $HOME/Library/Logs/sentinel-o-car/YYYY-MM-DD.log에 추가, 종료 코드를 기록. set -euo pipefail 사용.
  - local/com.xmfldksl.sentinel-o-car.plist.template: launchd 에이전트. StartCalendarInterval은 workflow cron을 KST로 변환해 같은 시각들로, RunAtLoad는 false, 표준 출력과 오류는 위 로그 경로로.
  - local/install.sh: 템플릿의 경로와 node 경로를 현재 환경 값으로 치환해 $HOME/Library/LaunchAgents/에 복사하고 launchctl bootstrap gui/$(id -u)로 등록. local/uninstall.sh: bootout으로 해제.
  - local/README.md: 설치, 해제, 로그 위치, 수동 실행, Actions 복구 시 되돌리는 순서를 짧게.
- 비밀값: workflow에서 secrets.로 참조하는 이름을 모두 추출해 .env.local.example에 이름만 나열한다. .env.local을 .gitignore에 추가한다. 실제 값은 사용자가 채우며, 로그에 값이 찍히지 않게 한다.
- 상태 파일: 로컬 실행이 저장소 안의 data/state.json을 건드리지 않게 한다. 코드가 경로를 환경변수로 받을 수 있으면 그것을 쓰고, 없으면 STATE_FILE 같은 환경변수로 경로를 바꿀 수 있는 최소 변경을 넣되 기본값은 현행 그대로 두어 workflow와 호환되게 하고 테스트를 추가한다. 로컬 상태 경로는 $HOME/Library/Application Support/sentinel-o-car/state.json으로 하고, install.sh가 현재 data/state.json을 그 위치로 한 번 복사해 이어받게 한다.
- workflow: .github/workflows/sentinel-o-car.yml의 schedule 트리거만 주석 처리하고 workflow_dispatch는 유지한다. 상단에 "로컬 launchd로 실행 중, Actions 복구 시 주석 해제" 주석을 남긴다. 플래그가 풀렸을 때 예약과 로컬이 이중 실행되는 것을 막기 위함이다. 이 변경은 별도 commit으로 한다.
- launchd 등록(install.sh 실행)은 사용자에게 확인을 받은 뒤에 한다. 맥의 전원이나 잠자기 설정은 변경하지 말고 안내만 한다.

## 금지 작업
- 비밀값, Token, Chat ID를 저장소 파일이나 로그에 기록
- data/state.json을 commit하거나 삭제
- 자기호스팅 러너 서비스 삭제 또는 설정 변경
- 기존 테스트 삭제 또는 assertion 약화
- 관련 없는 리팩터링
- 사용자 확인 없이 실제 수집과 Telegram 전송 실행

## 테스트 방법
- npm test 전체 통과.
- local/run.sh를 테스트 모드나 dry-run으로 수동 실행해 Telegram 전송 없이 끝까지 도는지 확인한다. 그런 모드가 없으면 그 사실을 보고하고, 실제 1회 실행은 사용자 확인 후 진행한다.
- install.sh 실행 후 launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car 로 등록 상태를 확인하고, 다음 예약 시각 이후 로그에 정상 종료가 기록되는지는 사용자가 확인한다.
- git status로 작업 트리가 clean인지, .env.local이 무시되는지(git check-ignore) 확인한다.

## commit 메시지
- feat: add local launchd runner / 로컬 launchd 실행 추가
- feat: allow state file path override / 상태 파일 경로 환경변수 지원 (코드 변경이 필요한 경우만)
- chore: pause scheduled workflow while running locally / 로컬 실행 중 예약 workflow 중지
- docs(ai): add local runner report / 로컬 실행 보고 추가

## 완료 시
- ai/notes/2026-10-12-claudecode-report-local-launchd.md 작성
- ai/CONTEXT.md 갱신: 진행 중 작업에 로컬 실행 전환, 미해결 이슈에 "Actions 복구 시 되돌리기(schedule 주석 해제, launchd 해제)" 기록
- ai/DECISIONS.md에 "Actions 비활성화로 맥 launchd 내재화, 복구 시 환원" 한 줄 추가
- 보고: 변경 파일, 테스트 결과, commit hash, 그리고 사용자가 할 일(.env.local 값 입력, 전원 연결 시 잠자기 방지 설정, 첫 예약 실행 확인)
