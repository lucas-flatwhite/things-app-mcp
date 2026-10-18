# Things App MCP

[English](README.md) | **한국어**

macOS용 [Things 3](https://culturedcode.com/things/) MCP 서버입니다. Things URL과 JXA로 할 일을 추가하고, 읽고, 고칩니다.

이 Mac에서 stdio로 연결됩니다.

## 필요한 것

- macOS
- [Things 3](https://culturedcode.com/things/)
- Node.js 18 이상
- Things URL 켜기: **Things > 설정 > 일반 > Things URL 활성화**
- 서버를 실행하는 앱의 자동화 권한. 터미널, Claude, Cursor, Codex 중 실제로 띄우는 앱입니다. `osascript`가 Things를 제어할 수 있어야 합니다.

## 설치

```bash
git clone https://github.com/lucas-flatwhite/things-app-mcp.git
cd things-app-mcp
npm install
npm run build
```

클론하지 않고 클라이언트가 `npx -y things-app-mcp@latest`를 실행하게 해도 됩니다. 아래 설정이 그 방식입니다.

## 클라이언트에 붙이기

할 일을 만들거나 읽는 데는 토큰이 필요 없습니다. 있는 항목을 고치거나, 미룬 일정을 실제로 적용할 때는 Things 인증 토큰이 필요합니다.

Things에서 **설정 > 일반 > Things URL 활성화 > 관리**.

`THINGS_AUTH_TOKEN`에 넣어 두세요. 호출마다 `authToken`으로 넘기면 클라이언트 로그에 토큰이 남습니다. 응답에서는 토큰, 메모, JSON `data`를 지웁니다. `open`에 넘기는 URL에는 토큰이 잠깐 들어 있습니다. Things가 그 형태로 받습니다.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "things-app-mcp@latest"],
      "env": {
        "THINGS_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json`

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "things-app-mcp@latest"],
      "env": {
        "THINGS_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Codex

`~/.codex/config.toml`

```toml
[mcp_servers.things]
command = "npx"
args = ["-y", "things-app-mcp@latest"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.things.env]
THINGS_AUTH_TOKEN = "your-token-here"
```

### Gemini CLI

```bash
export THINGS_AUTH_TOKEN="your-token-here"
gemini mcp add things npx -y things-app-mcp@latest
```

로컬 빌드를 쓰려면 `npx` 대신 `node`와 `dist/index.js`의 절대 경로를 지정합니다.

## 도구

### 쓰기

| 도구 | 설명 |
|------|------|
| `add-todo` | 할 일을 만듭니다. 제목, 메모, when, deadline, 태그, 체크리스트, 프로젝트, 영역. |
| `add-project` | 프로젝트를 만듭니다. `todos`에 할 일 제목을 한 줄에 하나씩 넣습니다. |
| `update-todo` | id로 할 일을 고칩니다. 완료와 취소도 여기 포함됩니다. 토큰이 필요합니다. |
| `update-project` | id로 프로젝트를 고칩니다. 토큰이 필요합니다. |
| `show` | Things에서 목록, 프로젝트, 영역, 태그, 할 일을 엽니다. |
| `search` | Things 검색을 엽니다. |
| `add-json` | 프로젝트, 헤딩, 할 일, 체크리스트를 묶어서 만들거나 고칩니다. 수정에는 토큰이 필요합니다. |

쓰기가 성공하면 macOS가 URL을 연 것입니다. Things에 저장됐는지는 다시 읽어 보면 됩니다. `add-todo`는 새 id를 돌려주지 않습니다.

### 읽기

| 도구 | 설명 |
|------|------|
| `get-todos` | 목록, 프로젝트, 영역, 태그 중 한 곳의 할 일. |
| `get-todo-by-id` | id로 할 일 하나. |
| `get-projects` | 프로젝트 전부. |
| `get-project-by-id` | id로 프로젝트 하나. |
| `get-areas` | 영역 전부. |
| `get-tags` | 태그 전부. |
| `search-todos` | 제목이나 메모에 검색어가 들어 있는 할 일. |
| `get-recent-todos` | 최근 N일 동안 바뀐 할 일. 기본은 7일입니다. |

`get-todos`에는 `list`, `project`, `area`, `tag` 중 하나를 넘기세요. 아무것도 없으면 Today를 가져옵니다.

목록 이름: `Inbox`, `Today`, `Anytime`, `Upcoming`, `Someday`, `Logbook`.

결과에는 제목과 메모가 들어 있습니다.

### Today에서 빼기

`reschedule-distant-todos`는 Today에서 마감이 아직 먼 할 일을 찾아, 시작일을 마감 며칠 전으로 바꿉니다.

인자 없이 부르면 미리보기만 합니다. 토큰이 있어야 Today를 읽습니다. 실제로 옮기려면 이렇게 보냅니다.

```json
{
  "daysThreshold": 7,
  "bufferDays": 3,
  "dryRun": false,
  "confirm": true
}
```

- `daysThreshold` (기본 7): 마감이 이보다 가까우면 Today에 둡니다.
- `bufferDays` (기본 3): 새 시작일은 마감에서 이 일수만큼 앞입니다.
- 오늘로 직접 올려 둔 항목은 그대로 둡니다. `activationDate`가 오늘인 경우입니다.
- `confirm: true` 없이 `dryRun: false`만 보내면 오류가 나고, Today는 읽지 않습니다.
- `confirm`은 호출 인자입니다. `destructiveHint`를 보는 클라이언트는 실행 전에 한 번 더 물을 수 있습니다.
- 변경은 JSON 배치 한 번으로 나갑니다.

`update-todo`, `update-project`, `add-json`의 수정은 `confirm`을 받지 않습니다. 토큰이 있으면 그 호출로 항목을 고치거나 완료할 수 있습니다.

## 예시

할 일 추가:

```json
{
  "title": "Buy groceries",
  "when": "today",
  "tags": "Errand"
}
```

프로젝트와 할 일을 함께 만들기:

```json
{
  "title": "Launch Website",
  "area": "Work",
  "todos": "Design mockups\nBuild frontend\nDeploy"
}
```

Today 읽기:

```json
{ "list": "Today" }
```

프로젝트 하나 읽기:

```json
{ "project": "Launch Website" }
```

id를 알고 있을 때 완료 처리:

```json
{
  "id": "the-todo-id",
  "completed": true
}
```

일정을 미리 보고 적용:

```json
{ "dryRun": true }
```

```json
{ "dryRun": false, "confirm": true }
```

## 날짜, 목록, JSON

쓰기 도구는 [Things URL scheme](https://culturedcode.com/things/support/articles/2803573/)을 사용합니다.

### when, deadline

| 형식 | 예시 |
|------|------|
| 이름 | `today`, `tomorrow`, `evening`, `anytime`, `someday` |
| 날짜 | `2026-03-15` |
| 날짜와 시각 | `2026-03-15@14:00` |
| 자연어 | `next friday`, `in 3 days` (Things가 영어로 읽습니다) |

### `show`에 쓰는 목록 id

`inbox`, `today`, `anytime`, `upcoming`, `someday`, `logbook`, `tomorrow`, `deadlines`, `repeating`, `all-projects`, `logged-projects`

### `add-json` 종류

| 종류 | 내용 |
|------|------|
| `to-do` | 할 일. 제목, 메모, when, deadline, 태그, 체크리스트. |
| `project` | 프로젝트. 제목, 메모, 하위 항목. |
| `heading` | 프로젝트 안의 구역. |
| `checklist-item` | 할 일의 체크 항목 하나. |

고칠 때는 `"operation": "update"`와 `"id"`를 넣습니다. 토큰이 필요합니다.

## 파일

```
src/index.ts            MCP 도구
src/things-url.ts       things:/// URL, 응답에서 토큰 제거
src/applescript.ts      JXA로 읽기
src/reschedule-mode.ts  미리보기와 적용을 나눔
```

쓰기는 `things:///` URL을 만들어 `open`으로 엽니다. 읽기는 `osascript`로 JXA를 실행합니다.

## 개발

```bash
npm install
npm run build
npm run dev    # tsc --watch
npm start      # node dist/index.js
```

## 테스트

자세한 내용은 [TESTING.md](TESTING.md)에 있습니다.

```bash
# Things 없이 실행됩니다.
node scripts/test-unit.js

# macOS와 Things 3이 필요합니다. 쓰기는 하지 않습니다.
npm run test:tools

THINGS_MCP_TEST_ALLOW_WRITES=1 npm run test:tools
```

단위 테스트 중 하나는 Things가 설치돼 있으면 Today를 읽습니다. 건너뛰려면:

```bash
THINGS_UNIT_SKIP_LIVE=1 node scripts/test-unit.js
```

## 라이선스

MIT
