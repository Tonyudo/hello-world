// Dataset loading, indexes and graph algorithms. No DOM here.

export async function loadData(url = "/data/symbiosis.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load dataset (${res.status})`);
  return buildIndex(await res.json());
}

export function buildIndex(raw) {
  const nodes = raw.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = raw.edges.map((e) => ({ ...e }));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const groups = new Map(raw.meta.groups.map((g) => [g.id, g]));
  const types = new Map(raw.meta.types.map((t) => [t.id, t]));

  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.source).push({ edge: e, other: e.target, side: "source" });
    adj.get(e.target).push({ edge: e, other: e.source, side: "target" });
  }

  const chainEdges = new Set();
  for (const c of raw.chains) c.edges.forEach((id) => chainEdges.add(id));
  const chainsByEdge = new Map();
  for (const c of raw.chains) for (const id of c.edges) {
    if (!chainsByEdge.has(id)) chainsByEdge.set(id, []);
    chainsByEdge.get(id).push(c);
  }

  for (const n of nodes) n.degree = adj.get(n.id).length;
  const btw = betweenness(nodes, adj);
  for (const n of nodes) n.betweenness = btw.get(n.id);

  return { meta: raw.meta, nodes, edges, chains: raw.chains, byId, edgeById, groups, types, adj, chainEdges, chainsByEdge };
}

/** Brandes betweenness on the undirected graph, normalised to 0–1. */
function betweenness(nodes, adj) {
  const cb = new Map(nodes.map((n) => [n.id, 0]));
  for (const s of nodes) {
    const stack = [];
    const pred = new Map(nodes.map((n) => [n.id, []]));
    const sigma = new Map(nodes.map((n) => [n.id, 0]));
    const dist = new Map(nodes.map((n) => [n.id, -1]));
    sigma.set(s.id, 1);
    dist.set(s.id, 0);
    const q = [s.id];
    while (q.length) {
      const v = q.shift();
      stack.push(v);
      for (const { other: w } of adj.get(v)) {
        if (dist.get(w) < 0) { q.push(w); dist.set(w, dist.get(v) + 1); }
        if (dist.get(w) === dist.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
      }
    }
    const delta = new Map(nodes.map((n) => [n.id, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      if (w !== s.id) cb.set(w, cb.get(w) + delta.get(w));
    }
  }
  const max = Math.max(...cb.values()) || 1;
  for (const [k, v] of cb) cb.set(k, v / max);
  return cb;
}

/** How much `nodeId` depends on its partner in edge `e`. */
export function dependenceOf(e, nodeId) {
  if (e.source === nodeId) return e.dependence?.source ?? "none";
  if (e.target === nodeId) return e.dependence?.target ?? "none";
  return "none";
}

/**
 * Shortest chain between two nodes (BFS, undirected).
 * By default it only walks edges where at least one side actually depends on the other
 * and skips parasitism, so the result reads as a dependency chain.
 */
export function findPath(index, fromId, toId, { includeParasitism = false } = {}) {
  if (fromId === toId) return { nodes: [fromId], edges: [] };
  const allowed = (e) =>
    (includeParasitism || e.type !== "parasitism") &&
    (e.dependence?.source !== "none" || e.dependence?.target !== "none");
  const prev = new Map([[fromId, null]]);
  const q = [fromId];
  while (q.length) {
    const v = q.shift();
    for (const { edge, other } of index.adj.get(v)) {
      if (!allowed(edge) || prev.has(other)) continue;
      prev.set(other, { from: v, edge });
      if (other === toId) {
        const nodes = [toId];
        const edges = [];
        let cur = toId;
        while (prev.get(cur)) { edges.unshift(prev.get(cur).edge); cur = prev.get(cur).from; nodes.unshift(cur); }
        return { nodes, edges };
      }
      q.push(other);
    }
  }
  return null;
}

/**
 * What breaks if X disappears.
 * Obligate dependents collapse and the cascade continues through them.
 * Facultative dependents are weakened but don't propagate further.
 */
export function cascade(index, rootId) {
  const collapsed = new Map([[rootId, { level: 0, via: null }]]);
  const weakened = new Map();
  const edgesHit = new Set();
  let frontier = [rootId];
  let level = 0;
  while (frontier.length) {
    level++;
    const next = [];
    for (const lost of frontier) {
      for (const { edge, other } of index.adj.get(lost)) {
        if (collapsed.has(other)) continue;
        const dep = dependenceOf(edge, other);
        if (dep === "obligate") {
          collapsed.set(other, { level, via: edge, lost });
          weakened.delete(other);
          edgesHit.add(edge.id);
          next.push(other);
        } else if (dep === "facultative" && !weakened.has(other)) {
          weakened.set(other, { level, via: edge, lost });
          edgesHit.add(edge.id);
        }
      }
    }
    frontier = next;
  }
  collapsed.delete(rootId);
  return { root: rootId, collapsed, weakened, edgesHit };
}

/** Fuzzy match free text to a dataset node. */
export function matchNode(index, text) {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const exact = index.nodes.find(
    (n) => n.id === q || n.name.toLowerCase() === q || n.sci.toLowerCase() === q,
  );
  if (exact) return exact;
  if (q.length < 4) return null;
  return (
    index.nodes.find((n) => n.name.toLowerCase().includes(q) || n.sci.toLowerCase().includes(q)) || null
  );
}

export function edgeBetween(index, a, b) {
  return index.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)) || null;
}

export function citationText(c) {
  if (c.needed) return `citation needed${c.note ? ` (${c.note})` : ""}`;
  return `${c.author}, ${c.year}. ${c.venue}`;
}
