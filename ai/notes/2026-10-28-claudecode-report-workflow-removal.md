# 보고: GitHub Actions workflow 삭제

작성자: claudecode
날짜: 2026-10-28
대상: ai/notes/2026-10-28-claudecode-handoff-workflow-removal.md

## 확인된 원인
- 운영은 Mac launchd로 이전됐고 자동 예약 실행과 Telegram 수신을 사용자가 확인했으므로 GitHub Actions workflow가 더 이상 필요하지 않다.
- 삭제 전 `test/repository-config.test.mjs`가 `.github/workflows/sentinel-o-car.yml`을 모듈 최상위에서 읽고 있었다. 그대로 삭제하면 import 단계에서 ENOENT로 npm test 전체가 실패하고, `local/run.sh`(set -e, 수집 전 npm test)가 매시 17분·47분 실행마다 수집 전에 중단된다. 사용자에게 보고 후 최소 테스트 수정을 허용받았다.

## 변경 파일
- 삭제: .github/workflows/inspect-encar-detail.yml (name: Inspect Encar detail, on: workflow_dispatch, job inspect runs-on: ubuntu-latest)
- 삭제: .github/workflows/sentinel-o-car.yml (name: Sentinel-o-car, on: workflow_dispatch, schedule은 주석 처리 상태, job scrape runs-on: [self-hosted, macOS, ARM64])
- 수정: test/repository-config.test.mjs (74줄 삭제)
- .github 아래에 workflow 외 다른 파일은 없었고, 두 파일 삭제로 .github 디렉터리 자체가 비어 사라졌다.

## 수정 내용
- workflow 파일 읽기(`workflowText`, 19~25행)와 "워크플로는 config의 searchUrlEnv를 Repository Variables로 연결한다" 테스트(459~525행) 제거.
- 제거한 블록에서 workflow와 무관한 유일한 assertion은 `urlEnvironmentNames.length > 0`이며, 이는 기존 "config.json은 root와 profile 계약을 따른다" 테스트의 profiles 비어있지 않음(245행)과 각 profile의 searchUrlEnv 형식·유일성 검증(307~319행)으로 이미 보장된다. 다른 테스트와 assertion은 변경하지 않았다.
- local/run.sh의 npm test 단계와 실패 시 중단 동작은 유지. 운영 코드·package 파일·launchd·상태 파일은 변경하지 않았다.

## 테스트 결과
- 관련 테스트: `node --test test/repository-config.test.mjs` 4 pass / 0 fail (이전 5개, 폐기한 workflow 전용 테스트 1개 감소)
- 전체 테스트: `npm test` 245 pass / 0 fail / 0 skipped (이전 246, 감소분 1개 = 위 workflow 전용 테스트)
- 실행 환경: 로컬. 테스트는 config.json, data/state.json, examples, fixtures만 읽고 네트워크·Telegram·자격 증명을 사용하지 않았다. data/ 변경 없음.

## Git
- branch: main
- commit: edee6a5 (chore: remove GitHub Actions workflows and related tests / GitHub Actions 워크플로 및 관련 테스트 정리). AI 기록 commit은 이 보고서를 포함하므로 hash는 CONTEXT 또는 git log에서 확인.
- Pull Request: 없음 (main 직접 commit)
- GitHub Actions: 실행 없음. workflow 삭제됨.
- push: 이 보고서 작성 시점에는 미수행. 두 번째 commit 이후 일반 push 예정이며 결과는 최종 응답에 보고.
- Secret 이름 목록 조회: 이 보고서 작성 시점에는 미수행. push 이후 gh secret list로 이름만 조회 예정.

## 검증
- 시작 전 git fetch, 작업 트리 clean, 로컬 전용 commit 없음 확인 후 fast-forward pull(d5645c1 → 579d2ee, local/README.md만 변경).
- staged diff가 workflow 2개 삭제와 테스트 변경만 포함함을 확인, git diff --cached --check 통과.
- 삭제 후 .github/workflows에 남은 파일 없음.

## 남은 제한사항
- 공개 문서에 GitHub Actions 실행을 전제로 한 설명이 남아 있으며 이번 작업에서는 수정하지 않았다.
  - README.md: 33, 37, 50, 104, 167, 184, 198, 234, 238, 251, 305, 366, 383, 397행
  - local/README.md: 15, 110, 164, 168, 170행 ("GitHub Actions로 전환" 절 포함)
  - AGENTS.md: 3, 7, 28, 63행 (삭제된 sentinel-o-car.yml 읽기 지시 포함)
  - CODEX_START_PROMPT.md: 5, 8, 19행
  - package.json 6행 description, local/run.sh 3행 주석
- 자기호스팅 러너 서비스, GitHub 계정의 Actions 제한 여부는 이번 작업에서 확인하거나 변경하지 않았다.
- Repository Secrets·Variables 값은 조회·변경하지 않는다.

## 정리
- 임시 파일 또는 workflow 유지/삭제: workflow 2개 삭제 완료, 임시 파일 없음
