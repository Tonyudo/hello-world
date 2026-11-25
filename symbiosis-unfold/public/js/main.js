import { loadData, findPath, cascade } from "./data.js";
import { edgeDetail, nodeDetail, cascadeDetail, pathDetail, esc } from "./panel.js";
import { createPlayground } from "./playground.js";

const $ = (s) => document.querySelector(s);

async function waitForD3() {
  if (window.d3) return;
  await new Promise((resolve) => window.addEventListener("d3ready", resolve, { once: true }));
}

const [index, status] = await Promise.all([
  loadData(),
  fetch("/api/status").then((r) => r.json()).catch(() => ({ llm: false })),
  waitForD3(),
]);
const { createMap } = await import("./map.js");

// ---------- panel ----------
const panel = $("#panel");
const panelBody = $("#panel-body");
const introHTML = panelBody.innerHTML;

function openPanel(html) {
  panelBody.innerHTML = html;
  panelBody.scrollTop = 0;
  panel.classList.add("open");
  wirePanel();
}
function closePanel() {
  panel.classList.remove("open");
  panelBody.innerHTML = introHTML;
}
$(".panel-close").onclick = () => { closePanel(); map.clearHighlight(); };

function wirePanel() {
  panelBody.querySelectorAll("[data-edge]").forEach((b) => b.addEventListener("click", () => showEdge(b.dataset.edge)));
  panelBody.querySelectorAll("[data-node]:not([data-action])").forEach((b) => b.addEventListener("click", () => showNode(b.dataset.node)));
  panelBody.querySelectorAll("[data-chain]").forEach((b) => b.addEventListener("click", () => showChain(b.dataset.chain)));
  panelBody.querySelectorAll("[data-action=cascade]").forEach((b) => b.addEventListener("click", () => runCascade(b.dataset.node)));
  panelBody.querySelectorAll("[data-action=pg-a]").forEach((b) => b.addEventListener("click", () => { playground.setA(b.dataset.node); switchView("playground"); }));
}

function showEdge(id, eyebrow) {
  const e = index.edgeById.get(id);
  if (!e) return;
  switchView("map");
  map.selectEdge(id);
  openPanel((eyebrow ? `<div class="surprise-tag">${esc(eyebrow)}</div>` : "") + edgeDetail(index, e));
}
function showNode(id) {
  switchView("map");
  map.selectNode(id);
  openPanel(nodeDetail(index, index.byId.get(id)));
}
function showChain(id) {
  const c = index.chains.find((x) => x.id === id);
  document.querySelectorAll(".chain-item").forEach((el) => el.classList.toggle("active", el.dataset.chain === id));
  map.highlight({ nodes: new Set(c.nodes), edges: new Set(c.edges), mode: "chain" });
  const steps = c.edges.map((eid) => {
    const e = index.edgeById.get(eid);
    return `<li><button class="rel" data-edge="${eid}"><span class="rel-type t-${e.type}"></span>
      <span class="rel-name">${esc(index.byId.get(e.source).name)} ${e.type === "parasitism" ? "→" : "↔"} ${esc(index.byId.get(e.target).name)}</span>
      <span class="rel-meta">${esc(index.types.get(e.type).label)}</span></button></li>`;
  }).join("");
  openPanel(`<header class="panel-head"><div class="eyebrow">Chain · ${c.nodes.length} organisms</div><h2>${esc(c.name)}</h2></header>
    <section class="tldr"><p>${esc(c.summary)}</p></section>
    <section><h3>Links</h3><ul class="rels">${steps}</ul></section>`);
}
function runCascade(id) {
  switchView("map");
  const r = cascade(index, id);
  $("#cascade-node").value = id;
  const nodes = new Set([id, ...r.collapsed.keys(), ...r.weakened.keys()]);
  const weakEdges = new Set([...r.weakened.values()].map((x) => x.via.id));
  map.highlight({ nodes, edges: r.edgesHit, mode: "cascade", extra: { root: id, collapsed: r.collapsed, weakened: r.weakened, weakEdges } });
  openPanel(cascadeDetail(index, r));
}

// ---------- map ----------
const map = createMap($("#map"), index, {
  onNodeClick: (n) => showNode(n.id),
  onEdgeClick: (e) => showEdge(e.id),
  onBackground: () => { map.clearHighlight(); closePanel(); document.querySelectorAll(".chain-item.active").forEach((el) => el.classList.remove("active")); },
});
window.addEventListener("resize", debounce(() => map.resize(), 200));

// Legend + stats
const LN = { mutualism: "mut", commensalism: "com", parasitism: "par", context: "ctx" };
$("#legend").innerHTML = [...index.types.values()].map((t) =>
  `<span class="lg"><span class="ln ${LN[t.id]}"></span>${esc(t.label)}</span>`).join("");
$("#stats").textContent = `${index.nodes.length} organisms · ${index.edges.length} relationships · ${index.chains.length} chains`;

// ---------- filters ----------
const groupWrap = $("#group-filters");
groupWrap.innerHTML = [...index.groups.values()].map((g) => {
  const count = index.nodes.filter((n) => n.group === g.id).length;
  return `<button class="toggle on" data-group="${g.id}" style="--c:${g.color}" aria-pressed="true"><span class="gdot" style="--c:${g.color}"></span>${esc(g.label)}<span class="count">${count}</span></button>`;
}).join("");
groupWrap.querySelectorAll(".toggle").forEach((b) => b.addEventListener("click", (ev) => {
  const set = new Set(map.getFilter().groups);
  if (ev.altKey || ev.metaKey) { set.clear(); set.add(b.dataset.group); } // solo
  else if (set.has(b.dataset.group)) set.delete(b.dataset.group); else set.add(b.dataset.group);
  groupWrap.querySelectorAll(".toggle").forEach((x) => { const on = set.has(x.dataset.group); x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
  map.setFilter({ groups: set });
}));

const typeWrap = $("#type-filters");
typeWrap.innerHTML = [...index.types.values()].map((t) => {
  const count = index.edges.filter((e) => e.type === t.id).length;
  return `<button class="toggle on" data-type="${t.id}" aria-pressed="true"><span class="ln ${LN[t.id]}"></span>${esc(t.label)}<span class="count">${count}</span></button>`;
}).join("");
typeWrap.querySelectorAll(".toggle").forEach((b) => b.addEventListener("click", () => {
  const set = new Set(map.getFilter().types);
  if (set.has(b.dataset.type)) set.delete(b.dataset.type); else set.add(b.dataset.type);
  b.classList.toggle("on", set.has(b.dataset.type));
  b.setAttribute("aria-pressed", set.has(b.dataset.type));
  map.setFilter({ types: set });
}));

$("#chains-only").addEventListener("change", (e) => map.setFilter({ chainsOnly: e.target.checked }));
$("#search").addEventListener("input", debounce((e) => map.setFilter({ search: e.target.value }), 120));
$("#search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const q = e.target.value.trim().toLowerCase();
  const hit = index.nodes.find((n) => n.name.toLowerCase().includes(q) || n.sci.toLowerCase().includes(q));
  if (hit) showNode(hit.id);
});

$("#chain-list").innerHTML = index.chains.map((c) =>
  `<button class="chain-item" data-chain="${c.id}"><span class="chain-name">${esc(c.name)}</span><span class="muted small">${c.nodes.length} organisms</span></button>`).join("");
$("#chain-list").querySelectorAll(".chain-item").forEach((b) => b.addEventListener("click", () => { showChain(b.dataset.chain); closeControlsOnMobile(); }));

// ---------- discovery ----------
const nodeOptions = [...index.groups.values()].map((g) =>
  `<optgroup label="${esc(g.label)}">${index.nodes.filter((n) => n.group === g.id).sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join("")}</optgroup>`).join("");
for (const id of ["#path-from", "#path-to", "#cascade-node"]) $(id).innerHTML = nodeOptions;
$("#path-from").value = "humans";
$("#path-to").value = "amf";
$("#cascade-node").value = "honeybee";

$("#btn-path").onclick = () => {
  const from = $("#path-from").value, to = $("#path-to").value, inc = $("#path-par").checked;
  const p = findPath(index, from, to, { includeParasitism: inc });
  if (p) map.highlight({ nodes: new Set(p.nodes), edges: new Set(p.edges.map((e) => e.id)), mode: "path" });
  else map.highlight({ nodes: new Set([from, to]), edges: new Set(), mode: "path" });
  openPanel(pathDetail(index, from, to, p, inc));
  closeControlsOnMobile();
};
$("#btn-cascade").onclick = () => { runCascade($("#cascade-node").value); closeControlsOnMobile(); };

let lastSurprise = null;
$("#btn-surprise").onclick = () => {
  // Weight toward cross-kingdom, context-dependent, contested or fully obligate links.
  const weighted = index.edges.filter((e) => e.id !== lastSurprise).map((e) => {
    const a = index.byId.get(e.source), b = index.byId.get(e.target);
    let w = 1;
    if (a.group !== b.group) w += 1.5;
    if (e.type === "context") w += 2;
    if (e.contested) w += 1;
    if (e.dependence.source === "obligate" && e.dependence.target === "obligate") w += 1.5;
    return { e, w };
  });
  let r = Math.random() * weighted.reduce((s, x) => s + x.w, 0);
  const pick = weighted.find((x) => (r -= x.w) <= 0) || weighted[0];
  lastSurprise = pick.e.id;
  showEdge(pick.e.id, "✦ Surprising connection");
  closeControlsOnMobile();
};

$("#btn-clear").onclick = () => { map.clearHighlight(); closePanel(); };
$("#btn-reset").onclick = () => map.resetView();

// Mobile drawer
const controls = $("#controls");
$("#open-controls").onclick = () => controls.classList.add("open");
$(".controls-close").onclick = () => controls.classList.remove("open");
function closeControlsOnMobile() { if (matchMedia("(max-width: 900px)").matches) controls.classList.remove("open"); }

// ---------- tabs + playground ----------
const playground = createPlayground($("#view-playground"), index, { onShowEdge: (id) => showEdge(id), llmAvailable: status.llm });

function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.view === name; t.classList.toggle("active", on); t.setAttribute("aria-selected", on); });
  if (name === "map") requestAnimationFrame(() => map.resize());
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
