// Symbiosis Unfold — static server + Claude proxy.
// The API key stays server-side (ANTHROPIC_API_KEY or an `ant auth login` profile).
// Without credentials the app still works; free-text pairs fall back to the offline engine.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.SYMBIOSIS_MODEL || "claude-opus-5-5";
const DATA_PATH = path.join(here, "data", "symbiosis.json");

const STATIC = {
  "/vendor/d3.min.js": path.join(here, "node_modules", "d3", "dist", "d3.min.js"),
  "/data/symbiosis.json": DATA_PATH,
};
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let client = null;
try {
  // Throws if no credentials can be resolved at all.
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.SYMBIOSIS_TRY_PROFILE) {
    client = new Anthropic();
  }
} catch {
  client = null;
}

// ---------- Prompt + schema ----------

const CHANNELS = ["nutrients", "protection", "dispersal", "cleaning", "signals", "shelter", "transport", "other"];
const REQ = {
  type: "object",
  additionalProperties: false,
  required: ["status", "note"],
  properties: {
    status: { type: "string", enum: ["yes", "partial", "no", "unknown"] },
    note: { type: "string" },
  },
};
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict", "literature_status", "literature_note", "confidence", "confidence_why",
    "mechanism", "requirements", "analog", "falsify",
  ],
  properties: {
    // "Documented" is deliberately absent: only pairs in the curated dataset can be Documented.
    verdict: { type: "string", enum: ["Plausible", "Speculative", "Unlikely"] },
    literature_status: { type: "string", enum: ["believed_documented", "not_known", "unsure"] },
    literature_note: { type: "string" },
    confidence: { type: "string", enum: ["Low", "Med", "High"] },
    confidence_why: { type: "string" },
    mechanism: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "a_gives", "b_gives", "channels"],
      properties: {
        summary: { type: "string" },
        a_gives: { type: "string" },
        b_gives: { type: "string" },
        channels: { type: "array", items: { type: "string", enum: CHANNELS } },
      },
    },
    requirements: {
      type: "object",
      additionalProperties: false,
      required: ["habitat", "scale", "biochemistry", "coevolution"],
      properties: { habitat: REQ, scale: REQ, biochemistry: REQ, coevolution: REQ },
    },
    analog: {
      type: "object",
      additionalProperties: false,
      required: ["edge_id", "reason"],
      properties: { edge_id: { type: "string" }, reason: { type: "string" } },
    },
    falsify: { type: "string" },
  },
};

export async function buildSystemPrompt() {
  const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const name = Object.fromEntries(data.nodes.map((n) => [n.id, n.name]));
  const edgeLines = data.edges
    .map((e) => `${e.id}: ${name[e.source]} — ${name[e.target]} (${e.type}) — ${e.tldr}`)
    .join("\n");
  return `You are the analysis engine of "Symbiosis Unfold", a research tool about symbiosis. A user has paired two organisms (A and B) that are NOT a documented pair in the curated dataset. Assess whether a symbiotic relationship between them is plausible.

Evidence tiers (follow strictly):
- Plausible: shared habitat and scale, and a concrete exchange that has close real precedents.
- Speculative: physically possible, but it requires conditions or mechanisms with weak or no precedent.
- Unlikely: they don't co-occur, their scales or biochemistry are incompatible, or no exchange makes sense.
- You may NOT return "Documented". If you genuinely believe peer-reviewed literature documents this specific relationship, set literature_status to "believed_documented" and explain in literature_note what you believe is documented. Still pick Plausible/Speculative/Unlikely for verdict, because the curated dataset hasn't verified it.

Rules:
- Never invent citations, authors, years, or journals. Do not cite at all in this output; refer to well-known phenomena in plain words.
- Label speculation as speculation. Prefer "unknown" over guessing in the requirement checks.
- Confidence measures how sure you are of the verdict itself, not how likely the relationship is. Explain why in one or two sentences.
- analog.edge_id must be one of the dataset edge ids below (the closest real relationship in mechanism), and analog.reason says why in one sentence.
- falsify: one sentence describing a concrete observation or experiment that would prove the hypothesis wrong.
- Keep each text field under ~60 words. a_gives is what organism A would give B; b_gives is what B would give A.
- If an input is not a real organism or is nonsense, return Unlikely with Low confidence and say so.

Curated dataset edges (for analogs):
${edgeLines}`;
}

let systemPromptCache = null;

export async function analyzePair(a, b, api = client) {
  if (!systemPromptCache) systemPromptCache = await buildSystemPrompt();
  const response = await api.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
    },
    system: [{ type: "text", text: systemPromptCache, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Organism A: ${a}\nOrganism B: ${b}\n\nReturn the compatibility analysis.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    const err = new Error("The model declined this request.");
    err.status = 422;
    throw err;
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error("The analysis was cut off before finishing.");
    err.status = 502;
    throw err;
  }
  const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  const parsed = JSON.parse(text);

  // Server-side enforcement of the hard rule, in case the schema were ever relaxed.
  if (!["Plausible", "Speculative", "Unlikely"].includes(parsed.verdict)) parsed.verdict = "Speculative";
  return { ...parsed, source: "claude", model: response.model };
}

// ---------- HTTP ----------

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120);

export function createServer({ client: api = client } = {}) {
  return http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/status") {
      return send(res, 200, { llm: Boolean(api), model: api ? MODEL : null });
    }
    if (url.pathname === "/api/analyze" && req.method === "POST") {
      if (!api) return send(res, 503, { error: "No Claude credentials configured on the server." });
      const body = await readBody(req);
      const a = clean(body.a);
      const b = clean(body.b);
      if (!a || !b) return send(res, 400, { error: "Both organisms are required." });
      try {
        return send(res, 200, await analyzePair(a, b, api));
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Rate limited — try again shortly." });
        if (err instanceof Anthropic.AuthenticationError) return send(res, 503, { error: "Claude credentials were rejected." });
        if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Claude API error ${err.status ?? ""}`.trim() });
        if (err instanceof SyntaxError) return send(res, 502, { error: "Claude returned malformed JSON." });
        return send(res, err.status || 500, { error: err.message || "Analysis failed." });
      }
    }

    // Static files
    let file = STATIC[url.pathname];
    if (!file) {
      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      file = path.join(here, "public", rel);
      if (!file.startsWith(path.join(here, "public"))) return send(res, 403, "Forbidden", "text/plain");
    }
    const buf = await fs.readFile(file);
    return send(res, 200, buf, MIME[path.extname(file)] || "application/octet-stream");
  } catch (err) {
    if (err.code === "ENOENT") return send(res, 404, "Not found", "text/plain");
    return send(res, err.status || 500, { error: err.message });
  }
  });
}

// Only listen when run directly (`node server.js`), so tests can import the module.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createServer().listen(PORT, () => {
  console.log(`Symbiosis Unfold → http://localhost:${PORT}`);
  console.log(client ? `Claude analysis enabled (${MODEL}).` : "No ANTHROPIC_API_KEY: free-text pairs use the offline engine.");
});
