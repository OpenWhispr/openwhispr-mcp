import assert from "node:assert/strict";
import { test } from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/mcp.js";

test("a GET for a server stream is refused with 405 so clients do not reconnect every second", async () => {
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
  };
  await handler({ method: "GET" } as VercelRequest, res as unknown as VercelResponse);
  assert.equal(result.status, 405);
  assert.equal(result.headers.Allow, "POST, OPTIONS");
});
