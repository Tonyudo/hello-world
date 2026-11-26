import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildIndex,
  findPath,
  cascade,
  matchNode,
  edgeBetween,
  dependenceOf,
  citationText,
} from "../public/js/data.js";

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "data", "symbiosis.json"), "utf8"));
const index = buildIndex(raw);

describe("buildIndex", () => {
  test("every node has a numeric degree matching its adjacency list", () => {
    for (const n of index.nodes) {
      assert.equal(typeof n.degree, "number", `${n.id} degree`);
      assert.equal(n.degree, index.adj.get(n.id).length, `${n.id} degree`);
    }
  });

  test("betweenness is within [0,1] and the maximum is exactly 1", () => {
    const values = index.nodes.map((n) => n.betweenness);
    for (const [i, v] of values.entries()) {
      assert.equal(typeof v, "number", `${index.nodes[i].id} betweenness`);
      assert.ok(v >= 0 && v <= 1, `${index.nodes[i].id} betweenness ${v} out of range`);
    }
    assert.equal(Math.max(...values), 1);
  });

  test("adjacency lists hold two entries per edge in total", () => {
    let total = 0;
    for (const list of index.adj.values()) total += list.length;
    assert.equal(total, 2 * index.edges.length);
  });

  test("indexes the full dataset", () => {
    assert.equal(index.nodes.length, raw.nodes.length);
    assert.equal(index.edges.length, raw.edges.length);
    assert.equal(index.byId.get("honeybee").name, "Western honeybee");
  });
});

describe("findPath", () => {
  test("humans -> amf returns the dependency chain through honeybee and almond", () => {
    const p = findPath(index, "humans", "amf");
    assert.deepEqual(p.nodes, ["humans", "honeybee", "almond", "amf"]);
    assert.equal(p.edges.length, 3);
  });

  test("the same node returns a one-node path with no edges", () => {
    assert.deepEqual(findPath(index, "humans", "humans"), { nodes: ["humans"], edges: [] });
  });

  test("default options never use a parasitism edge", () => {
    const p = findPath(index, "humans", "amf");
    assert.ok(p, "expected a path");
    for (const e of p.edges) assert.notEqual(e.type, "parasitism", `edge ${e.id} is parasitism`);
  });

  test("head_louse -> honeybee is null by default but found with includeParasitism", () => {
    assert.equal(findPath(index, "head_louse", "honeybee"), null);
    const p = findPath(index, "head_louse", "honeybee", { includeParasitism: true });
    assert.ok(p, "expected a path with parasitism allowed");
    assert.equal(p.nodes[0], "head_louse");
    assert.equal(p.nodes.at(-1), "honeybee");
    assert.ok(p.edges.some((e) => e.type === "parasitism"));
  });
});

describe("cascade", () => {
  test("removing honeybee collapses almond, varroa and bee_gut and weakens humans", () => {
    const c = cascade(index, "honeybee");
    for (const id of ["almond", "varroa", "bee_gut"]) {
      assert.ok(c.collapsed.has(id), `${id} should collapse`);
    }
    assert.ok(c.weakened.has("humans"), "humans should be weakened");
  });

  test("the removed root is not reported as collapsed", () => {
    const c = cascade(index, "honeybee");
    assert.equal(c.root, "honeybee");
    assert.equal(c.collapsed.has("honeybee"), false);
  });

  test("removing mouse does not collapse ixodes because the dependence is facultative", () => {
    const c = cascade(index, "mouse");
    assert.equal(c.collapsed.has("ixodes"), false);
    assert.ok(c.weakened.has("ixodes"), "ixodes should be weakened");
  });

  test("obligate collapse propagates through a synthetic chain B <- A <- C", () => {
    const tiny = {
      meta: {
        groups: [{ id: "g", label: "G", color: "#000" }],
        types: [{ id: "mutualism", label: "Mutualism", color: "#000" }],
      },
      nodes: [
        { id: "A", name: "A", sci: "A", group: "g", habitat: [], scale: "micro" },
        { id: "B", name: "B", sci: "B", group: "g", habitat: [], scale: "micro" },
        { id: "C", name: "C", sci: "C", group: "g", habitat: [], scale: "micro" },
      ],
      edges: [
        // A obligately depends on B
        { id: "e1", source: "A", target: "B", type: "mutualism", dependence: { source: "obligate", target: "none" }, citations: [] },
        // C obligately depends on A
        { id: "e2", source: "C", target: "A", type: "mutualism", dependence: { source: "obligate", target: "none" }, citations: [] },
      ],
      chains: [],
    };
    const idx = buildIndex(tiny);
    const c = cascade(idx, "B");
    assert.equal(c.collapsed.get("A").level, 1);
    assert.equal(c.collapsed.get("C").level, 2);
    assert.equal(c.collapsed.has("B"), false);
    assert.equal(c.weakened.size, 0);
  });
});

describe("dependenceOf", () => {
  test("returns each side's dependence on its partner", () => {
    const e = { source: "x", target: "y", dependence: { source: "obligate", target: "facultative" } };
    assert.equal(dependenceOf(e, "x"), "obligate");
    assert.equal(dependenceOf(e, "y"), "facultative");
    assert.equal(dependenceOf(e, "z"), "none");
  });
});

describe("matchNode", () => {
  test("matches an exact node id", () => {
    assert.equal(matchNode(index, "honeybee").id, "honeybee");
  });

  test("matches an exact common name", () => {
    assert.equal(matchNode(index, "Western honeybee").id, "honeybee");
  });

  test("matches an exact scientific name case-insensitively", () => {
    assert.equal(matchNode(index, "APIS MELLIFERA").id, "honeybee");
  });

  test("matches a case-insensitive partial name", () => {
    assert.equal(matchNode(index, "honeybee").name, "Western honeybee");
    assert.equal(matchNode(index, "HoneyB").id, "honeybee");
  });

  test("returns null for strings shorter than four characters", () => {
    assert.equal(matchNode(index, "ho"), null);
    assert.equal(matchNode(index, "  "), null);
  });

  test("returns null for unknown strings", () => {
    assert.equal(matchNode(index, "zzzz unknown organism"), null);
  });
});

describe("edgeBetween", () => {
  test("finds an edge in either direction and null when there is none", () => {
    assert.equal(edgeBetween(index, "honeybee", "almond").id, "e34");
    assert.equal(edgeBetween(index, "almond", "honeybee").id, "e34");
    assert.equal(edgeBetween(index, "humans", "amf"), null);
  });
});

describe("citationText", () => {
  test("a needed citation renders starting with 'citation needed'", () => {
    const text = citationText({ needed: true, note: "almond-specific field study" });
    assert.ok(text.startsWith("citation needed"), text);
    assert.equal(text, "citation needed (almond-specific field study)");
  });

  test("a needed citation without a note renders just the phrase", () => {
    assert.equal(citationText({ needed: true }), "citation needed");
  });

  test("a regular citation renders author, year and venue", () => {
    assert.equal(
      citationText({ author: "Crane", year: 1999, venue: "Routledge" }),
      "Crane, 1999. Routledge",
    );
  });
});
