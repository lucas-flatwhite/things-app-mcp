import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { openThingsURL } from "../applescript.js";
import { buildAddTodoURL, buildUpdateTodoURL } from "../things-url.js";
import type { SyncSnapshot, TodoStatus } from "./types.js";

export interface SyncWrite {
  url: string;
  warnings: string[];
}

function filterTags(
  tags: string[],
  known: Set<string> | undefined
): { value: string; warnings: string[]; clear: boolean } {
  if (!known) {
    return { value: tags.join(","), warnings: [], clear: tags.length === 0 };
  }
  const kept: string[] = [];
  const warnings: string[] = [];
  for (const tag of tags) {
    const name = tag.trim();
    if (name === "") continue;
    if (known.has(name)) kept.push(name);
    else warnings.push(`tag-missing:${name}`);
  }
  return { value: kept.join(","), warnings, clear: kept.length === 0 };
}

export function buildAddSyncUrl(input: {
  snapshot: SyncSnapshot;
  whenParam: string;
  listId?: string;
  knownTagNames?: Set<string>;
}): SyncWrite {
  const tags = filterTags(input.snapshot.tags, input.knownTagNames);
  const url = buildAddTodoURL({
    title: input.snapshot.title,
    notes: input.snapshot.notes || undefined,
    when: input.whenParam,
    deadline: input.snapshot.deadline || undefined,
    tags: tags.value || undefined,
    "list-id": input.listId || undefined,
    completed: input.snapshot.status === "completed" ? true : undefined,
    canceled: input.snapshot.status === "canceled" ? true : undefined,
  });
  return { url, warnings: tags.warnings };
}

export function buildUpdateSyncUrl(input: {
  authToken: string;
  id: string;
  snapshot: SyncSnapshot;
  fields: readonly string[];
  clearDeadline?: boolean;
  whenParam?: string;
  knownTagNames?: Set<string>;
}): SyncWrite {
  const fields = new Set(input.fields);
  const clear: Array<"deadline" | "notes" | "tags"> = [];
  if (input.clearDeadline) clear.push("deadline");
  let warnings: string[] = [];
  let tags: string | undefined;
  if (fields.has("tags")) {
    const filtered = filterTags(input.snapshot.tags, input.knownTagNames);
    warnings = filtered.warnings;
    if (filtered.clear) clear.push("tags");
    else tags = filtered.value;
  }
  if (fields.has("notes") && input.snapshot.notes === "") clear.push("notes");

  const status: TodoStatus | undefined = fields.has("status")
    ? input.snapshot.status
    : undefined;
  const url = buildUpdateTodoURL({
    "auth-token": input.authToken,
    id: input.id,
    title: fields.has("title") ? input.snapshot.title : undefined,
    notes: fields.has("notes") && input.snapshot.notes !== "" ? input.snapshot.notes : undefined,
    when: fields.has("when") ? input.whenParam : undefined,
    deadline:
      fields.has("deadline") && !input.clearDeadline
        ? input.snapshot.deadline
        : undefined,
    tags,
    completed: status === "completed" ? true : status === "open" ? false : undefined,
    canceled: status === "canceled" ? true : status === "open" ? false : undefined,
    clear,
  });
  return { url, warnings };
}

export function parseCallbackId(url: string): { ids: string[] } {
  const parsed = new URL(url, "http://127.0.0.1");
  const raw = parsed.searchParams.get("x-things-id") ?? "";
  return {
    ids: raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== ""),
  };
}

export async function addTodoAndReadId(
  url: string,
  open: (url: string) => Promise<void> = async (next) => {
    await openThingsURL(next);
  }
): Promise<string | null> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    return null;
  }
  const success = `http://127.0.0.1:${address.port}/success`;
  const full = `${url}${url.includes("?") ? "&" : "?"}x-success=${encodeURIComponent(success)}`;

  const id = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.off("request", onRequest);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    const onRequest = (request: IncomingMessage, response: ServerResponse) => {
      const ids = parseCallbackId(request.url ?? "");
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
      finish(ids.ids.length === 1 ? ids.ids[0] : null);
    };
    server.on("request", onRequest);
    open(full).catch(() => {
      finish(null);
    });
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  return id;
}
