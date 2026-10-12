# 인수인계: 원격 반영과 로컬 환경 파일 준비

작성자: codex
날짜: 2026-10-13
대상: codex

## 프로젝트
- 경로: $HOME/Projects/sentinel-o-car
- 저장소: git@github.com:xmfldksl/sentinel-o-car.git
- 기준 branch: main 직접 commit, origin/main에 일반 push 승인
- 사용자 지정 gpt-handoff 파일명을 유지하고 실제 작성자는 codex로 기록한다.

## 작업 목적
기존 로컬 실행기·검증·수정 커밋과 이번 문서를 원격 main에 반영하고, 실제 운영을 시작하지 않은 채 .env.local과 필수 설정의 준비 상태를 확인한다.

## 문제 현상 (있으면)
- 시작 시 main HEAD d21df90, 작업 트리 clean. git fetch origin 후에도 origin/main보다 10 ahead / 0 behind이며 분기 없음.
- 이전 보고의 원격 schedule 활성 문제를 이번 승인 범위에서 해소한다. 이미 통과한 246건 테스트는 코드 변경이 없으므로 반복하지 않는다.
- 실제 .env.local은 없고 Git ignore 적용·미추적 확인. config는 활성 Tesla 프로필 1개, 비활성 프로필 4개다.

## 먼저 확인할 파일
- ai/CONTEXT.md → ai/README.md, AGENTS.md, CLAUDE.md, 연결된 최신 보고·인수인계
- ai/templates/handoff.md, ai/templates/report.md
- 모든 .github/workflows/*.yml, push 대상 commit·변경 파일, 로컬 pre-push 훅
- .env.local.example, local/run.sh, config.json, 검색 URL·환경변수 설정 코드
- README.md 및 최신 운영 안내

## 수정 범위와 제한
- 이 handoff와 CONTEXT를 먼저 별도 commit한다. 기존 변경을 보존하고 이번 작업과 섞지 않는다.
- 원격과 분기되면 임의 merge·rebase·force push 없이 보고한다. 일반 push가 실패해도 remote·인증 설정은 바꾸지 않는다.
- push 대상 전체에서 의도하지 않은 파일·비밀값·상태 변경을 검사한다. 최종 workflow는 schedule 주석 처리·workflow_dispatch 유지 상태이며 다른 자동 트리거가 수집·전송을 시작할 가능성이 확인되면 push하지 않는다.
- 안전성이 확인되면 origin main에 일반 push하고 원격 commit·workflow를 읽어 예약 중지 반영을 검증한다. 최종 보고 commit도 같은 방식으로 push한다.
- .env.local이 없을 때만 예제에서 생성하고 권한 600을 설정한다. 기존 파일·입력값은 덮어쓰지 않는다. Git 미추적·ignore 적용을 확인한다.
- URL은 현재 저장소 설정 또는 기존 인증으로 조회 가능한 GitHub repository variables에서 확인된 값만 사용한다. 조회 불가 시 비워 두고 사용자 입력 항목으로 남긴다.
- 활성 프로필의 URL만 필수이며 비활성 URL은 코드 기준으로 선택 항목임을 확인한다. 값이 있으면 해당 URL도 코드의 형식 검증 대상임을 고려한다.
- Telegram 비밀값은 만들거나 다른 프로젝트·셸 기록에서 찾지 않는다. GitHub Secrets 실제 값 복원도 시도하지 않는다. 누락된 값은 사용자가 로컬 편집기로 입력한다.
- 환경 파일을 실행하거나 source하지 않는다. 정적 파싱·형식 검사만 수행한다.
- 실제 .env.local에 확인된 URL을 입력하는 지시와, 완료 기록에서 값 노출을 금지하는 지시를 함께 따른다. 채팅·보고·CONTEXT에는 변수 이름과 입력됨/비어 있음/선택 항목 상태만 기록하고 값·전체 URL은 출력하지 않는다.

## 금지 작업
- install.sh, uninstall.sh, 운영 run.sh 실행
- 실제 수집·Telegram 전송·외부 API 쓰기 (명시 승인된 Git 일반 push 제외)
- launchd 등록·해제·재시작, 전원·잠자기 또는 자기호스팅 러너 변경
- 실제 상태 파일 생성·복사·수정·삭제·commit
- 비밀값 출력·로그 기록·commit, 전역 Git 설정 변경, 관련 없는 코드 수정
- force push, 기존 변경 reset·checkout·삭제, ai/chats/ 읽기

## 테스트 방법
- 이미 완료된 246건 테스트 결과와 현재 코드 불변을 확인하고 전체 테스트는 재실행하지 않는다.
- push 범위·workflow 트리거·비밀값 패턴·상태 파일 불변·git diff --check를 정적으로 확인한다.
- 환경 파일 정적 파싱, 확인된 검색 URL의 순수 형식 검증, 필수/선택 변수별 준비 상태, 권한·Git 제외 확인.
- push 후 원격 main commit과 workflow 파일을 실제 조회해 로컬과 비교한다.

## commit 메시지
- docs(ai): add local runner preparation handoff / 로컬 실행 준비 인수인계 추가
- docs(ai): record local runner preparation / 로컬 실행 준비 결과 기록

## 완료 시
- ai/notes/2026-10-13-codex-report-local-runner-prepare.md를 report 템플릿으로 작성한다.
- CONTEXT.md를 50줄 이내로 갱신하고 최신 handoff/report를 연결한다. 새 설계 결정이 있을 때만 DECISIONS.md에 추가한다.
- 완료 문서를 별도 commit하고 일반 push한다.
- push·원격 예약 중지, 최종 branch/hash/status·동기화, 환경 파일 생성·권한·Git 제외, 변수별 준비 상태, 미실시 운영 작업, 사용자가 로컬에서 입력할 항목과 파일 여는 방법을 보고한다.
