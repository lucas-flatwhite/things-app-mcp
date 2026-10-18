import {
  NOTION_DATABASE_ID,
  NOTION_PROPS,
  NOTION_TEXT_LIMIT,
  NOTION_VERSION,
  REQUIRED_SCHEMA,
  STATUS_FROM_NOTION,
  STATUS_TO_NOTION,
  type NotionRow,
  type SyncSnapshot,
  type TodoStatus,
} from "./types.js";

export interface NotionResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type NotionFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<NotionResponse>;

export interface SchemaCheck {
  ok: boolean;
  missing: string[];
  wrongType: string[];
  formulaWarning: string[];
}

interface NotionProperty {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  date?: { start?: string | null } | null;
}

export interface NotionPage {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
}

const MIN_GAP_MS = 334;

export class Pace {
  private stamps: number[] = [];

  constructor(
    private now: () => number,
    private sleep: (ms: number) => Promise<void>
  ) {}

  async wait(): Promise<void> {
    for (;;) {
      const time = this.now();
      this.stamps = this.stamps.filter((stamp) => time - stamp < 1000);
      const sinceLast =
        this.stamps.length === 0
          ? MIN_GAP_MS
          : time - this.stamps[this.stamps.length - 1];
      if (this.stamps.length >= 3) {
        const wait = 1000 - (time - this.stamps[0]) + 1;
        await this.sleep(Math.max(wait, MIN_GAP_MS));
        continue;
      }
      if (sinceLast < MIN_GAP_MS) {
        await this.sleep(MIN_GAP_MS - sinceLast);
        continue;
      }
      this.stamps.push(this.now());
      return;
    }
  }
}

function plain(parts: Array<{ plain_text?: string }> | undefined): string {
  return (parts ?? []).map((part) => part.plain_text ?? "").join("");
}

function clip(value: string): string {
  return value.length > NOTION_TEXT_LIMIT ? value.slice(0, NOTION_TEXT_LIMIT) : value;
}

function richText(value: string): { rich_text: Array<{ type: "text"; text: { content: string } }> } {
  const content = clip(value);
  if (content === "") return { rich_text: [] };
  return { rich_text: [{ type: "text", text: { content } }] };
}

export function pageToSnapshot(page: NotionPage): NotionRow {
  const props = page.properties ?? {};
  const statusName = props[NOTION_PROPS.status]?.select?.name ?? "";
  const status: TodoStatus = STATUS_FROM_NOTION[statusName] ?? "open";
  const deadline = props[NOTION_PROPS.deadline]?.date?.start ?? "";
  return {
    pageId: page.id,
    thingsId: plain(props[NOTION_PROPS.thingsId]?.rich_text).trim(),
    hash: plain(props[NOTION_PROPS.hash]?.rich_text).trim(),
    edited: page.last_edited_time ?? "",
    snapshot: {
      title: plain(props[NOTION_PROPS.title]?.title).trim(),
      notes: plain(props[NOTION_PROPS.notes]?.rich_text),
      when: plain(props[NOTION_PROPS.when]?.rich_text).trim(),
      deadline: deadline.slice(0, 10),
      tags: (props[NOTION_PROPS.tags]?.multi_select ?? [])
        .map((tag) => tag.name ?? "")
        .filter((name) => name !== ""),
      status,
      projectName: plain(props[NOTION_PROPS.projectName]?.rich_text).trim(),
      projectId: plain(props[NOTION_PROPS.projectId]?.rich_text).trim(),
      areaName: plain(props[NOTION_PROPS.areaName]?.rich_text).trim(),
      areaId: plain(props[NOTION_PROPS.areaId]?.rich_text).trim(),
    },
  };
}

export function snapshotToProperties(
  snapshot: SyncSnapshot,
  fields: readonly string[],
  extras?: { hash?: string; syncedAt?: string; thingsId?: string; forceContainer?: boolean }
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const wanted = new Set(fields);
  const writeContainer =
    extras?.forceContainer === true ||
    wanted.has("projectName") ||
    wanted.has("projectId") ||
    wanted.has("areaName") ||
    wanted.has("areaId");

  if (wanted.has("title")) {
    properties[NOTION_PROPS.title] = {
      title: [{ type: "text", text: { content: clip(snapshot.title) } }],
    };
  }
  if (wanted.has("notes")) properties[NOTION_PROPS.notes] = richText(snapshot.notes);
  if (wanted.has("when")) properties[NOTION_PROPS.when] = richText(snapshot.when);
  if (wanted.has("deadline")) {
    properties[NOTION_PROPS.deadline] =
      snapshot.deadline === ""
        ? { date: null }
        : { date: { start: snapshot.deadline } };
  }
  if (wanted.has("tags")) {
    properties[NOTION_PROPS.tags] = {
      multi_select: snapshot.tags.map((name) => ({ name })),
    };
  }
  if (wanted.has("status")) {
    properties[NOTION_PROPS.status] = {
      select: { name: STATUS_TO_NOTION[snapshot.status] },
    };
  }
  if (writeContainer) {
    properties[NOTION_PROPS.projectName] = richText(snapshot.projectName);
    properties[NOTION_PROPS.projectId] = richText(snapshot.projectId);
    properties[NOTION_PROPS.areaName] = richText(snapshot.areaName);
    properties[NOTION_PROPS.areaId] = richText(snapshot.areaId);
  }
  if (extras?.thingsId !== undefined) {
    properties[NOTION_PROPS.thingsId] = richText(extras.thingsId);
  }
  if (extras?.hash !== undefined) properties[NOTION_PROPS.hash] = richText(extras.hash);
  if (extras?.syncedAt !== undefined) {
    properties[NOTION_PROPS.syncedAt] = { date: { start: extras.syncedAt } };
  }
  return properties;
}

export function checkSchema(database: {
  properties?: Record<string, { type?: string }>;
}): SchemaCheck {
  const properties = database.properties ?? {};
  const missing: string[] = [];
  const wrongType: string[] = [];
  for (const [name, type] of Object.entries(REQUIRED_SCHEMA)) {
    const found = properties[name];
    if (!found) missing.push(name);
    else if (found.type !== type) wrongType.push(`${name}:${found.type ?? "?"}`);
  }
  const formula = properties[NOTION_PROPS.startFormula];
  const formulaWarning: string[] = [];
  if (!formula) formulaWarning.push("시작일 수식이 없습니다");
  else if (formula.type !== "formula") {
    formulaWarning.push("시작일 타입이 formula가 아닙니다");
  }
  return {
    ok: missing.length === 0 && wrongType.length === 0,
    missing,
    wrongType,
    formulaWarning,
  };
}

export function missingSchemaPatch(missing: readonly string[]): {
  properties: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  for (const name of missing) {
    const type = REQUIRED_SCHEMA[name];
    if (type === "title") properties[name] = { title: {} };
    else if (type === "rich_text") properties[name] = { rich_text: {} };
    else if (type === "date") properties[name] = { date: {} };
    else if (type === "multi_select") properties[name] = { multi_select: {} };
    else if (type === "select") {
      properties[name] = {
        select: { options: [{ name: "열림" }, { name: "완료" }, { name: "취소" }] },
      };
    }
  }
  return { properties };
}

export class NotionClient {
  private readonly pace: Pace;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: NotionFetch,
    private readonly sleep: (ms: number) => Promise<void>,
    now: () => number = () => Date.now()
  ) {
    this.pace = new Pace(now, sleep);
  }

  async queryAll(): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const body: { page_size: number; start_cursor?: string } = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const json = (await this.send(
        "POST",
        `/databases/${NOTION_DATABASE_ID}/query`,
        body
      )) as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string };
      if (!Array.isArray(json.results)) {
        throw new Error("Notion query 응답에 results가 없습니다");
      }
      pages.push(...json.results);
      cursor = json.has_more ? json.next_cursor : undefined;
      if (json.has_more && !cursor) {
        throw new Error("Notion query 다음 커서가 없습니다");
      }
    } while (cursor);
    return pages;
  }

  async getDatabase(): Promise<{ properties?: Record<string, { type?: string }> }> {
    return (await this.send("GET", `/databases/${NOTION_DATABASE_ID}`)) as {
      properties?: Record<string, { type?: string }>;
    };
  }

  async updateDatabase(body: unknown): Promise<void> {
    await this.send("PATCH", `/databases/${NOTION_DATABASE_ID}`, body);
  }

  async createPage(properties: Record<string, unknown>): Promise<string> {
    const json = (await this.send("POST", "/pages", {
      parent: { database_id: NOTION_DATABASE_ID },
      properties,
    })) as { id?: string };
    if (!json.id) throw new Error("Notion 페이지 id가 없습니다");
    return json.id;
  }

  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<void> {
    await this.send("PATCH", `/pages/${pageId}`, { properties });
  }

  private async send(method: string, path: string, body?: unknown, attempt = 0): Promise<unknown> {
    await this.pace.wait();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };
    const response = await this.fetchImpl(`https://api.notion.com/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429 && attempt < 5) {
      const retry = response.headers.get("Retry-After");
      const seconds = retry ? Number(retry) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : 1000 * 2 ** attempt;
      await this.sleep(delay);
      return this.send(method, path, body, attempt + 1);
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Notion ${response.status} ${detail}`.slice(0, 500));
    }
    return response.json();
  }
}
