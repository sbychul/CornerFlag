# CornerFlag v1 — 기초 설계 명세

Status: needs-triage

바탕화면에 두는 미니멀한 축구 위젯. 응원하는 팀 하나의 직전 경기 결과, 다음 경기, 진행 중인 경기를 카드 한 장으로 보여준다. 자세한 정보는 위젯이 직접 보여주지 않고 구글 검색으로 넘긴다.

- 근거가 된 질문과 답: [qa.md](qa.md) (본문의 `Q#`는 그 문서의 질문 번호)
- 화면·버튼·표시 내용: [design.md](design.md)
- 기술 검증 결과: [verification.md](verification.md)

## 1. 범위

### 포함
- Windows 데스크톱 위젯 1개, 응원 팀 1개.
- 선택 가능한 팀: 유럽 5대 리그(EPL, LALIGA, Bundesliga, Serie A, Ligue 1) 소속 클럽. (Q9)
- 표시하는 경기: 그 팀의 모든 공식 대회 경기(리그, 국내 컵, 슈퍼컵, UEFA 대회). (Q10)

### 제외 (v1 비목표)
- macOS 등 다른 OS (Q1)
- 국가대표팀 (Q11), 친선경기 (Q10)
- 여러 팀 동시 응원
- 토스트 알림 (Q25)
- 한국어 UI·팀명 (Q15, Q16)
- 다른 창에 가려졌을 때의 갱신 중지 (Q33)
- 코드 서명 (Q32)
- 라인업, 순위, 통계 등 상세 정보 (구글 검색으로 대체)

## 2. 플랫폼·스택·배포

| 항목 | 결정 |
|---|---|
| OS | Windows (검증 환경: Windows 11 25H2, 빌드 26200) (Q1) |
| 스택 | Tauri v2, 프런트엔드는 vanilla TypeScript + Vite, 네이티브 처리는 Rust (Q2) |
| 배포 | GitHub Releases에 NSIS `setup.exe`와 포터블 zip을 함께 올림 (Q3) |
| 업데이트 | 설치본: 새 버전을 알리고 클릭하면 Tauri 업데이터로 설치·재시작. zip: 알리고 클릭하면 Releases 페이지를 엶 (Q4) |
| 서명 | 코드 서명 없음. README에 SmartScreen 경고 우회 방법(`추가 정보 → 실행`) 안내 (Q32) |
| 라이선스 | MIT |
| 앱 식별자 | `io.github.sbychul.cornerflag` |

## 3. 첫 실행

첫 실행 때 응원 팀과 Windows 시작 시 실행 여부를 정한다. 화면 구성은 [design.md](design.md) 5절.

응원 팀은 설정에서 바꿀 수 있다. 팀을 바꾸면 캐시를 버리고 즉시 갱신한다.

## 4. 창 동작

- **바탕화면 고정** (Q5): 위젯은 항상 다른 창들 아래에 있고, Win+D(바탕화면 보기)를 눌러도 사라지지 않는다.
  - 구현: 최상위 창의 소유자를 `Progman`으로 지정(`SetWindowLongPtrW(GWLP_HWNDPARENT)`)하고 `HWND_BOTTOM`에 둔다. WorkerW나 DefView의 자식 창으로 붙이는 방식은 쓰지 않는다 ([verification.md](verification.md) 6절).
  - Tauri 창 설정: `decorations: false`, `transparent: true`, `shadow: false`, `resizable: false`, `skipTaskbar: true`, `alwaysOnBottom: true`.
- **위치** (Q6): 드래그로 옮기고 위치를 기억한다. 저장된 위치가 화면 밖이면(해상도·모니터 변경) 기본 위치로 되돌린다. 설정에 위치 잠금 옵션이 있다 (Q27).
- **메뉴** (Q7, Q66, Q68): 위젯 우클릭과 트레이 아이콘 우클릭에 같은 드롭다운 메뉴를 띄운다. 항목과 모양은 [design.md](design.md) 3.1절.
  - Windows 기본 트레이 메뉴는 모양을 바꿀 수 없으므로, 메뉴는 별도의 프레임리스 팝업 창(투명, 작업 표시줄에 안 보임, 항상 위)으로 만든다. 포커스를 잃으면 닫는다.
  - 메뉴 창을 활성화해도 위젯 창은 활성화하지 않는다. 위젯이 다른 창 위로 올라오지 않게 하려는 것이다(10절).
- **배경** (Q26, Q29): 블러 없이 CSS 반투명 배경만 쓴다. 투명 창이라 잘린 모서리로 바탕화면이 그대로 보인다. 처음엔 비공개 API `SetWindowCompositionAttribute`(`ACCENT_ENABLE_ACRYLICBLURBEHIND`) 아크릴릭으로 구현했으나(2026-10-19) 다음 문제로 뺐다: 아크릴릭이 창 사각형 전체에 칠해져 잘린 모서리가 투명하지 않음, 뒤가 거의 비치지 않아 투명도 설정이 티가 안 남, 모서리를 자르려고 넣은 window region(`SetWindowRgn`) 때문에 활성화·드래그 때 Windows 기본 캡션이 그려짐(tao가 프레임리스 창에도 `WS_CAPTION`을 남김). Tauri 내장 `windowEffects: ["acrylic"]`은 비활성 창에서 단색이라 처음부터 제외 ([verification.md](verification.md) 6절).
- 앱은 하나만 실행된다 (single-instance).

## 5. 표시 규칙

### 5.1 어떤 경기를 보여줄지

아래 순서로 처음 해당하는 경기 하나만 보여준다 (Q22).

1. 진행 중인 경기가 있으면 → 실시간 카드
2. 다음 경기의 킥오프가 24시간 이내면 → 다음 경기
3. 직전 경기의 킥오프로부터 48시간이 지나지 않았으면 → 직전 결과
4. 다음 경기가 있으면 → 다음 경기
5. 아무것도 없으면 → `No upcoming matches` (Q30)

- 48시간과 24시간은 모두 킥오프 시각 기준이다.
- 다음 경기가 연기되면 원래 킥오프 시각까지 `Postponed` 배지와 함께 보여주고, 그 뒤에는 다음 경기로 넘어간다 (Q20).

각 상태에서 카드에 무엇을 표시하는지, 색을 어떻게 칠하는지는 [design.md](design.md) 2절.

### 5.2 구글 검색

카드를 클릭하면 기본 브라우저로 구글 검색을 연다 (Q23).

- 검색어: `{대회명} {홈팀} vs {원정팀} {YYYY-MM-DD}`. 날짜는 킥오프의 UTC 날짜다 (Q28).
- 팀명은 ESPN `displayName`이다. 카드에 표시하는 `shortDisplayName`은 검색어에 쓰지 않는다 (Q49).
- 예: `Premier League Manchester City vs Arsenal 2026-10-18`.

## 6. 데이터 소스 (ESPN 비공식 API)

기본 주소: `https://site.api.espn.com/apis/site/v2/sports/soccer`

| 용도 | 경로 | 비고 |
|---|---|---|
| 리그별 팀 목록 (첫 실행, 설정) | `https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings` | slug: `eng.1`, `esp.1`, `ger.1`, `ita.1`, `fra.1`. `/{slug}/teams`는 CORS 헤더가 없어 WebView에서 못 부른다(2026-10-19 확인). standings에는 `color`와 dark 로고가 없어서, 로고는 `500-dark/{id}.png` 주소 규칙(없으면 `500/`)을, 선택한 팀의 색은 그 팀 일정 응답의 `team.color`를 쓴다 |
| 직전 결과 | `/all/teams/{teamId}/schedule` | 모든 대회의 종료된 경기 |
| 다음 경기, 진행 중인 경기 | `/all/teams/{teamId}/schedule?fixture=true` | 예정 + 진행 중 경기 |
| 실시간 갱신 | `/all/scoreboard/{eventId}` | 경기 1개, 압축 약 2.3KB. `details[]`에 득점 정보 |

- 경로에 리그 slug 대신 `all`을 써야 모든 대회 경기가 나온다.
- 응답의 경기 순서는 날짜순이 아니므로 직접 정렬한다.
- 친선경기는 `event.league.slug`로 걸러낸다: `club.friendly`, `friendly.*`, `esp.joan_gamper`. 처음 보는 프리시즌 트로피 slug는 걸러지지 않을 수 있어 프리시즌마다 점검한다.
- 경기 상태는 `status.type.state`(`pre` / `in` / `post`)로 판단한다. `status.type.name`은 진행 중에 `STATUS_SECOND_HALF`와 `STATUS_IN_PROGRESS` 사이를 오가므로 상태 판단에 쓰지 않는다.
- 일정·scoreboard·standings 응답에는 `Access-Control-Allow-Origin: *`가 붙어 있어 WebView에서 `fetch`로 바로 호출할 수 있다. `/{slug}/teams`, `/{slug}/teams/{id}`에는 없다.

## 7. 갱신 정책

### 7.1 주기

| 상황 | 주기 | 호출 |
|---|---|---|
| 평소 | 1시간 | 직전 결과 + 다음 경기 목록 |
| 킥오프 5분 전부터 경기 시작 전까지 | 1분 | 해당 경기 `scoreboard/{eventId}` |
| 진행 중 (`state == in`, 하프타임·연장·승부차기 포함) | 10초 | 해당 경기 `scoreboard/{eventId}` |
| 경기 종료 (`state == post`) | 즉시 1회 후 평소로 | 직전 결과 + 다음 경기 목록 |

- 평소 상태의 다음 갱신 시각은 "지금 + 1시간"과 "다음 킥오프 − 5분" 중 이른 쪽이다.
- 킥오프가 늦어지면 경기가 시작할 때까지 1분 간격을 유지한다. 킥오프 2시간 뒤까지 시작하지 않으면(연기 등) 평소 주기로 돌아간다 (Q19).

### 7.2 중지와 재개

- 화면 잠금(Win+L)이나 모니터가 꺼진 동안에는 갱신을 멈춘다 (Q33).
- 재개 이벤트(잠금 해제, 모니터 켜짐, 절전 복귀, 네트워크 복구)가 오면, 마지막 성공 갱신이 현재 주기보다 오래됐을 때만 즉시 갱신한다 (Q34).

### 7.3 요청 제한

- 동시에 나가는 요청은 1개로 제한한다.
- 수동 새로고침을 포함해 갱신 사이에 최소 5초 간격을 둔다. 한 번의 갱신(일정 2개 + scoreboard 1개)은 요청을 차례로 바로 보낸다. 요청마다 5초를 두면 수동 새로고침 한 번이 10초 넘게 걸린다. 수동 새로고침 버튼은 5초 쿨다운이 있다.
- ESPN 캐시(`Cache-Control: max-age`)가 최대 10초라서 10초보다 자주 요청해도 새 데이터가 오지 않는다.

## 8. 오류 처리 (Q31, Q35)

HTTP 상태 코드만으로는 분류할 수 없다. 존재하지 않는 팀 ID에 `500`과 본문 `{"code":2404}`가 오기 때문에 응답 본문의 `code`도 함께 본다.

| 분류 | 조건 | 재시도 |
|---|---|---|
| 일시 오류 | 네트워크 오류, 타임아웃(10초), 5xx (본문 `code: 2404` 제외) | 10초부터 2배씩, 최대 5분. 성공하면 원래 주기로 |
| 요청 제한 | `429`, `403` | `Retry-After`가 있으면 따르고, 없으면 1분부터 2배씩 최대 1시간. 이 동안 수동 새로고침 비활성, 툴팁에 다음 시도 시각 |
| 영구 오류 | `400`, `404`, `500` + `code: 2404`, 응답 파싱 실패, 필수 필드 누락 | 1시간 간격. 툴팁 `Data unavailable — update may be required`, 업데이트 확인 1회 실행 |

공통:
- 화면에는 마지막으로 받은 데이터를 그대로 둔다. 데이터는 디스크에도 캐시해서 재시작 직후에도 바로 보여준다.
- 연속 2회 실패하면 ⚠를 표시한다. 표시 내용은 [design.md](design.md) 4절.

## 9. 설정과 저장

설정 항목은 [design.md](design.md) 6절. 응원 팀은 리그 slug와 팀 ID로 저장한다.

설정, 창 위치, 마지막 경기 캐시는 WebView의 `localStorage`에 JSON으로 저장한다(실제 파일은 `%LOCALAPPDATA%\io.github.sbychul.cornerflag\EBWebView\`). 모든 창이 같은 WebView2 프로필을 써서 별도 파일 I/O나 Rust 명령 없이 공유된다. (설계 초기에 `%APPDATA%` JSON 파일로 적었던 것을 구현 때 바꿈)

## 10. 미결·후속 검증

- explorer.exe가 재시작되면 Progman이 새로 만들어진다. `TaskbarCreated` 메시지를 받아 소유자를 다시 지정해야 할 것으로 보이며, 검증이 필요하다.
- 프로그램에서 위젯을 강제로 활성화하면(`SetForegroundWindow`) 다른 창 위로 올라온다. 사용자 클릭으로는 생기지 않았다. 위젯에 활성화를 일으키는 동작을 넣게 되면 `WS_EX_NOACTIVATE`를 적용한다. 우클릭 메뉴 팝업을 띄우고 닫을 때 위젯 z-순서가 바뀌지 않는지 검증이 필요하다.
- 멀티 모니터, DPI 변경 시 위치 복원.
- Windows 10 지원 여부 (미검증).
- 골이 실제보다 얼마나 늦게 반영되는지 (미측정).
- 연기된 경기의 실제 상태 값 (`STATUS_POSTPONED` 예상, 실제 데이터로 확인 필요).
- 업데이트 (Q4): 지금은 설치본·zip 모두 zip 방식이다. About을 열 때(최대 1시간에 1회) GitHub `releases/latest` 태그와 앱 버전을 숫자 비교해 `Up to date` / `Update available: vX` + `Download ↗`(Releases 페이지)를 보여준다. 확인 실패는 `Couldn't check for updates`. 설치본 자동 설치(Tauri updater)는 업데이터 서명키 보관 방식을 정한 뒤에 한다. 위젯 위 업데이트 표시는 모양 미정(design 9절)이라 없다. 릴리스 CI: `.github/workflows/release.yml`, `v*` 태그 → draft release에 NSIS 설치본 + 포터블 zip.
- 앱이 설치본인지 zip인지 구분하는 방법 (업데이트 동작이 다름).
