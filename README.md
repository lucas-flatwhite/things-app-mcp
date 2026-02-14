# Things App MCP

An MCP (Model Context Protocol) server for [Things 3](https://culturedcode.com/things/) on macOS. Enables AI assistants like Claude to create, read, update, and manage your tasks directly in Things.

## Features

### Write Operations (Things URL Scheme)

| Tool | Description |
|------|-------------|
| `add-todo` | Create a new to-do with title, notes, dates, tags, checklist, project/area assignment |
| `add-project` | Create a new project with to-dos, notes, dates, tags, area assignment |
| `update-todo` | Update an existing to-do (requires auth-token) |
| `update-project` | Update an existing project (requires auth-token) |
| `show` | Navigate to a list, project, area, tag, or specific to-do |
| `search` | Open the Things search screen |
| `add-json` | Create complex structures via the Things JSON command |

### Read Operations (AppleScript/JXA)

| Tool | Description |
|------|-------------|
| `get-todos` | Get to-dos from a list (Inbox, Today, etc.), project, area, or by tag |
| `get-todo-by-id` | Get a specific to-do by its ID |
| `get-projects` | Get all projects |
| `get-project-by-id` | Get a specific project by its ID |
| `get-areas` | Get all areas |
| `get-tags` | Get all tags |
| `search-todos` | Search to-dos by title/notes content |
| `get-recent-todos` | Get recently modified to-dos |

## Requirements

- **macOS** (required for AppleScript/JXA and `open` command)
- **Things 3** installed
- **Node.js** >= 18
- **Things URL Scheme** enabled (Things > Settings > General > Enable Things URLs)

## Installation

```bash
# Clone and build
git clone <repository-url>
cd things-app-mcp
npm install
npm run build
```

Or install globally:

```bash
npm install -g things-app-mcp
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "things-app-mcp@latest"]
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "things": {
      "command": "npx",
      "args": ["-y", "things-app-mcp@latest"]
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.things]
command = "npx"
args = ["-y", "things-app-mcp@latest"]
startup_timeout_sec = 20
tool_timeout_sec = 120
```

### Gemini CLI

Run the following command to register the MCP server:

```bash
gemini mcp add things npx -y things-app-mcp@latest
```

### Auth Token Configuration

To use `update-todo` and `update-project`, you need your Things auth-token.

**Option 1: Environment Variable (Recommended)**

Set the `THINGS_AUTH_TOKEN` environment variable in your MCP client configuration. This avoids needing to pass the token with every request.

**Claude Desktop:**
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

**Codex (`~/.codex/config.toml`):**
```toml
[mcp_servers.things]
command = "npx"
args = ["-y", "things-app-mcp@latest"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.things.env]
THINGS_AUTH_TOKEN = "your-token-here"
```

**Gemini CLI:**
Set the environment variable in your shell configuration or pass it when running:
```bash
export THINGS_AUTH_TOKEN="your-token-here"
```

**Option 2: Parameter**

If the environment variable is not set, you must pass the token as the `authToken` parameter when calling update tools:

1. Open Things on Mac
2. Go to **Things > Settings > General > Enable Things URLs > Manage**
3. Copy your authorization token
4. Pass it as the `authToken` parameter when calling update tools

## Usage Examples

### Adding a To-Do

```
"Add a to-do called 'Buy groceries' scheduled for today with tags 'Errand'"
```

The AI will call `add-todo` with:
```json
{
  "title": "Buy groceries",
  "when": "today",
  "tags": "Errand"
}
```

### Creating a Project with To-Dos

```
"Create a project called 'Launch Website' in the Work area with to-dos: Design mockups, Build frontend, Deploy"
```

The AI will call `add-project` with:
```json
{
  "title": "Launch Website",
  "area": "Work",
  "todos": "Design mockups\nBuild frontend\nDeploy"
}
```

### Complex Project via JSON

```
"Create a vacation planning project with headings for Travel, Accommodation, and Activities"
```

The AI will call `add-json` with structured JSON data containing nested headings and to-dos.

### Reading To-Dos

```
"What's on my Today list?"
```

The AI will call `get-todos` with `{ "list": "Today" }` and return the structured data.

### Updating a To-Do

```
"Mark the 'Buy groceries' todo as complete"
```

The AI will first search/get the to-do to find its ID, then call `update-todo` with the auth-token.

## Things URL Scheme Reference

This MCP server implements the full [Things URL Scheme v2](https://culturedcode.com/things/support/articles/2803573/):

### Date Formats

| Format | Example | Description |
|--------|---------|-------------|
| Named | `today`, `tomorrow`, `evening`, `anytime`, `someday` | Built-in schedule options |
| Date | `2026-03-15` | Specific date |
| Date + Time | `2026-03-15@14:00` | Date with reminder |
| Natural language | `next friday`, `in 3 days` | English natural language (parsed by Things) |

### Built-in List IDs (for `show` tool)

`inbox`, `today`, `anytime`, `upcoming`, `someday`, `logbook`, `tomorrow`, `deadlines`, `repeating`, `all-projects`, `logged-projects`

### JSON Command Object Types

| Type | Description |
|------|-------------|
| `to-do` | A task with title, notes, when, deadline, tags, checklist-items |
| `project` | A project with title, notes, items (to-dos and headings) |
| `heading` | A section heading within a project |
| `checklist-item` | A checklist item within a to-do |

## Architecture

```
things-app-mcp/
  src/
    index.ts          # MCP server entry point with all tool registrations
    things-url.ts     # Things URL scheme builder (URL construction)
    applescript.ts    # AppleScript/JXA executor (read operations)
  dist/               # Compiled JavaScript output
  package.json
  tsconfig.json
```

### How It Works

- **Write operations** construct `things:///` URLs and open them via macOS `open` command. Things processes the URL and creates/updates items accordingly.
- **Read operations** use JXA (JavaScript for Automation) scripts executed via `osascript` to query the Things database directly and return structured JSON data.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run directly
npm start
```

## License

MIT
