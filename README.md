# Things App MCP

**English** | [한국어](README.ko.md)

MCP server for [Things 3](https://culturedcode.com/things/) on macOS. It adds, reads, and updates to-dos through the Things URL scheme and JXA, and `npm run sync` copies the Today list into a Notion database.

The server talks to the client over stdio on your Mac.

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
- `confirm` is a tool argument. A client that reads `destructiveHint` may ask again before it runs.
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
src/notion-sync.ts      `npm run sync`, separate from the MCP server
src/notion-sync/        plan, Notion client, Things read and write
```

Writes build a `things:///` URL and hand it to `open`. Reads run JXA through `osascript`.

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

# Sync plan, hashes, and the Notion client. No network and no Things.
npm run test:sync

# macOS and Things 3. Writes stay off.
npm run test:tools

THINGS_MCP_TEST_ALLOW_WRITES=1 npm run test:tools
```

One case in the unit script reads Today when Things is installed. Skip it with:

```bash
THINGS_UNIT_SKIP_LIVE=1 node scripts/test-unit.js
```

## Notion sync

`npm run sync` copies the Things **Today** list into Notion database `9ac2752989a646918bfa93ab900dfb8c`. That list is whatever Things is showing under Today: items for today, this evening, and overdue items still sitting there. Inbox, Upcoming, Anytime, and Someday are left as they are.

You start each run yourself.

### Setup

Put the Notion token in the macOS keychain. Every run reads it from there.

```bash
security add-generic-password -s things-notion-sync -a "$USER" -w
```

Set `THINGS_AUTH_TOKEN` when the plan changes a Things to-do. A run that only creates or edits Notion rows can go without it.

If a column is missing, the dry-run exits 2 and prints a database patch. This command adds the missing columns and then writes the plan:

```bash
npm run sync -- --apply --ensure-schema
```

`시작일` is the calendar formula. A missing column, or a column of some other type, prints a warning and the sync continues. Paste this into Notion:

```
if(test(prop("언제"), "^\d{4}-\d{2}-\d{2}"), parseDate(slice(prop("언제"), 0, 10)), parseDate(""))
```

### Run

```bash
npm run build
npm run sync                  # print the plan
npm run sync -- --apply       # write it
```

The table columns are `action`, `things_id`, `title`, `fields`, and `detail`. With nothing to do, the command prints `변경 없음`. The same text is appended to `~/Library/Logs/things-notion-sync.log`, with ids, actions, and field names. Tokens and note text are stripped first.

### Columns

| Column | What the sync does |
|--------|--------------------|
| 제목, 메모, 마감일, 태그 | Copied both ways while the to-do is in Today. |
| 언제 | Copied both ways for `오늘`, `오늘 저녁`, and a date on or before today. `받은함`, `언제든`, `언젠가`, and a later date stay on the Notion row. |
| 상태 | `열림`, `완료`, or `취소`, both ways, while the to-do is in Today. |
| 시작일 | Shown on a calendar. The sync skips this column. |
| 프로젝트, 프로젝트 id, 영역, 영역 id | Filled from the Things to-do. |
| things_id | Things id for the row. The next run finds the row with this. |
| 동기화 해시 | Field hashes from the last write. The next run compares against this. Edit the hash and a later `완료` can be overwritten by the old Things status. |
| 마지막 동기화 | When that write happened. |

A tag name Things has never seen is dropped. Checklists, headings, and repeat rules stay in Things. A repeat that is in Today is copied like any other to-do. If Things ignores a when or deadline change, that Things value is written back to the row.

### Marking a to-do done

On the Notion page, set `상태` to `완료`. Leave `things_id` and `동기화 해시` alone. Then run `npm run sync -- --apply` while the to-do is still in Today, and Things completes it. The same works the next day if it is still in Today when you run the command. `취소` cancels the to-do. `열림` opens it again.

After Things completes it, the to-do leaves Today and the row stays `완료`. The next run fills any other differing fields from Things. From then on, edits to that row stay in Notion.

A new Notion row with an empty `언제`, or with `오늘` or `오늘 저녁`, is added to Today when you apply.

### Deleting rows

Rows are matched by `things_id`. Delete an `열림` row while its to-do is still in Today, and the next run creates the row again. The to-do stays open.

Finished rows can stay in the database. A completed to-do has left Today, so that row is left alone. A row can also be deleted after its to-do moves to Inbox, Anytime, Upcoming, or Someday. It comes back if the to-do returns to Today.

## License

MIT
