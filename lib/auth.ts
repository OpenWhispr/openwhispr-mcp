import { createHash } from "node:crypto";
import { z } from "zod";
import { apiUrl } from "./client.js";

export const MCP_SCOPES = [
  "notes:read",
  "notes:write",
  "transcriptions:read",
  "transcriptions:write",
  "usage:read",
  "dictionary:read",
  "dictionary:write",
  "snippets:read",
  "snippets:write",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export function isMcpScope(scope: string): scope is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(scope);
}

export const TOOL_SCOPES: Record<string, McpScope> = {
  list_notes: "notes:read",
  get_note: "notes:read",
  search_notes: "notes:read",
  list_folders: "notes:read",
  get_note_transcript: "notes:read",
  create_note: "notes:write",
  update_note: "notes:write",
  delete_note: "notes:write",
  create_folder: "notes:write",
  list_transcriptions: "transcriptions:read",
  get_transcription: "transcriptions:read",
  transcribe_audio: "transcriptions:write",
  get_usage: "usage:read",
  list_dictionary: "dictionary:read",
  add_dictionary_words: "dictionary:write",
  update_dictionary_word: "dictionary:write",
  delete_dictionary_word: "dictionary:write",
  list_snippets: "snippets:read",
  create_snippet: "snippets:write",
  update_snippet: "snippets:write",
  delete_snippet: "snippets:write",
};

export const MCP_RESOURCE = process.env.MCP_RESOURCE_URL || "https://mcp.openwhispr.com/mcp";
export const AUTHORIZATION_SERVER =
  process.env.OPENWHISPR_AUTH_URL || "https://auth.openwhispr.com";

const resource = new URL(MCP_RESOURCE);
const RESOURCE_METADATA_URL = `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;

export function buildChallenge(
  scopes: readonly string[],
  error?: "invalid_token" | "insufficient_scope"
): string {
  const params = [
    ...(error ? [`error="${error}"`] : []),
    `resource_metadata="${RESOURCE_METADATA_URL}"`,
    `scope="${scopes.join(" ")}"`,
  ];
  return `Bearer ${params.join(", ")}`;
}

const toolCall = z.object({
  method: z.literal("tools/call"),
  params: z.object({ name: z.string() }),
});

export function requiredToolScopes(body: unknown): McpScope[] {
  const messages = Array.isArray(body) ? body : [body];
  const scopes = new Set<McpScope>();
  for (const message of messages) {
    const parsed = toolCall.safeParse(message);
    if (!parsed.success) continue;
    const scope = TOOL_SCOPES[parsed.data.params.name];
    if (scope) scopes.add(scope);
  }
  return [...scopes];
}

type ValidToken = { status: "valid"; scopes: string[]; expiresAt: string | null };
export type TokenValidation = ValidToken | { status: "invalid" } | { status: "unavailable" };

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;
const cache = new Map<string, { result: ValidToken; expiresAt: number }>();

export async function validateToken(token: string): Promise<TokenValidation> {
  const key = createHash("sha256").update(token).digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  cache.delete(key);

  try {
    const res = await fetch(apiUrl("/me"), { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) return { status: "invalid" };
    if (!res.ok) return { status: "unavailable" };

    const { data } = (await res.json()) as {
      data: { scopes: string[]; expires_at: string | null };
    };
    const result: ValidToken = { status: "valid", scopes: data.scopes, expiresAt: data.expires_at };

    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    // Never serve a cached result past the token's own expiry.
    const ttl = Date.now() + CACHE_TTL_MS;
    cache.set(key, {
      result,
      expiresAt: result.expiresAt ? Math.min(ttl, Date.parse(result.expiresAt)) : ttl,
    });
    return result;
  } catch {
    return { status: "unavailable" };
  }
}
