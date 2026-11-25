// HTML renderers for the side panel. Pure functions returning strings.
import { citationText, dependenceOf } from "./data.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CONF_LABEL = { high: "High", medium: "Medium", low: "Low" };

export function typeChip(index, type) {
  return `<span class="chip type t-${type}">${esc(index.types.get(type).label)}</span>`;
}
export function groupDot(index, group) {
  return `<span class="gdot" style="--c:${index.groups.get(group).color}"></span>`;
}
function nodeLink(index, id) {
  const n = index.byId.get(id);
  return `<button class="linkish" data-node="${esc(id)}">${groupDot(index, n.group)}${esc(n.name)}</button>`;
}

export function edgeDetail(index, e) {
  const a = index.byId.get(e.source);
  const b = index.byId.get(e.target);
  const chains = index.chainsByEdge.get(e.id) || [];
  const arrow = e.type === "parasitism" ? "→" : "↔";
  const cites = e.citations.map((c) =>
    `<li class="${c.needed ? "needed" : ""}">${esc(citationText(c))}</li>`).join("");
  return `
    <header class="panel-head">
      <div class="eyebrow">${esc(e.id)} · relationship</div>
      <h2>${nodeLink(index, a.id)} <span class="arrow">${arrow}</span> ${nodeLink(index, b.id)}</h2>
      <div class="chips">${typeChip(index, e.type)}
        <span class="chip conf c-${e.confidence}">Confidence: ${CONF_LABEL[e.confidence]}</span>
        ${e.contested ? `<span class="chip warn">Contested</span>` : ""}
      </div>
    </header>
    <section class="tldr"><h3>TL;DR</h3><p>${esc(e.tldr)}</p></section>
    <section>
      <h3>Who gives what · who gets what</h3>
      <table class="exchange">
        <thead><tr><th></th><th>Gives</th><th>Gets</th></tr></thead>
        <tbody>
          <tr><th>${groupDot(index, a.group)}${esc(a.name)}</th><td>${esc(e.gives.source)}</td><td>${esc(e.gets.source)}</td></tr>
          <tr><th>${groupDot(index, b.group)}${esc(b.name)}</th><td>${esc(e.gives.target)}</td><td>${esc(e.gets.target)}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h3>Impact</h3>
      <dl class="kv">
        <dt>Ecological</dt><dd>${esc(e.impact.ecological || "—")}</dd>
        <dt>Human / economic</dt><dd>${esc(e.impact.human || "None notable")}</dd>
      </dl>
    </section>
    <section>
      <h3>Obligate vs facultative</h3>
      <p>${esc(e.obligate)}</p>
      <p class="muted small">Dependence on this partner: ${esc(a.name)} — <b>${esc(dependenceOf(e, a.id))}</b>; ${esc(b.name)} — <b>${esc(dependenceOf(e, b.id))}</b></p>
    </section>
    <section>
      <h3>Evidence</h3>
      <ul class="cites">${cites}</ul>
      ${e.confidence_note ? `<p class="flag">⚠ ${esc(e.confidence_note)}</p>` : ""}
    </section>
    ${chains.length ? `<section><h3>Part of chain</h3><div class="chips">${chains.map((c) => `<button class="chip chain-btn" data-chain="${c.id}">${esc(c.name)}</button>`).join("")}</div></section>` : ""}
  `;
}

export function nodeDetail(index, n) {
  const rels = index.adj.get(n.id);
  const maxDeg = Math.max(...index.nodes.map((x) => x.degree));
  const group = index.groups.get(n.group);
  const items = rels
    .slice()
    .sort((x, y) => x.edge.type.localeCompare(y.edge.type))
    .map(({ edge, other }) => {
      const o = index.byId.get(other);
      return `<li><button class="rel" data-edge="${edge.id}">
        <span class="rel-type t-${edge.type}"></span>
        <span class="rel-name">${groupDot(index, o.group)}${esc(o.name)}</span>
        <span class="rel-meta">${esc(index.types.get(edge.type).label)} · you: ${esc(dependenceOf(edge, n.id))}</span>
      </button></li>`;
    }).join("");
  return `
    <header class="panel-head">
      <div class="eyebrow">${groupDot(index, n.group)}${esc(group.label)}</div>
      <h2>${esc(n.name)}</h2>
      <p class="sci">${esc(n.sci)}</p>
    </header>
    <section class="scores">
      <div class="score">
        <div class="score-label">Keystone score <span class="muted">(degree)</span></div>
        <div class="score-val">${n.degree}</div>
        <div class="bar"><span style="width:${(n.degree / maxDeg) * 100}%"></span></div>
      </div>
      <div class="score">
        <div class="score-label">Bridging <span class="muted">(betweenness)</span></div>
        <div class="score-val">${Math.round(n.betweenness * 100)}</div>
        <div class="bar"><span style="width:${n.betweenness * 100}%"></span></div>
      </div>
      <p class="muted small">Both scores describe this curated dataset only. Well-studied organisms score higher because they're well studied, which isn't the same as ecological importance.</p>
    </section>
    <section class="fact"><h3>Fun fact</h3><p>${esc(n.fact)}</p></section>
    <section>
      <h3>Relationships (${rels.length})</h3>
      <ul class="rels">${items}</ul>
    </section>
    <section class="actions">
      <button class="btn ghost" data-action="cascade" data-node="${esc(n.id)}">What breaks if it disappears?</button>
      <button class="btn ghost" data-action="pg-a" data-node="${esc(n.id)}">Use in Playground</button>
    </section>
  `;
}

export function cascadeDetail(index, result) {
  const root = index.byId.get(result.root);
  const list = (map, cls) =>
    [...map.entries()]
      .sort((x, y) => x[1].level - y[1].level)
      .map(([id, info]) => {
        const n = index.byId.get(id);
        const via = index.byId.get(info.lost);
        return `<li class="${cls}"><button class="linkish" data-node="${id}">${groupDot(index, n.group)}${esc(n.name)}</button>
          <span class="muted small">step ${info.level} · via ${esc(via.name)} (<button class="linkish small" data-edge="${info.via.id}">${info.via.id}</button>)</span></li>`;
      }).join("");
  return `
    <header class="panel-head">
      <div class="eyebrow">Cascade simulation</div>
      <h2>If ${esc(root.name)} disappears…</h2>
    </header>
    <section>
      <h3>Collapses (obligate dependence) — ${result.collapsed.size}</h3>
      ${result.collapsed.size ? `<ul class="cascade">${list(result.collapsed, "c-hard")}</ul>` : `<p class="muted">Nothing in the dataset depends on it obligately.</p>`}
    </section>
    <section>
      <h3>Weakened (facultative) — ${result.weakened.size}</h3>
      ${result.weakened.size ? `<ul class="cascade">${list(result.weakened, "c-soft")}</ul>` : `<p class="muted">No facultative dependents.</p>`}
    </section>
    <p class="muted small">Collapse spreads only through obligate links; weakened partners don't spread it further. It's a toy model: real ecosystems have redundancy, partners outside this dataset, and evolution.</p>
  `;
}

export function pathDetail(index, from, to, path, includeParasitism) {
  const a = index.byId.get(from), b = index.byId.get(to);
  if (!path) {
    return `<header class="panel-head"><div class="eyebrow">Path finder</div><h2>${esc(a.name)} ⇢ ${esc(b.name)}</h2></header>
      <p>No dependency chain connects these two in the dataset${includeParasitism ? "" : " (parasitism excluded—try including it)"}.</p>`;
  }
  const steps = path.edges.map((e, i) => {
    const x = index.byId.get(path.nodes[i]);
    const y = index.byId.get(path.nodes[i + 1]);
    return `<li><button class="rel" data-edge="${e.id}"><span class="rel-type t-${e.type}"></span>
      <span class="rel-name">${esc(x.name)} → ${esc(y.name)}</span>
      <span class="rel-meta">${esc(index.types.get(e.type).label)} · ${esc(e.tldr.split(". ")[0])}.</span></button></li>`;
  }).join("");
  return `
    <header class="panel-head"><div class="eyebrow">Path finder · ${path.edges.length} step${path.edges.length === 1 ? "" : "s"}</div>
      <h2>${path.nodes.map((id) => esc(index.byId.get(id).name)).join(' <span class="arrow">→</span> ')}</h2></header>
    <ol class="rels path">${steps}</ol>
    <p class="muted small">Shortest chain through links where at least one side depends on the other${includeParasitism ? ", including parasitism" : "; parasitism excluded"}.</p>`;
}
