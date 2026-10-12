# 보고: 로컬 운영 재개 사전 확인과 게시물 링크 대조 대기

작성자: codex
날짜: 2026-10-13
대상: ai/notes/2026-10-13-codex-handoff-local-runner-resume.md

## 확인된 원인
- **사용자 확인 게시물 링크와 채팅 ID 대조를 완료하지 못해 실행 전 보류**했다. 대조용 링크가 현재 대화·최신 handoff·report에 없어 사용자에게 링크만 요청했다. 토큰과 채팅 ID는 요청하거나 출력하지 않았다.
- 사용자는 이전 Telegram 400 chat not found가 채팅 ID에 봇 이름을 넣은 문제였다고 확인했고, 노출 토큰을 재발급받아 .env.local에 교체했다고 알렸다.
- 이번 getMe·getChat·getChatMember는 모두 성공했다. 토큰의 봇 식별, 설정된 음수 ID와 응답 채널 ID의 일치, 채널 관리자 지위와 게시 권한을 확인했다. 사용자 링크에서 계산한 ID와의 대조는 별개의 미완료 조건이다.

## 변경 파일
- ai/notes/2026-10-13-codex-handoff-local-runner-resume.md: 승인 범위와 단일 실행 조건.
- ai/notes/2026-10-13-codex-report-local-runner-resume.md: 사전 확인 결과와 대기 사유.
- ai/CONTEXT.md: 현재 상태와 남은 필수 조건을 50줄 이내로 갱신.
- 코드·workflow·환경 파일·상태 파일은 변경하지 않았다. 새 설계 결정이 없어 DECISIONS.md도 변경하지 않았다.

## 수정 내용

### 로컬·원격 사전 확인
- 시작 branch는 main, HEAD와 성공한 git fetch의 origin/main은 `918fe5d`로 동일하고 작업 트리는 clean이었다. 원격 workflow의 schedule은 주석 처리되어 있고 workflow_dispatch는 유지된다. 원격과 로컬 운영 코드가 일치한다.
- .env.local은 권한 600, Git ignore·미추적 상태다. Telegram 필수값과 활성 Tesla 검색 URL이 있으며 실행 경로·모드 재정의는 없다. 값은 출력하지 않았다.
- 기존 외부 경로는 `/Users/softnexia/Library/Application Support/sentinel-o-car/state.json`이다. schema v2 정규화 검증을 통과했고 활성 Tesla 기준선이 있다.
- 외부 파일 수정 시각은 2026-10-13 02:44:31 KST이며 저장소 원본과 내용이 같다. 이전 최초 복사본을 이번에 다시 복사하거나 덮어쓰지 않았다.
- 운영 로그에는 이전 normal 실패 1회(02:44:32 시작, 02:46:01 종료 코드 1)만 있고 추가 시작·Done 기록은 없다.
- 수집 프로세스·Runner.Worker·두 기본 잠금 경로·대상 launchd·설치 plist는 없다. 기존 Runner.Listener는 실행 중이며 변경하지 않았다.

### Telegram 사전 확인
- getMe: 유효한 봇이며 토큰의 봇 식별 부분과 응답 봇 ID가 일치한다.
- getChat: 설정 ID와 응답 ID가 일치하며 대상 유형은 channel이다.
- getChatMember: 해당 봇은 administrator이며 can_post_messages=true다. 필드 의미는 [Telegram 공식 Bot API](https://core.telegram.org/bots/api#chatmemberadministrator)로 확인했다.
- 응답은 메모리에서 판정하고 성공·대상 유형·권한 여부만 출력했다. 인증 URL, 응답 전문, 봇·채널 이름 및 ID는 로그·문서에 기록하지 않았다.
- 첫 샌드박스 조회는 DNS 접근 오류로 API에 도달하지 못했다. 승인된 네트워크 접근 환경에서 사전 조회를 완료했다. 수집 실행이나 메시지 전송 재시도가 아니다.
- 게시물 링크는 .env.local에도 없다. API 접근 성공을 사용자 링크 대조 완료로 대신하지 않았다.

### 실행·저장·예약 결과
- local/run.sh normal: **0회, 미실행, 종료 코드 없음**.
- 전송 성공: **0건(시도 없음)**. 실제 Telegram 전송과 사용자 수신은 미검증이다.
- 외부 상태: 기존 파일 유지, 이번 수집 결과 저장 없음. 저장소 data/state.json과 .env.local도 불변이다.
- local/install.sh: 미실행. launchd 미등록, 다음 예약 시각 **없음**. 템플릿의 매시 17분·47분과 RunAtLoad=false만 정적으로 확인했으며 등록·예약 실행은 미검증이다.
- telegram_test·send_current·kickstart·추가 normal·gh run list 재시도·Actions 실행·전원 및 기존 자기호스팅 러너 변경은 하지 않았다.

## 테스트 결과
- 관련 테스트: Git 동기화·원격 예약 중지, 환경 형식·경로, 상태 schema v2, 프로세스·잠금·실행 기록·launchd 부재, Telegram 접근·게시 권한 확인.
- 전체 테스트: 별도 npm test 미실행. 이전 검증을 중복하지 않았으며 normal 미시작으로 실행기 내부 테스트도 이번에는 수행하지 않았다.
- 문서: git diff --check, 변경 범위·민감값 비포함·CONTEXT 50줄 이내 확인.
- 실행 환경: 로컬 macOS, API 조회는 `/opt/homebrew/bin/node` 사용.

## Git
- branch: main, 시작 commit `918fe5d`.
- commit: 이 handoff·report·CONTEXT만 `docs(ai): record local runner resume / 로컬 운영 재개 결과 기록`으로 별도 commit한다. 최종 hash와 실제 일반 push 결과는 사용자 최종 보고에 기록한다.
- Pull Request: 없음.
- GitHub Actions: 미실행. 원격 schedule 중지는 Git으로 확인했으며 실행 목록은 사용자 지시에 따라 미조회로 유지한다.

## 남은 제한사항
- 사용자 확인 게시물 링크를 받아 계산한 ID와 .env.local의 ID를 값 비출력으로 대조해야 한다. **이번 normal 1회·성공 후 설치 승인은 유효하며 다시 요청할 필요가 없다.**
- 대조 후 환경·기존 상태·중복 실행 조건을 재확인하고 승인된 normal을 한 번 실행한다. 실패하면 재시도·등록하지 않는다. 정상 종료와 프로필별 수집·전송·외부 저장을 확인한 경우만 미등록 서비스를 설치한다.
- 실제 메시지 전송·사용자 수신·예약 실행과 GitHub Actions 실행 목록은 미검증이다.

## 정리
- 임시 파일 또는 workflow 유지/삭제: 비밀값 없는 사전 확인 메타데이터와 단일 실행·성공 후 설치 보호 스크립트는 `/private/tmp/sentinel-runner-resume.GXkWZr/`에 있다. 실행·설치 스크립트는 준비만 했으며 호출하지 않았다. 환경·상태 사본은 만들지 않았다.
- 수동 실행 보호 스크립트는 임시 FIFO에서 API 오류 전문·인증 URL·민감값을 제거한 뒤 기존 운영 로그에 추가하도록 준비했다. 실행 시 한정 조치이며 운영 코드는 변경하지 않았다.
- 기존 운영 로그·외부 상태·환경·미완료 변경을 보존한다. 환경·상태·임시 스크립트는 commit하지 않는다.
