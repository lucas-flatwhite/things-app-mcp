# Testing Things MCP Server

This project includes a simple test script to verify the MCP server and its connection to Things 3.

## Prerequisites

- Node.js installed
- Things 3 running on macOS
- Project built (`npm run build`)

## Running the Test Script

A script is available at `scripts/test-client.js`. It does the following:
1. Starts the MCP server.
2. Lists all available tools.
3. Calls `get-projects` to fetch projects from Things (verifying AppleScript integration).

To run it:

```bash
node scripts/test-client.js
```

For broader coverage across all exposed tools, run:

```bash
npm run test:tools
```

By default this runs non-destructive checks and skips write-tool end-to-end calls.
To include write-tool tests (`add-todo`, `add-project`, `add-json`), set:

```bash
THINGS_MCP_TEST_ALLOW_WRITES=1 npm run test:tools
```

`update-todo` and `update-project` require `THINGS_AUTH_TOKEN` plus target IDs for success-path tests:

```bash
THINGS_AUTH_TOKEN=... \
THINGS_MCP_TEST_TODO_ID=... \
THINGS_MCP_TEST_PROJECT_ID=... \
npm run test:tools
```

## Expected Output

You should see output similar to:

```
Starting server at: .../dist/index.js
...
--- Found 15 tools ---
- add-todo: ...
...
--- Testing "get-projects" (Read-Only) ---
...
Found 35 projects.
```

## Manual Testing

You can also use an MCP Inspector (like the one in Claude Desktop or separate tools) to connect to the server.

Configuration for MCP Clients:

```json
{
  "mcpServers": {
    "things": {
      "command": "node",
      "args": ["/path/to/things-app-mcp/dist/index.js"]
    }
  }
}
```
