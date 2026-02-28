/**
 * Unit & logic tests for things-app-mcp.
 *
 * These tests run without macOS / Things 3 by exercising:
 *   1. Date utility functions (formatDateLocal, parseDateOnly, daysBetween)
 *   2. URL builder functions (things-url.ts)
 *   3. Reschedule-distant-todos filtering logic (mock-based)
 *   4. Edge cases (boundaries, nulls, special inputs)
 *
 * Run:  node scripts/test-unit.js
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, "../dist/index.js");

// =========================================================================
// Test Framework
// =========================================================================

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, testName, detail = "") {
  if (condition) {
    passCount++;
    process.stdout.write(`  [PASS] ${testName}\n`);
  } else {
    failCount++;
    const msg = `  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`;
    failures.push(msg);
    process.stdout.write(`${msg}\n`);
  }
}

function assertEqual(actual, expected, testName) {
  const pass = actual === expected;
  assert(pass, testName, pass ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(str, substr, testName) {
  const pass = typeof str === "string" && str.includes(substr);
  assert(pass, testName, pass ? "" : `"${substr}" not found in "${String(str).slice(0, 200)}"`);
}

function section(name) {
  process.stdout.write(`\n=== ${name} ===\n`);
}

// =========================================================================
// 1. Date Utility Tests (inline re-implementations to validate logic)
// =========================================================================

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnly(isoString) {
  const datePart = isoString.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(from, to) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function testDateUtilities() {
  section("Date Utilities");

  // formatDateLocal
  assertEqual(formatDateLocal(new Date(2026, 0, 1)), "2026-01-01", "formatDateLocal: Jan 1");
  assertEqual(formatDateLocal(new Date(2026, 11, 31)), "2026-12-31", "formatDateLocal: Dec 31");
  assertEqual(formatDateLocal(new Date(2026, 1, 28)), "2026-02-28", "formatDateLocal: Feb 28 (today)");
  assertEqual(formatDateLocal(new Date(2024, 1, 29)), "2024-02-29", "formatDateLocal: leap year Feb 29");
  assertEqual(formatDateLocal(new Date(2026, 5, 9)), "2026-06-09", "formatDateLocal: single-digit month/day padded");

  // parseDateOnly - basic
  const d1 = parseDateOnly("2026-03-15T00:00:00.000Z");
  assertEqual(d1.getFullYear(), 2026, "parseDateOnly: year");
  assertEqual(d1.getMonth(), 2, "parseDateOnly: month (0-indexed)");
  assertEqual(d1.getDate(), 15, "parseDateOnly: day");
  assertEqual(d1.getHours(), 0, "parseDateOnly: midnight hours");

  // parseDateOnly - strips time portion correctly
  const d2 = parseDateOnly("2026-07-04T14:30:00+09:00");
  assertEqual(formatDateLocal(d2), "2026-07-04", "parseDateOnly: ignores time/tz portion");

  // parseDateOnly - bare date string
  const d3 = parseDateOnly("2026-12-25");
  assertEqual(formatDateLocal(d3), "2026-12-25", "parseDateOnly: bare YYYY-MM-DD");

  // daysBetween - same day
  const today = new Date(2026, 1, 28);
  assertEqual(daysBetween(today, today), 0, "daysBetween: same day = 0");

  // daysBetween - positive days
  const future = new Date(2026, 2, 10);
  assertEqual(daysBetween(today, future), 10, "daysBetween: 10 days forward");

  // daysBetween - negative days (past)
  assertEqual(daysBetween(future, today), -10, "daysBetween: 10 days backward = -10");

  // daysBetween - large gap
  const nextYear = new Date(2027, 1, 28);
  assertEqual(daysBetween(today, nextYear), 365, "daysBetween: exactly 1 year = 365");

  // daysBetween - 1 day
  const tomorrow = new Date(2026, 2, 1);
  assertEqual(daysBetween(today, tomorrow), 1, "daysBetween: Feb 28 -> Mar 1 = 1 day");

  // Roundtrip: format -> parse -> format
  const original = new Date(2026, 8, 15);
  const formatted = formatDateLocal(original);
  const parsed = parseDateOnly(formatted);
  assertEqual(formatDateLocal(parsed), "2026-09-15", "Roundtrip: format -> parse -> format");
}

// =========================================================================
// 2. URL Builder Tests (import from dist)
// =========================================================================

async function testURLBuilders() {
  section("URL Builders (things-url.ts)");

  const {
    buildAddTodoURL,
    buildAddProjectURL,
    buildUpdateTodoURL,
    buildUpdateProjectURL,
    buildShowURL,
    buildSearchURL,
    buildJsonURL,
  } = await import(path.resolve(__dirname, "../dist/things-url.js"));

  // --- add-todo ---
  const addUrl1 = buildAddTodoURL({ title: "Test task" });
  assertIncludes(addUrl1, "things:///add?", "add-todo: base URL");
  assertIncludes(addUrl1, "title=Test%20task", "add-todo: title encoded");

  const addUrl2 = buildAddTodoURL({ title: "Buy milk", when: "today", tags: "Errand" });
  assertIncludes(addUrl2, "when=today", "add-todo: when param");
  assertIncludes(addUrl2, "tags=Errand", "add-todo: tags param");

  const addUrl3 = buildAddTodoURL({ title: "Deadline test", deadline: "2026-04-01" });
  assertIncludes(addUrl3, "deadline=2026-04-01", "add-todo: deadline param");

  // Empty title
  const addUrl4 = buildAddTodoURL({});
  assertEqual(addUrl4, "things:///add", "add-todo: no params = bare URL");

  // checklist-items with newlines (note: URL builder uses kebab-case key)
  const addUrl5 = buildAddTodoURL({ title: "Grocery", "checklist-items": "Milk\nEggs\nBread" });
  assertIncludes(addUrl5, "checklist-items=", "add-todo: checklist-items present");

  // completed / canceled booleans
  const addUrl6 = buildAddTodoURL({ title: "Done", completed: true });
  assertIncludes(addUrl6, "completed=true", "add-todo: completed=true");

  const addUrl7 = buildAddTodoURL({ title: "Nope", canceled: true });
  assertIncludes(addUrl7, "canceled=true", "add-todo: canceled=true");

  // --- add-project ---
  const projUrl = buildAddProjectURL({ title: "Project X", area: "Work" });
  assertIncludes(projUrl, "things:///add-project?", "add-project: base URL");
  assertIncludes(projUrl, "title=Project%20X", "add-project: title");
  assertIncludes(projUrl, "area=Work", "add-project: area");

  // --- update-todo ---
  const upUrl = buildUpdateTodoURL({ "auth-token": "tok123", id: "abc-123", when: "2026-05-01" });
  assertIncludes(upUrl, "things:///update?", "update-todo: base URL");
  assertIncludes(upUrl, "auth-token=tok123", "update-todo: auth-token");
  assertIncludes(upUrl, "id=abc-123", "update-todo: id");
  assertIncludes(upUrl, "when=2026-05-01", "update-todo: when");

  // --- update-project ---
  const upProjUrl = buildUpdateProjectURL({ "auth-token": "tok", id: "proj-1", title: "New Name" });
  assertIncludes(upProjUrl, "things:///update-project?", "update-project: base URL");
  assertIncludes(upProjUrl, "title=New%20Name", "update-project: title encoded");

  // --- show ---
  const showUrl1 = buildShowURL({ id: "today" });
  assertIncludes(showUrl1, "things:///show?", "show: base URL");
  assertIncludes(showUrl1, "id=today", "show: id=today");

  const showUrl2 = buildShowURL({ query: "Work", filter: "urgent" });
  assertIncludes(showUrl2, "query=Work", "show: query");
  assertIncludes(showUrl2, "filter=urgent", "show: filter");

  // --- search ---
  const searchUrl = buildSearchURL({ query: "hello world" });
  assertIncludes(searchUrl, "things:///search?", "search: base URL");
  assertIncludes(searchUrl, "query=hello%20world", "search: query encoded");

  const searchEmpty = buildSearchURL({});
  assertEqual(searchEmpty, "things:///search", "search: empty = bare URL");

  // --- json ---
  const jsonUrl = buildJsonURL({
    data: [{ type: "to-do", attributes: { title: "Test" } }],
    "auth-token": "secret",
    reveal: true,
  });
  assertIncludes(jsonUrl, "things:///json?", "json: base URL");
  assertIncludes(jsonUrl, "auth-token=secret", "json: auth-token");
  assertIncludes(jsonUrl, "reveal=true", "json: reveal");
  assertIncludes(jsonUrl, "data=", "json: data param present");

  // json - batch update format (used by reschedule)
  const batchData = [
    { type: "to-do", operation: "update", id: "id1", attributes: { when: "2026-04-01" } },
    { type: "to-do", operation: "update", id: "id2", attributes: { when: "2026-04-05" } },
  ];
  const batchUrl = buildJsonURL({ data: batchData, "auth-token": "tok" });
  assertIncludes(batchUrl, "things:///json?", "json batch: base URL");
  // Decoded data should contain both entries
  const dataParam = new URL(batchUrl).searchParams.get("data");
  const parsedData = JSON.parse(dataParam);
  assertEqual(Array.isArray(parsedData), true, "json batch: data is array");
  assertEqual(parsedData.length, 2, "json batch: 2 entries");
  assertEqual(parsedData[0].operation, "update", "json batch: operation=update");
  assertEqual(parsedData[1].attributes.when, "2026-04-05", "json batch: entry 2 when");

  // --- Special characters in title ---
  const specialUrl = buildAddTodoURL({ title: "Buy milk & eggs (2)" });
  assertIncludes(specialUrl, "Buy%20milk%20%26%20eggs%20(2)", "add-todo: ampersand & parens encoded");

  // --- Unicode in notes ---
  const unicodeUrl = buildAddTodoURL({ title: "Test", notes: "Korean: 할일" });
  assertIncludes(unicodeUrl, "notes=", "add-todo: unicode notes present");
}

// =========================================================================
// 3. Reschedule Logic Tests (MCP protocol over stdio, mock-free pure logic)
// =========================================================================

function simulateRescheduleLogic(todos, options = {}) {
  /**
   * Replicates the filtering logic from the reschedule-distant-todos handler
   * without needing the MCP server running.
   */
  const daysThreshold = options.daysThreshold ?? 7;
  const bufferDays = options.bufferDays ?? 3;

  const now = options.now ?? new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = formatDateLocal(todayMidnight);

  const rescheduled = [];
  const skippedSummary = {};

  function skipWith(reason) {
    skippedSummary[reason] = (skippedSummary[reason] ?? 0) + 1;
  }

  for (const todo of todos) {
    if (todo.status !== "open") {
      skipWith("status is not open");
      continue;
    }

    if (!todo.dueDate) {
      skipWith("no deadline set");
      continue;
    }

    if (todo.activationDate) {
      const activationStr = formatDateLocal(parseDateOnly(todo.activationDate));
      if (activationStr === todayStr) {
        skipWith("explicitly scheduled for today (activationDate = today)");
        continue;
      }
    }

    const deadlineDate = parseDateOnly(todo.dueDate);
    const daysUntilDue = daysBetween(todayMidnight, deadlineDate);

    if (daysUntilDue < daysThreshold) {
      skipWith(`deadline within threshold (< ${daysThreshold} days)`);
      continue;
    }

    const newWhenDate = new Date(deadlineDate);
    newWhenDate.setDate(newWhenDate.getDate() - bufferDays);

    if (newWhenDate.getTime() <= todayMidnight.getTime()) {
      skipWith("computed new date would not move to-do out of Today");
      continue;
    }

    const newWhenStr = formatDateLocal(newWhenDate);
    const oldWhen = todo.activationDate
      ? formatDateLocal(parseDateOnly(todo.activationDate))
      : null;

    rescheduled.push({
      id: todo.id,
      name: todo.name,
      oldWhen,
      newWhen: newWhenStr,
      dueDate: todo.dueDate.slice(0, 10),
      daysUntilDue,
    });
  }

  return { rescheduled, skippedSummary, totalToday: todos.length };
}

function testRescheduleLogic() {
  section("Reschedule Logic");

  const NOW = new Date(2026, 1, 28); // 2026-02-28

  // Helper to create a todo
  function todo(overrides) {
    return {
      id: overrides.id ?? "t-" + Math.random().toString(36).slice(2, 8),
      name: overrides.name ?? "Test Todo",
      status: overrides.status ?? "open",
      notes: "",
      tags: "",
      dueDate: overrides.dueDate ?? null,
      activationDate: overrides.activationDate ?? null,
      creationDate: "2026-01-01T00:00:00.000Z",
      modificationDate: "2026-02-27T00:00:00.000Z",
      completionDate: null,
      projectName: null,
      areaName: null,
      ...overrides,
    };
  }

  // 3a. Basic: deadline 20 days away -> should reschedule
  {
    const todos = [todo({ name: "Far deadline", dueDate: "2026-03-20T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 1, "Basic: 1 item rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-17", "Basic: newWhen = deadline - 3 days");
    assertEqual(r.rescheduled[0].daysUntilDue, 20, "Basic: daysUntilDue = 20");
  }

  // 3b. Deadline too close (5 days, threshold 7) -> skip
  {
    const todos = [todo({ name: "Close deadline", dueDate: "2026-03-05T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Close deadline: not rescheduled");
    assertEqual(r.skippedSummary["deadline within threshold (< 7 days)"], 1, "Close deadline: skip reason");
  }

  // 3c. No deadline -> skip
  {
    const todos = [todo({ name: "No deadline" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "No deadline: not rescheduled");
    assertEqual(r.skippedSummary["no deadline set"], 1, "No deadline: skip reason");
  }

  // 3d. Completed status -> skip
  {
    const todos = [todo({ name: "Done", status: "completed", dueDate: "2026-06-01T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Completed: not rescheduled");
    assertEqual(r.skippedSummary["status is not open"], 1, "Completed: skip reason");
  }

  // 3e. Canceled status -> skip
  {
    const todos = [todo({ name: "Canceled", status: "canceled", dueDate: "2026-06-01T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Canceled: not rescheduled");
  }

  // 3f. activationDate = today -> protected, skip
  {
    const todos = [todo({
      name: "Intentional Today",
      dueDate: "2026-06-01T00:00:00.000Z",
      activationDate: "2026-02-28T00:00:00.000Z",
    })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "activationDate=today: protected");
    assertEqual(
      r.skippedSummary["explicitly scheduled for today (activationDate = today)"],
      1,
      "activationDate=today: skip reason"
    );
  }

  // 3g. activationDate = yesterday -> NOT protected, eligible
  {
    const todos = [todo({
      name: "Yesterday activation",
      dueDate: "2026-06-01T00:00:00.000Z",
      activationDate: "2026-02-27T00:00:00.000Z",
    })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 1, "activationDate=yesterday: rescheduled");
    assertEqual(r.rescheduled[0].oldWhen, "2026-02-27", "activationDate=yesterday: oldWhen preserved");
  }

  // 3h. Custom daysThreshold = 3
  {
    const todos = [todo({ name: "5 days", dueDate: "2026-03-05T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, daysThreshold: 3 });
    assertEqual(r.rescheduled.length, 1, "Custom threshold=3: 5-day deadline rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-02", "Custom threshold=3: newWhen correct");
  }

  // 3i. Custom bufferDays = 5
  {
    const todos = [todo({ name: "Buffer 5", dueDate: "2026-03-20T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 5 });
    assertEqual(r.rescheduled.length, 1, "bufferDays=5: rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-15", "bufferDays=5: deadline - 5 = 2026-03-15");
  }

  // 3j. newWhen would be today or past -> skip guard
  {
    // Deadline 8 days away, bufferDays = 8 -> newWhen = today -> should skip
    const todos = [todo({ name: "Guard test", dueDate: "2026-03-08T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 8 });
    assertEqual(r.rescheduled.length, 0, "newWhen=today guard: not rescheduled");
    assertEqual(r.skippedSummary["computed new date would not move to-do out of Today"], 1, "newWhen=today guard: reason");
  }

  // 3k. newWhen would be past (bufferDays larger than daysUntilDue)
  {
    const todos = [todo({ name: "Past guard", dueDate: "2026-03-08T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 20 });
    assertEqual(r.rescheduled.length, 0, "newWhen=past guard: not rescheduled");
  }

  // 3l. Multiple todos - mixed scenarios
  {
    const todos = [
      todo({ id: "1", name: "Far", dueDate: "2026-06-01T00:00:00.000Z" }),
      todo({ id: "2", name: "Close", dueDate: "2026-03-03T00:00:00.000Z" }),
      todo({ id: "3", name: "NoDL" }),
      todo({ id: "4", name: "Done", status: "completed", dueDate: "2026-06-01T00:00:00.000Z" }),
      todo({ id: "5", name: "Protected", dueDate: "2026-06-01T00:00:00.000Z", activationDate: "2026-02-28T00:00:00.000Z" }),
      todo({ id: "6", name: "Also Far", dueDate: "2026-05-15T00:00:00.000Z" }),
    ];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.totalToday, 6, "Mixed: totalToday = 6");
    assertEqual(r.rescheduled.length, 2, "Mixed: 2 rescheduled (Far + Also Far)");
    const ids = r.rescheduled.map(e => e.id);
    assert(ids.includes("1"), "Mixed: 'Far' rescheduled");
    assert(ids.includes("6"), "Mixed: 'Also Far' rescheduled");
    assertEqual(r.skippedSummary["no deadline set"], 1, "Mixed: 1 no-deadline");
    assertEqual(r.skippedSummary["status is not open"], 1, "Mixed: 1 completed");
    assertEqual(
      r.skippedSummary["explicitly scheduled for today (activationDate = today)"],
      1,
      "Mixed: 1 protected"
    );
  }

  // 3m. Empty list
  {
    const r = simulateRescheduleLogic([], { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Empty list: nothing rescheduled");
    assertEqual(r.totalToday, 0, "Empty list: totalToday = 0");
    assertEqual(Object.keys(r.skippedSummary).length, 0, "Empty list: no skip reasons");
  }

  // 3n. Threshold boundary: exactly 7 days = eligible (code uses `<` not `<=`)
  {
    // 2026-02-28 + 7 days = 2026-03-07; 7 < 7 is false so it IS eligible
    const todos = [todo({ name: "Exact 7", dueDate: "2026-03-07T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 1, "Exact threshold (7 days): IS rescheduled (7 < 7 = false)");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-04", "Exact threshold: newWhen = Mar 7 - 3 = Mar 4");
  }

  // 3n2. Threshold boundary: exactly 6 days = NOT eligible
  {
    const todos = [todo({ name: "Under 7", dueDate: "2026-03-06T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Under threshold (6 days): NOT rescheduled (6 < 7 = true)");
  }

  // 3o. Threshold boundary: exactly 8 days = eligible
  {
    const todos = [todo({ name: "Over 7", dueDate: "2026-03-08T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 1, "8 days (> threshold): rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-05", "8 days: newWhen = Mar 8 - 3 = Mar 5");
  }

  // 3p. Deadline is today (0 days) -> skip
  {
    const todos = [todo({ name: "Due today", dueDate: "2026-02-28T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Due today: not rescheduled");
  }

  // 3q. Deadline is in the past -> skip
  {
    const todos = [todo({ name: "Overdue", dueDate: "2026-02-20T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.rescheduled.length, 0, "Overdue: not rescheduled (negative days)");
  }

  // 3r. bufferDays = 0 -> newWhen = deadline itself, must be > today
  {
    const todos = [todo({ name: "Buffer0", dueDate: "2026-03-20T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 0 });
    assertEqual(r.rescheduled.length, 1, "bufferDays=0: rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-20", "bufferDays=0: newWhen = deadline");
  }

  // 3s. Very large bufferDays -> newWhen goes far past -> guard
  {
    const todos = [todo({ name: "HugeBuf", dueDate: "2026-03-10T00:00:00.000Z" })];
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 100 });
    assertEqual(r.rescheduled.length, 0, "Huge bufferDays: guard prevents reschedule");
  }

  // 3t. skippedSummary counts aggregate correctly
  {
    const todos = [
      todo({ name: "NoDL1" }),
      todo({ name: "NoDL2" }),
      todo({ name: "NoDL3" }),
    ];
    const r = simulateRescheduleLogic(todos, { now: NOW });
    assertEqual(r.skippedSummary["no deadline set"], 3, "Skip aggregation: 3 no-deadline items counted");
  }
}

// =========================================================================
// 4. Edge Cases
// =========================================================================

function testEdgeCases() {
  section("Edge Cases");

  // Year boundary
  const dec31 = new Date(2025, 11, 31);
  const jan1 = new Date(2026, 0, 1);
  assertEqual(daysBetween(dec31, jan1), 1, "Year boundary: Dec 31 -> Jan 1 = 1 day");
  assertEqual(formatDateLocal(dec31), "2025-12-31", "Year boundary: format Dec 31");
  assertEqual(formatDateLocal(jan1), "2026-01-01", "Year boundary: format Jan 1");

  // Leap year boundary
  const feb28 = new Date(2024, 1, 28);
  const feb29 = new Date(2024, 1, 29);
  const mar1 = new Date(2024, 2, 1);
  assertEqual(daysBetween(feb28, feb29), 1, "Leap year: Feb 28 -> Feb 29 = 1");
  assertEqual(daysBetween(feb29, mar1), 1, "Leap year: Feb 29 -> Mar 1 = 1");
  assertEqual(daysBetween(feb28, mar1), 2, "Leap year: Feb 28 -> Mar 1 = 2");

  // Non-leap year
  const feb28_2026 = new Date(2026, 1, 28);
  const mar1_2026 = new Date(2026, 2, 1);
  assertEqual(daysBetween(feb28_2026, mar1_2026), 1, "Non-leap: Feb 28 -> Mar 1 = 1");

  // parseDateOnly with various ISO formats
  const iso1 = parseDateOnly("2026-01-15T23:59:59.999Z");
  assertEqual(formatDateLocal(iso1), "2026-01-15", "parseDateOnly: late time UTC");

  const iso2 = parseDateOnly("2026-01-15T00:00:00+09:00");
  assertEqual(formatDateLocal(iso2), "2026-01-15", "parseDateOnly: +09:00 timezone");

  const iso3 = parseDateOnly("2026-01-15T00:00:00-12:00");
  assertEqual(formatDateLocal(iso3), "2026-01-15", "parseDateOnly: -12:00 timezone");

  // Large date range: 100 years with 25 leap years (2000 is leap, 2100 is not) = 36525 days
  const y2000 = new Date(2000, 0, 1);
  const y2100 = new Date(2100, 0, 1);
  const days100y = daysBetween(y2000, y2100);
  assertEqual(days100y, 36525, "Large range: 2000 -> 2100 (36525 days with 25 leap years)");

  // Reschedule with deadline exactly at threshold + 1 and bufferDays = threshold
  // This creates newWhen = today + 1, which is valid
  {
    const NOW = new Date(2026, 1, 28);
    const todos = [{
      id: "edge-1",
      name: "Edge",
      status: "open",
      dueDate: "2026-03-08T00:00:00.000Z", // 8 days away
      activationDate: null,
      notes: "", tags: "",
      creationDate: "2026-01-01T00:00:00.000Z",
      modificationDate: "2026-01-01T00:00:00.000Z",
      completionDate: null,
      projectName: null, areaName: null,
    }];
    // bufferDays=7 -> newWhen = Mar 8 - 7 = Mar 1 (1 day from today) -> valid
    const r = simulateRescheduleLogic(todos, { now: NOW, bufferDays: 7 });
    assertEqual(r.rescheduled.length, 1, "Edge: bufferDays=7 with 8-day deadline: rescheduled");
    assertEqual(r.rescheduled[0].newWhen, "2026-03-01", "Edge: newWhen = Mar 1 (tomorrow)");
  }
}

// =========================================================================
// 5. MCP Server Protocol Tests (live server, error paths)
// =========================================================================

async function testMCPProtocol() {
  section("MCP Server Protocol");

  const server = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let nextId = 1;
  const pending = new Map();

  server.stderr.on("data", () => {}); // suppress

  server.stdout.on("data", (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
          else entry.resolve(msg.result);
        }
      } catch {}
    }
  });

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("timeout")); }, 10000);
      pending.set(id, {
        resolve: (r) => { clearTimeout(t); resolve(r); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  try {
    // Initialize
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "unit-test", version: "1.0.0" },
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

    // Test: tools/list contains reschedule-distant-todos
    const listed = await request("tools/list");
    const toolNames = (listed?.tools ?? []).map(t => t.name);
    assert(toolNames.includes("reschedule-distant-todos"), "MCP: reschedule tool in listing");
    assertEqual(toolNames.length, 16, "MCP: 16 tools total");

    // Test: tool annotations
    const rTool = listed.tools.find(t => t.name === "reschedule-distant-todos");
    assertEqual(rTool?.annotations?.destructiveHint, true, "MCP: destructiveHint = true");
    assertEqual(rTool?.annotations?.readOnlyHint, false, "MCP: readOnlyHint = false");
    assertEqual(rTool?.annotations?.openWorldHint, true, "MCP: openWorldHint = true");

    // Test: call without auth -> error
    const noAuth = await request("tools/call", { name: "reschedule-distant-todos", arguments: {} });
    assertEqual(noAuth?.isError, true, "MCP: no auth -> isError=true");
    assertIncludes(
      noAuth?.content?.[0]?.text ?? "",
      "Auth token is required",
      "MCP: no auth -> error message"
    );

    // Test: call with auth but no Things (dryRun) -> JXA error because no osascript
    const dryResult = await request("tools/call", {
      name: "reschedule-distant-todos",
      arguments: { authToken: "test-token", dryRun: true },
    });
    // Should be an error because osascript doesn't exist on Linux
    assertEqual(dryResult?.isError, true, "MCP: dryRun on Linux -> isError (no osascript)");
    assertIncludes(
      dryResult?.content?.[0]?.text ?? "",
      "Error fetching Today list",
      "MCP: dryRun -> fetching error"
    );

    // Test: update-todo without auth
    const noAuthUpdate = await request("tools/call", {
      name: "update-todo",
      arguments: { id: "fake" },
    });
    assertEqual(noAuthUpdate?.isError, true, "MCP: update-todo no auth -> error");

    // Test: update-project without auth
    const noAuthProj = await request("tools/call", {
      name: "update-project",
      arguments: { id: "fake" },
    });
    assertEqual(noAuthProj?.isError, true, "MCP: update-project no auth -> error");

    // Test: get-todos invalid list
    const badList = await request("tools/call", {
      name: "get-todos",
      arguments: { list: "NonexistentList" },
    });
    assertEqual(badList?.isError, true, "MCP: get-todos invalid list -> error");
    assertIncludes(
      badList?.content?.[0]?.text ?? "",
      "Invalid list name",
      "MCP: get-todos invalid list -> error message"
    );

    // Test: THINGS_AUTH_TOKEN env is not set -> resolveAuthToken returns undefined
    const envAuthResult = await request("tools/call", {
      name: "reschedule-distant-todos",
      arguments: { dryRun: true },
    });
    assertEqual(envAuthResult?.isError, true, "MCP: no env auth -> error");

  } finally {
    server.kill("SIGTERM");
  }
}

// =========================================================================
// Main
// =========================================================================

async function main() {
  process.stdout.write("Things MCP - Unit & Logic Tests\n");
  process.stdout.write(`Date: ${new Date().toISOString()}\n`);
  process.stdout.write(`Server: ${serverPath}\n\n`);

  testDateUtilities();
  await testURLBuilders();
  testRescheduleLogic();
  testEdgeCases();
  await testMCPProtocol();

  section("FINAL RESULTS");
  process.stdout.write(`PASS: ${passCount}\n`);
  process.stdout.write(`FAIL: ${failCount}\n`);

  if (failures.length > 0) {
    process.stdout.write("\nFailures:\n");
    for (const f of failures) {
      process.stdout.write(`${f}\n`);
    }
  }

  process.stdout.write(`\nTotal: ${passCount + failCount} tests\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${String(error)}\n`);
  process.exit(1);
});
