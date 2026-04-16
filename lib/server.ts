import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "./client.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function json(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function createServer(apiKey: string): McpServer {
  const server = new McpServer({ name: "OpenWhispr", version: "1.0.0" });

  server.tool(
    "list_notes",
    "List notes with optional folder filtering and cursor pagination",
    {
      limit: z.number().min(1).max(100).default(50).describe("Number of notes to return (1-100)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      folder_id: z.string().uuid().optional().describe("Filter by folder ID"),
    },
    async ({ limit, cursor, folder_id }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      if (folder_id) query.folder_id = folder_id;
      return json(await apiRequest({ method: "GET", path: "/notes/list", apiKey, query }));
    }
  );

  server.tool(
    "get_note",
    "Get a single note by ID",
    { id: z.string().uuid().describe("The note ID") },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/notes/${id}`,
        apiKey,
      });
      return json(data);
    }
  );

  server.tool(
    "create_note",
    "Create a new note",
    {
      content: z.string().describe("The note content"),
      title: z.string().optional().describe("Optional title"),
      note_type: z
        .enum(["personal", "meeting", "upload"])
        .default("personal")
        .describe("Type of note"),
      folder_id: z.string().uuid().optional().describe("Folder to place the note in"),
    },
    async (input) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "POST",
        path: "/notes/create",
        apiKey,
        body: input,
      });
      return json(data);
    }
  );

  server.tool(
    "update_note",
    "Update a note's title, content, or folder",
    {
      id: z.string().uuid().describe("The note ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      enhanced_content: z.string().optional().describe("New enhanced/cleaned content"),
      folder_id: z.string().uuid().optional().describe("Move to a different folder"),
    },
    async ({ id, ...updates }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "PATCH",
        path: `/notes/${id}`,
        apiKey,
        body: updates,
      });
      return json(data);
    }
  );

  server.tool(
    "delete_note",
    "Delete a note",
    { id: z.string().uuid().describe("The note ID to delete") },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/notes/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.tool(
    "search_notes",
    "Search notes using semantic and full-text search",
    {
      query: z.string().min(1).max(500).describe("Search query"),
      limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
    },
    async (input) => {
      const { data } = await apiRequest<{ data: Array<Record<string, unknown>> }>({
        method: "POST",
        path: "/notes/search",
        apiKey,
        body: input,
      });
      return json(data);
    }
  );

  server.tool("list_folders", "List all folders", {}, async () => {
    const { data } = await apiRequest<{ data: Array<Record<string, unknown>> }>({
      method: "GET",
      path: "/folders/list",
      apiKey,
    });
    return json(data);
  });

  server.tool(
    "create_folder",
    "Create a new folder",
    {
      name: z.string().min(1).max(100).describe("Folder name"),
      sort_order: z.number().int().optional().describe("Sort position"),
    },
    async (input) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "POST",
        path: "/folders/create",
        apiKey,
        body: input,
      });
      return json(data);
    }
  );

  server.tool(
    "list_transcriptions",
    "List transcription history with cursor pagination",
    {
      limit: z.number().min(1).max(100).default(50).describe("Number of transcriptions to return"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    async ({ limit, cursor }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      return json(await apiRequest({ method: "GET", path: "/transcriptions/list", apiKey, query }));
    }
  );

  server.tool(
    "get_transcription",
    "Get a single transcription by ID",
    { id: z.string().uuid().describe("The transcription ID") },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/transcriptions/${id}`,
        apiKey,
      });
      return json(data);
    }
  );

  server.tool("get_usage", "Get usage statistics, word counts, and plan details", {}, async () => {
    const { data } = await apiRequest<{ data: Record<string, unknown> }>({
      method: "GET",
      path: "/usage",
      apiKey,
    });
    return json(data);
  });

  return server;
}
