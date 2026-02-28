import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "../dist/index.js");

const allowWrites = process.env.THINGS_MCP_TEST_ALLOW_WRITES === "1";
const authToken = process.env.THINGS_AUTH_TOKEN?.trim();
const updateTodoId = process.env.THINGS_MCP_TEST_TODO_ID?.trim();
const updateProjectId = process.env.THINGS_MCP_TEST_PROJECT_ID?.trim();
const expectedTools = [
  "add-todo",
  "add-project",
  "update-todo",
  "update-project",
  "show",
  "search",
  "add-json",
  "get-todos",
  "get-todo-by-id",
  "get-projects",
  "get-project-by-id",
  "get-areas",
  "get-tags",
  "search-todos",
  "get-recent-todos",
  "reschedule-distant-todos",
];

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let nextId = 1;
const pending = new Map();
const results = [];

server.stderr.on("data", (data) => {
  process.stderr.write(data.toString());
});

server.stdout.on("data", (data) => {
  stdoutBuffer += data.toString();
  const lines = stdoutBuffer.split("\n");
  stdoutBuffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const message = JSON.parse(line);
      handleMessage(message);
    } catch {
      process.stdout.write(`Non-JSON server output: ${line}\n`);
    }
  }
});

server.on("exit", (code, signal) => {
  if (pending.size > 0) {
    for (const [, entry] of pending.entries()) {
      entry.reject(
        new Error(`Server exited unexpectedly (code=${code}, signal=${signal})`)
      );
    }
    pending.clear();
  }
});

function handleMessage(message) {
  if (typeof message.id !== "number") {
    return;
  }

  const entry = pending.get(message.id);
  if (!entry) {
    return;
  }
  pending.delete(message.id);

  if (message.error) {
    entry.reject(new Error(JSON.stringify(message.error)));
    return;
  }

  entry.resolve(message.result);
}

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Request timed out: ${method}`));
    }, 180000);

    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    send({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
  });
}

function record(status, name, detail) {
  const line = `[${status}] ${name}${detail ? ` - ${detail}` : ""}`;
  results.push({ status, name, detail });
  process.stdout.write(`${line}\n`);
}

function textFromToolResult(result) {
  if (!result || !Array.isArray(result.content)) {
    return "";
  }
  return result.content
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isBlocked(message) {
  const lower = message.toLowerCase();
  return (
    lower.includes("no application knows how to open url things:///") ||
    lower.includes("klsexecutableincorrectformat") ||
    lower.includes("connection invalid error for service com.apple.hiservices-xpcservice") ||
    lower.includes("parameter is missing. (-1701)") ||
    lower.includes("application can't be found") ||
    lower.includes("can't get application") ||
    lower.includes("unable to connect to things via jxa")
  );
}

async function callTool(name, args, options = {}) {
  const { expectError = false, expectedPattern } = options;

  try {
    const result = await request("tools/call", { name, arguments: args });
    const error = result?.isError === true;
    const text = textFromToolResult(result);

    if (expectError) {
      if (!error) {
        record("FAIL", name, "Expected an error but got success");
        return { ok: false, result, text };
      }

      if (expectedPattern && !expectedPattern.test(text)) {
        record("FAIL", name, `Unexpected error: ${text}`);
        return { ok: false, result, text };
      }

      record("PASS", name, "Expected error path verified");
      return { ok: true, result, text };
    }

    if (error) {
      if (isBlocked(text)) {
        record("BLOCKED", name, text);
      } else {
        record("FAIL", name, text);
      }
      return { ok: false, result, text };
    }

    record("PASS", name);
    return { ok: true, result, text };
  } catch (error) {
    record("FAIL", name, String(error));
    return { ok: false, text: String(error) };
  }
}

async function main() {
  process.stdout.write(`Starting server at: ${serverPath}\n`);
  process.stdout.write(
    `Write tests: ${allowWrites ? "enabled (will create test items)" : "disabled"}\n`
  );

  const initResult = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-all-tools",
      version: "1.0.0",
    },
  });

  const serverVersion = initResult?.serverInfo?.version ?? "unknown";
  process.stdout.write(`Server version: ${serverVersion}\n`);

  send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  const listed = await request("tools/list");
  const listedToolNames = (listed?.tools ?? []).map((tool) => tool.name);
  const missingTools = expectedTools.filter(
    (toolName) => !listedToolNames.includes(toolName)
  );

  if (missingTools.length > 0) {
    record("FAIL", "tools/list", `Missing tools: ${missingTools.join(", ")}`);
  } else {
    record("PASS", "tools/list", `${listedToolNames.length} tools exposed`);
  }

  await callTool("show", { id: "today" });
  await callTool("search", { query: "mcp smoke test" });

  if (allowWrites) {
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    await callTool("add-todo", {
      title: `[MCP TEST ${suffix}] add-todo`,
      when: "someday",
      canceled: true,
      reveal: false,
    });
    await callTool("add-project", {
      title: `[MCP TEST ${suffix}] add-project`,
      when: "someday",
      canceled: true,
      reveal: false,
    });
    await callTool("add-json", {
      data: JSON.stringify([
        {
          type: "to-do",
          attributes: {
            title: `[MCP TEST ${suffix}] add-json`,
            when: "someday",
            canceled: true,
          },
        },
      ]),
      reveal: false,
    });
  } else {
    record(
      "SKIP",
      "add-todo/add-project/add-json",
      "Set THINGS_MCP_TEST_ALLOW_WRITES=1 to run write e2e tests"
    );
  }

  if (authToken && updateTodoId) {
    const marker = `[MCP TEST ${Date.now()}] update-todo smoke`;
    await callTool("update-todo", {
      authToken,
      id: updateTodoId,
      appendNotes: marker,
      reveal: false,
    });

    const verify = await callTool("get-todo-by-id", { id: updateTodoId });
    const parsed = parseJsonText(verify.text ?? "");
    if (!parsed || typeof parsed.notes !== "string" || !parsed.notes.includes(marker)) {
      record(
        "FAIL",
        "update-todo verification",
        "Updated note marker was not found in get-todo-by-id result"
      );
    } else {
      record("PASS", "update-todo verification");
    }
  } else {
    record(
      "SKIP",
      "update-todo success-path",
      "Set THINGS_AUTH_TOKEN and THINGS_MCP_TEST_TODO_ID to run success-path test"
    );
    await callTool(
      "update-todo",
      { id: "MCP-NONEXISTENT-ID" },
      {
        expectError: true,
        expectedPattern: /Auth token is required/i,
      }
    );
  }

  if (authToken && updateProjectId) {
    const marker = `[MCP TEST ${Date.now()}] update-project smoke`;
    await callTool("update-project", {
      authToken,
      id: updateProjectId,
      appendNotes: marker,
      reveal: false,
    });

    const verify = await callTool("get-project-by-id", { id: updateProjectId });
    const parsed = parseJsonText(verify.text ?? "");
    if (!parsed || typeof parsed.notes !== "string" || !parsed.notes.includes(marker)) {
      record(
        "FAIL",
        "update-project verification",
        "Updated note marker was not found in get-project-by-id result"
      );
    } else {
      record("PASS", "update-project verification");
    }
  } else {
    record(
      "SKIP",
      "update-project success-path",
      "Set THINGS_AUTH_TOKEN and THINGS_MCP_TEST_PROJECT_ID to run success-path test"
    );
    await callTool(
      "update-project",
      { id: "MCP-NONEXISTENT-ID" },
      {
        expectError: true,
        expectedPattern: /Auth token is required/i,
      }
    );
  }

  await callTool("get-todos", { list: "Today" });
  await callTool(
    "get-todos",
    { list: "invalid-list-name" },
    { expectError: true, expectedPattern: /Invalid list name/i }
  );
  await callTool("get-projects", {});
  await callTool("get-areas", {});
  await callTool("get-tags", {});
  await callTool("search-todos", { query: "mcp" });
  await callTool("get-recent-todos", { days: 3 });
  await callTool(
    "get-todo-by-id",
    { id: "MCP-NONEXISTENT-ID" },
    { expectError: true }
  );
  await callTool(
    "get-project-by-id",
    { id: "MCP-NONEXISTENT-ID" },
    { expectError: true }
  );

  // --------------------------------------------------------------------------
  // reschedule-distant-todos tests
  // --------------------------------------------------------------------------

  // Error path: missing auth token
  await callTool(
    "reschedule-distant-todos",
    {},
    {
      expectError: true,
      expectedPattern: /Auth token is required/i,
    }
  );

  // Dry-run path: requires Things running, so may be BLOCKED on CI
  if (authToken) {
    const dryRunResult = await callTool("reschedule-distant-todos", {
      authToken,
      dryRun: true,
    });
    if (dryRunResult.ok) {
      const parsed = parseJsonText(dryRunResult.text ?? "");
      if (!parsed || parsed.dryRun !== true) {
        record(
          "FAIL",
          "reschedule-distant-todos (dryRun validation)",
          "dryRun flag was not true in response"
        );
      } else if (typeof parsed.totalToday !== "number") {
        record(
          "FAIL",
          "reschedule-distant-todos (dryRun validation)",
          "totalToday is not a number"
        );
      } else if (typeof parsed.skippedSummary !== "object" || parsed.skippedSummary === null) {
        record(
          "FAIL",
          "reschedule-distant-todos (dryRun validation)",
          "skippedSummary is not an object"
        );
      } else if (typeof parsed.hint !== "undefined") {
        record(
          "FAIL",
          "reschedule-distant-todos (dryRun validation)",
          "dryRun response should not contain hint"
        );
      } else {
        record(
          "PASS",
          "reschedule-distant-todos (dryRun validation)",
          `totalToday=${parsed.totalToday}, wouldReschedule=${parsed.rescheduledCount}`
        );
      }
    }
  } else {
    record(
      "SKIP",
      "reschedule-distant-todos (dryRun)",
      "Set THINGS_AUTH_TOKEN to run dryRun test"
    );
  }

  // Verify tool annotations in listing
  const rescheduleTool = (listed?.tools ?? []).find(
    (tool) => tool.name === "reschedule-distant-todos"
  );
  if (rescheduleTool) {
    const ann = rescheduleTool.annotations ?? {};
    if (ann.destructiveHint !== true) {
      record(
        "FAIL",
        "reschedule-distant-todos (annotations)",
        "destructiveHint should be true"
      );
    } else if (ann.readOnlyHint !== false) {
      record(
        "FAIL",
        "reschedule-distant-todos (annotations)",
        "readOnlyHint should be false"
      );
    } else {
      record("PASS", "reschedule-distant-todos (annotations)");
    }
  } else {
    record(
      "FAIL",
      "reschedule-distant-todos (annotations)",
      "Tool not found in listing"
    );
  }

  const summary = {
    pass: results.filter((result) => result.status === "PASS").length,
    fail: results.filter((result) => result.status === "FAIL").length,
    blocked: results.filter((result) => result.status === "BLOCKED").length,
    skip: results.filter((result) => result.status === "SKIP").length,
  };

  process.stdout.write("\nSummary\n");
  process.stdout.write(`PASS: ${summary.pass}\n`);
  process.stdout.write(`FAIL: ${summary.fail}\n`);
  process.stdout.write(`BLOCKED: ${summary.blocked}\n`);
  process.stdout.write(`SKIP: ${summary.skip}\n`);

  server.kill("SIGTERM");

  if (summary.fail > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`Fatal test error: ${String(error)}\n`);
  try {
    server.kill("SIGTERM");
  } catch {
    // no-op
  }
  process.exit(1);
});
