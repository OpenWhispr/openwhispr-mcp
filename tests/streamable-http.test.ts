import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, type TestContext } from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import handler from "../api/mcp.js";
import { MCP_SCOPES } from "../lib/auth.js";

async function request(method: string) {
  const result = { status: 0, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) {
      result.headers[name] = value;
    },
    status(code: number) {
      result.status = code;
      return this;
    },
    json() {},
    end() {},
  };
  await handler({ method } as VercelRequest, res as unknown as VercelResponse);
  return result;
}

test("a GET for a server stream is refused with 405 so clients do not reconnect every second", async () => {
  const result = await request("GET");
  assert.equal(result.status, 405);
  assert.equal(result.headers.Allow, "POST, OPTIONS");
});

test("the CORS preflight allows the headers a 2026-07-28 browser client sends on every request", async () => {
  const result = await request("OPTIONS");
  assert.equal(result.status, 200);
  const allowed = result.headers["Access-Control-Allow-Headers"].toLowerCase().split(", ");
  for (const header of ["mcp-protocol-version", "mcp-method", "mcp-name"]) {
    assert.ok(allowed.includes(header), header);
  }
});

// Serves the real handler over HTTP the way Vercel calls it (parsed body, status/json helpers),
// with the OpenWhispr API's token check stubbed. Returns the endpoint and every exchange seen.
async function serve(t: TestContext) {
  const upstream = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) =>
    String(input).includes("/api/v1/me")
      ? Promise.resolve(Response.json({ data: { scopes: MCP_SCOPES, expires_at: null } }))
      : upstream(input, init)
  );
  const seen: string[] = [];
  const server = createHttpServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    res.on("close", () => seen.push([req.method, body?.method, res.statusCode].join(" ")));
    await handler(
      Object.assign(req, { body }) as unknown as VercelRequest,
      Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        json(value: unknown) {
          res.setHeader("Content-Type", "application/json").end(JSON.stringify(value));
        },
      }) as unknown as VercelResponse
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.closeAllConnections());
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: "Bearer test-only-not-a-credential" } },
  });
  return { transport, seen };
}

test("a 2026-07-28 client lists tools in two requests: no legacy handshake and no stream held open", async (t) => {
  const { transport, seen } = await serve(t);
  const client = new Client(
    { name: "modern-client", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } }
  );
  await client.connect(transport);
  const { tools } = await client.listTools();
  // A client told the list can change keeps a `subscriptions/listen` stream open all session.
  const listCanChange = client.getServerCapabilities()?.tools?.listChanged;
  await client.close();
  assert.equal(tools.length, 21);
  assert.equal(listCanChange, false);
  assert.deepEqual(seen, ["POST server/discover 200", "POST tools/list 200"]);
});

test("a 2025-era client still connects through the initialize handshake", async (t) => {
  const { transport, seen } = await serve(t);
  const client = new Client({ name: "legacy-client", version: "1.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  assert.equal(tools.length, 21);
  assert.ok(seen.includes("POST initialize 200"), seen.join(", "));
  assert.ok(seen.includes("POST tools/list 200"), seen.join(", "));
});
