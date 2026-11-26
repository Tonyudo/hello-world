// Symbiosis Playground: compatibility analysis, experiment log, run comparison.
import { edgeBetween, matchNode, findPath, citationText } from "./data.js";
import { esc, typeChip, groupDot } from "./panel.js";

const OFFERS = {
  fungi: { give: "mineral nutrients and water from soil, breakdown of tough organic matter, antimicrobial compounds", ch: ["nutrients", "protection"] },
  bacteria: { give: "fixed nitrogen, vitamins, digestion of complex carbohydrates, antibiotics, light", ch: ["nutrients", "protection", "signals"] },
  plants: { give: "sugars, nectar, pollen or fruit, shelter", ch: ["nutrients", "shelter"] },
  protists: { give: "photosynthetic sugars or cellulose breakdown", ch: ["nutrients"] },
  insects: { give: "pollination, defence, transport of spores or seeds, cultivation", ch: ["dispersal", "protection", "transport"] },
  birds: { give: "seed dispersal, pollination, parasite removal, alarm calls", ch: ["dispersal", "cleaning", "signals"] },
  animals: { give: "cleaning, shelter, transport, nutrient-rich waste, defence", ch: ["cleaning", "shelter", "transport", "protection"] },
  humans: { give: "cultivation, protection, global transport, food", ch: ["shelter", "transport", "nutrients"] },
};
const MICRO_GROUPS = new Set(["fungi", "bacteria", "protists"]);
const HOST_TAGS = new Set(["host-internal", "host-external"]);
const SCALE_RANK = { micro: 0, small: 1, medium: 2, large: 3 };
const LOG_KEY = "symbiosis.experimentLog.v1";

const FALSIFY = {
  mutualism: (a, b) => `If experimentally separating ${a} and ${b} caused no fitness loss for either across realistic conditions, the mutualism label would be wrong.`,
  parasitism: (a, b) => `If ${b} carrying ${a} showed no measurable loss of survival or reproduction compared with ${b} without it, this isn't parasitism.`,
  commensalism: (a, b) => `If ${b} measurably gained or lost fitness from ${a}'s presence, the relationship isn't commensal.`,
  context: (a, b) => `If the outcome for ${a} and ${b} stayed the same sign across the conditions that are said to flip it, "context-dependent" would be wrong.`,
};

// ---------- offline engine ----------

const HOSTED_MICRO = new Set(["animal-gut", "animal-intracellular", "animal-surface", "plant-interior"]);
const overlap = (x = [], y = []) => x.filter((v) => y.includes(v));
const regionsMeet = (a, b) =>
  a.includes("cosmopolitan") || b.includes("cosmopolitan") || overlap(a, b).length > 0;

function habitatCheck(A, B) {
  // Fine-grained tags (microhabitat / zone / region) when present; coarse habitat otherwise.
  if (A.microhabitat && B.microhabitat) return fineHabitatCheck(A, B);
  return coarseHabitatCheck(A, B);
}

function fineHabitatCheck(A, B) {
  if (!regionsMeet(A.region, B.region)) {
    return { status: "no", note: `Ranges don't overlap (${A.region.join(", ")} vs ${B.region.join(", ")}).`, score: 0 };
  }
  const sharedMicro = overlap(A.microhabitat, B.microhabitat);
  if (sharedMicro.length) return { status: "yes", note: `Both live in: ${sharedMicro.join(", ")}.`, score: 2 };
  const aHosted = A.zone.includes("inside-host") || A.microhabitat.some((m) => HOSTED_MICRO.has(m));
  const bHosted = B.zone.includes("inside-host") || B.microhabitat.some((m) => HOSTED_MICRO.has(m));
  if (aHosted && B.scale !== "micro") return { status: "partial", note: `${A.name} lives in or on hosts; ${B.name} would have to become a new host.`, score: 1 };
  if (bHosted && A.scale !== "micro") return { status: "partial", note: `${B.name} lives in or on hosts; ${A.name} would have to become a new host.`, score: 1 };
  const sharedZone = overlap(A.zone, B.zone).filter((z) => z !== "inside-host");
  if (sharedZone.length) return { status: "partial", note: `Same zone (${sharedZone.join(", ")}) and overlapping ranges, but different microhabitats (${A.microhabitat.join(", ")} vs ${B.microhabitat.join(", ")}).`, score: 1 };
  return { status: "no", note: `Different microhabitats and zones (${A.microhabitat.join(", ")} / ${A.zone.join(", ")} vs ${B.microhabitat.join(", ")} / ${B.zone.join(", ")}).`, score: 0 };
}

function coarseHabitatCheck(A, B) {
  const ha = A.habitat.filter((h) => !HOST_TAGS.has(h));
  const hb = B.habitat.filter((h) => !HOST_TAGS.has(h));
  const shared = ha.filter((h) => hb.includes(h));
  const aHosted = A.habitat.some((h) => HOST_TAGS.has(h));
  const bHosted = B.habitat.some((h) => HOST_TAGS.has(h));
  if (shared.length) return { status: "yes", note: `Both occur in: ${shared.join(", ")}.`, score: 2 };
  if (aHosted && B.scale !== "micro") return { status: "partial", note: `${A.name} lives in or on hosts; ${B.name} would have to become a new host.`, score: 1 };
  if (bHosted && A.scale !== "micro") return { status: "partial", note: `${B.name} lives in or on hosts; ${A.name} would have to become a new host.`, score: 1 };
  if (aHosted && bHosted) return { status: "partial", note: "Both are host-associated; they would need to share a host.", score: 1 };
  return { status: "no", note: `No shared habitat tags (${ha.join(", ") || "—"} vs ${hb.join(", ") || "—"}).`, score: 0 };
}

function scaleCheck(A, B) {
  const ra = SCALE_RANK[A.scale], rb = SCALE_RANK[B.scale];
  if (ra === 0 && rb === 0) return { status: "yes", note: "Both microscopic: microbial consortia and cross-feeding are common." };
  if (ra === 0 || rb === 0) return { status: "yes", note: "Microbe and macro-organism: the classic host–symbiont scale gap." };
  if (Math.abs(ra - rb) >= 1 && Math.min(ra, rb) === 1) return { status: "yes", note: "A small partner can live on, around or alongside a bigger one (cleaning, pollination, guarding)." };
  if (ra === rb && ra === 1) return { status: "yes", note: "Similar small scale: trophobiosis-style exchanges are possible." };
  return { status: "partial", note: "Both are large; only loose behavioural associations are realistic." };
}

function bioCheck(A, B) {
  const ga = A.group, gb = B.group;
  const pair = [ga, gb].sort().join("|");
  if (pair === "fungi|plants") return { status: "yes", note: "Most plants have the molecular toolkit for fungal root symbioses (the common symbiosis signalling pathway)." };
  if (pair === "bacteria|plants") return { status: "partial", note: "Nitrogen-fixing nodules need specific signalling that most plant lineages lack; looser root and leaf associations are common." };
  if (MICRO_GROUPS.has(ga) !== MICRO_GROUPS.has(gb)) return { status: "partial", note: "Microbe–host nutrient complementarity is common (vitamins, nitrogen, cellulose), but it needs host immune tolerance and a way to transmit the microbe." };
  if (MICRO_GROUPS.has(ga) && MICRO_GROUPS.has(gb)) return { status: "yes", note: "Microbes routinely trade metabolites (cross-feeding)." };
  return { status: "yes", note: "No intimate biochemical integration needed; the exchange would be behavioural or ecological." };
}

function coevoCheck(index, A, B) {
  if (A.group === "humans" || B.group === "humans") return { status: "partial", note: "Human partnerships are recent: about 15,000+ years for dogs and about 10,000 for crops. That's enough for domestication, not deep co-speciation." };
  const internal = A.habitat.includes("host-internal") || B.habitat.includes("host-internal");
  const shared = sharedPartners(index, A.id, B.id);
  const sharedNote = shared.length ? ` Both already interact with ${shared.map((n) => n.name).join(", ")}.` : "";
  if (internal) return { status: "unknown", note: `Intimate endosymbioses usually take millions of years and leave genomic signatures such as genome reduction.${sharedNote}` };
  return { status: shared.length ? "partial" : "unknown", note: `Behavioural partnerships can form in ecological time if the exchange pays off.${sharedNote}` };
}

function sharedPartners(index, a, b) {
  const na = new Set(index.adj.get(a).map((x) => x.other));
  return index.adj.get(b).filter((x) => na.has(x.other)).map((x) => index.byId.get(x.other));
}

function pickAnalog(index, A, B) {
  const pairKey = [A.group, B.group].sort().join("|");
  const sameGroups = index.edges.filter((e) => [index.byId.get(e.source).group, index.byId.get(e.target).group].sort().join("|") === pairKey);
  const touching = (e) => [e.source, e.target].some((id) => id === A.id || id === B.id);
  const best = sameGroups.find(touching) || sameGroups.find((e) => e.type === "mutualism") || sameGroups[0] ||
    index.edges.find(touching) || index.edges[0];
  const precedent = sameGroups.length > 0;
  const reason = precedent
    ? `Same kinds of partners (${index.groups.get(A.group).label} + ${index.groups.get(B.group).label}), with a documented exchange.`
    : `There's no documented ${index.groups.get(A.group).label}–${index.groups.get(B.group).label} pair in the dataset, so this is the nearest link involving one of them.`;
  return { edge: best, precedent, reason };
}

export function analyzeLocal(index, A, B) {
  const edge = edgeBetween(index, A.id, B.id);
  const requirements = { habitat: habitatCheck(A, B), scale: scaleCheck(A, B), biochemistry: bioCheck(A, B), coevolution: coevoCheck(index, A, B) };

  if (edge) {
    const forward = edge.source === A.id;
    const conf = { high: "High", medium: "Med", low: "Low" }[edge.confidence];
    const cited = edge.citations.filter((c) => !c.needed).length;
    return {
      source: "dataset",
      verdict: "Documented",
      confidence: conf,
      confidence_why: `Curated edge ${edge.id} with ${cited} citation${cited === 1 ? "" : "s"}${edge.citations.some((c) => c.needed) ? " (one marked citation needed)" : ""}.${edge.confidence_note ? " " + edge.confidence_note : ""}`,
      mechanism: {
        summary: edge.tldr,
        a_gives: forward ? edge.gives.source : edge.gives.target,
        b_gives: forward ? edge.gives.target : edge.gives.source,
        channels: [...new Set([...OFFERS[A.group].ch.slice(0, 1), ...OFFERS[B.group].ch.slice(0, 1)])],
      },
      requirements,
      analog: { edge_id: edge.id, reason: "This pair is itself in the dataset." },
      falsify: FALSIFY[edge.type](A.name, B.name),
      type: edge.type,
      citations: edge.citations.map(citationText),
    };
  }

  const analog = pickAnalog(index, A, B);
  const path = findPath(index, A.id, B.id, { includeParasitism: true });
  const near = path && path.edges.length <= 2;
  const hab = requirements.habitat.score;
  const score = hab + (analog.precedent ? 1 : 0) + (near ? 1 : 0) + (requirements.scale.status === "yes" ? 1 : 0);

  let verdict, confidence, why;
  if (hab === 0 && requirements.habitat.status === "no") {
    verdict = "Unlikely";
    confidence = "Med";
    why = `${requirements.habitat.note} Medium, not High: the tags describe typical habitat, and organisms can meet outside it.`;
  } else if (score >= 4) {
    verdict = "Plausible";
    confidence = analog.precedent && near ? "Med" : "Low";
    why = `They share a habitat, ${analog.precedent ? "partners like these have documented precedents" : "but there's no precedent for these kinds of partners"}, and ${near ? "they're already within two links of each other" : "they aren't closely linked in the network"}. Undocumented pairs never get High.`;
  } else {
    verdict = "Speculative";
    confidence = "Low";
    why = "Some conditions are met but key ones are missing or unknown (see the checks below). This is a heuristic based on coarse tags.";
  }

  return {
    source: "offline",
    verdict,
    confidence,
    confidence_why: why,
    mechanism: {
      summary: `Hypothesis (speculative): ${A.name} could offer ${OFFERS[A.group].give}; ${B.name} could offer ${OFFERS[B.group].give}.`,
      a_gives: OFFERS[A.group].give,
      b_gives: OFFERS[B.group].give,
      channels: [...new Set([...OFFERS[A.group].ch, ...OFFERS[B.group].ch])],
    },
    requirements,
    analog: { edge_id: analog.edge.id, reason: analog.reason },
    falsify: `If ${A.name} and ${B.name} were found together in the field and neither's survival or reproduction changed with the other's presence or absence, the hypothesis fails.`,
    path: path ? path.nodes : null,
  };
}

function analyzeOfflineFreeText(index, aText, bText, Anode, Bnode) {
  const known = Anode || Bnode;
  const analogEdge = (known && index.adj.get(known.id)[0]?.edge) || index.edges[0];
  const unk = { status: "unknown", note: "Can't check: at least one organism isn't in the curated dataset and Claude analysis is offline." };
  return {
    source: "offline",
    verdict: "Speculative",
    confidence: "Low",
    confidence_why: "At least one organism isn't in the dataset and the server has no Claude credentials, so nothing can be checked.",
    mechanism: { summary: "Not assessed offline.", a_gives: "Unknown", b_gives: "Unknown", channels: [] },
    requirements: { habitat: unk, scale: unk, biochemistry: unk, coevolution: unk },
    analog: { edge_id: analogEdge.id, reason: known ? `Closest dataset link for ${known.name}.` : "Placeholder; no basis for an analog." },
    falsify: `Field surveys finding ${aText} and ${bText} never co-occurring would rule out a relationship.`,
  };
}

// ---------- UI ----------

export function createPlayground(root, index, { onShowEdge, llmAvailable }) {
  const opts = [...index.groups.values()].map((g) => {
    const members = index.nodes.filter((n) => n.group === g.id).sort((a, b) => a.name.localeCompare(b.name));
    return `<optgroup label="${esc(g.label)}">${members.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join("")}</optgroup>`;
  }).join("");

  root.innerHTML = `
    <div class="pg-grid">
      <section class="pg-form card">
        <h2>Compatibility experiment</h2>
        <p class="muted">Pick two organisms from the dataset or type any organism. Dataset pairs are scored locally. Free-text pairs go to Claude${llmAvailable ? "" : " <span class='warn-inline'>(offline: no API key on the server)</span>"}.</p>
        ${["a", "b"].map((k) => `
          <fieldset class="pg-pick">
            <legend>Organism ${k.toUpperCase()}</legend>
            <select id="pg-${k}-sel"><option value="">— choose from dataset —</option>${opts}</select>
            <input id="pg-${k}-txt" type="text" placeholder="…or type any organism" autocomplete="off" maxlength="120">
          </fieldset>`).join("")}
        <div class="row">
          <button id="pg-run" class="btn primary">Run analysis</button>
          <button id="pg-swap" class="btn ghost" title="Swap A and B">⇄ Swap</button>
          <button id="pg-random" class="btn ghost">Random pair</button>
        </div>
        <p class="muted small">Rule: a pair that isn't in the curated dataset can never be labelled Documented. Speculation is labelled as speculation.</p>
      </section>
      <section id="pg-out" class="pg-out card empty"><p class="muted">Results appear here.</p></section>
      <section class="pg-log card">
        <div class="row between"><h2>Experiment log</h2>
          <div class="row"><button id="log-compare" class="btn ghost" disabled>Compare 2</button><button id="log-clear" class="btn ghost">Clear</button></div></div>
        <p class="muted small">Saved for this browser session. Tick two runs to compare.</p>
        <ul id="log-list" class="log-list"></ul>
      </section>
    </div>
    <dialog id="cmp-dialog" class="cmp"><form method="dialog"><button class="btn ghost close">Close</button></form><div id="cmp-body"></div></dialog>
  `;

  const $ = (sel) => root.querySelector(sel);
  const out = $("#pg-out");
  for (const k of ["a", "b"]) {
    $(`#pg-${k}-sel`).addEventListener("change", (e) => { if (e.target.value) $(`#pg-${k}-txt`).value = ""; });
    $(`#pg-${k}-txt`).addEventListener("input", (e) => { if (e.target.value) $(`#pg-${k}-sel`).value = ""; });
  }
  $("#pg-swap").onclick = () => {
    const [as, at, bs, bt] = [$("#pg-a-sel").value, $("#pg-a-txt").value, $("#pg-b-sel").value, $("#pg-b-txt").value];
    $("#pg-a-sel").value = bs; $("#pg-a-txt").value = bt; $("#pg-b-sel").value = as; $("#pg-b-txt").value = at;
  };
  $("#pg-random").onclick = () => {
    const pick = () => index.nodes[Math.floor(Math.random() * index.nodes.length)].id;
    let a = pick(), b = pick();
    while (b === a) b = pick();
    $("#pg-a-sel").value = a; $("#pg-b-sel").value = b; $("#pg-a-txt").value = ""; $("#pg-b-txt").value = "";
    run();
  };
  $("#pg-run").onclick = run;

  function readSide(k) {
    const sel = $(`#pg-${k}-sel`).value;
    const txt = $(`#pg-${k}-txt`).value.trim();
    if (sel) return { text: index.byId.get(sel).name, node: index.byId.get(sel) };
    if (txt) return { text: txt, node: matchNode(index, txt) };
    return null;
  }

  async function run() {
    const A = readSide("a"), B = readSide("b");
    if (!A || !B) { out.className = "pg-out card"; out.innerHTML = `<p class="flag">Choose or type both organisms.</p>`; return; }
    if (A.node && B.node && A.node.id === B.node.id) { out.className = "pg-out card"; out.innerHTML = `<p class="flag">Pick two different organisms.</p>`; return; }
    out.className = "pg-out card loading";
    out.innerHTML = `<div class="spore-loader" aria-label="Analysing"></div><p class="muted">Analysing ${esc(A.text)} × ${esc(B.text)}…</p>`;

    let result;
    if (A.node && B.node) {
      result = analyzeLocal(index, A.node, B.node);
    } else if (llmAvailable) {
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: A.text, b: B.text }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        result = enforceRule(index, body);
      } catch (err) {
        result = analyzeOfflineFreeText(index, A.text, B.text, A.node, B.node);
        result.error = `Claude analysis failed (${err.message}); showing offline fallback.`;
      }
    } else {
      result = analyzeOfflineFreeText(index, A.text, B.text, A.node, B.node);
    }
    const entry = { id: Date.now().toString(36), ts: new Date().toISOString(), a: A.text, b: B.text, aId: A.node?.id || null, bId: B.node?.id || null, result };
    saveLog([entry, ...loadLog()].slice(0, 50));
    out.className = "pg-out card";
    out.innerHTML = renderResult(index, entry);
    wireResult(out);
    renderLog();
  }

  function wireResult(el) {
    el.querySelectorAll("[data-edge]").forEach((b) => b.addEventListener("click", () => onShowEdge?.(b.dataset.edge)));
  }

  // ---------- log ----------
  const selected = new Set();
  function renderLog() {
    const log = loadLog();
    $("#log-list").innerHTML = log.length ? log.map((e) => `
      <li>
        <label class="log-pick"><input type="checkbox" data-id="${e.id}" ${selected.has(e.id) ? "checked" : ""}></label>
        <button class="log-item" data-open="${e.id}">
          <span class="verdict-dot v-${e.result.verdict.toLowerCase()}"></span>
          <span class="log-pair">${esc(e.a)} × ${esc(e.b)}</span>
          <span class="muted small">${esc(e.result.verdict)} · ${esc(e.result.confidence)} · ${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </button>
      </li>`).join("") : `<li class="muted small">No runs yet.</li>`;
    $("#log-list").querySelectorAll("input[type=checkbox]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
      if (selected.size > 2) { const first = selected.values().next().value; selected.delete(first); renderLog(); return; }
      $("#log-compare").disabled = selected.size !== 2;
    }));
    $("#log-list").querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
      const e = loadLog().find((x) => x.id === b.dataset.open);
      if (!e) return;
      out.className = "pg-out card";
      out.innerHTML = renderResult(index, e);
      wireResult(out);
    }));
    $("#log-compare").disabled = selected.size !== 2;
  }
  $("#log-clear").onclick = () => { saveLog([]); selected.clear(); renderLog(); };
  $("#log-compare").onclick = () => {
    const log = loadLog();
    const [x, y] = [...selected].map((id) => log.find((e) => e.id === id));
    if (!x || !y) return;
    $("#cmp-body").innerHTML = renderCompare(index, x, y);
    wireResult($("#cmp-body"));
    $("#cmp-dialog").showModal();
  };
  renderLog();

  return {
    setA(id) { $("#pg-a-sel").value = id; $("#pg-a-txt").value = ""; },
  };
}

function enforceRule(index, r) {
  // Hard rule: free-text pairs can't be Documented, whatever the API returns.
  if (r.verdict === "Documented") r.verdict = "Plausible";
  if (!index.edgeById.has(r.analog?.edge_id)) r.analog = { edge_id: index.edges[0].id, reason: "(The model's analog wasn't a valid dataset id.)" };
  return r;
}

function loadLog() {
  try { return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
}
function saveLog(log) {
  try { sessionStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* storage unavailable */ }
}

const STATUS_ICON = { yes: "●", partial: "◐", no: "○", unknown: "?" };
const SOURCE_LABEL = { dataset: "Curated dataset", offline: "Offline heuristic engine", claude: "Claude analysis" };

function renderResult(index, entry) {
  const r = entry.result;
  const analog = index.edgeById.get(r.analog.edge_id);
  const an = analog ? `${index.byId.get(analog.source).name} ↔ ${index.byId.get(analog.target).name}` : r.analog.edge_id;
  const req = (k, label) => {
    const x = r.requirements[k];
    return `<div class="req s-${x.status}"><span class="req-icon">${STATUS_ICON[x.status]}</span><div><b>${label}</b> <span class="muted small">${x.status}</span><p>${esc(x.note)}</p></div></div>`;
  };
  return `
    <div class="result">
      <div class="row between wrap">
        <div><div class="eyebrow">Compatibility analysis</div><h2>${esc(entry.a)} <span class="arrow">×</span> ${esc(entry.b)}</h2></div>
        <span class="chip src">${esc(SOURCE_LABEL[r.source] || r.source)}${r.model ? ` · ${esc(r.model)}` : ""}</span>
      </div>
      ${r.error ? `<p class="flag">${esc(r.error)}</p>` : ""}
      <div class="verdict-row">
        <div class="verdict v-${r.verdict.toLowerCase()}"><span class="k">1 · Verdict</span><span class="v">${esc(r.verdict)}</span></div>
        <div class="confidence"><span class="k">2 · Confidence</span><span class="v c-${r.confidence.toLowerCase()}">${esc(r.confidence)}</span><p>${esc(r.confidence_why)}</p></div>
      </div>
      ${r.type ? `<p>${typeChip(index, r.type)}</p>` : ""}
      ${r.literature_status === "believed_documented" ? `<p class="flag">The model believes this may be documented in the literature: ${esc(r.literature_note)} It isn't in the curated dataset, so the verdict stays below Documented. Verify before trusting.</p>` : ""}
      <section><h3>3 · Mechanism hypothesis${r.verdict === "Documented" ? "" : " <span class='tag-spec'>speculative</span>"}</h3>
        <p>${esc(r.mechanism.summary)}</p>
        <dl class="kv"><dt>${esc(entry.a)} gives</dt><dd>${esc(r.mechanism.a_gives)}</dd><dt>${esc(entry.b)} gives</dt><dd>${esc(r.mechanism.b_gives)}</dd></dl>
        ${r.mechanism.channels?.length ? `<div class="chips">${r.mechanism.channels.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
      </section>
      <section><h3>4 · Requirement check</h3>
        <div class="reqs">${req("habitat", "Shared habitat")}${req("scale", "Size / scale")}${req("biochemistry", "Biochemistry")}${req("coevolution", "Co-evolution timescale")}</div>
      </section>
      <section><h3>5 · Closest real analog</h3>
        <p>This resembles <button class="linkish" data-edge="${esc(r.analog.edge_id)}">${esc(an)}</button>. <span class="muted">${esc(r.analog.reason)}</span></p>
      </section>
      <section><h3>6 · What would falsify it</h3><p class="falsify">${esc(r.falsify)}</p></section>
      ${r.citations ? `<section><h3>Evidence</h3><ul class="cites">${r.citations.map((c) => `<li class="${c.startsWith("citation needed") ? "needed" : ""}">${esc(c)}</li>`).join("")}</ul></section>` : ""}
    </div>`;
}

function renderCompare(index, x, y) {
  const rows = [
    ["Verdict", (r) => r.verdict],
    ["Confidence", (r) => r.confidence],
    ["Source", (r) => SOURCE_LABEL[r.source] || r.source],
    ["Habitat", (r) => r.requirements.habitat.status],
    ["Scale", (r) => r.requirements.scale.status],
    ["Biochemistry", (r) => r.requirements.biochemistry.status],
    ["Co-evolution", (r) => r.requirements.coevolution.status],
    ["Channels", (r) => (r.mechanism.channels || []).join(", ") || "—"],
    ["Analog", (r) => { const e = index.edgeById.get(r.analog.edge_id); return e ? `${index.byId.get(e.source).name} ↔ ${index.byId.get(e.target).name}` : r.analog.edge_id; }],
    ["Falsifier", (r) => r.falsify],
  ];
  return `
    <h2>Compare runs</h2>
    <table class="cmp-table">
      <thead><tr><th></th><th>${esc(x.a)} × ${esc(x.b)}</th><th>${esc(y.a)} × ${esc(y.b)}</th></tr></thead>
      <tbody>${rows.map(([label, f]) => {
        const a = f(x.result), b = f(y.result);
        return `<tr class="${a === b ? "" : "diff"}"><th>${label}</th><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
      }).join("")}</tbody>
    </table>
    <p class="muted small">Highlighted rows differ.</p>`;
}

export { groupDot };
