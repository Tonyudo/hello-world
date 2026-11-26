import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildIndex, edgeBetween } from "../public/js/data.js";
import { analyzeLocal } from "../public/js/playground.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "data", "symbiosis.json"), "utf8"));
const index = buildIndex(raw);

const STATUSES = ["yes", "partial", "no", "unknown"];
const REQ_KEYS = ["habitat", "scale", "biochemistry", "coevolution"];

// Small seeded PRNG (mulberry32) so the random pairs are the same on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertRequirements(result) {
  for (const k of REQ_KEYS) {
    assert.ok(result.requirements[k], `missing requirement ${k}`);
    assert.ok(STATUSES.includes(result.requirements[k].status), `${k} status ${result.requirements[k].status}`);
  }
}

describe("analyzeLocal: documented pairs", () => {
  test("honeybee + almond is Documented from the curated edge", () => {
    const r = analyzeLocal(index, index.byId.get("honeybee"), index.byId.get("almond"));
    assert.equal(r.verdict, "Documented");
    assert.equal(r.source, "dataset");
    assert.equal(r.analog.edge_id, edgeBetween(index, "honeybee", "almond").id);
    assertRequirements(r);
  });
});

describe("analyzeLocal: undocumented pairs", () => {
  test("10 seeded random pairs with no direct edge are never Documented or High", () => {
    const rand = mulberry32(20261126);
    const ids = index.nodes.map((n) => n.id);
    const pairs = [];
    const seen = new Set();
    let guard = 0;
    while (pairs.length < 10 && guard++ < 100000) {
      const a = ids[Math.floor(rand() * ids.length)];
      const b = ids[Math.floor(rand() * ids.length)];
      if (a === b) continue;
      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      if (edgeBetween(index, a, b)) continue;
      pairs.push([a, b]);
    }
    assert.equal(pairs.length, 10, "could not find 10 undocumented pairs");

    for (const [a, b] of pairs) {
      const r = analyzeLocal(index, index.byId.get(a), index.byId.get(b));
      assert.notEqual(r.verdict, "Documented", `${a} + ${b} should not be Documented`);
      assert.notEqual(r.confidence, "High", `${a} + ${b} should not be High confidence`);
      assert.ok(["Plausible", "Speculative", "Unlikely"].includes(r.verdict), `${a} + ${b}: ${r.verdict}`);
      assertRequirements(r);
    }
  });

  test("cleaner_wrasse + riftia returns Plausible, Speculative or Unlikely", () => {
    const r = analyzeLocal(index, index.byId.get("cleaner_wrasse"), index.byId.get("riftia"));
    assert.ok(["Plausible", "Speculative", "Unlikely"].includes(r.verdict), r.verdict);
    assert.notEqual(r.confidence, "High");
    assertRequirements(r);
  });

  test("every result has requirement statuses within the allowed set", () => {
    const r = analyzeLocal(index, index.byId.get("amf"), index.byId.get("riftia"));
    assertRequirements(r);
  });
});

describe("analyzeLocal: fine-grained habitat tags", () => {
  const run = (a, b) => analyzeLocal(index, index.byId.get(a), index.byId.get(b));

  test("reef cleaner and deep-sea vent tubeworm are no longer co-located", () => {
    const r = run("cleaner_wrasse", "riftia");
    assert.equal(r.requirements.habitat.status, "no");
    assert.equal(r.verdict, "Unlikely");
  });

  test("two reef organisms share a microhabitat", () => {
    const r = run("cleaner_wrasse", "coral");
    assert.equal(r.requirements.habitat.status, "yes");
    assert.notEqual(r.verdict, "Unlikely");
  });

  test("non-overlapping ranges are rejected even in similar habitats", () => {
    const r = run("whitebark_pine", "macrotermes"); // North America vs Africa/Asia
    assert.equal(r.requirements.habitat.status, "no");
  });

  test("a host-restricted microbe and a large animal is a partial (would need a new host)", () => {
    const r = run("buchnera", "grey_wolf");
    assert.equal(r.requirements.habitat.status, "partial");
  });
});
