import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "./client.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function json(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
// Checked on the base64 string so an oversized clip is rejected before it is decoded.
const MAX_AUDIO_BASE64_CHARS = (MAX_AUDIO_BYTES / 3) * 4;

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

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description: "List notes with optional folder filtering and cursor pagination",
      inputSchema: {
        limit: z.number().min(1).max(100).default(50).describe("Number of notes to return (1-100)"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        folder_id: z.string().uuid().optional().describe("Filter by folder ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, cursor, folder_id }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      if (folder_id) query.folder_id = folder_id;
      return json(await apiRequest({ method: "GET", path: "/notes/list", apiKey, query }));
    }
  );

  server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Get a single note by ID",
      inputSchema: { id: z.string().uuid().describe("The note ID") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/notes/${id}`,
        apiKey,
      });
      return json(data);
    }
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description: "Create a new note",
      inputSchema: {
        content: z.string().describe("The note content"),
        title: z.string().optional().describe("Optional title"),
        note_type: z
          .enum(["personal", "meeting", "upload"])
          .default("personal")
          .describe("Type of note"),
        folder_id: z.string().uuid().optional().describe("Folder to place the note in"),
      },
      annotations: { destructiveHint: false },
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

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description: "Update a note's title, content, or folder",
      inputSchema: {
        id: z.string().uuid().describe("The note ID to update"),
        title: z.string().optional().describe("New title"),
        content: z.string().optional().describe("New content"),
        enhanced_content: z.string().optional().describe("New enhanced/cleaned content"),
        folder_id: z.string().uuid().optional().describe("Move to a different folder"),
      },
      annotations: { destructiveHint: true },
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

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description: "Delete a note",
      inputSchema: { id: z.string().uuid().describe("The note ID to delete") },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/notes/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Search notes using semantic and full-text search",
      inputSchema: {
        query: z.string().min(1).max(500).describe("Search query"),
        limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
      },
      annotations: { readOnlyHint: true },
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

  server.registerTool(
    "list_folders",
    {
      title: "List folders",
      description: "List all folders",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data } = await apiRequest<{ data: Array<Record<string, unknown>> }>({
        method: "GET",
        path: "/folders/list",
        apiKey,
      });
      return json(data);
    }
  );

  server.registerTool(
    "create_folder",
    {
      title: "Create folder",
      description: "Create a new folder",
      inputSchema: {
        name: z.string().min(1).max(100).describe("Folder name"),
        sort_order: z.number().int().optional().describe("Sort position"),
      },
      annotations: { destructiveHint: false },
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

  server.registerTool(
    "list_transcriptions",
    {
      title: "List transcriptions",
      description:
        "List transcription history with cursor pagination. Supports filtering by language or linked note.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .default(50)
          .describe("Number of transcriptions to return"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        note_id: z.string().uuid().optional().describe("Filter by linked note ID"),
        language: z.string().optional().describe("Filter by detected language (e.g. 'en')"),
        include: z
          .string()
          .optional()
          .describe("Set to 'segments' to include speaker-attributed segments with timestamps"),
      },
      annotations: { readOnlyHint: true },
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

  server.registerTool(
    "get_transcription",
    {
      title: "Get transcription",
      description:
        "Get a single transcription by ID, including speaker-attributed segments with timestamps",
      inputSchema: { id: z.string().uuid().describe("The transcription ID") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/transcriptions/${id}`,
        apiKey,
      });
      return json(data);
    }
  );

  server.registerTool(
    "get_note_transcript",
    {
      title: "Get note transcript",
      description:
        "Get the transcript for a specific note. Returns structured segments if available, or raw text for older notes.",
      inputSchema: { id: z.string().uuid().describe("The note ID") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: `/notes/${id}/transcript`,
        apiKey,
      });
      return json(data);
    }
  );

  server.registerTool(
    "list_dictionary",
    {
      title: "List dictionary",
      description:
        "List the user's custom dictionary: words and names that transcription should spell exactly. Paginate with cursor while has_more is true.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(500)
          .default(200)
          .describe("Number of entries to return (1-500)"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, cursor }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      return json(await apiRequest({ method: "GET", path: "/dictionary/list", apiKey, query }));
    }
  );

  server.registerTool(
    "add_dictionary_words",
    {
      title: "Add dictionary words",
      description:
        "Add words, names, or jargon the user wants transcription to spell exactly. Words already in the dictionary are returned rather than duplicated.",
      inputSchema: {
        words: z
          .array(z.string().min(1).max(100))
          .min(1)
          .max(200)
          .describe("Words to add (1-200, each 1-100 characters)"),
      },
      annotations: { destructiveHint: false },
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

  server.registerTool(
    "update_dictionary_word",
    {
      title: "Update dictionary word",
      description: "Change the spelling of a dictionary entry",
      inputSchema: {
        id: z.string().uuid().describe("The dictionary entry ID to update"),
        word: z.string().min(1).max(100).describe("New spelling"),
      },
      annotations: { destructiveHint: true },
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

  server.registerTool(
    "delete_dictionary_word",
    {
      title: "Delete dictionary word",
      description: "Remove a word from the dictionary",
      inputSchema: { id: z.string().uuid().describe("The dictionary entry ID to delete") },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/dictionary/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.registerTool(
    "list_snippets",
    {
      title: "List snippets",
      description:
        "List the user's snippets: spoken trigger phrases that expand into saved text during dictation. Paginate with cursor while has_more is true.",
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(500)
          .default(200)
          .describe("Number of snippets to return (1-500)"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, cursor }) => {
      const query: Record<string, string> = { limit: String(limit) };
      if (cursor) query.cursor = cursor;
      return json(await apiRequest({ method: "GET", path: "/snippets/list", apiKey, query }));
    }
  );

  server.registerTool(
    "create_snippet",
    {
      title: "Create snippet",
      description:
        "Create a snippet: a spoken trigger phrase that expands into replacement text during dictation",
      inputSchema: {
        trigger: z.string().min(1).max(100).describe("Spoken phrase that triggers the expansion"),
        replacement: z
          .string()
          .min(1)
          .max(5000)
          .describe("Text inserted when the trigger is spoken"),
      },
      annotations: { destructiveHint: false },
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

  server.registerTool(
    "update_snippet",
    {
      title: "Update snippet",
      description:
        "Update a snippet's trigger phrase or replacement text. Provide at least one field.",
      inputSchema: {
        id: z.string().uuid().describe("The snippet ID to update"),
        trigger: z.string().min(1).max(100).optional().describe("New trigger phrase"),
        replacement: z.string().min(1).max(5000).optional().describe("New replacement text"),
      },
      annotations: { destructiveHint: true },
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

  server.registerTool(
    "delete_snippet",
    {
      title: "Delete snippet",
      description: "Delete a snippet",
      inputSchema: { id: z.string().uuid().describe("The snippet ID to delete") },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      await apiRequest({ method: "DELETE", path: `/snippets/${id}`, apiKey });
      return json({ deleted: true, id });
    }
  );

  server.registerTool(
    "transcribe_audio",
    {
      title: "Transcribe audio",
      description:
        "Transcribe a short audio clip (up to 3 MB) with OpenWhispr Cloud. Beta: requires a Pro or Business plan and the transcriptions:write scope; 600 minutes per month. For longer files use the OpenWhispr CLI, which can also transcribe locally for free.",
      inputSchema: {
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
      annotations: { destructiveHint: false },
    },
    async ({ audio_base64, mime_type, language, prompt }) => {
      if (audio_base64.length > MAX_AUDIO_BASE64_CHARS) {
        const size = ((audio_base64.length * 3) / 4 / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Audio is about ${size} MB, over this tool's 3 MB limit. Trim the clip, or use the OpenWhispr CLI (npm i -g @openwhispr/cli) for longer recordings.`
        );
      }
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(Buffer.from(audio_base64, "base64"))], { type: mime_type }),
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

  server.registerTool(
    "get_usage",
    {
      title: "Get usage",
      description: "Get usage statistics, word counts, and plan details",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data } = await apiRequest<{ data: Record<string, unknown> }>({
        method: "GET",
        path: "/usage",
        apiKey,
      });
      return json(data);
    }
  );

  return server;
}
