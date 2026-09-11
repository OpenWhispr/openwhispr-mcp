import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "./client.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function json(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "webm",
};

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
    "List transcription history with cursor pagination. Supports filtering by language or linked note.",
    {
      limit: z.number().min(1).max(100).default(50).describe("Number of transcriptions to return"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      note_id: z.string().uuid().optional().describe("Filter by linked note ID"),
      language: z.string().optional().describe("Filter by detected language (e.g. 'en')"),
      include: z
        .string()
        .optional()
        .describe("Set to 'segments' to include speaker-attributed segments with timestamps"),
    },
    async ({ limit, cursor, note_id, language, include }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      if (note_id) query.note_id = note_id;
      if (language) query.language = language;
      if (include) query.include = include;
      return json(await apiRequest({ method: "GET", path: "/transcriptions/list", apiKey, query }));
    }
  );

  server.tool(
    "get_transcription",
    "Get a single transcription by ID, including speaker-attributed segments with timestamps",
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

  server.tool(
    "get_note_transcript",
    "Get the transcript for a specific note. Returns structured segments if available, or raw text for older notes.",
    { id: z.string().uuid().describe("The note ID") },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/notes/${id}/transcript`,
        apiKey,
      });
      return json(data);
    }
  );

  server.tool(
    "list_dictionary",
    "List the user's custom dictionary: words and names that transcription should spell exactly. Paginate with cursor while has_more is true.",
    {
      limit: z
        .number()
        .min(1)
        .max(500)
        .default(200)
        .describe("Number of entries to return (1-500)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    async ({ limit, cursor }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      return json(await apiRequest({ method: "GET", path: "/dictionary/list", apiKey, query }));
    }
  );

  server.tool(
    "add_dictionary_words",
    "Add words, names, or jargon the user wants transcription to spell exactly. Words already in the dictionary are returned rather than duplicated.",
    {
      words: z
        .array(z.string().min(1).max(100))
        .min(1)
        .max(200)
        .describe("Words to add (1-200, each 1-100 characters)"),
    },
    async (input) => {
      const { data } = await apiRequest<{ data: Array<Record<string, unknown>> }>({
        method: "POST",
        path: "/dictionary/create",
        apiKey,
        body: input,
      });
      return json(data);
    }
  );

  server.tool(
    "update_dictionary_word",
    "Change the spelling of a dictionary entry",
    {
      id: z.string().uuid().describe("The dictionary entry ID to update"),
      word: z.string().min(1).max(100).describe("New spelling"),
    },
    async ({ id, ...updates }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "PATCH",
        path: `/dictionary/${id}`,
        apiKey,
        body: updates,
      });
      return json(data);
    }
  );

  server.tool(
    "delete_dictionary_word",
    "Remove a word from the dictionary",
    { id: z.string().uuid().describe("The dictionary entry ID to delete") },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/dictionary/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.tool(
    "list_snippets",
    "List the user's snippets: spoken trigger phrases that expand into saved text during dictation. Paginate with cursor while has_more is true.",
    {
      limit: z
        .number()
        .min(1)
        .max(500)
        .default(200)
        .describe("Number of snippets to return (1-500)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    async ({ limit, cursor }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      return json(await apiRequest({ method: "GET", path: "/snippets/list", apiKey, query }));
    }
  );

  server.tool(
    "create_snippet",
    "Create a snippet: a spoken trigger phrase that expands into replacement text during dictation",
    {
      trigger: z.string().min(1).max(100).describe("Spoken phrase that triggers the expansion"),
      replacement: z.string().min(1).max(5000).describe("Text inserted when the trigger is spoken"),
    },
    async (input) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "POST",
        path: "/snippets/create",
        apiKey,
        body: input,
      });
      return json(data);
    }
  );

  server.tool(
    "update_snippet",
    "Update a snippet's trigger phrase or replacement text. Provide at least one field.",
    {
      id: z.string().uuid().describe("The snippet ID to update"),
      trigger: z.string().min(1).max(100).optional().describe("New trigger phrase"),
      replacement: z.string().min(1).max(5000).optional().describe("New replacement text"),
    },
    async ({ id, ...updates }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "PATCH",
        path: `/snippets/${id}`,
        apiKey,
        body: updates,
      });
      return json(data);
    }
  );

  server.tool(
    "delete_snippet",
    "Delete a snippet",
    { id: z.string().uuid().describe("The snippet ID to delete") },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/snippets/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.tool(
    "transcribe_audio",
    "Transcribe a short audio clip (up to 3 MB) with OpenWhispr Cloud. Beta: requires a Pro or Business plan and the transcriptions:write scope; 600 minutes per month. For longer files use the OpenWhispr CLI, which can also transcribe locally for free.",
    {
      audio_base64: z
        .string()
        .min(1)
        .describe(
          "Base64-encoded audio (wav, mp3, m4a, ogg, flac, or webm). Maximum 3 MB decoded."
        ),
      mime_type: z.enum([
        "audio/wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/m4a",
        "audio/ogg",
        "audio/flac",
        "audio/webm",
      ]),
      language: z.string().optional().describe("Language code (e.g. 'en' or 'pt-BR')"),
      prompt: z.string().optional().describe("Names or jargon to spell correctly"),
    },
    async ({ audio_base64, mime_type, language, prompt }) => {
      const bytes = new Uint8Array(Buffer.from(audio_base64, "base64"));
      if (bytes.length > MAX_AUDIO_BYTES) {
        const size = (bytes.length / (1024 * 1024)).toFixed(1);
        return {
          content: [
            {
              type: "text",
              text: `Audio is ${size} MB; the limit is 3 MB. Use the OpenWhispr CLI for longer recordings.`,
            },
          ],
        };
      }
      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes], { type: mime_type }),
        `clip.${AUDIO_EXTENSIONS[mime_type]}`
      );
      if (language) form.append("language", language);
      if (prompt) form.append("prompt", prompt);
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "POST",
        path: "/transcribe",
        apiKey,
        form,
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
