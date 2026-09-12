import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({
      name: "OpenWhispr",
      version: "1.0.0",
      description:
        "Access your OpenWhispr notes, folders, transcriptions, dictionary, snippets, and usage stats, and transcribe audio with OpenWhispr Cloud",
    });
    return;
  }

  if (req.method !== "POST") {
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

  const server = createServer(apiKey);

  // Stateless — no session persistence needed for serverless
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
