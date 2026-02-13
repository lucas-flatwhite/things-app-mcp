/**
 * AppleScript executor for reading data from Things 3.
 * Uses `osascript` to run JXA (JavaScript for Automation) or AppleScript.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Executes an AppleScript and returns the output.
 */
async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 15000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(
      `AppleScript execution failed: ${err.stderr || err.message}`
    );
  }
}

/**
 * Executes JXA (JavaScript for Automation) and returns parsed JSON.
 */
async function runJXA<T>(script: string): Promise<T> {
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 5,
      }
    );
    return JSON.parse(stdout.trim()) as T;
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(`JXA execution failed: ${err.stderr || err.message}`);
  }
}

/**
 * Opens a Things URL scheme link via `open` command on macOS.
 */
export async function openThingsURL(url: string): Promise<string> {
  try {
    await execFileAsync("open", [url], { timeout: 10000 });
    return `Successfully opened Things URL: ${url}`;
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(
      `Failed to open Things URL: ${err.stderr || err.message}`
    );
  }
}

// --------------------------------------------------------------------------
// Things Data Types
// --------------------------------------------------------------------------

export interface ThingsTodo {
  id: string;
  name: string;
  status: "open" | "completed" | "canceled";
  notes: string;
  tags: string;
  dueDate: string | null;
  activationDate: string | null;
  creationDate: string;
  modificationDate: string;
  completionDate: string | null;
  projectName: string | null;
  areaName: string | null;
}

export interface ThingsProject {
  id: string;
  name: string;
  status: "open" | "completed" | "canceled";
  notes: string;
  tags: string;
  dueDate: string | null;
  activationDate: string | null;
  creationDate: string;
  modificationDate: string;
  completionDate: string | null;
  areaName: string | null;
  todoCount: number;
}

export interface ThingsArea {
  id: string;
  name: string;
  tags: string;
}

export interface ThingsTag {
  name: string;
}

// --------------------------------------------------------------------------
// Query Functions
// --------------------------------------------------------------------------

/**
 * Get to-dos from a specific list (inbox, today, anytime, upcoming, someday, logbook).
 */
export async function getTodosFromList(
  listName: string
): Promise<ThingsTodo[]> {
  const validLists = [
    "Inbox",
    "Today",
    "Anytime",
    "Upcoming",
    "Someday",
    "Logbook",
    "Trash",
  ];
  const normalizedList =
    listName.charAt(0).toUpperCase() + listName.slice(1).toLowerCase();

  if (!validLists.includes(normalizedList)) {
    throw new Error(
      `Invalid list name: ${listName}. Valid lists are: ${validLists.join(", ")}`
    );
  }

  const script = `
    const things = Application("Things3");
    const todos = things.lists.byName("${normalizedList}").toDos();
    const result = todos.map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}

/**
 * Get to-dos from a specific project by name.
 */
export async function getTodosFromProject(
  projectName: string
): Promise<ThingsTodo[]> {
  const escapedName = projectName.replace(/"/g, '\\"');
  const script = `
    const things = Application("Things3");
    const todos = things.projects.byName("${escapedName}").toDos();
    const result = todos.map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: "${escapedName}",
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}

/**
 * Get to-dos from a specific area by name.
 */
export async function getTodosFromArea(
  areaName: string
): Promise<ThingsTodo[]> {
  const escapedName = areaName.replace(/"/g, '\\"');
  const script = `
    const things = Application("Things3");
    const todos = things.areas.byName("${escapedName}").toDos();
    const result = todos.map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: "${escapedName}"
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}

/**
 * Get a specific to-do by ID.
 */
export async function getTodoById(id: string): Promise<ThingsTodo> {
  const escapedId = id.replace(/"/g, '\\"');
  const script = `
    const things = Application("Things3");
    const todo = things.toDos.byId("${escapedId}");
    const result = {
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    };
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo>(script);
}

/**
 * Get all projects.
 */
export async function getProjects(): Promise<ThingsProject[]> {
  const script = `
    const things = Application("Things3");
    const projects = things.projects();
    const result = projects.map(proj => ({
      id: proj.id(),
      name: proj.name(),
      status: proj.status(),
      notes: proj.notes() || "",
      tags: proj.tagNames() || "",
      dueDate: proj.dueDate() ? proj.dueDate().toISOString() : null,
      activationDate: proj.activationDate() ? proj.activationDate().toISOString() : null,
      creationDate: proj.creationDate().toISOString(),
      modificationDate: proj.modificationDate().toISOString(),
      completionDate: proj.completionDate() ? proj.completionDate().toISOString() : null,
      areaName: (() => { try { return proj.area().name(); } catch(e) { return null; } })(),
      todoCount: proj.toDos().length
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsProject[]>(script);
}

/**
 * Get a specific project by ID.
 */
export async function getProjectById(id: string): Promise<ThingsProject> {
  const escapedId = id.replace(/"/g, '\\"');
  const script = `
    const things = Application("Things3");
    const proj = things.projects.byId("${escapedId}");
    const result = {
      id: proj.id(),
      name: proj.name(),
      status: proj.status(),
      notes: proj.notes() || "",
      tags: proj.tagNames() || "",
      dueDate: proj.dueDate() ? proj.dueDate().toISOString() : null,
      activationDate: proj.activationDate() ? proj.activationDate().toISOString() : null,
      creationDate: proj.creationDate().toISOString(),
      modificationDate: proj.modificationDate().toISOString(),
      completionDate: proj.completionDate() ? proj.completionDate().toISOString() : null,
      areaName: (() => { try { return proj.area().name(); } catch(e) { return null; } })(),
      todoCount: proj.toDos().length
    };
    JSON.stringify(result);
  `;
  return runJXA<ThingsProject>(script);
}

/**
 * Get all areas.
 */
export async function getAreas(): Promise<ThingsArea[]> {
  const script = `
    const things = Application("Things3");
    const areas = things.areas();
    const result = areas.map(area => ({
      id: area.id(),
      name: area.name(),
      tags: area.tagNames() || ""
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsArea[]>(script);
}

/**
 * Get all tags.
 */
export async function getTags(): Promise<ThingsTag[]> {
  const script = `
    const things = Application("Things3");
    const tags = things.tags();
    const result = tags.map(tag => ({
      name: tag.name()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTag[]>(script);
}

/**
 * Get to-dos tagged with a specific tag name.
 */
export async function getTodosByTag(tagName: string): Promise<ThingsTodo[]> {
  const escapedName = tagName.replace(/"/g, '\\"');
  const script = `
    const things = Application("Things3");
    const allTodos = things.toDos();
    const result = allTodos.filter(todo => {
      const tags = todo.tagNames() || "";
      return tags.split(", ").some(t => t === "${escapedName}");
    }).map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}

/**
 * Get recently modified to-dos (within the last N days).
 */
export async function getRecentTodos(days: number = 7): Promise<ThingsTodo[]> {
  const script = `
    const things = Application("Things3");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ${days});
    const allTodos = things.toDos();
    const result = allTodos.filter(todo => {
      const modDate = todo.modificationDate();
      return modDate && modDate >= cutoff;
    }).map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}

/**
 * Search for to-dos by title substring.
 */
export async function searchTodosByTitle(
  query: string
): Promise<ThingsTodo[]> {
  const escapedQuery = query.replace(/"/g, '\\"').replace(/\\/g, "\\\\");
  const script = `
    const things = Application("Things3");
    const allTodos = things.toDos();
    const queryLower = "${escapedQuery}".toLowerCase();
    const result = allTodos.filter(todo => {
      const name = todo.name() || "";
      const notes = todo.notes() || "";
      return name.toLowerCase().includes(queryLower) || notes.toLowerCase().includes(queryLower);
    }).map(todo => ({
      id: todo.id(),
      name: todo.name(),
      status: todo.status(),
      notes: todo.notes() || "",
      tags: todo.tagNames() || "",
      dueDate: todo.dueDate() ? todo.dueDate().toISOString() : null,
      activationDate: todo.activationDate() ? todo.activationDate().toISOString() : null,
      creationDate: todo.creationDate().toISOString(),
      modificationDate: todo.modificationDate().toISOString(),
      completionDate: todo.completionDate() ? todo.completionDate().toISOString() : null,
      projectName: (() => { try { return todo.project().name(); } catch(e) { return null; } })(),
      areaName: (() => { try { return todo.area().name(); } catch(e) { return null; } })()
    }));
    JSON.stringify(result);
  `;
  return runJXA<ThingsTodo[]>(script);
}
