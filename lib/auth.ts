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

const policyDescriptions = {
  api_access_disabled: "Your organization has turned off API and MCP access.",
  policy_unresolvable:
    "Your organization's policy could not be resolved. Contact your workspace admin.",
} as const;

type PolicyCode = keyof typeof policyDescriptions;

function isPolicyCode(code: string): code is PolicyCode {
  return Object.hasOwn(policyDescriptions, code);
}

export type TokenValidation =
  | { status: "valid"; scopes: string[] }
  | { status: "forbidden"; code: PolicyCode | "forbidden"; description: string }
  | { status: "invalid" }
  | { status: "rate_limited"; retryAfter: string | null }
  | { status: "unavailable" };

const apiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().trim().min(1).max(512).catch(""),
  }),
});

async function forbiddenToken(res: Response): Promise<TokenValidation> {
  const body = apiErrorBody.safeParse(await res.json().catch(() => null));
  // Without the API's error body the 403 came from the edge (e.g. Vercel's firewall), not a policy.
  if (!body.success) return { status: "unavailable" };
  const { code, message } = body.data.error;
  if (isPolicyCode(code)) {
    return { status: "forbidden", code, description: message || policyDescriptions[code] };
  }
  return {
    status: "forbidden",
    code: "forbidden",
    description: "OpenWhispr API access was denied",
  };
}

function parseRetryAfter(value: string | null): string | null {
  return value !== null && /^\d+$/.test(value) ? value : null;
}

export async function validateToken(token: string): Promise<TokenValidation> {
  try {
    // Claude gives up on a tool call after 10 s; a hung API must not consume all of it.
    const res = await fetch(apiUrl("/me?purpose=mcp-auth"), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 401) return { status: "invalid" };
    if (res.status === 403) return await forbiddenToken(res);
    if (res.status === 429) {
      return {
        status: "rate_limited",
        retryAfter: parseRetryAfter(res.headers.get("Retry-After")),
      };
    }
    if (!res.ok) return { status: "unavailable" };

    const { data } = (await res.json()) as { data: { scopes: string[] } };
    return { status: "valid", scopes: data.scopes };
  } catch {
    return { status: "unavailable" };
  }
}
