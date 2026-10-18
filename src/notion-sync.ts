import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { openThingsURL } from "./applescript.js";
import { applyOps } from "./notion-sync/apply.js";
import { redactLog, writeLog } from "./notion-sync/log.js";
import {
  NotionClient,
  checkSchema,
  missingSchemaPatch,
  pageToSnapshot,
} from "./notion-sync/notion-api.js";
import { buildSyncPlan, formatPlan, preserveEvening } from "./notion-sync/plan-build.js";
import {
  findCreatedTodo,
  loadThingsSyncSet,
  lookupTodo,
} from "./notion-sync/things-read.js";
import { addTodoAndReadId } from "./notion-sync/things-write.js";
import type { NotionRow, ThingsItem } from "./notion-sync/types.js";

const execFileAsync = promisify(execFile);

function help(): string {
  return `Things 오늘 목록과 Notion 데이터베이스를 맞춥니다.

  npm run sync                 시험 모드. 쓰지 않습니다.
  npm run sync -- --apply      오늘 목록과 연결된 행만 반영합니다.
  npm run sync -- --apply --ensure-schema
                               빠진 Notion 열을 만든 뒤 반영합니다.

Notion 토큰은 키체인 서비스 things-notion-sync 에 있습니다.
Things에 쓸 때는 환경 변수 THINGS_AUTH_TOKEN 이 필요합니다.
받은함, 예정, 언제든, 언젠가는 Things에서만 관리합니다.
`;
}

async function readNotionToken(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      "things-notion-sync",
      "-w",
    ]);
    const token = stdout.trim();
    if (token === "") throw new Error("empty");
    return token;
  } catch {
    console.error(
      "Notion 토큰이 키체인에 없습니다. 다음으로 저장하세요.\nsecurity add-generic-password -s things-notion-sync -a \"$USER\" -w"
    );
    process.exit(2);
  }
}

function byName(items: Array<{ id: string; name: string }>): (name: string) => "none" | "many" | string {
  return (name) => {
    const matches = items.filter((item) => item.name === name);
    if (matches.length === 1) return matches[0].id;
    if (matches.length === 0) return "none";
    return "many";
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(help());
    return;
  }
  const unknown = args.filter(
    (arg) => !["--apply", "--dry-run", "--ensure-schema", "--help"].includes(arg)
  );
  if (unknown.length > 0) {
    console.error(help());
    process.exit(2);
  }
  const apply = args.includes("--apply") && !args.includes("--dry-run");
  const ensure = args.includes("--ensure-schema");
  if (ensure && !apply) {
    console.error("--ensure-schema 는 --apply 와 함께 써야 합니다.");
    process.exit(2);
  }

  const token = await readNotionToken();
  const notion = new NotionClient(
    token,
    (url, init) => fetch(url, init),
    (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  );

  let database: { properties?: Record<string, { type?: string }> };
  try {
    database = await notion.getDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactLog(message));
    process.exit(1);
  }
  const schema = checkSchema(database);
  for (const warning of schema.formulaWarning) console.log(warning);
  if (!schema.ok) {
    console.error(`빠진 열: ${schema.missing.join(", ") || "없음"}`);
    console.error(`타입이 다른 열: ${schema.wrongType.join(", ") || "없음"}`);
    console.log(JSON.stringify(missingSchemaPatch(schema.missing), null, 2));
    if (!(ensure && apply && schema.wrongType.length === 0 && schema.missing.length > 0)) {
      process.exit(2);
    }
    await notion.updateDatabase(missingSchemaPatch(schema.missing));
  }

  let pages;
  try {
    pages = await notion.queryAll();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactLog(message));
    process.exit(1);
  }
  const notionRows: NotionRow[] = pages.map((page) => pageToSnapshot(page));

  let set;
  try {
    set = await loadThingsSyncSet(new Date());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactLog(message));
    process.exit(1);
  }

  const todayIds = new Set(set.today.map((item) => item.id));
  const linkedOutside: ThingsItem[] = [];
  const missing = new Set<string>();
  const seen = new Set<string>();
  for (const row of notionRows) {
    if (row.thingsId === "" || todayIds.has(row.thingsId) || seen.has(row.thingsId)) continue;
    seen.add(row.thingsId);
    try {
      const found = await lookupTodo(
        row.thingsId,
        set.listIds,
        set.somedayProjectIds,
        set.timeZone,
        set.todayDate
      );
      if (found === "missing") missing.add(row.thingsId);
      else linkedOutside.push(found);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(redactLog(message));
      process.exit(1);
    }
  }

  for (const item of set.today) {
    const row = notionRows.find((candidate) => candidate.thingsId === item.id);
    if (!row) continue;
    const activation = /^\d{4}-\d{2}-\d{2}/.test(item.when)
      ? item.when.slice(0, 10)
      : set.todayDate;
    item.when = preserveEvening(row.snapshot.when, item.when, activation, set.todayDate);
  }

  const { ops } = buildSyncPlan({
    today: set.today,
    linkedOutsideToday: linkedOutside,
    notion: notionRows,
    missingThingsIds: missing,
    todayDate: set.todayDate,
    resolvedProjectId: byName(set.projects),
    resolvedAreaId: byName(set.areas),
    knownTagNames: set.tags,
  });

  const table = formatPlan(ops);
  process.stdout.write(table);
  await writeLog(table.replaceAll("\n", " | "));

  if (!apply) return;

  const writesThings = ops.some(
    (op) => op.action === "create-things" || op.action === "update-things"
  );
  const authToken = process.env.THINGS_AUTH_TOKEN ?? "";
  if (writesThings && authToken === "") {
    console.error("Things에 쓰려면 THINGS_AUTH_TOKEN 이 필요합니다.");
    process.exit(2);
  }

  const notes = await applyOps(ops, {
    notion,
    authToken,
    knownTagNames: set.tags,
    todayDate: set.todayDate,
    open: async (url) => {
      await openThingsURL(url);
    },
    add: (url) => addTodoAndReadId(url),
    findCreated: (title) => findCreatedTodo(title),
    reread: (id) =>
      lookupTodo(id, set.listIds, set.somedayProjectIds, set.timeZone, set.todayDate),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date().toISOString(),
  });
  for (const note of notes) {
    console.log(note);
    await writeLog(note);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactLog(message));
  process.exit(1);
});
