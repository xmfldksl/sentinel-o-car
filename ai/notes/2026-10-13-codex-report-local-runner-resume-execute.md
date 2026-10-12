# 보고: 로컬 운영 재개 성공과 launchd 등록

작성자: codex
날짜: 2026-10-13
대상: ai/notes/2026-10-13-codex-handoff-local-runner-resume-execute.md

## 확인된 원인
- 이전 실행의 Telegram 400 chat not found는 사용자가 확인한 채팅 ID 설정 문제였다. 토큰 재발급·설정 교체 후 사전 API 확인을 통과했고, 이번에는 사용자 확인 게시물 링크에서 계산한 ID와 설정 ID까지 값 비출력으로 대조해 일치를 확인했다.
- 승인된 **normal 1회가 종료 코드 0으로 완료**됐고 Telegram 알림 **42건 전송 성공**, 외부 상태 저장을 확인했다. 이어서 local/install.sh가 종료 코드 0으로 완료되어 로컬 예약 운영을 등록했다.

## 변경 파일
- ai/notes/2026-10-13-codex-handoff-local-runner-resume-execute.md: 사용자 응답 이후 실행 승인·제약·검증 기준.
- ai/notes/2026-10-13-codex-report-local-runner-resume-execute.md: 실제 실행·전송·저장·등록 결과.
- ai/CONTEXT.md: 현재 운영 상태와 다음 예약, 남은 미검증 사항을 50줄 이내로 갱신.
- 운영 결과로 저장소 밖의 기존 상태·운영 로그가 갱신되고 LaunchAgent plist가 생성됐다. 환경·상태·로그·plist·임시 스크립트는 commit하지 않는다.
- 코드·workflow·.env.local·저장소 data/state.json은 변경하지 않았다. 기존 설계 결정을 실행한 작업으로 DECISIONS.md의 변경은 없다.

## 수정 내용

### 재개 직전 확인
- 시작 main HEAD `cdebfee`, 작업 트리 clean. 이전 getMe·getChat·getChatMember 및 원격 schedule 중지·코드 동기화 검증을 이어받았다. API와 전체 사전 검증, gh run list를 반복하지 않았다.
- 사용자 링크에서 계산한 ID, 사용자가 함께 확인한 ID, .env.local의 음수 정수 ID가 모두 일치한다. 환경 파일 해시도 기존 API 확인 시점과 같다. 실제 링크·ID·토큰을 출력하거나 파일에 저장하지 않았다.
- 수집 프로세스·Runner.Worker·잠금·대상 launchd·설치 plist 부재를 실행 직전에 확인했다. 기존 외부 상태는 복사·초기화하지 않고 그대로 사용했다.

### normal 실제 실행
- 명령: `/Users/softnexia/Projects/sentinel-o-car/local/run.sh normal`, 이번 승인에 따른 호출 **1회**.
- 한국시간: **2026-10-13 03:43:48~03:47:23**, 호출자·실행기 로그 종료 코드 모두 **0**.
- 실행기 내부 npm test: **246 pass / 0 fail / 0 skipped**. 별도 테스트 반복은 없다.
- 실제 앱 구간은 03:43:52의 npm run scrape 이후로 구분했다. 테스트 fixture의 가짜 프로필 출력은 실제 수집 집계에서 제외했다.
- 활성 `tesla-model3-long-range`: 1페이지 76건, 2페이지 0건, 총 **76건** 수집. 프로필 실패·부분 수집·상세 조회 실패는 모두 0건이다.
- `Done. 42 notification(s).`와 외부 상태에 새로 기록된 Telegram 전송 이력 42건이 일치한다. 앱이 성공 응답을 받은 **알림 42건 전송 완료**이며 사용자 기기에서의 수신 확인은 별개로 미검증이다.
- 전송 중 속도 제한 대기 경고가 2회 있었다. 각 메시지의 기존 sender 대기·재시도 처리 후 정상 완료했고, 네트워크 재시도 경고와 최종 API 실패는 없다. normal 자체를 추가 호출한 것은 아니다.
- `.env.local`·저장소 data/state.json은 실행 전후 해시가 동일하다. 실행 잠금은 종료 후 정리됐다.

### 외부 상태 저장
- 경로: `/Users/softnexia/Library/Application Support/sentinel-o-car/state.json`.
- schema v2 유지, 최종 파일 수정 시각 **2026-10-13 03:47:22 KST**, 권한 600. 기존 파일이 실제 앱 저장으로 갱신됐으며 저장소 상태로 덮어쓰지 않았다.
- 활성 Tesla의 기존 initializedAt은 유지됐다. 저장된 이력 레코드는 139개이며, 이는 과거 이력도 포함하는 상태 레코드 수로 이번 목록 76건과 구분한다. 이번 새 전송 이력은 42개다.
- 비활성 `toyota-sienna`와 `slot-3`~`slot-5`는 수집·전송하지 않았고 프로필 상태도 바뀌지 않았다.
- 설치 전후 외부 파일 해시·수정 시각이 같아 설치기가 정상 저장 결과를 그대로 보존했음을 확인했다.

### launchd 예약 등록
- 정상 완료를 확인한 뒤 중복 실행·미등록 여부를 확인하고 **local/install.sh 1회, 종료 코드 0**으로 등록했다. 설치기는 기존 상태 유지 경로를 사용했다.
- label: `com.xmfldksl.sentinel-o-car`, 사용자 GUI LaunchAgent 등록·활성화 확인.
- plist: `/Users/softnexia/Library/LaunchAgents/com.xmfldksl.sentinel-o-car.plist`.
- 실행 인수: `/bin/bash`, `/Users/softnexia/Projects/sentinel-o-car/local/run.sh`.
- 작업 디렉터리: `/Users/softnexia/Projects/sentinel-o-car`; NODE_BIN_DIR: `/opt/homebrew/bin`.
- 실제 plist와 로드된 launchctl 정보에서 **매시 17분·47분** 및 실행 경로 일치를 확인했다. RunAtLoad=false다.
- 등록 직후 03:48 KST 기준 state=not running, runs=0. **다음 예약은 2026-10-13 04:17 KST**이며 해당 예약의 실제 수집·전송·저장은 아직 미검증이다. 예약을 기다리거나 kickstart하지 않았다.
- telegram_test·send_current·추가 수동 normal·Actions 실행·전원 및 기존 자기호스팅 러너 변경은 하지 않았다.

## 테스트 결과
- 관련 테스트: 링크와 설정의 값 비출력 대조, 실행 직전 중복 방지, 실제 앱 수집·전송·저장 및 설치 후 상태 보존·로드된 예약 확인.
- 전체 테스트: 승인된 실행기 내부 npm test **246 pass / 0 fail / 0 skipped**, 종료 0.
- 로그 보호: 이번 수동 실행 출력은 임시 FIFO에서 민감값·API 오류 전문을 제거한 뒤 기존 운영 로그에 추가했다. 신규 로그 구간에 실제 환경 비밀값·채널 게시물 링크·인증 URL이 없음을 확인했다. API 응답 전문은 저장하지 않았다.
- 문서: git diff --check, AI 문서 한정 변경, 민감값 비포함, CONTEXT 50줄 이내 확인.
- 실행 환경: 로컬 macOS, 기존 Node 실행 경로와 운영 코드를 유지했다.

## Git
- branch: main, 시작 commit `cdebfee`.
- commit: 새 handoff·report와 CONTEXT만 `docs(ai): record local runner activation success / 로컬 운영 활성화 결과 기록`으로 별도 commit한다. 최종 hash·실제 일반 push 결과는 사용자 최종 보고에 기록한다.
- Pull Request: 없음.
- GitHub Actions: 실행하지 않음. 원격 schedule 중지 상태를 이어받았으며 실행 목록은 사용자 지시대로 미조회 상태를 유지한다.

## 남은 제한사항
- 수동 normal의 수집·API 전송 성공·외부 저장과 launchd 등록은 검증됐다. 첫 자동 예약 실행 및 사용자 기기 수신은 아직 검증하지 않았다.
- 사용자 GUI LaunchAgent의 실행은 로그인·전원·잠자기 상태의 영향을 받는다. 해당 설정과 기존 자기호스팅 러너를 변경하지 않았다.
- 사전 대기 보고는 과거 시점 기록으로 보존한다. 다음 운영 확인에서는 이 보고와 CONTEXT를 기준으로 하며 normal·설치를 중복 수행하지 않는다.

## 정리
- 임시 파일 또는 workflow 유지/삭제: `/private/tmp/sentinel-runner-resume.GXkWZr/`의 단일 실행·설치 보호 스크립트, 값 없는 일치 판정·실행 결과 메타데이터를 유지한다. 상태·환경 사본은 없다. 임시 FIFO는 이번 실행의 로그 정제에만 사용했고 launchd는 원래 local/run.sh를 직접 실행한다.
- 기존 운영 로그에 결과를 추가했고 기존 외부 상태와 비활성 프로필 기록을 유지했다. 저장소 상태·환경은 불변이며 커밋 대상에서 제외했다.
