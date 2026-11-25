// Force-directed connection map (D3 v7, loaded globally as window.d3).
const d3 = window.d3;

const TYPE_STROKE = {
  mutualism: "var(--mut)",
  commensalism: "var(--com)",
  parasitism: "var(--par)",
};

export function createMap(svgEl, index, { onNodeClick, onEdgeClick, onBackground } = {}) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const width = () => svgEl.clientWidth || 800;
  const height = () => svgEl.clientHeight || 600;

  const defs = svg.append("defs");
  // Soft bioluminescent glow
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
  glow.append("feGaussianBlur").attr("stdDeviation", 3.2).attr("result", "b");
  const m = glow.append("feMerge");
  m.append("feMergeNode").attr("in", "b");
  m.append("feMergeNode").attr("in", "SourceGraphic");

  defs.append("marker")
    .attr("id", "arrow-par").attr("viewBox", "0 0 10 10").attr("refX", 9).attr("refY", 5)
    .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
    .append("path").attr("d", "M0,1 L9,5 L0,9 z").attr("fill", "var(--par)");

  const root = svg.append("g").attr("class", "viewport");
  const linkLayer = root.append("g").attr("class", "links");
  const nodeLayer = root.append("g").attr("class", "nodes");
  const labelLayer = root.append("g").attr("class", "labels");

  const zoom = d3.zoom().scaleExtent([0.25, 5]).on("zoom", (ev) => {
    root.attr("transform", ev.transform);
    svgEl.classList.toggle("zoomed-in", ev.transform.k > 1.35);
    // Keep labels readable: grow sub-linearly with zoom instead of 1:1.
    labelLayer.style("font-size", `${11 / Math.sqrt(ev.transform.k)}px`);
  });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (ev) => { if (ev.target === svgEl) onBackground?.(); });

  // Simulation data (copies so D3 can mutate)
  const simNodes = index.nodes.map((n) => ({ ...n, r: 5 + Math.sqrt(n.degree) * 3.4 }));
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));
  const simLinks = index.edges.map((e) => ({ ...e, source: nodeById.get(e.source), target: nodeById.get(e.target), data: e }));

  // Group anchors around a ring keep kingdoms loosely clustered; humans sit in the middle.
  const groupIds = [...index.groups.keys()].filter((g) => g !== "humans");
  const anchor = (g, w, h) => {
    if (g === "humans") return { x: w / 2, y: h / 2 };
    const i = groupIds.indexOf(g);
    const a = (i / groupIds.length) * Math.PI * 2 - Math.PI / 2;
    const R = Math.min(w, h) * 0.34;
    return { x: w / 2 + Math.cos(a) * R, y: h / 2 + Math.sin(a) * R };
  };

  // Context edges get a per-edge gradient that follows the line.
  const grads = defs.selectAll("linearGradient.ctx")
    .data(simLinks.filter((l) => l.type === "context"), (d) => d.id)
    .join("linearGradient")
    .attr("class", "ctx").attr("id", (d) => `g-${d.id}`).attr("gradientUnits", "userSpaceOnUse");
  grads.append("stop").attr("offset", "0%").attr("stop-color", "var(--mut)");
  grads.append("stop").attr("offset", "50%").attr("stop-color", "var(--ctx-mid)");
  grads.append("stop").attr("offset", "100%").attr("stop-color", "var(--par)");

  const linkG = linkLayer.selectAll("g.link").data(simLinks, (d) => d.id).join("g")
    .attr("class", (d) => `link t-${d.type}${index.chainEdges.has(d.id) ? " in-chain" : ""}`);
  const linkVis = linkG.append("path").attr("class", "vis")
    .attr("stroke", (d) => (d.type === "context" ? `url(#g-${d.id})` : TYPE_STROKE[d.type]))
    .attr("marker-end", (d) => (d.type === "parasitism" ? "url(#arrow-par)" : null));
  const linkHit = linkG.append("path").attr("class", "hit")
    .on("click", (ev, d) => { ev.stopPropagation(); onEdgeClick?.(d.data); })
    .on("mouseenter", function (ev, d) { d3.select(this.parentNode).classed("hover", true); showTip(ev, edgeTip(d)); })
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", function () { d3.select(this.parentNode).classed("hover", false); hideTip(); });
  linkHit.append("title").text((d) => `${d.source.name} — ${d.target.name}`);

  const nodeG = nodeLayer.selectAll("g.node").data(simNodes, (d) => d.id).join("g")
    .attr("class", (d) => `node grp-${d.group}`)
    .call(d3.drag()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
    .on("click", (ev, d) => { ev.stopPropagation(); onNodeClick?.(index.byId.get(d.id)); })
    .on("mouseenter", (ev, d) => { hoverNode(d.id, true); showTip(ev, `<b>${d.name}</b><br><i>${d.sci}</i><br>${d.degree} link${d.degree === 1 ? "" : "s"}`); })
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", (ev, d) => { hoverNode(d.id, false); hideTip(); });
  nodeG.append("circle").attr("class", "halo").attr("r", (d) => d.r + 5).attr("fill", (d) => index.groups.get(d.group).color);
  nodeG.append("circle").attr("class", "core").attr("r", (d) => d.r)
    .attr("fill", (d) => index.groups.get(d.group).color).attr("filter", "url(#glow)");

  const labels = labelLayer.selectAll("text").data(simNodes, (d) => d.id).join("text")
    .attr("class", (d) => `label${d.degree >= 4 || d.group === "humans" ? " major" : ""}`)
    .text((d) => d.name);

  const sim = d3.forceSimulation(simNodes)
    .force("link", d3.forceLink(simLinks).id((d) => d.id).distance((l) => (l.source.group === l.target.group ? 48 : 78)).strength(0.55))
    .force("charge", d3.forceManyBody().strength(-170).distanceMax(420))
    .force("collide", d3.forceCollide().radius((d) => d.r + 7))
    .force("x", d3.forceX((d) => anchor(d.group, width(), height()).x).strength(0.07))
    .force("y", d3.forceY((d) => anchor(d.group, width(), height()).y).strength(0.07))
    .alphaDecay(0.025)
    .on("tick", ticked)
    .stop();
  // Pre-settle the layout so the first frame is already readable, then fit it to the viewport.
  for (let i = 0; i < 220; i++) sim.tick();
  ticked();
  fitAll(false);
  sim.alpha(0.08).restart();

  function curve(d) {
    const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.min(26, len * 0.12);
    const mx = (sx + tx) / 2 - (dy / len) * off;
    const my = (sy + ty) / 2 + (dx / len) * off;
    // Pull the endpoint back to the target circle edge so arrows stay visible.
    const ex = tx - ((tx - mx) / Math.hypot(tx - mx, ty - my)) * (d.target.r + 3);
    const ey = ty - ((ty - my) / Math.hypot(tx - mx, ty - my)) * (d.target.r + 3);
    return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
  }

  function ticked() {
    linkVis.attr("d", curve);
    linkHit.attr("d", curve);
    grads.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    nodeG.attr("transform", (d) => `translate(${d.x},${d.y})`);
    labels.attr("x", (d) => d.x).attr("y", (d) => d.y + d.r + 12);
  }

  // ---------- tooltip ----------
  const tip = document.getElementById("map-tip");
  function edgeTip(d) {
    const t = index.types.get(d.type).label;
    return `<b>${d.source.name}</b> ${d.type === "parasitism" ? "→" : "↔"} <b>${d.target.name}</b><br><span class="tip-type t-${d.type}">${t}</span>`;
  }
  function showTip(ev, html) {
    if (!tip || matchMedia("(hover: none)").matches) return;
    tip.innerHTML = html;
    tip.hidden = false;
    moveTip(ev);
  }
  function moveTip(ev) {
    if (!tip || tip.hidden) return;
    const box = svgEl.getBoundingClientRect();
    tip.style.left = `${ev.clientX - box.left + 14}px`;
    tip.style.top = `${ev.clientY - box.top + 14}px`;
  }
  function hideTip() { if (tip) tip.hidden = true; }

  // ---------- state: filters + highlights ----------
  let filter = { groups: new Set(index.groups.keys()), types: new Set(index.types.keys()), chainsOnly: false, search: "" };
  let highlight = null; // { nodes:Set, edges:Set, mode, extra:{collapsed,weakened} }

  function visibleEdge(e) {
    return filter.types.has(e.type) &&
      filter.groups.has(e.source.group) && filter.groups.has(e.target.group) &&
      (!filter.chainsOnly || index.chainEdges.has(e.id));
  }

  function apply() {
    const visEdges = new Set(simLinks.filter(visibleEdge).map((e) => e.id));
    const visNodes = new Set();
    for (const l of simLinks) if (visEdges.has(l.id)) { visNodes.add(l.source.id); visNodes.add(l.target.id); }
    // Nodes stay visible when their group is on, unless "chains only" hides unconnected ones.
    for (const n of simNodes) if (filter.groups.has(n.group) && !filter.chainsOnly) visNodes.add(n.id);

    const q = filter.search.trim().toLowerCase();
    const searchHit = (n) => q && (n.name.toLowerCase().includes(q) || n.sci.toLowerCase().includes(q));

    linkG.classed("hidden", (d) => !visEdges.has(d.id));
    nodeG.classed("hidden", (d) => !visNodes.has(d.id));
    labels.classed("hidden", (d) => !visNodes.has(d.id));

    const hl = highlight;
    const searching = Boolean(q);
    nodeG
      .classed("dim", (d) => (hl ? !hl.nodes.has(d.id) : searching && !searchHit(d)))
      .classed("hl", (d) => Boolean(hl?.nodes.has(d.id)))
      .classed("search-hit", (d) => Boolean(searchHit(d)))
      .classed("collapsed", (d) => Boolean(hl?.extra?.collapsed?.has(d.id)))
      .classed("weakened", (d) => Boolean(hl?.extra?.weakened?.has(d.id)))
      .classed("root", (d) => hl?.extra?.root === d.id);
    labels
      .classed("dim", (d) => (hl ? !hl.nodes.has(d.id) : searching && !searchHit(d)))
      .classed("show", (d) => Boolean(hl?.nodes.has(d.id) || searchHit(d)));
    linkG
      .classed("dim", (d) => (hl ? !hl.edges.has(d.id) : searching && !(searchHit(d.source) || searchHit(d.target))))
      .classed("hl", (d) => Boolean(hl?.edges.has(d.id)))
      .classed("flow", (d) => Boolean(hl?.edges.has(d.id) && (hl.mode === "chain" || hl.mode === "path")))
      .classed("weak", (d) => Boolean(hl?.extra?.weakEdges?.has(d.id)));
  }

  function hoverNode(id, on) {
    if (highlight) return;
    const nbr = new Set([id]);
    const eids = new Set();
    for (const { edge, other } of index.adj.get(id)) { nbr.add(other); eids.add(edge.id); }
    nodeG.classed("hover-dim", (d) => on && !nbr.has(d.id));
    linkG.classed("hover-dim", (d) => on && !eids.has(d.id));
    labels.classed("hover-show", (d) => on && nbr.has(d.id));
  }

  function fitAll(animate = true) {
    focusOn(new Set(simNodes.map((n) => n.id)), { maxScale: 1.2, animate });
  }

  function focusOn(ids, { maxScale = 1.8, animate = true } = {}) {
    const pts = simNodes.filter((n) => ids.has(n.id));
    if (!pts.length) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 90;
    const k = Math.min(maxScale, 0.9 / Math.max((x1 - x0 + pad) / width(), (y1 - y0 + pad) / height()));
    const t = d3.zoomIdentity.translate(width() / 2, height() / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    if (animate) svg.transition().duration(750).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }

  const api = {
    setFilter(next) { filter = { ...filter, ...next }; apply(); },
    getFilter: () => filter,
    highlight(h) { highlight = h; apply(); if (h?.focus !== false && h?.nodes?.size) focusOn(h.nodes); },
    clearHighlight() { highlight = null; apply(); },
    selectEdge(edgeId) {
      const e = index.edgeById.get(edgeId);
      api.highlight({ nodes: new Set([e.source, e.target]), edges: new Set([edgeId]), mode: "edge" });
    },
    selectNode(nodeId) {
      const nodes = new Set([nodeId]);
      const edges = new Set();
      for (const { edge, other } of index.adj.get(nodeId)) { nodes.add(other); edges.add(edge.id); }
      api.highlight({ nodes, edges, mode: "node" });
    },
    resetView() { fitAll(); },
    resize() {
      sim.force("x").x((d) => anchor(d.group, width(), height()).x);
      sim.force("y").y((d) => anchor(d.group, width(), height()).y);
      sim.alpha(0.3).restart();
      setTimeout(() => fitAll(), 700);
    },
    reheat() { sim.alpha(0.6).restart(); },
  };
  apply();
  return api;
}
