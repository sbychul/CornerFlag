# 여러 팀 표시 · 새 첫 실행 · Settings Your teams — 구현 명세

Status: needs-triage

팀을 최대 4개까지 고른다. 1번 팀은 지금의 메인 위젯이고, 2~4번 팀의 경기는 메인 위나 아래에 얇은 줄로 붙는다. 첫 실행은 왼쪽 단계 레일이 있는 3단계 창으로, Settings는 리그 드롭다운·그리드 대신 팀 목록으로 바뀐다.

- 시안: Figma [CornerFlag — Widget Design](https://www.figma.com/design/yrP3oyV0Q8jD7d8fnP4nH3) 페이지 Multi-team, First-run, Menu & windows(6~10번, About)
- 기존 명세: [../cornerflag-v1/spec.md](../cornerflag-v1/spec.md). 여기 없는 규칙(경기 선택, 주기, 오류 분류)은 그대로 따른다.
- 결정 근거: 2026-10-28 대화의 질문 1~19

## 1. 데이터 모델

- 설정은 `teams: { id, league, name, short }[]`(최대 4개, 0번이 메인)와 `stack: "above" | "below"`(기본 above)를 갖는다. `name`은 전체 이름(첫 실행 B3용), `short`는 짧은 이름이다.
- 기존 `league`·`teamId`·`team`만 있는 설정은 읽을 때 `teams[0]`으로 옮긴다.
- 경기 캐시, 마지막 성공 시각, 실패 상태는 팀 ID별로 저장한다.
- 줄의 3글자 약어는 ESPN `team.abbreviation`이다.

## 2. 위젯

### 2.1 쌓기

- 줄은 320×44에 간격 6px이다. 팀 1개면 줄이 없다.
- 줄 순서: #2가 메인에 가장 가깝다. Above면 메인 바로 위부터 #2·#3·#4, Below면 메인 바로 아래부터 #2·#3·#4.
- 고른 팀끼리의 경기(같은 경기 ID)는 우선순위가 높은 팀 하나에서만 보인다. 메인 팀 경기면 해당 줄은 숨긴다.
- 메인 카드는 화면에서 제자리에 있다. 줄 개수가 바뀌면(추가·삭제, 맞대결로 숨김, Above/Below 변경) 창의 높이와 y만 바뀌어 줄이 늘고 준다.
- 저장 위치는 메인 카드의 위치다. `keepOnScreen`은 스택 전체를 화면 안에 넣고, 그때만 메인도 움직인다.
- Size·Opacity는 메인과 줄에 같은 비율로 적용된다.

### 2.2 줄 표시

- Figma Multi-team "줄 상태": 경기 전(크게 시각, 작게 날짜), 경기 중(빨간 점 + 시간, 리드 팀 틴트 40%), HT, FT(이긴 팀 색, 무승부는 무채색), 경기 없음(크레스트 + No upcoming matches), 호버(가운데 흐려지고 More details)
- 이번에 추가한 상태:
  - 로딩: 크레스트 없이 `Loading…`
  - 연기: 날짜 자리에 빨간 `Postponed` 배지
  - 승부차기: FT 자리에 `4–3 PEN` 배지(이긴 팀 색)
- 모션(득점, 킥오프, HT, 후반, FT, 리플)은 메인과 같은 시간과 곡선을 쓴다. 같은 갱신에서 온 골은 한꺼번에 재생한다. 캐시로 시작한 뒤 첫 갱신은 메인과 마찬가지로 모션 없이 반영한다.

### 2.3 조작

- 줄을 클릭하면 그 경기를 구글에서 검색한다. 우클릭하면 같은 메뉴가 뜬다. 끌면 스택 전체가 움직이고, Lock position이 적용된다.
- ↻와 Refresh now는 모든 팀을 새로고침한다.
- ⚠와 Update 배지는 메인 머리줄에만 있다. 어느 팀이든 연속 2회 실패하면 ⚠를 띄우고, 툴팁에는 가장 심한 사유를 쓴다(영구 > 요청 제한 > 일시). 줄은 실패해도 마지막 데이터를 유지한다.

## 3. 갱신 루프

- 타이머는 하나다. 팀마다 다음 갱신 시각(`due`)을 따로 두고, 계산은 지금의 `nextDelay`·`backoff`를 그대로 쓴다.
- 타이머가 울리면 `due`가 지금부터 2초 안에 드는 팀을 모두 골라 차례로 요청한다. 같은 tick에서 갱신된 경기 중 팀들은 다음 `due`도 같아져 함께 돈다.
- 다음 타이머는 가장 이른 `due`에 맞춘다.
- 요청은 한 번에 하나만 보낸다. tick 사이는 최소 5초다(`sleep`의 `Math.max(0, ms)` 하한 유지).
- 같은 경기 ID의 scoreboard는 한 tick에 한 번만 요청한다.
- 요청 제한(429·403)은 모든 팀의 요청을 멈춘다. 영구 오류와 일시 오류는 팀별로 처리한다.
- About의 Last updated는 모든 팀 중 가장 오래된 성공 시각이다.
- README의 Data 문단을 고친다. 팀 수만큼 요청이 늘어난다.

## 4. Settings

시안: Menu & windows 6~10번.

- Your teams 목록: 핸들, 번호, 크레스트, 이름과 리그, Main 배지 또는 Row, ✕로 구성된다.
  - 줄을 누르면 Change team 시트가 열리고, ✕를 누르면 목록에서 빠진다.
  - 순서는 끌어서 바꾼다(키보드는 핸들에 포커스한 뒤 Alt+↑/↓). 1번 자리에 놓은 팀이 메인 위젯이 된다.
- 팀이 1개면 핸들과 ✕를 숨기고, Extra teams는 흐린 비활성 상태로 둔다. 힌트는 `Only shown with 2 or more teams.`이다(10번).
- Add team은 `n of 4`로 표시하고, 4개가 되면 숨긴다.
- 팀 선택 시트(7번)
  - 창 안을 덮고 바깥은 어둡게 한다.
  - 구성: 제목(Add team 또는 Change team), 오른쪽 위 ✕, 검색, 리그 드롭다운, 그리드. 뒤로(‹)는 ✕와 겹쳐 보여 두지 않는다.
  - Esc로도 닫힌다.
  - 이미 목록에 있는 팀은 흐리게 보이고 고를 수 없다.
- 검색(8번)
  - 모든 리그에서 찾는다. 처음 입력할 때 리그 17개의 standings를 받아 캐시하고, 실패한 리그는 다음 입력 때 다시 받는다.
  - 결과는 맞은 글자를 굵게, 목록에 있는 팀은 흐리게 + In your teams로 보여 준다.
  - 키보드는 ↑↓, Enter, Esc를 쓴다.
- Widget 섹션은 지금과 같다. 하단 문구는 `Size and opacity apply to the main widget and its rows. Changes apply immediately.`
- 창 높이는 목록 길이에 맞춰 다시 정한다.

## 5. 첫 실행

시안: First-run B1~B4, B3a. 창은 800×680이고, 모든 단계의 오른쪽 위 ✕는 앱을 종료한다.

- B1 Select your team: 검색, 리그 드롭다운, 그리드로 구성된다. Next는 팀을 고르기 전까지 비활성이다.
- B2 Follow more teams?
  - B1에서 Next를 누르면 뜨는 가운데 대화상자다. 추가 팀이 이미 있으면 묻지 않고 B3로 간다.
  - Yes, add teams를 누르면 B3로, No, just one을 누르면 B4로 간다. 이때 레일의 2단계는 회색 체크로 표시한다.
- B3 Add up to 3 more
  - 칸 4개로 이뤄진다. 팀 이름은 전체 이름이고, 크레스트와 Main/Row 글자는 양옆 24px이다.
  - +를 누르면 팀 선택 시트(B3a)가 본문 위에 뜬다. 채운 칸을 누르면 같은 시트가 Change team으로 뜬다.
  - 채운 칸에 호버하면 Main/Row 글자가 사라지고 그 자리에 ✕가 뜬다. 누르면 그 팀이 빠진다. 1번 칸은 B1에서 고른 팀이다.
- B4 Almost done
  - 구성: Your teams 목록(Settings와 같음), Extra teams(팀이 2개 이상일 때만 활성), 실루엣 미리보기, 자동 시작, 시간 형식
  - 미리보기는 줄 개수와 Above/Below를 반영하고, 값을 바꾸면 바로 바뀐다.
  - Back은 2단계를 건너뛰었어도 B3로 간다.
  - Start를 누르면 모두 저장하고 일반 Settings 창으로 돌아간다(지금의 `location.reload()` 흐름).
- 레일의 단계는 클릭으로 이동하지 않는다. Back과 Next로만 이동한다.

## 6. About

- Your team: 메인 팀의 짧은 이름이다. 추가 팀이 있으면 그 수를 붙인다(`Man City +2`).

## 7. 지켜야 할 불변 조건

[docs/bug-history.md](../../docs/bug-history.md)의 표를 그대로 지킨다. 이번 변경과 닿는 것:

- `sleep` 하한, 캐시 시작 직후 첫 갱신은 모션 없음: 팀별 루프로 바꿔도 유지
- 첫 실행 Start는 고른 팀의 리그를 저장: 팀마다 `league`를 함께 저장해 이어감
- 같은 리그를 다시 고르면 실패한 팀 목록을 다시 요청: 시트의 리그 드롭다운에도 적용
- 창 간 설정 전달은 `settings` 이벤트에 값을 실어 보냄: `teams`·`stack` 포함
- macOS 좌표는 포인트로만 계산, 위치는 `keepOnScreen`을 거침: 스택 높이 변경과 메인 고정 계산에도 적용
- 새 표시 항목은 `src/espn.test.mjs`에 케이스를 남긴다(맞대결 중복 제거, tick에서 due 팀 고르기).
