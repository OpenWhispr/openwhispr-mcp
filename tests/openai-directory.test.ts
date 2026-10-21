import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, mock, test } from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import challenge from "../api/openai-apps-challenge.js";
import { createServer } from "../lib/server.js";
import { apiRequest } from "../lib/client.js";

const originalChallenge = process.env.OPENAI_APPS_CHALLENGE;
afterEach(() => {
  mock.restoreAll();
  if (originalChallenge === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
  else process.env.OPENAI_APPS_CHALLENGE = originalChallenge;
});

test("an expired connection asks for reconnection without soliciting login codes or API keys", async () => {
  mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
  );
  await assert.rejects(
    apiRequest({ method: "GET", path: "/notes/list", apiKey: "test-only" }),
    (error: Error) => {
      assert.match(error.message, /Reconnect OpenWhispr/);
      assert.doesNotMatch(error.message, /API key|email-code|6-digit|keys\/create/);
      return true;
    }
  );
});

function request(method: string) {
  const result = { status: 0, body: "", headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) {
      result.headers[name] = value;
    },
    status(code: number) {
      result.status = code;
      return this;
    },
    send(value: string) {
      result.body = value;
    },
    end() {},
  };
  challenge({ method } as VercelRequest, res as unknown as VercelResponse);
  return result;
}

test("verification returns the exact configurable plain-text token without caching", () => {
  process.env.OPENAI_APPS_CHALLENGE = "test-only.opaque-challenge_123";
  const result = request("GET");
  assert.equal(result.status, 200);
  assert.equal(result.body, process.env.OPENAI_APPS_CHALLENGE);
  assert.equal(result.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(result.headers["Cache-Control"], "no-store");
  process.env.OPENAI_APPS_CHALLENGE = "test-only.replacement";
  assert.equal(request("GET").body, "test-only.replacement");
});

test("unconfigured verification is absent; HEAD and unsupported methods never return the token", () => {
  delete process.env.OPENAI_APPS_CHALLENGE;
  assert.equal(request("GET").status, 404);
  process.env.OPENAI_APPS_CHALLENGE = "test-only.challenge";
  assert.equal(request("HEAD").status, 200);
  assert.equal(request("HEAD").body, "");
  assert.equal(request("POST").status, 405);
  assert.equal(request("POST").body, "");
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(
    config.rewrites.find(
      (r: { source: string }) => r.source === "/.well-known/openai-apps-challenge"
    )?.destination,
    "/api/openai-apps-challenge"
  );
});

test("MCP discovery exposes all 21 existing tools with complete, accurate safety annotations", async () => {
  const server = createServer("test-only-not-a-credential");
  const client = new Client({ name: "directory-contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 21);
    const destructive = new Set([
      "update_note",
      "delete_note",
      "add_dictionary_words",
      "update_dictionary_word",
      "delete_dictionary_word",
      "create_snippet",
      "update_snippet",
      "delete_snippet",
    ]);
    const reads = new Set([
      "list_notes",
      "get_note",
      "search_notes",
      "list_folders",
      "list_transcriptions",
      "get_transcription",
      "get_note_transcript",
      "list_dictionary",
      "list_snippets",
      "get_usage",
    ]);
    for (const tool of tools) {
      assert.ok(tool.annotations?.title, tool.name);
      assert.equal(tool.annotations?.readOnlyHint, reads.has(tool.name), tool.name);
      assert.equal(tool.annotations?.destructiveHint, destructive.has(tool.name), tool.name);
      assert.equal(tool.annotations?.openWorldHint, false, tool.name);
    }
    assert.match(tools.find((t) => t.name === "create_snippet")!.description!, /overwritten/);
    assert.match(
      tools.find((t) => t.name === "add_dictionary_words")!.description!,
      /capitalisation/
    );
  } finally {
    await client.close();
    await server.close();
  }
});
