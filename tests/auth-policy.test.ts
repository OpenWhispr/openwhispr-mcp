import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/mcp.js";
import { validateToken } from "../lib/auth.js";

afterEach(() => mock.restoreAll());

const discovery = { jsonrpc: "2.0", id: 1, method: "tools/list" };
const toolCall = { ...discovery, method: "tools/call", params: { name: "list_notes" } };
const disabledMessage = "Your organization has turned off API and MCP access.";

interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body?: { error: string; error_description: string };
}

async function post(token: string, body: typeof discovery): Promise<HandlerResult> {
  const req = { method: "POST", headers: { authorization: `Bearer ${token}` }, body };
  const result: HandlerResult = { status: 0, headers: {} };
  const res = {
    setHeader(name: string, value: string): void {
      result.headers[name] = value;
    },
    status(code: number): { json(value: HandlerResult["body"]): void } {
      result.status = code;
      return {
        json(value): void {
          result.body = value;
        },
      };
    },
  };
  await handler(req as VercelRequest, res as unknown as VercelResponse);
  return result;
}

for (const [code, message] of [
  ["api_access_disabled", disabledMessage],
  [
    "policy_unresolvable",
    "Your organization's policy could not be resolved. Contact your workspace admin.",
  ],
]) {
  for (const warm of [false, true]) {
    test(`${code} blocks discovery and calls with a ${warm ? "previously validated" : "new"} token`, async () => {
      const token = `${code}-${warm}`;
      let blocked = !warm;
      const probe = mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
        assert.equal(url.pathname, "/api/v1/me");
        assert.equal(url.search, "?purpose=mcp-auth");
        assert.equal(init.method ?? "GET", "GET");
        assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${token}`);
        return blocked
          ? Response.json({ error: { code, message } }, { status: 403 })
          : Response.json({ data: { scopes: ["notes:read"] } });
      });
      if (warm) {
        assert.equal((await validateToken(token)).status, "valid");
        blocked = true;
      }
      for (const body of [discovery, toolCall]) {
        const result = await post(token, body);
        assert.equal(result.status, 403);
        assert.deepEqual(result.body, { error: code, error_description: message });
        assert.equal(result.headers["WWW-Authenticate"], undefined);
      }
      blocked = false;
      assert.equal((await validateToken(token)).status, "valid");
      assert.equal(probe.mock.callCount(), warm ? 4 : 3);
    });
  }
}

test("an unrecognised API error code is a generic 403 that hides its detail", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { code: "unknown", message: "private detail" } }, { status: 403 })
  );
  const denied = await post("unknown-code", discovery);
  assert.equal(denied.status, 403);
  assert.equal(denied.body?.error, "forbidden");
  assert.doesNotMatch(denied.body.error_description, /private detail/);
  assert.equal(denied.headers["WWW-Authenticate"], undefined);
});

test("a 403 without the API's error body is treated as upstream unavailable", async () => {
  const edgeBlocks = [
    (): Response => new Response("<html>Forbidden</html>", { status: 403 }),
    (): Response => Response.json({ message: "Forbidden" }, { status: 403 }),
  ];
  for (const edgeBlock of edgeBlocks) {
    mock.method(globalThis, "fetch", async () => edgeBlock());
    for (const body of [discovery, toolCall]) {
      const result = await post("edge-block", body);
      assert.equal(result.status, 503);
      assert.equal(result.body?.error, "upstream_unavailable");
    }
    mock.restoreAll();
  }
});

test("a known policy code retains its meaning when its description is missing", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { code: "api_access_disabled" } }, { status: 403 })
  );
  const denied = await post("missing-description", discovery);
  assert.deepEqual(denied.body, {
    error: "api_access_disabled",
    error_description: disabledMessage,
  });
});

test("token, scope and upstream failures retain their existing responses", async () => {
  let upstream = new Response(null, { status: 401 });
  mock.method(globalThis, "fetch", async () => upstream);
  const invalid = await post("invalid", discovery);
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body?.error, "invalid_token");
  assert.match(invalid.headers["WWW-Authenticate"], /invalid_token/);

  upstream = Response.json({ data: { scopes: [] } });
  const missingScope = await post("limited", toolCall);
  assert.equal(missingScope.status, 403);
  assert.equal(missingScope.body?.error, "insufficient_scope");
  assert.match(missingScope.headers["WWW-Authenticate"], /insufficient_scope/);

  upstream = new Response(null, { status: 503 });
  const unavailable = await post("limited", discovery);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body?.error, "upstream_unavailable");
});

test("a throttled credential check returns 429 with valid retry guidance", async () => {
  let retryAfter: string | null = null;
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("private upstream details", {
        status: 429,
        headers: retryAfter === null ? {} : { "Retry-After": retryAfter },
      })
  );
  for (const [value, expected] of [
    ["0", "0"],
    ["47", "47"],
    ["Thu, 19 Nov 2026 12:00:00 GMT", undefined],
    ["private upstream details", undefined],
    ["-1", undefined],
    [null, undefined],
  ] as const) {
    retryAfter = value;
    const limited = await post("throttled", toolCall);
    assert.equal(limited.status, 429);
    assert.equal(limited.body?.error, "rate_limited");
    assert.match(limited.body.error_description, /try again/i);
    assert.doesNotMatch(limited.body.error_description, /private upstream details/);
    assert.equal(limited.headers["Retry-After"], expected);
    assert.equal(limited.headers["WWW-Authenticate"], undefined);
    assert.match(limited.headers["Access-Control-Expose-Headers"], /Retry-After/i);
  }
});
