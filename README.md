# Things App MCP

**English** | [한국어](README.ko.md)

MCP server for [Things 3](https://culturedcode.com/things/) on macOS. An assistant can add, read, and update to-dos through the Things URL scheme and JXA.

It runs on your Mac over stdio.

## Requirements

- macOS
- [Things 3](https://culturedcode.com/things/)
- Node.js 18 or newer
- Things URLs turned on: **Things > Settings > General > Enable Things URLs**
- Automation permission for whichever app starts the server (Terminal, Claude, Cursor, or Codex). `osascript` has to be allowed to control Things.

## Install

```bash
git clone https://github.com/lucas-flatwhite/things-app-mcp.git
cd things-app-mcp
npm install
npm run build
```

You can also skip the clone and let the client run `npx -y things-app-mcp@latest`. The configs below do that.

## Connect a client

Adding and reading to-dos works without a token. Changing an existing item, or applying a reschedule, needs the Things auth token.

In Things: **Settings > General > Enable Things URLs > Manage**.

Set `THINGS_AUTH_TOKEN` in the client config. If you pass `authToken` on each call, that token lands in the client log. Replies strip the token, notes, and JSON `data`. The URL given to `open` still has the token for a moment. Things expects it there.

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

For a local build, use `node` and the absolute path to `dist/index.js` instead of `npx`.

## Tools

### Writing

| Tool | Description |
|------|-------------|
| `add-todo` | New to-do: title, notes, when, deadline, tags, checklist, project, or area. |
| `add-project` | New project. Put to-do titles in `todos`, one per line. |
| `update-todo` | Change a to-do by id, including completing or canceling it. Needs the token. |
| `update-project` | Change a project by id. Needs the token. |
| `show` | Open a list, project, area, tag, or to-do in Things. |
| `search` | Open Things search. |
| `add-json` | Nested projects, headings, to-dos, and checklist items. Updates need the token. |

When a write succeeds, macOS has opened the URL. Read the item again if you need to see that Things saved it. `add-todo` does not return the new id.

### Reading

| Tool | Description |
|------|-------------|
| `get-todos` | To-dos from one list, project, area, or tag. |
| `get-todo-by-id` | One to-do by id. |
| `get-projects` | Every project. |
| `get-project-by-id` | One project by id. |
| `get-areas` | Every area. |
| `get-tags` | Every tag. |
| `search-todos` | To-dos whose title or notes contain the query. |
| `get-recent-todos` | To-dos changed in the last N days. Default is 7. |

Call `get-todos` with one of `list`, `project`, `area`, or `tag`. If you leave them all out, you get Today.

Lists: `Inbox`, `Today`, `Anytime`, `Upcoming`, `Someday`, `Logbook`.

Results include titles and notes.

### Clearing Today

`reschedule-distant-todos` looks through Today for open items whose deadline is still far off, and moves the start date to a few days before that deadline.

No arguments means preview only, and only when a token is set. To apply:

```json
{
  "daysThreshold": 7,
  "bufferDays": 3,
  "dryRun": false,
  "confirm": true
}
```

- `daysThreshold` (default 7): a closer deadline stays in Today.
- `bufferDays` (default 3): new start date, this many days before the deadline.
- An item you put on today yourself (`activationDate` is today) stays where it is.
- `dryRun: false` without `confirm: true` returns an error and leaves Today unread.
- `confirm` is just an argument. A client that honors `destructiveHint` can still ask before it runs.
- The update is one JSON batch.

`update-todo`, `update-project`, and updates through `add-json` do not take `confirm`. With the token set, those calls can edit or complete items.

## Examples

Add a to-do:

```json
{
  "title": "Buy groceries",
  "when": "today",
  "tags": "Errand"
}
```

Create a project and its to-dos:

```json
{
  "title": "Launch Website",
  "area": "Work",
  "todos": "Design mockups\nBuild frontend\nDeploy"
}
```

Read Today:

```json
{ "list": "Today" }
```

Read one project:

```json
{ "project": "Launch Website" }
```

Complete a to-do once you have its id:

```json
{
  "id": "the-todo-id",
  "completed": true
}
```

Preview a reschedule, then apply it:

```json
{ "dryRun": true }
```

```json
{ "dryRun": false, "confirm": true }
```

## Dates, lists, and JSON

Write tools follow the [Things URL scheme](https://culturedcode.com/things/support/articles/2803573/).

### When and deadline

| Format | Example |
|--------|---------|
| Named | `today`, `tomorrow`, `evening`, `anytime`, `someday` |
| Date | `2026-03-15` |
| Date and time | `2026-03-15@14:00` |
| Natural language | `next friday`, `in 3 days` (Things reads these in English) |

### `show` list ids

`inbox`, `today`, `anytime`, `upcoming`, `someday`, `logbook`, `tomorrow`, `deadlines`, `repeating`, `all-projects`, `logged-projects`

### `add-json` types

| Type | What it is |
|------|------------|
| `to-do` | A task: title, notes, when, deadline, tags, checklist items. |
| `project` | A project: title, notes, nested items. |
| `heading` | A section in a project. |
| `checklist-item` | One line in a to-do. |

To update, set `"operation": "update"` and `"id"`. That needs the auth token.

## Layout

```
src/index.ts            MCP tools
src/things-url.ts       things:/// URLs, and stripping secrets from replies
src/applescript.ts      JXA reads
src/reschedule-mode.ts  preview versus apply
```

Writes build a `things:///` URL and hand it to `open`. Reads run JXA with `osascript`.

## Development

```bash
npm install
npm run build
npm run dev    # tsc --watch
npm start      # node dist/index.js
```

## Testing

See [TESTING.md](TESTING.md).

```bash
# No Things required.
node scripts/test-unit.js

# macOS and Things 3. Writes stay off.
npm run test:tools

THINGS_MCP_TEST_ALLOW_WRITES=1 npm run test:tools
```

One case in the unit script reads Today when Things is installed. Skip it with:

```bash
THINGS_UNIT_SKIP_LIVE=1 node scripts/test-unit.js
```

## License

MIT
