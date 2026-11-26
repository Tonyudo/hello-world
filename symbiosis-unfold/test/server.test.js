import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  ANALYSIS_SCHEMA,
  buildSystemPrompt,
  analyzePair,
  createServer,
} from "../server.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "data", "symbiosis.json"), "utf8"));
const MODEL = process.env.SYMBIOSIS_MODEL || "claude-opus-5-5";

const REQ_OK = { status: "partial", note: "some note" };
const VALID = {
  verdict: "Plausible",
  literature_status: "not_known",
  literature_note: "",
  confidence: "Med",
  confidence_why: "Reasonable but untested.",
  mechanism: {
    summary: "Exchange of sugars for shelter.",
    a_gives: "Sugars",
    b_gives: "Shelter",
    channels: ["nutrients", "shelter"],
  },
  requirements: { habitat: REQ_OK, scale: REQ_OK, biochemistry: REQ_OK, coevolution: REQ_OK },
  analog: { edge_id: raw.edges[0].id, reason: "Closest mechanism." },
  falsify: "Co-culture shows no growth benefit.",
};

// Fake Claude client: records every params object it receives and returns `respond`
// (an object, or a function of params).
function fakeClient(respond = okResponse()) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return typeof respond === "function" ? respond(params) : respond;
        },
      },
    },
  };
}

function okResponse(obj = VALID) {
  return {
    stop_reason: "end_turn",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(obj) }],
  };
}

async function startServer(opts) {
  const srv = createServer(opts);
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return {
    base,
    close: () =>
      new Promise((resolve) => {
        srv.closeAllConnections?.();
        srv.close(() => resolve());
      }),
  };
}

describe("ANALYSIS_SCHEMA", () => {
  test("verdict enum is exactly the three non-Documented tiers", () => {
    assert.deepEqual(
      [...ANALYSIS_SCHEMA.properties.verdict.enum].sort(),
      ["Plausible", "Speculative", "Unlikely"],
    );
    assert.ok(!ANALYSIS_SCHEMA.properties.verdict.enum.includes("Documented"));
  });

  test("top level forbids additional properties", () => {
    assert.equal(ANALYSIS_SCHEMA.additionalProperties, false);
  });

  test("required lists every top-level property", () => {
    assert.deepEqual(
      [...ANALYSIS_SCHEMA.required].sort(),
      Object.keys(ANALYSIS_SCHEMA.properties).sort(),
    );
  });
});

describe("buildSystemPrompt", () => {
  test("mentions every dataset edge id", async () => {
    const prompt = await buildSystemPrompt();
    for (const edge of raw.edges) {
      assert.ok(prompt.includes(`${edge.id}: `), `missing edge ${edge.id}`);
    }
  });

  test("forbids inventing citations", async () => {
    const prompt = await buildSystemPrompt();
    assert.match(prompt, /never invent citations/i);
  });
});

describe("analyzePair", () => {
  test("returns parsed result tagged with source and model, and sends the expected params", async () => {
    const fake = fakeClient();
    const result = await analyzePair("Tardigrade", "Lichen", fake);

    assert.equal(result.verdict, "Plausible");
    assert.equal(result.source, "claude");
    assert.equal(result.model, "claude-opus-5-5");

    assert.equal(fake.calls.length, 1);
    const params = fake.calls[0];
    assert.equal(params.model, MODEL);
    assert.equal(params.output_config.format.type, "json_schema");
    assert.deepEqual(params.output_config.format.schema, ANALYSIS_SCHEMA);
    assert.deepEqual(params.system[0].cache_control, { type: "ephemeral" });
    assert.equal(params.system[0].type, "text");

    const user = params.messages.find((m) => m.role === "user");
    assert.ok(user, "no user message sent");
    const text = typeof user.content === "string" ? user.content : user.content.map((c) => c.text).join("");
    assert.ok(text.includes("Tardigrade"), "organism A missing from user message");
    assert.ok(text.includes("Lichen"), "organism B missing from user message");
  });

  test("coerces a 'Documented' verdict to a non-Documented tier", async () => {
    const fake = fakeClient(okResponse({ ...VALID, verdict: "Documented" }));
    const result = await analyzePair("Oak", "Mycorrhizal fungus", fake);
    assert.notEqual(result.verdict, "Documented");
    assert.equal(result.verdict, "Speculative");
  });

  test("stop_reason 'refusal' rejects with status 422", async () => {
    const fake = fakeClient({ stop_reason: "refusal", model: MODEL, content: [] });
    await assert.rejects(analyzePair("A", "B", fake), { status: 422 });
  });

  test("stop_reason 'max_tokens' rejects with status 502", async () => {
    const fake = fakeClient({ stop_reason: "max_tokens", model: MODEL, content: [] });
    await assert.rejects(analyzePair("A", "B", fake), { status: 502 });
  });

  test("malformed JSON text rejects with SyntaxError", async () => {
    const fake = fakeClient({
      stop_reason: "end_turn",
      model: MODEL,
      content: [{ type: "text", text: "{not json" }],
    });
    await assert.rejects(analyzePair("A", "B", fake), SyntaxError);
  });
});

describe("HTTP: status and disabled client", () => {
  test("GET /api/status reports llm:true when a client is injected", async () => {
    const s = await startServer({ client: fakeClient() });
    try {
      const res = await fetch(`${s.base}/api/status`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.llm, true);
    } finally {
      await s.close();
    }
  });

  test("client:null disables the client: status llm:false and analyze returns 503", async () => {
    const s = await startServer({ client: null });
    try {
      const status = await fetch(`${s.base}/api/status`);
      assert.equal((await status.json()).llm, false);

      const res = await fetch(`${s.base}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a: "A", b: "B" }),
      });
      assert.equal(res.status, 503);
    } finally {
      await s.close();
    }
  });
});

describe("HTTP: POST /api/analyze", () => {
  let s;
  let fake;
  before(async () => {
    fake = fakeClient();
    s = await startServer({ client: fake });
  });
  after(async () => {
    await s.close();
  });

  const post = (payload) =>
    fetch(`${s.base}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });

  test("malformed JSON body returns 400, not 500", async () => {
    const res = await post("{not json");
    assert.equal(res.status, 400);
  });

  test("missing organism b returns 400", async () => {
    const res = await post({ a: "Tardigrade" });
    assert.equal(res.status, 400);
  });

  test("body larger than 4096 bytes returns 413", async () => {
    const res = await post({ a: "A", b: "B", pad: "y".repeat(5000) });
    assert.equal(res.status, 413);
  });

  test("valid request returns 200 JSON with an allowed verdict", async () => {
    const res = await post({ a: "Tardigrade", b: "Lichen" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/json/);
    const body = await res.json();
    assert.ok(["Plausible", "Speculative", "Unlikely"].includes(body.verdict), `verdict ${body.verdict}`);
    assert.equal(body.source, "claude");
  });

  test("control characters and overlong names are cleaned before reaching the model", async () => {
    const before = fake.calls.length;
    const longName = "x".repeat(300);
    const res = await post({ a: `A\n\tB${longName}`, b: "Beta\u0001\u0002" });
    assert.equal(res.status, 200);

    assert.equal(fake.calls.length, before + 1);
    const user = fake.calls[fake.calls.length - 1].messages.find((m) => m.role === "user");
    const text = typeof user.content === "string" ? user.content : user.content.map((c) => c.text).join("");
    const m = text.match(/^Organism A: (.*)\nOrganism B: (.*)\n/);
    assert.ok(m, `unexpected user message shape: ${JSON.stringify(text.slice(0, 200))}`);
    const [, a, b] = m;
    assert.ok(a.length <= 120, `A is ${a.length} chars`);
    assert.ok(b.length <= 120, `B is ${b.length} chars`);
    assert.ok(!/[\u0000-\u001f]/.test(a), "control characters left in A");
    assert.ok(!/[\u0000-\u001f]/.test(b), "control characters left in B");
    assert.ok(a.startsWith("A  B"), `A cleaned to ${JSON.stringify(a.slice(0, 10))}`);
  });

  test("SDK rate-limit error maps to 429", async () => {
    const rl = new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
    const s2 = await startServer({ client: fakeClient(() => { throw rl; }) });
    try {
      const res = await fetch(`${s2.base}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a: "A", b: "B" }),
      });
      assert.equal(res.status, 429);
    } finally {
      await s2.close();
    }
  });

  test("SDK authentication error maps to 503", async () => {
    const auth = new Anthropic.AuthenticationError(401, { type: "error" }, "bad key", new Headers());
    const s2 = await startServer({ client: fakeClient(() => { throw auth; }) });
    try {
      const res = await fetch(`${s2.base}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a: "A", b: "B" }),
      });
      assert.equal(res.status, 503);
    } finally {
      await s2.close();
    }
  });
});

describe("HTTP: static files", () => {
  let s;
  before(async () => {
    s = await startServer({ client: null });
  });
  after(async () => {
    await s.close();
  });

  test("malformed percent-encoding returns 400, not 500", async () => {
    const res = await fetch(`${s.base}/%E0%A4%A`);
    assert.equal(res.status, 400);
  });

  test("sibling-directory prefix trick cannot escape public/", async () => {
    const res = await fetch(`${s.base}/..%2Fpublic-evil%2Fx.js`);
    assert.ok([403, 404].includes(res.status));
  });

  test("GET / returns the HTML page", async () => {
    const res = await fetch(`${s.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /<html/i);
  });

  test("GET /data/symbiosis.json returns the dataset", async () => {
    const res = await fetch(`${s.base}/data/symbiosis.json`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.edges.length, raw.edges.length);
  });

  for (const p of ["/..%2Fserver.js", "/%2e%2e/server.js", "/..%2F..%2Fpackage.json"]) {
    test(`path traversal ${p} is refused and does not leak server source`, async () => {
      const res = await fetch(`${s.base}${p}`);
      assert.ok([403, 404].includes(res.status), `status ${res.status}`);
      const text = await res.text();
      assert.ok(!text.includes("createServer"), "server source leaked");
      assert.ok(!text.includes("ANALYSIS_SCHEMA"), "server source leaked");
    });
  }
});
