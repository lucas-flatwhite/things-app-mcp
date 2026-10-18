import { diffSnapshot } from "./diff.js";
import { canonicalTags, canonicalText } from "./snapshot.js";
import {
  FIELD_NAMES,
  type FieldName,
  type NotionRow,
  type PlanInput,
  type SyncOp,
  type SyncSnapshot,
  type ThingsItem,
} from "./types.js";
import { isTodayWritableWhen, whenToThingsParam } from "./when.js";

/**
 * AppleScript cannot see This Evening. Keep the Notion value when Things
 * still shows the item as today.
 */
export function preserveEvening(
  notionWhen: string,
  thingsWhen: string,
  activationLocalDate: string,
  today: string
): string {
  const thingsIsToday = thingsWhen === "오늘" || thingsWhen === today;
  if (
    notionWhen === "오늘 저녁" &&
    thingsIsToday &&
    activationLocalDate === today
  ) {
    return "오늘 저녁";
  }
  return thingsWhen;
}

function snapshotOf(item: ThingsItem): SyncSnapshot {
  return {
    title: item.title,
    notes: item.notes,
    when: item.when,
    deadline: item.deadline,
    tags: item.tags,
    status: item.status,
    projectId: item.projectId,
    projectName: item.projectName,
    areaId: item.areaId,
    areaName: item.areaName,
  };
}

function skip(row: { pageId?: string; thingsId?: string; title?: string }, detail: string): SyncOp {
  return {
    action: "skip",
    thingsId: row.thingsId ?? "",
    pageId: row.pageId ?? "",
    title: row.title ?? "",
    fields: [],
    detail,
    warnings: [],
  };
}

function knownTags(
  tags: string[],
  known: Set<string>
): { tags: string[]; warnings: string[] } {
  const kept: string[] = [];
  const warnings: string[] = [];
  for (const tag of tags) {
    const name = tag.trim();
    if (name === "") continue;
    if (known.has(name)) kept.push(name);
    else warnings.push(`tag-missing:${name}`);
  }
  return { tags: kept, warnings };
}

function createWhenParam(when: string): string | null {
  if (when === "" || when === "오늘") return "today";
  if (when === "오늘 저녁") return "evening";
  return whenToThingsParam(when);
}

function resolveList(
  snapshot: SyncSnapshot,
  input: PlanInput
): { listId: string; detail: string } {
  if (snapshot.projectId) return { listId: snapshot.projectId, detail: "" };
  if (snapshot.projectName) {
    const resolved = input.resolvedProjectId(snapshot.projectName);
    if (resolved === "none" || resolved === "many") {
      return { listId: "", detail: "project-ambiguous" };
    }
    return { listId: resolved, detail: "" };
  }
  if (snapshot.areaId) return { listId: snapshot.areaId, detail: "" };
  if (snapshot.areaName) {
    const resolved = input.resolvedAreaId(snapshot.areaName);
    if (resolved === "none" || resolved === "many") {
      return { listId: "", detail: "area-ambiguous" };
    }
    return { listId: resolved, detail: "" };
  }
  return { listId: "", detail: "" };
}

function joinDetail(parts: string[]): string {
  return [...new Set(parts.filter((part) => part !== ""))].join(",");
}

export function buildSyncPlan(input: PlanInput): { ops: SyncOp[] } {
  const ops: SyncOp[] = [];
  const byThingsId = new Map<string, NotionRow[]>();
  for (const row of input.notion) {
    if (row.thingsId === "") continue;
    const list = byThingsId.get(row.thingsId) ?? [];
    list.push(row);
    byThingsId.set(row.thingsId, list);
  }

  const duplicateIds = new Set<string>();
  for (const [thingsId, rows] of byThingsId) {
    if (rows.length < 2) continue;
    duplicateIds.add(thingsId);
    for (const row of rows) {
      ops.push(skip({ ...row, title: row.snapshot.title }, "duplicate-id"));
    }
  }

  for (const row of input.notion) {
    if (row.thingsId !== "") continue;
    if (row.hash === "needs-id") {
      ops.push(skip(row, "needs-id"));
      continue;
    }
    const title = row.snapshot.title.trim();
    if (title === "") {
      ops.push(skip({ pageId: row.pageId, title: row.snapshot.title }, "empty-title"));
      continue;
    }
    const when = row.snapshot.when.trim();
    if (when !== "" && !isTodayWritableWhen(when, input.todayDate)) {
      ops.push(skip({ pageId: row.pageId, title }, "not-today"));
      continue;
    }
    const whenParam = createWhenParam(when);
    if (!whenParam) {
      ops.push(skip({ pageId: row.pageId, title }, "bad-when"));
      continue;
    }
    const list = resolveList(row.snapshot, input);
    const tags = knownTags(row.snapshot.tags, input.knownTagNames);
    ops.push({
      action: "create-things",
      thingsId: "",
      pageId: row.pageId,
      title,
      fields: [],
      detail: joinDetail([list.detail, ...tags.warnings]),
      whenParam,
      listId: list.listId,
      snapshot: { ...row.snapshot, title, tags: tags.tags },
      warnings: tags.warnings,
    });
  }

  for (const item of input.today) {
    if (duplicateIds.has(item.id)) continue;
    const rows = byThingsId.get(item.id) ?? [];
    if (rows.length === 0) {
      const snapshot = snapshotOf(item);
      ops.push({
        action: "create-notion",
        thingsId: item.id,
        pageId: "",
        title: item.title,
        fields: [...FIELD_NAMES, "projectName", "areaName"],
        detail: item.unclassified ? "when-unclassified" : "",
        snapshot,
        hashSnapshot: snapshot,
        warnings: [],
      });
      continue;
    }
    ops.push(...linkedTodayOps(item, rows[0], input));
  }

  for (const item of input.linkedOutsideToday) {
    if (duplicateIds.has(item.id)) continue;
    const rows = byThingsId.get(item.id) ?? [];
    if (rows.length === 0) continue;
    ops.push(...thingsWinsOps(item, rows[0], "left-today"));
  }

  for (const thingsId of input.missingThingsIds) {
    if (duplicateIds.has(thingsId)) continue;
    for (const row of byThingsId.get(thingsId) ?? []) {
      ops.push({
        action: "cancel-notion",
        thingsId,
        pageId: row.pageId,
        title: row.snapshot.title,
        fields: ["status"],
        detail: "",
        snapshot: { ...row.snapshot, status: "canceled" },
        hashSnapshot: { ...row.snapshot, status: "canceled" },
        warnings: [],
      });
    }
  }

  return { ops };
}

export function formatPlan(ops: readonly SyncOp[]): string {
  if (ops.length === 0) return "변경 없음\n";
  const lines = ["action\tthings_id\ttitle\tfields\tdetail"];
  for (const op of ops) {
    lines.push(
      [
        op.action,
        op.thingsId,
        op.title.replaceAll("\t", " "),
        op.fields.join(","),
        op.detail,
      ].join("\t")
    );
  }
  return `${lines.join("\n")}\n`;
}

function linkedTodayOps(
  item: ThingsItem,
  row: NotionRow,
  input: PlanInput
): SyncOp[] {
  const things = snapshotOf(item);
  const diff = diffSnapshot({
    storedHash: row.hash,
    things,
    notion: row.snapshot,
    thingsModified: item.modified,
    notionEdited: row.edited,
  });

  const details: string[] = [];
  if (diff.firstSync.length > 0) details.push("first-sync");
  const thingsFields: FieldName[] = [];
  const notionFields: string[] = [];
  const agreed: SyncSnapshot = { ...things };

  for (const field of FIELD_NAMES) {
    if (field === "projectId" || field === "areaId") continue;
    const decision = diff[field];
    if (decision === "same") continue;
    if (decision === "things") {
      notionFields.push(field);
      continue;
    }
    if (field === "when" && !isTodayWritableWhen(row.snapshot.when, input.todayDate)) {
      details.push("when-stays-in-things");
      agreed.when = things.when;
      continue;
    }
    thingsFields.push(field);
    agreed[field] = row.snapshot[field] as never;
  }

  const containerChanged =
    row.snapshot.projectId !== things.projectId ||
    row.snapshot.areaId !== things.areaId;
  if (containerChanged) details.push("container-stays-in-things");
  if (row.snapshot.projectName !== things.projectName) notionFields.push("projectName");
  if (row.snapshot.areaName !== things.areaName) notionFields.push("areaName");
  if (containerChanged || row.snapshot.projectName !== things.projectName) {
    if (!notionFields.includes("projectName") && row.snapshot.projectName !== things.projectName) {
      notionFields.push("projectName");
    }
  }

  const tags = knownTags(
    thingsFields.includes("tags") ? row.snapshot.tags : things.tags,
    input.knownTagNames
  );
  if (thingsFields.includes("tags")) {
    details.push(...tags.warnings);
    agreed.tags = tags.tags;
  }

  const ops: SyncOp[] = [];
  const detail = joinDetail(details);
  if (ops.length === 0 && notionFields.length === 0 && thingsFields.length === 0 && detail !== "") {
    return [skip({ pageId: row.pageId, thingsId: item.id, title: item.title }, detail)];
  }
  if (notionFields.length > 0) {
    ops.push({
      action: "update-notion",
      thingsId: item.id,
      pageId: row.pageId,
      title: agreed.title,
      fields: notionFields,
      detail,
      snapshot: agreed,
      hashSnapshot: agreed,
      warnings: tags.warnings,
    });
  }
  if (thingsFields.length > 0) {
    const whenParam = thingsFields.includes("when")
      ? whenToThingsParam(row.snapshot.when) ?? undefined
      : undefined;
    ops.push({
      action: "update-things",
      thingsId: item.id,
      pageId: row.pageId,
      title: item.title,
      fields: thingsFields,
      detail,
      clearDeadline:
        thingsFields.includes("deadline") && row.snapshot.deadline === "",
      whenParam,
      snapshot: agreed,
      hashSnapshot: agreed,
      warnings: tags.warnings,
    });
  }
  return ops;
}

function thingsWinsOps(item: ThingsItem, row: NotionRow, detail: string): SyncOp[] {
  const things = snapshotOf(item);
  const fields: string[] = [];
  for (const field of FIELD_NAMES) {
    if (field === "projectId" || field === "areaId") {
      if (row.snapshot[field] !== things[field]) fields.push(field);
      continue;
    }
    if (field === "tags") {
      if (canonicalTags(row.snapshot.tags) !== canonicalTags(things.tags)) {
        fields.push(field);
      }
      continue;
    }
    if (field === "title" || field === "notes") {
      if (canonicalText(row.snapshot[field]) !== canonicalText(things[field])) {
        fields.push(field);
      }
      continue;
    }
    if (row.snapshot[field] !== things[field]) fields.push(field);
  }
  if (row.snapshot.projectName !== things.projectName && !fields.includes("projectName")) {
    fields.push("projectName");
  }
  if (row.snapshot.areaName !== things.areaName && !fields.includes("areaName")) {
    fields.push("areaName");
  }
  if (fields.length === 0) return [];
  return [
    {
      action: "update-notion",
      thingsId: item.id,
      pageId: row.pageId,
      title: things.title,
      fields,
      detail,
      snapshot: things,
      hashSnapshot: things,
      warnings: [],
    },
  ];
}
