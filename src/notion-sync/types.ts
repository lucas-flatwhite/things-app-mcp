export const NOTION_DATABASE_ID = "9ac2752989a646918bfa93ab900dfb8c";
export const NOTION_VERSION = "2022-06-28";
export const NOTION_TEXT_LIMIT = 2000;

export const FIELD_NAMES = [
  "title",
  "notes",
  "when",
  "deadline",
  "tags",
  "status",
  "projectId",
  "areaId",
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];
export type FieldDecision = "same" | "things" | "notion";
export type TodoStatus = "open" | "completed" | "canceled";

export interface SyncSnapshot {
  title: string;
  notes: string;
  when: string;
  deadline: string;
  tags: string[];
  status: TodoStatus;
  projectId: string;
  projectName: string;
  areaId: string;
  areaName: string;
}

export interface ThingsItem extends SyncSnapshot {
  id: string;
  modified: string;
  unclassified?: boolean;
}

export type SyncAction =
  | "create-notion"
  | "create-things"
  | "update-notion"
  | "update-things"
  | "cancel-notion"
  | "skip";

export interface SyncOp {
  action: SyncAction;
  thingsId: string;
  pageId: string;
  title: string;
  fields: string[];
  detail: string;
  clearDeadline?: boolean;
  whenParam?: string;
  listId?: string;
  snapshot?: SyncSnapshot;
  /** Snapshot both sides should match after this operation. */
  hashSnapshot?: SyncSnapshot;
  warnings: string[];
}

export interface NotionRow {
  pageId: string;
  thingsId: string;
  hash: string;
  edited: string;
  snapshot: SyncSnapshot;
}

export interface PlanInput {
  today: ThingsItem[];
  linkedOutsideToday: ThingsItem[];
  notion: NotionRow[];
  missingThingsIds: Set<string>;
  todayDate: string;
  resolvedProjectId: (name: string) => "none" | "many" | string;
  resolvedAreaId: (name: string) => "none" | "many" | string;
  knownTagNames: Set<string>;
}

export const NOTION_PROPS = {
  title: "제목",
  notes: "메모",
  when: "언제",
  deadline: "마감일",
  tags: "태그",
  status: "상태",
  projectName: "프로젝트",
  projectId: "프로젝트 id",
  areaName: "영역",
  areaId: "영역 id",
  thingsId: "things_id",
  hash: "동기화 해시",
  syncedAt: "마지막 동기화",
  startFormula: "시작일",
} as const;

export const REQUIRED_SCHEMA: Record<string, string> = {
  [NOTION_PROPS.title]: "title",
  [NOTION_PROPS.notes]: "rich_text",
  [NOTION_PROPS.when]: "rich_text",
  [NOTION_PROPS.status]: "select",
  [NOTION_PROPS.deadline]: "date",
  [NOTION_PROPS.tags]: "multi_select",
  [NOTION_PROPS.projectName]: "rich_text",
  [NOTION_PROPS.projectId]: "rich_text",
  [NOTION_PROPS.areaName]: "rich_text",
  [NOTION_PROPS.areaId]: "rich_text",
  [NOTION_PROPS.thingsId]: "rich_text",
  [NOTION_PROPS.hash]: "rich_text",
  [NOTION_PROPS.syncedAt]: "date",
};

export const STATUS_TO_NOTION: Record<TodoStatus, string> = {
  open: "열림",
  completed: "완료",
  canceled: "취소",
};

export const STATUS_FROM_NOTION: Record<string, TodoStatus> = {
  열림: "open",
  완료: "completed",
  취소: "canceled",
};
