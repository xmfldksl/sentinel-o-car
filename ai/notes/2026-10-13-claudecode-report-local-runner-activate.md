# 보고: 로컬 실행 활성화 시도와 Telegram 오류로 인한 보류

작성자: codex (사용자 지정 claudecode-report 파일명 유지)
날짜: 2026-10-13
대상: ai/notes/2026-10-13-gpt-handoff-local-runner-activate.md

## 확인된 원인

- normal 1회 실행은 **종료 코드 1**로 실패했다. 수집 후 Telegram API가 `400 Bad Request: chat not found`를 반환했다. 제공된 채팅 설정으로 전송이 완료되지 않았으며 정확한 설정 원인은 이번 작업에서 진단하지 않았다.
- 사용자 지시에 따라 실패 후 재실행하지 않았고 local/install.sh도 실행하지 않았다. launchd는 미등록이며 다음 자동 예약은 없다.
- 시작 시 main과 성공한 git fetch의 origin/main은 `3e6a3fc`로 동일했고 작업 트리는 clean이었다. 원격 workflow에서 schedule 주석 처리·workflow_dispatch 유지와 코드 일치를 확인했다.
- GitHub Actions 실행 목록은 API 연결 오류 후 사용자가 진단·반복 조회를 제외했다. 목록은 미확인으로 남기고 로컬 프로세스·launchctl 조회로 중복 실행을 점검했다. 중단 직후에도 실행 중인 수집·잠금·운영 로그·서비스·plist가 없었다.

## 변경 파일

- ai/notes/2026-10-13-gpt-handoff-local-runner-activate.md: 실행 전에 작성·별도 commit한 인수인계.
- ai/notes/2026-10-13-claudecode-report-local-runner-activate.md: 이 결과 보고.
- ai/CONTEXT.md: 실제 실패 결과와 후속 확인 사항을 50줄 이내로 갱신.
- 저장소 밖에 기본 외부 상태 파일과 실행기 로그가 생성됐다. 이 파일들은 commit에 포함하지 않는다.
- 코드·workflow·.env.local·저장소 data/state.json은 변경하지 않았다. 새 설계 결정이 없어 DECISIONS.md도 변경하지 않았다.

## 수정 내용

### 준비와 상태 파일
- .env.local의 필수 Telegram 두 값과 활성 프로필 검색 URL 존재만 확인했다. 권한 600, Git 미추적·ignore를 확인했고 값·전체 URL은 출력하지 않았다.
- STATE_PATH·ENV_FILE·LOG_DIR·NODE_BIN_DIR·RUN_MODE 재정의가 없으며 실행기는 `/Users/softnexia/Library/Application Support/sentinel-o-car/state.json`을 사용했다. 저장소 내부를 가리키지 않는다.
- 외부 파일이 없어 data/state.json을 배타적 생성으로 한 번 복사했다. 기존 파일이 있으면 덮어쓰지 않는 절차다. 외부 파일 권한은 600이며 실제 정규화 함수로 schema v2 검증, 파일 읽기·쓰기 열기와 부모 디렉터리 접근 가능 여부를 확인했다. 상태 내용은 출력하지 않았다.
- 실행 직전에도 서비스 미등록·수집 프로세스 없음·잠금 없음과 원격 기준 운영 코드 일치를 확인했다.

### 실제 실행
- 명령: `/Users/softnexia/Projects/sentinel-o-car/local/run.sh normal`, 실제 호출 **1회**.
- 한국시간 시작: 2026-10-13 02:44:31, 실행기 시작 로그 02:44:32.
- 실행기 내부 npm test: 246 pass / 0 fail / 0 skipped. 앱 실행 시작: 02:44:35.
- 활성 Tesla 프로필 목록: 1페이지 76건, 2페이지 0건으로 전체 76건을 추출했다. 총 수집 0건 오류가 아니며 프로필 실패·부분 수집 경고는 없었다. 이후 차량 중복 억제 로그가 기록됐다.
- Telegram 전송 중 `Error: 텔레그램 전송 실패: {"ok":false,"error_code":400,"description":"Bad Request: chat not found"}`로 중단됐다.
- 한국시간 종료: 2026-10-13 02:46:01. 호출자 종료 코드와 실행기 로그의 `종료 코드=1`이 일치하며 앱 `Done.` 기록은 없다.
- Telegram 전송 시도와 실패는 확인했다. 개별 성공 전송을 기록하지 않는 로그이므로 성공 건수는 확정할 수 없고 수신도 검증하지 않았다. “변경 없음으로 알림 0건인 성공”으로 처리하지 않는다.
- 앱은 Telegram 전송 뒤 상태를 저장하는 구조다. 실패 후 외부 파일 내용 해시와 수정 시각이 실행 전과 동일하고 저장소 원본과도 일치해 이번 수집 결과가 저장되지 않았음을 확인했다. 최초 복사본은 유지했다.
- 저장소 data/state.json은 실행 전후 해시와 Git 비교 모두 불변이다. .env.local도 불변이며 실제 환경값·전체 검색 URL이 이번 실행 로그에 포함되지 않았음을 값 비출력 방식으로 확인했다.
- 획득한 실행 잠금은 종료 후 정리됐다. 재시도, telegram_test, send_current, kickstart는 수행하지 않았다.

### 예약 등록
- 성공 조건을 충족하지 못해 설치하지 않았다. 최종 launchctl 조회도 대상 서비스를 찾지 못했고 plist도 없다.
- 따라서 설치기의 기존 상태 유지, 등록된 실행 경로·17분/47분 예약, 자동 예약 실행은 검증하지 않았다. 다음 예약 시각은 **없음**이다.
- 전원·잠자기 설정과 기존 자기호스팅 러너는 변경하지 않았다.

## 테스트 결과
- 관련 테스트: 상태·환경·중복 실행 조건, 실제 앱 로그와 종료 코드, 외부 상태 미저장·저장소 상태 보존 확인.
- 전체 테스트: 별도 반복하지 않음. 승인된 run.sh 내부에서 실행된 npm test 246 pass / 0 fail / 0 skipped.
- 문서: git diff --check, 변경 범위, 비밀값 비포함, CONTEXT 50줄 이내 검증.
- 실행 환경: 로컬 macOS, Node v25.9.0, npm 11.12.1.

## Git
- branch: main, 시작 commit `3e6a3fc`.
- commit: `70c2e79` — docs(ai): add local runner activation handoff / 로컬 실행 활성화 인수인계 추가
- 이 보고와 최종 CONTEXT는 `docs(ai): record local runner activation / 로컬 실행 활성화 결과 기록`으로 별도 commit하고 두 문서 commit을 일반 push한다. 최종 hash·push 결과·Git 상태는 사용자 최종 보고에 기록한다.
- Pull Request: 없음.
- GitHub Actions: 실행하지 않음. 원격 schedule 중지는 fetch한 파일로 확인했으며 실행 목록 조회는 미확인으로 남긴다. 두 workflow 모두 push 트리거가 없다.

## 남은 제한사항
- 로컬 운영 전환은 완료되지 않았다. Telegram 채팅 설정을 확인·수정한 뒤 실제 normal 재실행과 성공 후 등록을 별도로 진행해야 한다. 이번 실패를 이유로 자동 재시도하거나 예약하지 않는다.
- 이번 전송의 성공 건수와 사용자 수신은 미확인이다. 상태 저장 전 전송 실패에서는 앞서 성공한 메시지가 있었다면 다음 실행 시 중복될 수 있다.
- 예약이 없으므로 다음 17분·47분에 실행을 기다릴 필요는 없다. 현재 보류 상태 확인 명령 한 개: `launchctl print gui/$(id -u)/com.xmfldksl.sentinel-o-car`. 기대 결과는 `Could not find service`이며 성공적인 운영 등록을 뜻하지 않는다.

## 정리
- 임시 파일 또는 workflow 유지/삭제: 점검·1회 실행 보호 스크립트와 내용 없는 메타데이터는 `/private/tmp/sentinel-runner-activate.88c5s8fl/`에 있다. 설치 보호 스크립트는 작성만 했고 실행하지 않았다. 임시 파일은 Git에 포함하지 않는다.
- 외부 상태 최초 복사본과 `~/Library/Logs/sentinel-o-car/2026-10-13.log`를 보존한다. 상태 내용·자격 증명 사본은 임시 폴더에 만들지 않았다. workflow는 변경하지 않았다.
