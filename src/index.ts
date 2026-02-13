#!/usr/bin/env node

/**
 * Things MCP Server
 *
 * An MCP server that provides tools and resources for interacting with
 * Things 3 (macOS) via the Things URL Scheme and AppleScript/JXA.
 *
 * Tools (write operations via URL scheme):
 *   - add-todo: Create a new to-do
 *   - add-project: Create a new project
 *   - update-todo: Update an existing to-do (requires auth-token)
 *   - update-project: Update an existing project (requires auth-token)
 *   - show: Navigate to a list, project, area, tag, or to-do
 *   - search: Open the search screen in Things
 *   - add-json: Create complex projects/to-dos via JSON
 *
 * Tools (read operations via AppleScript/JXA):
 *   - get-todos: Get to-dos from a list, project, area, or by tag
 *   - get-projects: Get all projects
 *   - get-areas: Get all areas
 *   - get-tags: Get all tags
 *   - get-todo-by-id: Get a specific to-do by ID
 *   - get-project-by-id: Get a specific project by ID
 *   - search-todos: Search to-dos by title/notes content
 *   - get-recent-todos: Get recently modified to-dos
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  buildAddTodoURL,
  buildAddProjectURL,
  buildUpdateTodoURL,
  buildUpdateProjectURL,
  buildShowURL,
  buildSearchURL,
  buildJsonURL,
} from "./things-url.js";

import {
  openThingsURL,
  getTodosFromList,
  getTodosFromProject,
  getTodosFromArea,
  getTodoById,
  getProjects,
  getProjectById,
  getAreas,
  getTags,
  getTodosByTag,
  getRecentTodos,
  searchTodosByTitle,
} from "./applescript.js";

// --------------------------------------------------------------------------
// Server Setup
// --------------------------------------------------------------------------

const server = new McpServer(
  {
    name: "things-app-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --------------------------------------------------------------------------
// URL Scheme Tools (Write Operations)
// --------------------------------------------------------------------------

server.registerTool(
  "add-todo",
  {
    title: "Add To-Do",
    description:
      "Create a new to-do in Things. Supports setting title, notes, when/deadline dates, tags, checklist items, and assigning to projects/areas. Uses the Things URL scheme.",
    inputSchema: {
      title: z
        .string()
        .optional()
        .describe("Title of the to-do"),
      titles: z
        .string()
        .optional()
        .describe(
          "Multiple to-do titles separated by newlines (takes priority over title)"
        ),
      notes: z
        .string()
        .optional()
        .describe("Notes for the to-do (max 10,000 chars)"),
      when: z
        .string()
        .optional()
        .describe(
          "When to schedule: today, tomorrow, evening, anytime, someday, YYYY-MM-DD, or YYYY-MM-DD@HH:MM for a reminder"
        ),
      deadline: z
        .string()
        .optional()
        .describe(
          "Deadline date: YYYY-MM-DD or natural language like 'next friday'"
        ),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tag names (must already exist in Things)"),
      checklistItems: z
        .string()
        .optional()
        .describe("Checklist items separated by newlines (max 100)"),
      listId: z
        .string()
        .optional()
        .describe(
          "ID of a project or area to add to (takes precedence over list)"
        ),
      list: z
        .string()
        .optional()
        .describe("Title of a project or area to add to"),
      headingId: z
        .string()
        .optional()
        .describe("ID of a heading within a project"),
      heading: z
        .string()
        .optional()
        .describe("Title of a heading within a project"),
      completed: z
        .boolean()
        .optional()
        .describe("Set to true to mark as completed"),
      canceled: z
        .boolean()
        .optional()
        .describe("Set to true to mark as canceled (takes priority over completed)"),
      showQuickEntry: z
        .boolean()
        .optional()
        .describe("Show the quick entry dialog instead of adding directly"),
      reveal: z
        .boolean()
        .optional()
        .describe("Navigate to and show the newly created to-do"),
      creationDate: z
        .string()
        .optional()
        .describe("Creation date in ISO8601 format"),
      completionDate: z
        .string()
        .optional()
        .describe("Completion date in ISO8601 format"),
    },
    annotations: {
      title: "Add To-Do",
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildAddTodoURL({
      title: args.title,
      titles: args.titles,
      notes: args.notes,
      when: args.when,
      deadline: args.deadline,
      tags: args.tags,
      "checklist-items": args.checklistItems,
      "list-id": args.listId,
      list: args.list,
      "heading-id": args.headingId,
      heading: args.heading,
      completed: args.completed,
      canceled: args.canceled,
      "show-quick-entry": args.showQuickEntry,
      reveal: args.reveal,
      "creation-date": args.creationDate,
      "completion-date": args.completionDate,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [
          {
            type: "text" as const,
            text: `${result}\n\nURL: ${url}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating to-do: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "add-project",
  {
    title: "Add Project",
    description:
      "Create a new project in Things. Supports setting title, notes, when/deadline dates, tags, area assignment, and initial to-dos.",
    inputSchema: {
      title: z
        .string()
        .optional()
        .describe("Title of the project"),
      notes: z
        .string()
        .optional()
        .describe("Notes for the project (max 10,000 chars)"),
      when: z
        .string()
        .optional()
        .describe(
          "When to schedule: today, tomorrow, evening, anytime, someday, YYYY-MM-DD, or YYYY-MM-DD@HH:MM"
        ),
      deadline: z
        .string()
        .optional()
        .describe("Deadline date: YYYY-MM-DD or natural language"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tag names"),
      areaId: z
        .string()
        .optional()
        .describe("ID of an area to add to (takes precedence over area)"),
      area: z
        .string()
        .optional()
        .describe("Title of an area to add to"),
      todos: z
        .string()
        .optional()
        .describe(
          "To-do titles separated by newlines to create inside the project"
        ),
      completed: z.boolean().optional().describe("Set to true to mark as completed"),
      canceled: z.boolean().optional().describe("Set to true to mark as canceled"),
      reveal: z
        .boolean()
        .optional()
        .describe("Navigate into the newly created project"),
      creationDate: z.string().optional().describe("Creation date in ISO8601 format"),
      completionDate: z.string().optional().describe("Completion date in ISO8601 format"),
    },
    annotations: {
      title: "Add Project",
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildAddProjectURL({
      title: args.title,
      notes: args.notes,
      when: args.when,
      deadline: args.deadline,
      tags: args.tags,
      "area-id": args.areaId,
      area: args.area,
      "to-dos": args.todos,
      completed: args.completed,
      canceled: args.canceled,
      reveal: args.reveal,
      "creation-date": args.creationDate,
      "completion-date": args.completionDate,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [{ type: "text" as const, text: `${result}\n\nURL: ${url}` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error creating project: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update-todo",
  {
    title: "Update To-Do",
    description:
      "Update an existing to-do in Things. Requires the to-do ID and your Things auth-token. Supports changing title, notes, dates, tags, checklist, list assignment, and status.",
    inputSchema: {
      authToken: z
        .string()
        .describe(
          "Things URL scheme authorization token (find in Things Settings > General > Things URLs)"
        ),
      id: z.string().describe("ID of the to-do to update"),
      title: z.string().optional().describe("New title"),
      notes: z
        .string()
        .optional()
        .describe("Replace notes (pass empty string to clear)"),
      prependNotes: z.string().optional().describe("Text to prepend to existing notes"),
      appendNotes: z.string().optional().describe("Text to append to existing notes"),
      when: z
        .string()
        .optional()
        .describe(
          "When to schedule: today, tomorrow, evening, someday, YYYY-MM-DD, or YYYY-MM-DD@HH:MM"
        ),
      deadline: z
        .string()
        .optional()
        .describe("Deadline date (pass empty string to clear)"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags to replace all current tags"),
      addTags: z
        .string()
        .optional()
        .describe("Comma-separated tags to add to existing tags"),
      checklistItems: z
        .string()
        .optional()
        .describe("Newline-separated checklist items to replace all existing"),
      prependChecklistItems: z
        .string()
        .optional()
        .describe("Newline-separated checklist items to prepend"),
      appendChecklistItems: z
        .string()
        .optional()
        .describe("Newline-separated checklist items to append"),
      listId: z
        .string()
        .optional()
        .describe("ID of project or area to move to"),
      list: z
        .string()
        .optional()
        .describe("Title of project or area to move to"),
      headingId: z.string().optional().describe("ID of heading within project"),
      heading: z.string().optional().describe("Title of heading within project"),
      completed: z.boolean().optional().describe("Set completion status"),
      canceled: z.boolean().optional().describe("Set canceled status"),
      reveal: z.boolean().optional().describe("Navigate to the updated to-do"),
      duplicate: z
        .boolean()
        .optional()
        .describe("Duplicate the to-do before updating"),
      creationDate: z.string().optional().describe("Creation date in ISO8601 format"),
      completionDate: z.string().optional().describe("Completion date in ISO8601 format"),
    },
    annotations: {
      title: "Update To-Do",
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildUpdateTodoURL({
      "auth-token": args.authToken,
      id: args.id,
      title: args.title,
      notes: args.notes,
      "prepend-notes": args.prependNotes,
      "append-notes": args.appendNotes,
      when: args.when,
      deadline: args.deadline,
      tags: args.tags,
      "add-tags": args.addTags,
      "checklist-items": args.checklistItems,
      "prepend-checklist-items": args.prependChecklistItems,
      "append-checklist-items": args.appendChecklistItems,
      "list-id": args.listId,
      list: args.list,
      "heading-id": args.headingId,
      heading: args.heading,
      completed: args.completed,
      canceled: args.canceled,
      reveal: args.reveal,
      duplicate: args.duplicate,
      "creation-date": args.creationDate,
      "completion-date": args.completionDate,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [{ type: "text" as const, text: `${result}\n\nURL: ${url}` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating to-do: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "update-project",
  {
    title: "Update Project",
    description:
      "Update an existing project in Things. Requires the project ID and your Things auth-token.",
    inputSchema: {
      authToken: z
        .string()
        .describe("Things URL scheme authorization token"),
      id: z.string().describe("ID of the project to update"),
      title: z.string().optional().describe("New title"),
      notes: z.string().optional().describe("Replace notes"),
      prependNotes: z.string().optional().describe("Text to prepend to existing notes"),
      appendNotes: z.string().optional().describe("Text to append to existing notes"),
      when: z.string().optional().describe("When to schedule"),
      deadline: z.string().optional().describe("Deadline date"),
      tags: z.string().optional().describe("Replace all tags"),
      addTags: z.string().optional().describe("Add tags"),
      areaId: z.string().optional().describe("ID of area to move to"),
      area: z.string().optional().describe("Title of area to move to"),
      completed: z.boolean().optional().describe("Set completion status"),
      canceled: z.boolean().optional().describe("Set canceled status"),
      reveal: z.boolean().optional().describe("Navigate to the project"),
      duplicate: z.boolean().optional().describe("Duplicate before updating"),
      creationDate: z.string().optional().describe("Creation date in ISO8601"),
      completionDate: z.string().optional().describe("Completion date in ISO8601"),
    },
    annotations: {
      title: "Update Project",
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildUpdateProjectURL({
      "auth-token": args.authToken,
      id: args.id,
      title: args.title,
      notes: args.notes,
      "prepend-notes": args.prependNotes,
      "append-notes": args.appendNotes,
      when: args.when,
      deadline: args.deadline,
      tags: args.tags,
      "add-tags": args.addTags,
      "area-id": args.areaId,
      area: args.area,
      completed: args.completed,
      canceled: args.canceled,
      reveal: args.reveal,
      duplicate: args.duplicate,
      "creation-date": args.creationDate,
      "completion-date": args.completionDate,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [{ type: "text" as const, text: `${result}\n\nURL: ${url}` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error updating project: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "show",
  {
    title: "Show in Things",
    description:
      "Navigate to and show a list, project, area, tag, or to-do in Things. Built-in list IDs: inbox, today, anytime, upcoming, someday, logbook, tomorrow, deadlines, repeating, all-projects, logged-projects.",
    inputSchema: {
      id: z
        .string()
        .optional()
        .describe(
          "ID of item to show, or a built-in list ID (inbox, today, anytime, upcoming, someday, logbook, tomorrow, deadlines, repeating, all-projects, logged-projects)"
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Name of an area, project, tag, or built-in list to show (ignored if id is set)"
        ),
      filter: z
        .string()
        .optional()
        .describe("Comma-separated tag names to filter the list by"),
    },
    annotations: {
      title: "Show in Things",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildShowURL({
      id: args.id,
      query: args.query,
      filter: args.filter,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [{ type: "text" as const, text: `${result}\n\nURL: ${url}` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error showing in Things: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search",
  {
    title: "Search in Things",
    description: "Open the search screen in Things with an optional search query.",
    inputSchema: {
      query: z.string().optional().describe("Search query text"),
    },
    annotations: {
      title: "Search in Things",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    const url = buildSearchURL({ query: args.query });

    try {
      const result = await openThingsURL(url);
      return {
        content: [{ type: "text" as const, text: `${result}\n\nURL: ${url}` }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching in Things: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "add-json",
  {
    title: "Add via JSON",
    description:
      'Create complex projects and to-dos using the Things JSON command. Supports nested projects with headings, checklist items, and to-dos. The data should be an array of objects with "type" (to-do, project, heading, checklist-item) and "attributes" fields. For updates, include "operation": "update" and "id" fields, and provide auth-token.',
    inputSchema: {
      data: z
        .string()
        .describe(
          "JSON string containing an array of Things objects. Each object has 'type' (to-do/project/heading/checklist-item), optional 'operation' (create/update), optional 'id' (for updates), and 'attributes' (title, notes, when, deadline, tags, items, etc.)"
        ),
      authToken: z
        .string()
        .optional()
        .describe(
          "Things auth-token (required when data contains update operations)"
        ),
      reveal: z
        .boolean()
        .optional()
        .describe("Navigate to the first created item"),
    },
    annotations: {
      title: "Add via JSON",
      openWorldHint: true,
    },
  },
  async (args) => {
    let parsedData: object[];
    try {
      parsedData = JSON.parse(args.data);
      if (!Array.isArray(parsedData)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: data must be a JSON array of Things objects",
            },
          ],
          isError: true,
        };
      }
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Invalid JSON string. The data must be a valid JSON array.",
          },
        ],
        isError: true,
      };
    }

    const url = buildJsonURL({
      data: parsedData,
      "auth-token": args.authToken,
      reveal: args.reveal,
    });

    try {
      const result = await openThingsURL(url);
      return {
        content: [
          {
            type: "text" as const,
            text: `${result}\n\nURL: ${url}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error executing JSON command: ${error instanceof Error ? error.message : String(error)}\n\nAttempted URL: ${url}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --------------------------------------------------------------------------
// AppleScript/JXA Tools (Read Operations)
// --------------------------------------------------------------------------

server.registerTool(
  "get-todos",
  {
    title: "Get To-Dos",
    description:
      "Get to-dos from Things by list, project, area, or tag. Specify exactly one source. Uses AppleScript (macOS only).",
    inputSchema: {
      list: z
        .string()
        .optional()
        .describe(
          "Built-in list name: Inbox, Today, Anytime, Upcoming, Someday, Logbook"
        ),
      project: z
        .string()
        .optional()
        .describe("Project name to get to-dos from"),
      area: z
        .string()
        .optional()
        .describe("Area name to get to-dos from"),
      tag: z
        .string()
        .optional()
        .describe("Tag name to filter to-dos by"),
    },
    annotations: {
      title: "Get To-Dos",
      readOnlyHint: true,
    },
  },
  async (args) => {
    try {
      let todos;
      if (args.list) {
        todos = await getTodosFromList(args.list);
      } else if (args.project) {
        todos = await getTodosFromProject(args.project);
      } else if (args.area) {
        todos = await getTodosFromArea(args.area);
      } else if (args.tag) {
        todos = await getTodosByTag(args.tag);
      } else {
        // Default to Today
        todos = await getTodosFromList("Today");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(todos, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting to-dos: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-todo-by-id",
  {
    title: "Get To-Do by ID",
    description: "Get a specific to-do by its ID. Uses AppleScript (macOS only).",
    inputSchema: {
      id: z.string().describe("The ID of the to-do to retrieve"),
    },
    annotations: {
      title: "Get To-Do by ID",
      readOnlyHint: true,
    },
  },
  async (args) => {
    try {
      const todo = await getTodoById(args.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(todo, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting to-do: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-projects",
  {
    title: "Get Projects",
    description: "Get all projects from Things. Uses AppleScript (macOS only).",
    inputSchema: {},
    annotations: {
      title: "Get Projects",
      readOnlyHint: true,
    },
  },
  async () => {
    try {
      const projects = await getProjects();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting projects: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-project-by-id",
  {
    title: "Get Project by ID",
    description: "Get a specific project by its ID. Uses AppleScript (macOS only).",
    inputSchema: {
      id: z.string().describe("The ID of the project to retrieve"),
    },
    annotations: {
      title: "Get Project by ID",
      readOnlyHint: true,
    },
  },
  async (args) => {
    try {
      const project = await getProjectById(args.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting project: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-areas",
  {
    title: "Get Areas",
    description: "Get all areas from Things. Uses AppleScript (macOS only).",
    inputSchema: {},
    annotations: {
      title: "Get Areas",
      readOnlyHint: true,
    },
  },
  async () => {
    try {
      const areas = await getAreas();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(areas, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting areas: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-tags",
  {
    title: "Get Tags",
    description: "Get all tags from Things. Uses AppleScript (macOS only).",
    inputSchema: {},
    annotations: {
      title: "Get Tags",
      readOnlyHint: true,
    },
  },
  async () => {
    try {
      const tags = await getTags();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(tags, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting tags: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search-todos",
  {
    title: "Search To-Dos",
    description:
      "Search for to-dos by title or notes content. Uses AppleScript (macOS only).",
    inputSchema: {
      query: z
        .string()
        .describe("Search query to match against to-do titles and notes"),
    },
    annotations: {
      title: "Search To-Dos",
      readOnlyHint: true,
    },
  },
  async (args) => {
    try {
      const todos = await searchTodosByTitle(args.query);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(todos, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching to-dos: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "get-recent-todos",
  {
    title: "Get Recent To-Dos",
    description:
      "Get recently modified to-dos. Uses AppleScript (macOS only).",
    inputSchema: {
      days: z
        .number()
        .optional()
        .describe("Number of days to look back (default: 7)"),
    },
    annotations: {
      title: "Get Recent To-Dos",
      readOnlyHint: true,
    },
  },
  async (args) => {
    try {
      const todos = await getRecentTodos(args.days ?? 7);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(todos, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting recent to-dos: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --------------------------------------------------------------------------
// Start Server
// --------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Things MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
