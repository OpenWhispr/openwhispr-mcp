import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../lib/server.js";
import {
  MCP_SCOPES,
  buildChallenge,
  isMcpScope,
  requiredToolScopes,
  validateToken,
} from "../lib/auth.js";

function unauthorized(res: VercelResponse, description: string, error?: "invalid_token"): void {
  res.setHeader("WWW-Authenticate", buildChallenge(MCP_SCOPES, error));
  res.status(401).json({ error: "invalid_token", error_description: description });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Streamable HTTP clients GET this endpoint to listen for server-sent messages. A stateless
  // server has none, and 405 is how the spec says so: any 200 reads as a stream that just
  // closed, which clients reopen every second for as long as they stay connected.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!apiKey) {
    unauthorized(res, "Missing Authorization: Bearer <token> header");
    return;
  }

  const token = await validateToken(apiKey);
  if (token.status === "invalid") {
    unauthorized(res, "The access token is invalid, expired, or revoked", "invalid_token");
    return;
  }
  if (token.status === "unavailable") {
    res.status(503).json({
      error: "upstream_unavailable",
      error_description: "OpenWhispr API is unavailable, retry shortly",
    });
    return;
  }

  const missing = requiredToolScopes(req.body).filter((scope) => !token.scopes.includes(scope));
  if (missing.length > 0) {
    // API keys may carry scopes the authorization server does not issue; only
    // advertise what a re-consent can actually grant.
    res.setHeader(
      "WWW-Authenticate",
      buildChallenge([...token.scopes.filter(isMcpScope), ...missing], "insufficient_scope")
    );
    res.status(403).json({
      error: "insufficient_scope",
      error_description: `This action requires the ${missing.join(", ")} scope`,
    });
    return;
  }

  // Stateless: a fresh server per request, scoped to this caller's key. The handler answers
  // the 2026-07-28 protocol directly and serves 2025-era clients, which still open with
  // `initialize`, through the SDK's stateless legacy fallback.
  const mcp = createMcpHandler(() => createServer(apiKey));
  await toNodeHandler(mcp)(req, res, req.body);
}
