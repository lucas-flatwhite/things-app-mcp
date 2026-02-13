/**
 * Things URL Scheme builder.
 * Constructs `things:///` URLs per https://culturedcode.com/things/support/articles/2803573/
 */

const THINGS_SCHEME = "things:///";

/**
 * Encodes a value for use in a Things URL parameter.
 */
function encodeParam(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Builds a Things URL from a command and parameters.
 */
function buildURL(
  command: string,
  params: Record<string, string | boolean | undefined>
): string {
  const filteredParams = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );

  if (filteredParams.length === 0) {
    return `${THINGS_SCHEME}${command}`;
  }

  const queryString = filteredParams
    .map(([key, value]) => {
      if (typeof value === "boolean") {
        return `${key}=${value}`;
      }
      return `${key}=${encodeParam(value as string)}`;
    })
    .join("&");

  return `${THINGS_SCHEME}${command}?${queryString}`;
}

// --------------------------------------------------------------------------
// Add To-Do
// --------------------------------------------------------------------------

export interface AddTodoParams {
  /** Title of the to-do */
  title?: string;
  /** Multiple titles separated by newlines (takes priority over title) */
  titles?: string;
  /** Notes for the to-do (max 10,000 chars) */
  notes?: string;
  /** When to schedule: today, tomorrow, evening, anytime, someday, date string, or date time string */
  when?: string;
  /** Deadline as date string (yyyy-mm-dd or natural language) */
  deadline?: string;
  /** Comma-separated tag names */
  tags?: string;
  /** Checklist items separated by newlines */
  "checklist-items"?: string;
  /** ID of a project or area to add to (takes precedence over list) */
  "list-id"?: string;
  /** Title of a project or area to add to */
  list?: string;
  /** ID of a heading within a project */
  "heading-id"?: string;
  /** Title of a heading within a project */
  heading?: string;
  /** Whether to mark as completed */
  completed?: boolean;
  /** Whether to mark as canceled */
  canceled?: boolean;
  /** Whether to show the quick entry dialog */
  "show-quick-entry"?: boolean;
  /** Whether to navigate to the new to-do */
  reveal?: boolean;
  /** Creation date (ISO8601) */
  "creation-date"?: string;
  /** Completion date (ISO8601) */
  "completion-date"?: string;
}

export function buildAddTodoURL(params: AddTodoParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  // Handle titles (newline-separated) - encode newlines as %0a
  if (params.titles) {
    urlParams.titles = params.titles.replace(/\n/g, "\n");
  } else if (params.title) {
    urlParams.title = params.title;
  }

  if (params.notes) urlParams.notes = params.notes;
  if (params.when) urlParams.when = params.when;
  if (params.deadline) urlParams.deadline = params.deadline;
  if (params.tags) urlParams.tags = params.tags;
  if (params["checklist-items"]) {
    urlParams["checklist-items"] = params["checklist-items"].replace(
      /\n/g,
      "\n"
    );
  }
  if (params["list-id"]) urlParams["list-id"] = params["list-id"];
  if (params.list) urlParams.list = params.list;
  if (params["heading-id"]) urlParams["heading-id"] = params["heading-id"];
  if (params.heading) urlParams.heading = params.heading;
  if (params.completed !== undefined) urlParams.completed = params.completed;
  if (params.canceled !== undefined) urlParams.canceled = params.canceled;
  if (params["show-quick-entry"] !== undefined)
    urlParams["show-quick-entry"] = params["show-quick-entry"];
  if (params.reveal !== undefined) urlParams.reveal = params.reveal;
  if (params["creation-date"])
    urlParams["creation-date"] = params["creation-date"];
  if (params["completion-date"])
    urlParams["completion-date"] = params["completion-date"];

  return buildURL("add", urlParams);
}

// --------------------------------------------------------------------------
// Add Project
// --------------------------------------------------------------------------

export interface AddProjectParams {
  /** Title of the project */
  title?: string;
  /** Notes for the project (max 10,000 chars) */
  notes?: string;
  /** When to schedule */
  when?: string;
  /** Deadline as date string */
  deadline?: string;
  /** Comma-separated tag names */
  tags?: string;
  /** ID of an area to add to (takes precedence over area) */
  "area-id"?: string;
  /** Title of an area to add to */
  area?: string;
  /** To-do titles separated by newlines */
  "to-dos"?: string;
  /** Whether to mark as completed */
  completed?: boolean;
  /** Whether to mark as canceled */
  canceled?: boolean;
  /** Whether to navigate into the new project */
  reveal?: boolean;
  /** Creation date (ISO8601) */
  "creation-date"?: string;
  /** Completion date (ISO8601) */
  "completion-date"?: string;
}

export function buildAddProjectURL(params: AddProjectParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  if (params.title) urlParams.title = params.title;
  if (params.notes) urlParams.notes = params.notes;
  if (params.when) urlParams.when = params.when;
  if (params.deadline) urlParams.deadline = params.deadline;
  if (params.tags) urlParams.tags = params.tags;
  if (params["area-id"]) urlParams["area-id"] = params["area-id"];
  if (params.area) urlParams.area = params.area;
  if (params["to-dos"]) {
    urlParams["to-dos"] = params["to-dos"].replace(/\n/g, "\n");
  }
  if (params.completed !== undefined) urlParams.completed = params.completed;
  if (params.canceled !== undefined) urlParams.canceled = params.canceled;
  if (params.reveal !== undefined) urlParams.reveal = params.reveal;
  if (params["creation-date"])
    urlParams["creation-date"] = params["creation-date"];
  if (params["completion-date"])
    urlParams["completion-date"] = params["completion-date"];

  return buildURL("add-project", urlParams);
}

// --------------------------------------------------------------------------
// Update To-Do
// --------------------------------------------------------------------------

export interface UpdateTodoParams {
  /** Authorization token (required) */
  "auth-token": string;
  /** ID of the to-do to update (required) */
  id: string;
  /** New title */
  title?: string;
  /** Replace notes */
  notes?: string;
  /** Prepend to notes */
  "prepend-notes"?: string;
  /** Append to notes */
  "append-notes"?: string;
  /** When to schedule */
  when?: string;
  /** Deadline */
  deadline?: string;
  /** Replace all tags */
  tags?: string;
  /** Add tags */
  "add-tags"?: string;
  /** Replace checklist items */
  "checklist-items"?: string;
  /** Prepend checklist items */
  "prepend-checklist-items"?: string;
  /** Append checklist items */
  "append-checklist-items"?: string;
  /** ID of project or area to move to */
  "list-id"?: string;
  /** Title of project or area to move to */
  list?: string;
  /** ID of heading within project */
  "heading-id"?: string;
  /** Title of heading within project */
  heading?: string;
  /** Mark as completed */
  completed?: boolean;
  /** Mark as canceled */
  canceled?: boolean;
  /** Navigate to the to-do */
  reveal?: boolean;
  /** Duplicate before updating */
  duplicate?: boolean;
  /** Creation date (ISO8601) */
  "creation-date"?: string;
  /** Completion date (ISO8601) */
  "completion-date"?: string;
}

export function buildUpdateTodoURL(params: UpdateTodoParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  urlParams["auth-token"] = params["auth-token"];
  urlParams.id = params.id;

  if (params.title !== undefined) urlParams.title = params.title;
  if (params.notes !== undefined) urlParams.notes = params.notes;
  if (params["prepend-notes"])
    urlParams["prepend-notes"] = params["prepend-notes"];
  if (params["append-notes"])
    urlParams["append-notes"] = params["append-notes"];
  if (params.when !== undefined) urlParams.when = params.when;
  if (params.deadline !== undefined) urlParams.deadline = params.deadline;
  if (params.tags !== undefined) urlParams.tags = params.tags;
  if (params["add-tags"]) urlParams["add-tags"] = params["add-tags"];
  if (params["checklist-items"]) {
    urlParams["checklist-items"] = params["checklist-items"].replace(
      /\n/g,
      "\n"
    );
  }
  if (params["prepend-checklist-items"]) {
    urlParams["prepend-checklist-items"] = params[
      "prepend-checklist-items"
    ].replace(/\n/g, "\n");
  }
  if (params["append-checklist-items"]) {
    urlParams["append-checklist-items"] = params[
      "append-checklist-items"
    ].replace(/\n/g, "\n");
  }
  if (params["list-id"]) urlParams["list-id"] = params["list-id"];
  if (params.list) urlParams.list = params.list;
  if (params["heading-id"]) urlParams["heading-id"] = params["heading-id"];
  if (params.heading) urlParams.heading = params.heading;
  if (params.completed !== undefined) urlParams.completed = params.completed;
  if (params.canceled !== undefined) urlParams.canceled = params.canceled;
  if (params.reveal !== undefined) urlParams.reveal = params.reveal;
  if (params.duplicate !== undefined) urlParams.duplicate = params.duplicate;
  if (params["creation-date"])
    urlParams["creation-date"] = params["creation-date"];
  if (params["completion-date"])
    urlParams["completion-date"] = params["completion-date"];

  return buildURL("update", urlParams);
}

// --------------------------------------------------------------------------
// Update Project
// --------------------------------------------------------------------------

export interface UpdateProjectParams {
  /** Authorization token (required) */
  "auth-token": string;
  /** ID of the project to update (required) */
  id: string;
  /** New title */
  title?: string;
  /** Replace notes */
  notes?: string;
  /** Prepend to notes */
  "prepend-notes"?: string;
  /** Append to notes */
  "append-notes"?: string;
  /** When to schedule */
  when?: string;
  /** Deadline */
  deadline?: string;
  /** Replace all tags */
  tags?: string;
  /** Add tags */
  "add-tags"?: string;
  /** ID of area to move to */
  "area-id"?: string;
  /** Title of area to move to */
  area?: string;
  /** Mark as completed */
  completed?: boolean;
  /** Mark as canceled */
  canceled?: boolean;
  /** Navigate to the project */
  reveal?: boolean;
  /** Duplicate before updating */
  duplicate?: boolean;
  /** Creation date (ISO8601) */
  "creation-date"?: string;
  /** Completion date (ISO8601) */
  "completion-date"?: string;
}

export function buildUpdateProjectURL(params: UpdateProjectParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  urlParams["auth-token"] = params["auth-token"];
  urlParams.id = params.id;

  if (params.title !== undefined) urlParams.title = params.title;
  if (params.notes !== undefined) urlParams.notes = params.notes;
  if (params["prepend-notes"])
    urlParams["prepend-notes"] = params["prepend-notes"];
  if (params["append-notes"])
    urlParams["append-notes"] = params["append-notes"];
  if (params.when !== undefined) urlParams.when = params.when;
  if (params.deadline !== undefined) urlParams.deadline = params.deadline;
  if (params.tags !== undefined) urlParams.tags = params.tags;
  if (params["add-tags"]) urlParams["add-tags"] = params["add-tags"];
  if (params["area-id"]) urlParams["area-id"] = params["area-id"];
  if (params.area) urlParams.area = params.area;
  if (params.completed !== undefined) urlParams.completed = params.completed;
  if (params.canceled !== undefined) urlParams.canceled = params.canceled;
  if (params.reveal !== undefined) urlParams.reveal = params.reveal;
  if (params.duplicate !== undefined) urlParams.duplicate = params.duplicate;
  if (params["creation-date"])
    urlParams["creation-date"] = params["creation-date"];
  if (params["completion-date"])
    urlParams["completion-date"] = params["completion-date"];

  return buildURL("update-project", urlParams);
}

// --------------------------------------------------------------------------
// Show
// --------------------------------------------------------------------------

export interface ShowParams {
  /** ID of an item or built-in list to show */
  id?: string;
  /** Name of an area, project, tag, or built-in list to show */
  query?: string;
  /** Comma-separated tag names to filter by */
  filter?: string;
}

export function buildShowURL(params: ShowParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  if (params.id) urlParams.id = params.id;
  if (params.query) urlParams.query = params.query;
  if (params.filter) urlParams.filter = params.filter;

  return buildURL("show", urlParams);
}

// --------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------

export interface SearchParams {
  /** Search query text */
  query?: string;
}

export function buildSearchURL(params: SearchParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};
  if (params.query) urlParams.query = params.query;
  return buildURL("search", urlParams);
}

// --------------------------------------------------------------------------
// Version
// --------------------------------------------------------------------------

export function buildVersionURL(): string {
  return buildURL("version", {});
}

// --------------------------------------------------------------------------
// JSON (Advanced)
// --------------------------------------------------------------------------

export interface JsonParams {
  /** JSON data array containing to-do and project objects */
  data: object[];
  /** Authorization token (required for update operations) */
  "auth-token"?: string;
  /** Whether to navigate to the first created item */
  reveal?: boolean;
}

export function buildJsonURL(params: JsonParams): string {
  const urlParams: Record<string, string | boolean | undefined> = {};

  urlParams.data = JSON.stringify(params.data);
  if (params["auth-token"]) urlParams["auth-token"] = params["auth-token"];
  if (params.reveal !== undefined) urlParams.reveal = params.reveal;

  return buildURL("json", urlParams);
}
