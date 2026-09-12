import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AUTHORIZATION_SERVER, MCP_RESOURCE, MCP_SCOPES } from "../lib/auth.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    resource: MCP_RESOURCE,
    authorization_servers: [AUTHORIZATION_SERVER],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
