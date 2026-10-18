import { hashFields } from "./snapshot.js";
import type { NotionClient } from "./notion-api.js";
import { snapshotToProperties } from "./notion-api.js";
import type { SyncOp, SyncSnapshot, ThingsItem } from "./types.js";
import { FIELD_NAMES } from "./types.js";
import { whenToThingsParam } from "./when.js";
import { buildAddSyncUrl, buildUpdateSyncUrl } from "./things-write.js";

export interface ApplyDeps {
  notion: Pick<NotionClient, "updatePage" | "createPage">;
  authToken: string;
  knownTagNames: Set<string>;
  todayDate: string;
  open: (url: string) => Promise<void>;
  add: (url: string) => Promise<string | null>;
  findCreated: (title: string) => Promise<string | null>;
  reread: (id: string) => Promise<ThingsItem | "missing">;
  sleep: (ms: number) => Promise<void>;
  now: () => string;
}

const ORDER: SyncOp["action"][] = [
  "create-things",
  "update-things",
  "cancel-notion",
  "create-notion",
  "update-notion",
];

function whenLanded(sent: string, actualWhen: string, todayDate: string): boolean {
  if (sent === "today") {
    return actualWhen === "오늘" || actualWhen === todayDate || actualWhen.startsWith(`${todayDate} `);
  }
  if (sent === "evening") return actualWhen === "오늘 저녁";
  return whenToThingsParam(actualWhen) === sent || actualWhen === sent;
}

async function writeHash(
  deps: ApplyDeps,
  pageId: string,
  snapshot: SyncSnapshot,
  thingsId?: string,
  fields: string[] = []
): Promise<void> {
  await deps.sleep(300);
  await deps.notion.updatePage(
    pageId,
    snapshotToProperties(snapshot, fields, {
      hash: hashFields(snapshot),
      syncedAt: deps.now(),
      thingsId,
      forceContainer: fields.includes("projectName") || fields.includes("projectId"),
    })
  );
}

export async function applyOps(ops: readonly SyncOp[], deps: ApplyDeps): Promise<string[]> {
  const notes: string[] = [];
  for (const action of ORDER) {
    for (const op of ops) {
      if (op.action !== action || !op.snapshot) continue;
      if (action === "create-things") {
        const built = buildAddSyncUrl({
          snapshot: op.snapshot,
          whenParam: op.whenParam ?? "today",
          listId: op.listId,
          knownTagNames: deps.knownTagNames,
        });
        await deps.sleep(300);
        const created =
          (await deps.add(built.url)) ?? (await deps.findCreated(op.snapshot.title));
        if (!created) {
          await deps.sleep(300);
          await deps.notion.updatePage(
            op.pageId,
            snapshotToProperties(op.snapshot, [], {
              hash: "needs-id",
              syncedAt: deps.now(),
            })
          );
          notes.push(`needs-id ${op.pageId}`);
          continue;
        }
        const actual = await deps.reread(created);
        let stored = op.snapshot;
        if (actual !== "missing" && !whenLanded(op.whenParam ?? "today", actual.when, deps.todayDate)) {
          stored = { ...op.snapshot, when: actual.when, deadline: actual.deadline };
          notes.push(`repeating-kept ${created}`);
        }
        await writeHash(deps, op.pageId, stored, created, ["when", "deadline"]);
        continue;
      }

      if (action === "update-things") {
        const built = buildUpdateSyncUrl({
          authToken: deps.authToken,
          id: op.thingsId,
          snapshot: op.snapshot,
          fields: op.fields,
          clearDeadline: op.clearDeadline,
          whenParam: op.whenParam,
          knownTagNames: deps.knownTagNames,
        });
        await deps.sleep(300);
        await deps.open(built.url);
        const actual = await deps.reread(op.thingsId);
        if (actual === "missing") {
          notes.push(`reread-missing ${op.thingsId}`);
          continue;
        }
        const agreed = { ...(op.hashSnapshot ?? op.snapshot) };
        let kept = false;
        if (op.whenParam && !whenLanded(op.whenParam, actual.when, deps.todayDate)) {
          agreed.when = actual.when;
          agreed.deadline = actual.deadline;
          kept = true;
        } else if (
          op.fields.includes("deadline") &&
          actual.deadline !== op.snapshot.deadline
        ) {
          agreed.deadline = actual.deadline;
          kept = true;
        }
        await writeHash(
          deps,
          op.pageId,
          agreed,
          undefined,
          kept ? ["when", "deadline"] : op.fields
        );
        if (kept) notes.push(`repeating-kept ${op.thingsId}`);
        continue;
      }

      if (action === "cancel-notion") {
        await writeHash(deps, op.pageId, op.snapshot, undefined, ["status"]);
        continue;
      }

      if (action === "create-notion") {
        await deps.sleep(300);
        const fields = [...FIELD_NAMES, "projectName", "areaName"];
        await deps.notion.createPage(
          snapshotToProperties(op.snapshot, fields, {
            hash: hashFields(op.hashSnapshot ?? op.snapshot),
            syncedAt: deps.now(),
            thingsId: op.thingsId,
            forceContainer: true,
          })
        );
        continue;
      }

      if (action === "update-notion") {
        const forceContainer = op.detail.includes("container-stays-in-things");
        await deps.sleep(300);
        await deps.notion.updatePage(
          op.pageId,
          snapshotToProperties(op.hashSnapshot ?? op.snapshot, op.fields, {
            hash: hashFields(op.hashSnapshot ?? op.snapshot),
            syncedAt: deps.now(),
            forceContainer,
          })
        );
      }
    }
  }
  return notes;
}
