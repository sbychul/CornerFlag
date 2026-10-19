# CornerFlag v1 — 기술 검증 결과

2026-10-19에 [spec.md](spec.md)의 전제를 실제로 확인한 기록이다. 결정 근거가 된 질문은 [qa.md](qa.md)에 있다.

## 0. 환경

- Windows 11 Home 10.0.26200 (25H2), 2880×1800, 화면 배율 175%, 다크 테마, 투명 효과 켜짐
- WebView2 런타임 155.0.4283.62
- Rust 1.99.1 (stable-x86_64-pc-windows-msvc), Tauri v2 (tao 0.37.1), Node v24.21.0
- ESPN API 기본 주소: `https://site.api.espn.com/apis/site/v2/sports/soccer`

## 1. ESPN 응답·오류·요청 제한

### 1.1 정상 응답

| 경로 | 상태 | `Cache-Control` | 원본 크기 | gzip 크기 |
|---|---|---|---|---|
| `/eng.1/scoreboard` | 200 | `max-age=6` | 46,484 B | 5,637 B |
| `/eng.1/teams/382/schedule` | 200 | `max-age=1` | 67,041 B | 4,014 B |
| `/eng.1/summary?event=740000` | 200 | `max-age=10` | 60,743 B | 7,377 B |
| `/all/scoreboard/{eventId}` (경기 1개) | 200 | — | — | 2,197~2,462 B |

- 모든 응답에 `Access-Control-Allow-Origin: *`가 붙는다.
- rate limit 관련 헤더나 `Retry-After`는 없다.

### 1.2 잘못된 요청

| 요청 | 상태 | 본문 | `Cache-Control` |
|---|---|---|---|
| 존재하지 않는 팀 ID `/eng.1/teams/99999999/schedule` | **500** | `{"code":2404,"detail":"http error: not found"}` | `max-age=1` |
| 팀 ID 형식 오류 `/eng.1/teams/abc/schedule` | 400 | `{"code":400,"message":"Bad request for team with value: abc"}` | `max-age=3591` |
| 없는 리그 slug `/xxx.9/scoreboard` | 400 | `{"code":400,"message":"Failed to get events endpoint."}` | `max-age=3591` |
| 없는 리그 slug `/xxx.9/teams/382/schedule` | 400 | — | — |
| 필수 파라미터 누락 `/eng.1/summary` | 400 | `{"code":1,"detail":"general error: invalid URI"}` | `max-age=1` |
| 없는 경기 ID `/eng.1/summary?event=1` | 404 | `{"code":404,"message":"Error invoking GET: ..."}` | — |
| 없는 경로 `/eng.1/nonexistent`, `/apis/site/v9/...` | 404 | `{"code":404}` | — |

- 존재하지 않는 리소스에 500이 오는 경우가 있어서, 상태 코드만으로 일시 오류와 영구 오류를 구분할 수 없다. 본문의 `code`를 함께 봐야 한다.
- 일부 오류 응답은 `Accept-Encoding`을 보내지 않아도 gzip으로 온다. HTTP 클라이언트가 gzip을 풀 수 있어야 한다(브라우저 `fetch`는 자동 처리).

### 1.3 연속 요청

- 캐시되는 경로(`/eng.1/scoreboard`) 30회와 캐시를 우회한 경로(`/eng.1/teams/382/schedule?_=랜덤`) 30회를 순차로 보냈다(초당 약 1.4회). 60회 모두 200이었다.
- 실제 rate limit 값과 429 응답의 형태는 확인하지 못했다. 일부러 일으키려면 대량 요청이 필요해서 하지 않았다. 위젯의 최대 사용량(10초에 1회)은 테스트한 속도의 약 1/14이다.

### 결론
- 10초 갱신은 ESPN 캐시 수명(최대 10초)과 맞는다.
- 오류 분류 정책은 [spec.md](spec.md) 8절대로 간다.

## 2. 대회 통합 일정

| 팀 | 경로 | 경기 수 | 대회별 |
|---|---|---|---|
| Man City (382) | `/eng.1/teams/382/schedule` | 7 | Premier League 7 |
| | `/eng.1/teams/382/schedule?fixture=true` | 31 | Premier League 31 |
| | `/all/teams/382/schedule` | 13 | Premier League 7, UCL 2, Carabao Cup 1, Community Shield 1, Club Friendly 2 |
| | `/all/teams/382/schedule?fixture=true` | 38 | UCL 6, Premier League 31, Carabao Cup 1 |
| Barcelona (83) | `/all/teams/83/schedule` | 14 | LALIGA 9, UCL 2, Trofeo Joan Gamper 1, Club Friendly 2 |
| | `/all/teams/83/schedule?fixture=true` | 36 | UCL 6, LALIGA 29, Spanish Supercopa 1 |
| Bayern (132) | `/all/teams/132/schedule` | 16 | Bundesliga 6, UCL 2, German Cup 1, German SuperCup 1, Club Friendly 6 |
| | `/all/teams/132/schedule?fixture=true` | 35 | UCL 6, Bundesliga 28, German Cup 1 |

- 리그 slug 경로는 그 리그 경기만 준다. `all` 경로라야 모든 대회가 나온다.
- 기본 호출은 종료된 경기, `?fixture=true`는 예정된 경기를 준다. 진행 중인 경기는 `?fixture=true` 쪽에 나온다(3절).
- 응답 순서가 날짜순이 아니다.
- 9개 팀(382, 83, 132, 86, 111, 160, 359, 364, 110)의 일정에서 나온 대회 slug:
  - 리그: `eng.1`, `esp.1`, `ger.1`, `ita.1`, `fra.1`
  - 컵·슈퍼컵: `eng.league_cup`, `eng.charity`, `esp.super_cup`, `ger.dfb_pokal`, `ger.super_cup`, `ita.coppa_italia`, `ita.super_cup`, `fra.super_cup`
  - UEFA: `uefa.champions`, `uefa.europa`, `uefa.super_cup`
  - 친선: `club.friendly`, `friendly.emirates_cup`, `esp.joan_gamper`
- 친선경기를 나타내는 필드는 따로 없다. `esp.joan_gamper`처럼 국가 prefix를 쓰는 친선 트로피도 있어서 slug denylist로 걸러야 한다.

## 3. 득점자 데이터와 실시간 관찰

### 3.1 득점 데이터 구조

`/eng.1/scoreboard?dates=20261017`의 경기 401879259(Ipswich Town at Manchester City, 3–2, 종료)에서 `competitions[0].details[]`를 확인했다.

| `type.text` | `clock.displayValue` | `team.id` | `scoringPlay` | `penaltyKick` | `athletesInvolved[].shortName` |
|---|---|---|---|---|---|
| Goal | 19' | 382 | true | false | P. Foden |
| Goal | 21' | 373 | true | false | D. Maeda |
| Goal - Header | 34' | 382 | true | false | E. Haaland |
| Goal | 69' | 382 | true | false | E. Haaland |
| Yellow Card | 73' | 373 | false | false | A. Ouattara |
| Penalty - Scored | 90' | 373 | true | true | Z. Flemming |

- `ownGoal`, `redCard` 필드도 있다.
- summary의 `keyEvents`에도 같은 정보가 있지만, scoreboard의 `details`만으로 충분하다.
- `/all/scoreboard/{eventId}`는 경기 하나만 돌려주고(`details` 포함), gzip 기준 약 2.3KB다. 10초 갱신이면 시간당 약 0.8MB다.

### 3.2 실시간 관찰

진행 중이던 경기 401876938(Pachuca at Monterrey, `mex.1`)을 2026-10-19 02:20 UTC 무렵부터 약 3분간 10초 간격으로 19회 조회했다.

- 진행 중인 경기는 팀 일정(`/all/teams/220/schedule`)의 종료 경기 목록에는 없고, `?fixture=true` 목록에 `state: in`으로 나왔다.
- 경기 시계 `displayClock`: 0초 `47'`, 31초 `48'`, 83초 `49'`, 145초 `50'`. 약 50~60초마다 1분씩 바뀌었다.
- `status.type.name`이 145초에는 `STATUS_IN_PROGRESS`, 165초에는 `STATUS_SECOND_HALF`로 바뀌었다. 같은 경기 단계인데 조회마다 이름이 흔들리므로 상태 판단은 `status.type.state`로 해야 한다.
- `Cache-Control`은 `max-age` 1, 9, 10이 섞여 나왔다.
- 관찰 동안 골이 없어서 득점이 반영되기까지의 지연은 측정하지 못했다.

## 4. 팀 색

5대 리그 96팀의 `/{slug}/teams` 응답을 분석했다.

- 96팀 모두 `color`와 `alternateColor` 값이 있다.
- 대표 색이 흰색·검정 등 무채색(채도 0.15 미만)인 팀이 23팀(24%)이다: Fulham, Leeds United, Newcastle United, Tottenham Hotspur, Racing Santander, Rayo Vallecano, Real Madrid, Sevilla, Valencia, Borussia Mönchengladbach, Eintracht Frankfurt, FC Augsburg, FC Cologne, RB Leipzig, SV Elversberg, VfB Stuttgart, Juventus, Venezia, AJ Auxerre, Angers, Lyon, Marseille, Paris FC.
- 이 팀들의 `alternateColor`는 맞는 경우(Tottenham `0B1426` 남색)도 있지만 엉뚱한 경우도 있다: Real Madrid `1B4D3E`(진녹색), Juventus `E8A2B0`(분홍), Paris FC는 두 값 모두 `000000`.
- 그래서 보조 색으로 바꾸지 않고 `color`를 그대로 쓰기로 했다 ([qa.md](qa.md) Q36).

## 5. 리그 slug와 팀 목록

| slug | `league.name` | `league.abbreviation` | 팀 수 |
|---|---|---|---|
| `eng.1` | English Premier League | Premier League | 20 |
| `esp.1` | Spanish LALIGA | LALIGA | 20 |
| `ger.1` | German Bundesliga | Bundesliga | 18 |
| `ita.1` | Italian Serie A | Serie A | 20 |
| `fra.1` | French Ligue 1 | Ligue 1 | 18 |

- 시즌은 모두 2026(2026-27).
- 팀 필드: `id`, `displayName`, `shortDisplayName`, `abbreviation`, `color`, `alternateColor`, `logos[]`, `slug` 등. 로고 주소 형식은 `https://a.espncdn.com/i/teamlogos/soccer/500/{id}.png`.
- 구글 검색어의 대회명으로는 `abbreviation`이 적합하다. 다른 대회 예: `UEFA Champions League`, `Carabao Cup`, `German Cup`.

## 6. 바탕화면 고정과 아크릴릭

### 6.1 방법

- 테스트 창 왼쪽 절반은 불투명 마젠타, 오른쪽 절반은 투명하게 만들어 배경 효과가 비치게 했다.
- 실제 Win+D 키 입력을 보낸 뒤 화면을 캡처해서 판정했다.
  - 마젠타가 보이면 창이 화면에 남아 있는 것이다.
  - 오른쪽 절반의 밝기 표준편차(lumSD)가 0이면 단색, 약 1이면 아크릴의 노이즈 질감이 있는 것이다.
- 바탕화면 창 구조(26200): `Progman`의 자식으로 `SHELLDLL_DefView`와 `WorkerW`가 있다(24H2 이후 구조).

### 6.2 고정 방식 비교 (WinForms 프로토타입)

| 방식 | Win+D 후 | DWM 아크릴릭 API 호출 결과 (렌더링은 6.3) |
|---|---|---|
| `WorkerW`의 자식 창 (`SetParent`) | 안 보임 | 실패 `0x80070057` (`E_INVALIDARG`) |
| `SHELLDLL_DefView`의 자식 창 | 보임. 단 아이콘 레이어 위라 아이콘 클릭을 가로챔 | 실패 `0x80070057` |
| 일반 최상위 창 + `HWND_BOTTOM` | 숨겨짐 | 성공 |
| **최상위 창 + 소유자 `Progman` + `HWND_BOTTOM`** | **보임** | 성공 |

### 6.3 아크릴릭 API 비교 (WinForms 프로토타입)

| 창 | API | 상태 | 오른쪽 절반 평균색 | lumSD |
|---|---|---|---|---|
| 항상 위 창 | `DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_TRANSIENTWINDOW)` | 비활성 | (84,84,84) | 0.00 |
| 항상 위 창 | 같음 | 활성 (포그라운드 확인) | (84,84,84) | 0.00 |
| 항상 위 창 | `SetWindowCompositionAttribute(ACCENT_ENABLE_ACRYLICBLURBEHIND)`, 초록 틴트 | 비활성 | (53,124,53) | 1.04 |
| 소유자 Progman 창 | SWCA, 초록 틴트 | Win+D | (47,124,64) | 1.10 |
| 소유자 Progman 창 | DWMSBT | Win+D | (84,84,84) | 0.00 |

- 공식 API인 DWM system backdrop은 이 테두리 없는 창에서 활성·비활성 모두 단색이었다.
- 비공개 API인 SWCA는 비활성 상태와 Win+D 상태에서 모두 아크릴이 렌더링됐다.

### 6.4 Tauri + WebView2 재검증

저장소의 스캐폴드([src-tauri/src/desktop.rs](../../src-tauri/src/desktop.rs))로 창 두 개를 띄웠다. 둘 다 소유자를 Progman으로 지정했고, 아크릴릭만 다르게 했다.

- `CornerFlag`: `desktop::acrylic`(SWCA)
- `CornerFlag DWMSBT`: Tauri 내장 `windowEffects: ["acrylic"]`

| 창 | 상태 | 마젠타(HTML) | 오른쪽 절반 평균색 | lumSD | 다른 창보다 위 |
|---|---|---|---|---|---|
| CornerFlag (SWCA) | 평소 | — | — | — | 아니오 (다른 창에 가려짐) |
| CornerFlag (SWCA) | Win+D | 보임 | (47,124,64) | 1.08 | 예 |
| CornerFlag DWMSBT | Win+D | 보임 | (84,84,84) | 0.00 | 예 |

- 창 크기 240×120(논리 픽셀)은 175% 배율에서 420×210 물리 픽셀로 나왔다.
- WebView2 투명 배경 위로 SWCA 아크릴이 비치고, 그 위에 HTML 요소가 정상적으로 그려졌다.
- Tauri 내장 아크릴릭은 WinForms 결과와 같이 단색이었다. 그래서 SWCA를 직접 호출한다.

### 6.5 활성화와 z-order

| 시나리오 | 결과 |
|---|---|
| Win+D 상태에서 위젯을 실제 마우스로 클릭한 뒤 Win+D로 복귀 | 클릭 시 위젯이 포그라운드가 됨. 복귀 후에는 다시 다른 창 아래로 내려감 (정상) |
| 다른 창에 가려진 위젯을 프로그램에서 `SetForegroundWindow`로 활성화 | 위젯이 다른 창 위로 올라오고, Win+D 왕복 후에도 위에 남음 |

- tao의 `alwaysOnBottom`은 `WM_WINDOWPOSCHANGING`에서 `hwndInsertAfter = HWND_BOTTOM`으로 바꾸지만, 프로그램에서 강제로 활성화하는 경우는 막지 못했다.
- 사용자 클릭으로는 생기지 않는 상황이라 지금은 대응하지 않는다. 위젯을 활성화하는 기능이 생기면 `WS_EX_NOACTIVATE`를 적용한다 ([spec.md](spec.md) 10절).

### 결론
- 고정: 최상위 창 + 소유자 `Progman` + `HWND_BOTTOM` (+ Tauri `alwaysOnBottom`)
- 아크릴릭: SWCA `ACCENT_ENABLE_ACRYLICBLURBEHIND`. 비공개 API라 이후 Windows 업데이트로 깨질 수 있다. 실패하면 CSS 반투명 배경으로 대체한다.
- 설계 초기에 걱정했던 "바탕화면 고정과 아크릴릭이 충돌한다"는 문제는 이 조합으로 해결된다.

### 부수 효과
- 테스트 중 `Progman`에 `0x052C` 메시지를 보내 바탕화면 `WorkerW` 창이 하나 생성됐다. explorer.exe가 재시작될 때까지 남지만 해는 없다.

## 7. 검증하지 못한 것

- explorer.exe 재시작 시 고정 유지 여부 (탐색기 재시작이 필요해서 하지 않음)
- SWCA 아크릴 상태에서 드래그할 때의 성능
- 멀티 모니터, DPI 변경
- Windows 10
- 429 응답의 실제 형태와 rate limit 값
- 골 반영 지연
- 연기된 경기의 상태 값
