# Testing Things MCP Server

This project includes two test suites with different purposes and requirements.

## Test Suites Overview

| Script | Requires macOS? | Requires Things 3? | Coverage |
|--------|----------------|---------------------|----------|
| `scripts/test-unit.js` | No | No | Date utils, URL builders, reschedule logic, edge cases (122 tests) |
| `scripts/test-all-tools.js` | Yes | Yes | All 16 MCP tools via protocol, end-to-end |
| `scripts/test-client.js` | Yes | Yes | Basic server connectivity |

## Prerequisites

- Node.js installed
- Project built (`npm run build`)
- **For integration tests only**: Things 3 running on macOS

## Unit Tests (No macOS Required)

Run the unit test suite to validate core logic without needing macOS or Things 3:

```bash
node scripts/test-unit.js
```

This covers:
- **Date utilities** (17 tests): `formatDateLocal`, `parseDateOnly`, `daysBetween` with leap years, timezone handling, year boundaries
- **URL builders** (31 tests): All Things URL scheme commands with encoding, special characters, unicode, empty params
- **Reschedule logic** (44 tests): Filtering, thresholds, boundary values, activation date protection, buffer days, skip aggregation, mixed scenarios
- **Edge cases** (13 tests): Large date ranges, leap year boundaries, ISO8601 format variations
- **MCP protocol** (14 tests): Tool listing, annotations, error paths via live server stdio

Expected output:
```
=== Date Utilities ===
  [PASS] formatDateLocal: Jan 1
  ...
=== FINAL RESULTS ===
PASS: 122
FAIL: 0
```

## Integration Tests (macOS + Things 3)

### Basic Connectivity

```bash
node scripts/test-client.js
```

Starts the MCP server, lists tools, and calls `get-projects` to verify AppleScript integration.

### Full Tool Coverage

```bash
npm run test:tools
```

By default this runs non-destructive checks and skips write-tool end-to-end calls.
To include write-tool tests (`add-todo`, `add-project`, `add-json`), set:

```bash
THINGS_MCP_TEST_ALLOW_WRITES=1 npm run test:tools
```

`update-todo`, `update-project`, and `reschedule-distant-todos` require `THINGS_AUTH_TOKEN` for success-path tests:

```bash
THINGS_AUTH_TOKEN=... \
THINGS_MCP_TEST_TODO_ID=... \
THINGS_MCP_TEST_PROJECT_ID=... \
npm run test:tools
```

### What Integration Tests Cover

| Tool | Without Auth | With Auth | With Writes |
|------|-------------|-----------|-------------|
| `show`, `search` | Executed | - | - |
| `get-todos`, `get-projects`, etc. | Executed + error paths | - | - |
| `update-todo`, `update-project` | Error path only | Success + verification | - |
| `add-todo`, `add-project`, `add-json` | Skipped | - | Executed |
| `reschedule-distant-todos` | Error path + annotations | dryRun validation | - |

## Expected Output (Integration)

You should see output similar to:

```
Starting server at: .../dist/index.js
...
[PASS] tools/list - 16 tools exposed
...
[PASS] reschedule-distant-todos - Expected error path verified
[PASS] reschedule-distant-todos (annotations)
...
Summary
PASS: 8+
FAIL: 0 (on macOS with Things 3)
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
