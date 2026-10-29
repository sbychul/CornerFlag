<h1 align="center">
  <picture>
    <!-- logo-wordmark.svg is currentColor, which an <img> draws black; GitHub dark theme gets a white copy -->
    <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-white.svg">
    <img src="src-tauri/icons/logo-wordmark.svg" alt="CornerFlag" height="48">
  </picture>
</h1>

<p align="center">바탕화면 구석(Corner)에 꽂는 작은 깃발(Flag).</p>

---

Windows와 macOS 데스크톱용 미니멀 축구 위젯입니다. 클럽을 최대 4개까지 고르세요. 첫 번째 클럽의 진행 중인 경기, 다음 경기 또는 최근 결과가 데스크톱에 머무는 카드에 표시되고, 나머지 클럽은 카드 위나 아래에 얇은 줄로 표시됩니다.

- 17개 리그의 클럽: 유럽 5대 리그(Premier League, LALIGA, Bundesliga, Serie A, Ligue 1), 유럽의 10개 리그(Eredivisie, Liga Portugal, Scottish Premiership, Belgian Pro League, Süper Lig, Austria Bundesliga, Super League Greece, Danish Superliga, Allsvenskan, Eliteserien), Saudi Pro League, MLS
- 모든 공식 대회: 리그, 국내 컵, 슈퍼컵, UEFA. 친선 경기는 제외됩니다.
- 10초마다 실시간 스코어를 갱신하고, 카드에 가장 최근 득점자를 표시
- 카드를 클릭하면 해당 경기를 Google에서 검색합니다. 자세한 내용은 거기서 확인하세요.

## 설치

[Releases](https://github.com/sbychul/CornerFlag/releases/latest)에서 내려받으세요.

- `CornerFlag_x.y.z_x64-setup.exe`: 설치 프로그램
- `CornerFlag-vx.y.z-portable.zip`: 압축을 풀고 `CornerFlag.exe` 실행
- `CornerFlag_x.y.z_aarch64.dmg`: macOS(Apple silicon), Applications로 드래그

WebView2 런타임이 있는 Windows 10/11(Windows 11에는 기본 포함) 또는 Apple silicon Mac이 필요합니다.

macOS에서는 CornerFlag가 Dock 아이콘 없이 메뉴 막대에 상주합니다. 카드는 바탕화면 보기(Show Desktop)와 Mission Control에서도, 모든 Space에서도 데스크톱에 남아 있습니다.

### "Windows의 PC 보호" / "Apple이 확인할 수 없음"

앱에 코드 서명이 되어 있지 않습니다. Windows에서는 처음 실행할 때 SmartScreen 경고가 뜰 수 있습니다. **추가 정보**를 누른 뒤 **실행**을 누르세요. macOS에서는 앱을 한 번 열어 본 뒤 **시스템 설정** → **개인정보 보호 및 보안**에서 **그래도 열기**를 누르세요.

## 사용법

| 동작                                                            | 결과                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 카드나 줄 클릭                                                  | 해당 경기를 Google에서 검색                                                       |
| 카드나 줄 드래그                                                | 줄을 포함해 위젯 이동 (**Lock position**이 켜져 있으면 이동 불가)                 |
| 카드에 마우스 올리기                                            | ↻(모든 클럽 새로고침)와 _More details_ 표시                                       |
| 줄에 마우스 올리기                                              | _More details_ 표시                                                               |
| ⚠에 마우스 올리기 (어느 클럽이든 업데이트가 계속 실패하면 표시) | 이유 표시: 마지막 업데이트 시각, 요청 제한 재시도 시각, 또는 업데이트 필요 가능성 |
| 카드, 줄, 트레이 아이콘 우클릭                                  | 메뉴: Settings, Refresh now, About, Quit (macOS: 메뉴 막대 아이콘 클릭)           |

**Settings**(즉시 적용): 팀(최대 4개: 리그에서 추가하거나 모든 리그에서 검색해 추가, 클릭하면 변경, 드래그하면 순서 변경, 1번이 카드), 다른 팀의 줄을 카드 위/아래 중 어디에 둘지, Windows 시작 시 실행(macOS: 로그인 시 열기), 크기, 투명도, 위치 고정, 12/24시간제.

카드와 각 줄은 다음 순서로 표시합니다. 진행 중인 경기 → 24시간 이내에 시작하는 다음 경기 → 킥오프 후 48시간 동안은 마지막 결과 → 다음 경기. 내 클럽끼리 맞붙는 경기는 목록에서 더 높은 클럽 기준으로 한 번만 표시됩니다.

## 데이터

경기 데이터는 ESPN의 공개되어 있지만 **비공식인** 사이트 API에서 가져옵니다. 예고 없이 바뀌거나 동작하지 않을 수 있습니다. CornerFlag는 **개인적, 비상업적 용도**를 위한 것이며 요청을 가볍게 유지합니다. 클럽당 한 시간에 한 번 확인하고, 클럽이 경기 중일 때만 10초마다 확인합니다. 클럽을 추가할 때마다 그 클럽의 요청이 따로 늘어납니다. [면책 조항](#면책-조항)을 참고하세요.

## 소스에서 빌드

Node.js 24, Rust(stable, Windows는 MSVC), 그리고 사용하는 OS의 [Tauri 사전 요구 사항](https://v2.tauri.app/start/prerequisites/)이 필요합니다.

```bash
npm install
npm run tauri dev     # run with hot reload
npm test              # match-selection, refresh-timing, multi-team and error-backoff checks
npm run tauri build   # Windows: NSIS installer in src-tauri/target/release/bundle/nsis
npm run tauri build -- --bundles dmg   # macOS: dmg in src-tauri/target/release/bundle/dmg
```

릴리스(Windows 설치 프로그램, 포터블 zip, macOS dmg)는 `v*` 태그를 푸시하면 GitHub Actions가 빌드합니다(`.github/workflows/release.yml`). 태그는 `src-tauri/tauri.conf.json`의 `version`과 일치해야 합니다.

## 면책 조항

CornerFlag는 독립적인 무료 오픈 소스 취미 프로젝트입니다. ESPN, The Walt Disney Company, 그 어떤 리그, 대회, 클럽과도 제휴, 승인, 후원 관계가 없습니다.

- ESPN, 클럽 및 대회 이름, 로고 등 상표는 각 소유자에게 있습니다. 팀과 경기를 구별하기 위한 용도로만 표시됩니다. 로고는 실행 중에 ESPN에서 불러오며 앱에 포함해 배포하지 않습니다.
- 경기 데이터는 CornerFlag가 통제할 수 없는 제3자가 제공합니다. 있는 그대로 표시되며, 지연되거나 틀리거나 제공되지 않을 수 있습니다. 베팅 등 어떤 결정에도 의존해서는 안 됩니다.
- 사용이 데이터 제공자의 약관을 준수하는지 확인할 책임은 사용자에게 있습니다. 개인적, 비상업적 목적으로만 사용하세요.
- 권리자로서 변경이나 삭제를 원하시면 [이슈를 열어 주세요](https://github.com/sbychul/CornerFlag/issues). 데이터 소스 사용 중단을 포함해 신속히 따르겠습니다.

## 라이선스

[MIT](LICENSE). 라이선스는 CornerFlag 코드에만 적용되며, 앱이 표시하는 제3자의 데이터, 이름, 로고에는 적용되지 않습니다.
