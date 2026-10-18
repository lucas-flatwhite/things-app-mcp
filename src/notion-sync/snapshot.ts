import { createHash } from "node:crypto";

import {
  FIELD_NAMES,
  NOTION_TEXT_LIMIT,
  type FieldName,
  type SyncSnapshot,
} from "./types.js";

export function canonicalText(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

export function canonicalTags(tags: string[]): string {
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "")
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

/**
 * Notion rich text and titles stop at 2000 characters.
 * A stored prefix of a longer Things value is the same text.
 */
export function canonicalNotesEqual(
  thingsText: string,
  notionText: string
): boolean {
  const things = canonicalText(thingsText);
  const notion = canonicalText(notionText);
  if (things === notion) return true;
  return (
    things.length > NOTION_TEXT_LIMIT &&
    notion.length === NOTION_TEXT_LIMIT &&
    things.startsWith(notion)
  );
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fieldHash(snapshot: SyncSnapshot, field: FieldName): string {
  if (field === "tags") return hashValue(canonicalTags(snapshot.tags));
  if (field === "areaId" && snapshot.projectId.trim() !== "") {
    return hashValue("");
  }
  if (field === "title" || field === "notes") {
    return hashValue(canonicalText(snapshot[field]));
  }
  return hashValue(snapshot[field]);
}

export function hashFields(snapshot: SyncSnapshot): string {
  return FIELD_NAMES.map((field) => `${field}=${fieldHash(snapshot, field)}`).join(
    ","
  );
}

export function parseHash(hash: string): Partial<Record<FieldName, string>> {
  const parsed: Partial<Record<FieldName, string>> = {};
  if (hash === "" || hash === "needs-id") return parsed;
  for (const part of hash.split(",")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index);
    if ((FIELD_NAMES as readonly string[]).includes(key)) {
      parsed[key as FieldName] = part.slice(index + 1);
    }
  }
  return parsed;
}

export function isEmptyField(snapshot: SyncSnapshot, field: FieldName): boolean {
  if (field === "tags") return canonicalTags(snapshot.tags) === "";
  if (field === "status") return false;
  if (field === "title" || field === "notes") {
    return canonicalText(snapshot[field]) === "";
  }
  if (field === "areaId" && snapshot.projectId.trim() !== "") return true;
  return snapshot[field] === "";
}
