import {
  canonicalNotesEqual,
  fieldHash,
  isEmptyField,
  parseHash,
} from "./snapshot.js";
import {
  FIELD_NAMES,
  type FieldDecision,
  type FieldName,
  type SyncSnapshot,
} from "./types.js";

export interface DiffResult extends Record<FieldName, FieldDecision> {
  firstSync: FieldName[];
}

export function diffSnapshot(input: {
  storedHash: string;
  things: SyncSnapshot;
  notion: SyncSnapshot;
  thingsModified: string;
  notionEdited: string;
}): DiffResult {
  const stored = parseHash(input.storedHash);
  const firstSync: FieldName[] = [];
  const decisions = {} as Record<FieldName, FieldDecision>;
  const hasStored = input.storedHash !== "" && input.storedHash !== "needs-id";

  for (const field of FIELD_NAMES) {
    if (
      (field === "notes" || field === "title") &&
      canonicalNotesEqual(input.things[field], input.notion[field])
    ) {
      decisions[field] = "same";
      continue;
    }

    const thingsHash = fieldHash(input.things, field);
    const notionHash = fieldHash(input.notion, field);
    if (!hasStored || stored[field] === undefined) {
      if (thingsHash === notionHash) {
        decisions[field] = "same";
        continue;
      }
      const thingsEmpty = isEmptyField(input.things, field);
      const notionEmpty = isEmptyField(input.notion, field);
      if (notionEmpty && !thingsEmpty) {
        firstSync.push(field);
        decisions[field] = "things";
        continue;
      }
      if (thingsEmpty && !notionEmpty) {
        decisions[field] = "notion";
        continue;
      }
      firstSync.push(field);
      decisions[field] = "things";
      continue;
    }

    const thingsChanged = thingsHash !== stored[field];
    const notionChanged = notionHash !== stored[field];
    if (!thingsChanged && !notionChanged) {
      decisions[field] = "same";
    } else if (thingsChanged && !notionChanged) {
      decisions[field] = "things";
    } else if (!thingsChanged && notionChanged) {
      decisions[field] = "notion";
    } else {
      const notionMs = Date.parse(input.notionEdited);
      const thingsMs = Date.parse(input.thingsModified);
      decisions[field] =
        Number.isFinite(notionMs) && notionMs > thingsMs ? "notion" : "things";
    }
  }

  return { ...decisions, firstSync };
}
