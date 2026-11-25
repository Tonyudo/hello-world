// Validates data/symbiosis.json: run with `npm run check-data` after editing the dataset.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const d = JSON.parse(fs.readFileSync(path.join(here, "..", "data", "symbiosis.json"), "utf8"));
const errors = [];
const groups = new Set(d.meta.groups.map((g) => g.id));
const types = new Set(d.meta.types.map((t) => t.id));
const DEP = new Set(["obligate", "facultative", "none"]);
const CONF = new Set(["high", "medium", "low"]);

const ids = new Set();
for (const n of d.nodes) {
  if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
  ids.add(n.id);
  if (!groups.has(n.group)) errors.push(`node ${n.id}: unknown group ${n.group}`);
  for (const k of ["name", "sci", "fact", "scale"]) if (!n[k]) errors.push(`node ${n.id}: missing ${k}`);
  if (!Array.isArray(n.habitat) || !n.habitat.length) errors.push(`node ${n.id}: habitat must be a non-empty array`);
}

const eids = new Set();
const pairs = new Set();
for (const e of d.edges) {
  if (eids.has(e.id)) errors.push(`duplicate edge id ${e.id}`);
  eids.add(e.id);
  for (const k of ["source", "target"]) if (!ids.has(e[k])) errors.push(`edge ${e.id}: unknown ${k} ${e[k]}`);
  const pair = [e.source, e.target].sort().join("|");
  if (pairs.has(pair)) errors.push(`edge ${e.id}: duplicate pair ${pair}`);
  pairs.add(pair);
  if (!types.has(e.type)) errors.push(`edge ${e.id}: unknown type ${e.type}`);
  if (!CONF.has(e.confidence)) errors.push(`edge ${e.id}: confidence must be high|medium|low`);
  if (!DEP.has(e.dependence?.source) || !DEP.has(e.dependence?.target)) errors.push(`edge ${e.id}: bad dependence`);
  for (const k of ["tldr", "obligate"]) if (!e[k]) errors.push(`edge ${e.id}: missing ${k}`);
  for (const k of ["gives", "gets"]) if (!e[k]?.source || !e[k]?.target) errors.push(`edge ${e.id}: ${k} needs source and target`);
  if (!e.impact || typeof e.impact.ecological !== "string") errors.push(`edge ${e.id}: impact.ecological required`);
  if (!Array.isArray(e.citations) || !e.citations.length) errors.push(`edge ${e.id}: at least one citation (or {needed:true})`);
  for (const c of e.citations || []) if (!c.needed && !(c.author && c.year && c.venue)) errors.push(`edge ${e.id}: citation needs author, year, venue — or needed:true`);
  const sentences = (e.tldr.match(/[.!?](\s|$)/g) || []).length;
  if (sentences > 2) errors.push(`edge ${e.id}: TL;DR is over 2 sentences`);
}

for (const c of d.chains) {
  if (c.nodes.length < 3) errors.push(`chain ${c.id}: needs 3+ organisms`);
  for (const n of c.nodes) if (!ids.has(n)) errors.push(`chain ${c.id}: unknown node ${n}`);
  for (const e of c.edges) if (!eids.has(e)) errors.push(`chain ${c.id}: unknown edge ${e}`);
}

const used = new Set(d.edges.flatMap((e) => [e.source, e.target]));
const orphans = d.nodes.filter((n) => !used.has(n.id)).map((n) => n.id);
if (orphans.length) errors.push(`orphan nodes: ${orphans.join(", ")}`);

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
const needed = d.edges.filter((e) => e.citations.some((c) => c.needed)).map((e) => e.id);
console.log(`✓ ${d.nodes.length} nodes, ${d.edges.length} edges, ${d.chains.length} chains`);
console.log(`  flagged low/medium confidence: ${d.edges.filter((e) => e.confidence !== "high").map((e) => e.id).join(", ")}`);
console.log(`  open "citation needed": ${needed.join(", ") || "none"}`);
