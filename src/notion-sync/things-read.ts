import {
  getAreas,
  getProjects,
  getTags,
  jsStringLiteral,
  runJXA,
  searchTodosByTitle,
} from "../applescript.js";
import type { ThingsItem, TodoStatus } from "./types.js";
import { classifyWhen, localDate } from "./when.js";

interface RawTodo {
  id: string;
  name: string;
  status: string;
  notes: string;
  tags: string;
  dueDate: string | null;
  activationDate: string | null;
  modificationDate: string | null;
  projectId: string | null;
  projectName: string | null;
  areaId: string | null;
  areaName: string | null;
}

export interface ListIds {
  inbox: Set<string>;
  anytime: Set<string>;
  upcoming: Set<string>;
  someday: Set<string>;
}

export interface ThingsSyncSet {
  today: ThingsItem[];
  listIds: ListIds;
  projectIds: Set<string>;
  somedayProjectIds: Set<string>;
  tags: Set<string>;
  projects: Array<{ id: string; name: string }>;
  areas: Array<{ id: string; name: string }>;
  timeZone: string;
  todayDate: string;
}

function asStatus(value: string): TodoStatus {
  const status = value.toLowerCase();
  if (status === "completed" || status === "canceled") return status;
  return "open";
}

function toItem(
  raw: RawTodo,
  lists: ListIds,
  somedayProjectIds: Set<string>,
  timeZone: string,
  todayDate: string
): ThingsItem & { unclassified: boolean } {
  const projectId = raw.projectId ?? "";
  const classified = classifyWhen({
    activationDate: raw.activationDate,
    projectId: projectId || null,
    areaId: raw.areaId,
    inInbox: lists.inbox.has(raw.id),
    inSomeday: lists.someday.has(raw.id),
    inAnytime: lists.anytime.has(raw.id),
    projectIsSomeday: somedayProjectIds.has(projectId),
    timeZone,
    today: todayDate,
  });
  return {
    id: raw.id,
    title: raw.name ?? "",
    notes: raw.notes ?? "",
    when: classified.when,
    deadline: raw.dueDate ? localDate(new Date(raw.dueDate), timeZone) : "",
    tags: (raw.tags ?? "")
      .split(", ")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ""),
    status: asStatus(raw.status ?? ""),
    projectId,
    projectName: raw.projectName ?? "",
    areaId: raw.areaId ?? "",
    areaName: raw.areaName ?? "",
    modified: raw.modificationDate ?? "",
    unclassified: classified.unclassified,
  };
}

const READ_SCRIPT = `
  const things = Application("Things3");
  function readTodo(todo) {
    return {
      id: todo.id(),
      name: todo.name() || "",
      status: String(todo.status()),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      modificationDate: todo.modificationDate() ? todo.modificationDate().toISOString() : null,
      projectId: (() => { try { return todo.project().id(); } catch (e) { return null; } })(),
      projectName: (() => { try { return todo.project().name(); } catch (e) { return null; } })(),
      areaId: (() => { try { return todo.area().id(); } catch (e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch (e) { return null; } })()
    };
  }
  function ids(name) {
    return things.lists.byName(name).toDos().map(todo => todo.id());
  }
  JSON.stringify({
    today: things.lists.byName("Today").toDos().map(readTodo),
    inbox: ids("Inbox"),
    anytime: ids("Anytime"),
    upcoming: ids("Upcoming"),
    someday: ids("Someday")
  });
`;

export async function loadThingsSyncSet(now = new Date()): Promise<ThingsSyncSet> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayDate = localDate(now, timeZone);
  const [raw, projects, areas, tagList] = await Promise.all([
    runJXA<{
      today: RawTodo[];
      inbox: string[];
      anytime: string[];
      upcoming: string[];
      someday: string[];
    }>(READ_SCRIPT),
    getProjects(),
    getAreas(),
    getTags(),
  ]);
  const listIds: ListIds = {
    inbox: new Set(raw.inbox),
    anytime: new Set(raw.anytime),
    upcoming: new Set(raw.upcoming),
    someday: new Set(raw.someday),
  };
  const projectIds = new Set(projects.map((project) => project.id));
  const somedayProjectIds = new Set(
    projects
      .filter((project) => listIds.someday.has(project.id) && !project.activationDate)
      .map((project) => project.id)
  );
  const today = raw.today
    .filter((todo) => !projectIds.has(todo.id))
    .map((todo) => toItem(todo, listIds, somedayProjectIds, timeZone, todayDate));
  return {
    today,
    listIds,
    projectIds,
    somedayProjectIds,
    tags: new Set(tagList.map((tag) => tag.name)),
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    areas: areas.map((area) => ({ id: area.id, name: area.name })),
    timeZone,
    todayDate,
  };
}

export async function lookupTodo(
  id: string,
  lists: ListIds,
  somedayProjectIds: Set<string>,
  timeZone: string,
  todayDate: string
): Promise<ThingsItem | "missing"> {
  const idLiteral = jsStringLiteral(id);
  const script = `
    const things = Application("Things3");
    const todo = things.toDos.byId(${idLiteral});
    JSON.stringify({
      id: todo.id(),
      name: todo.name() || "",
      status: String(todo.status()),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      modificationDate: todo.modificationDate() ? todo.modificationDate().toISOString() : null,
      projectId: (() => { try { return todo.project().id(); } catch (e) { return null; } })(),
      projectName: (() => { try { return todo.project().name(); } catch (e) { return null; } })(),
      areaId: (() => { try { return todo.area().id(); } catch (e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch (e) { return null; } })()
    });
  `;
  try {
    const raw = await runJXA<RawTodo>(script);
    return toItem(raw, lists, somedayProjectIds, timeZone, todayDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/can.?t get|\(-1728\)|not found|찾을 수 없/i.test(message)) return "missing";
    throw error;
  }
}

export async function findCreatedTodo(
  title: string,
  now = new Date()
): Promise<string | null> {
  const matches = await searchTodosByTitle(title);
  const exact = matches.filter((todo) => {
    if (todo.name !== title) return false;
    const created = Date.parse(todo.creationDate);
    return Number.isFinite(created) && Math.abs(created - now.getTime()) <= 20_000;
  });
  return exact.length === 1 ? exact[0].id : null;
}
