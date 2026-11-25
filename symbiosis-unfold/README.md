# Symbiosis Unfold

A research and experiment tool for how life cooperates, competes and depends on itself.

- **Connection Map**: a force-directed graph of 95 organisms and 68 citation-backed relationships in 8 groups, with 11 multi-party chains.
- **Playground**: a compatibility analysis for any two organisms, with an experiment log and a side-by-side comparison of two runs.
- **Discovery**: a random surprising connection, a shortest dependency-chain finder, and a "what breaks if X disappears?" cascade.

## Run

```bash
cd symbiosis-unfold
npm install
npm start                      # http://localhost:8787
```

Claude analysis for free-text pairs is optional:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
# or, after `ant auth login`:
SYMBIOSIS_TRY_PROFILE=1 npm start
```

The key stays on the server (`server.js` proxies `/api/analyze`). Without a key the app still runs, and free-text pairs get an offline "can't check" result. `SYMBIOSIS_MODEL` overrides the model (default `claude-opus-5-5`).

## Layout

```
data/symbiosis.json     ← the dataset (single source of truth)
server.js               ← static server + Claude proxy (structured JSON output)
public/js/data.js       ← indexes, betweenness, path finder, cascade
public/js/map.js        ← D3 force graph
public/js/panel.js      ← side-panel renderers
public/js/playground.js ← analysis engine, log, compare
scripts/check-data.js   ← dataset validator
```

## Growing the dataset

Edit `data/symbiosis.json`, then run `npm run check-data`. No code changes are needed.

Edge schema:

| Field | Meaning |
|---|---|
| `id`, `source`, `target` | Node ids. For parasitism, `source` is the parasite and `target` the host. |
| `type` | `mutualism` · `commensalism` · `parasitism` · `context` (shifts with context) |
| `obligate` | Free-text summary shown in the panel |
| `dependence.{source,target}` | `obligate` · `facultative` · `none`: how much that side depends on *this particular partner*. Drives the cascade and path finder. |
| `tldr` | At most 2 sentences (the validator enforces this) |
| `gives` / `gets` | `{source, target}`: what each side provides and receives |
| `impact` | `{ecological, human}` |
| `citations[]` | `{author, year, venue}`, or `{needed: true, note}`. Never invent one. |
| `confidence` | `high` · `medium` · `low`, plus an optional `confidence_note` and `contested` |

Chains are `{id, name, summary, nodes[], edges[]}` and need at least 3 organisms.

## Evidence rules in the Playground

| Pair | Engine | Possible verdicts |
|---|---|---|
| Both in the dataset with a direct edge | Local | **Documented**, with the edge's confidence |
| Both in the dataset, no edge | Local heuristic (habitat tags, scale, group precedent, graph distance) | Plausible / Speculative / Unlikely; never High confidence |
| Any free-text organism | Claude, with a JSON schema that leaves out "Documented" | Plausible / Speculative / Unlikely. If the model thinks the literature documents the pair, it's shown as a separate flag to verify. |

The "Documented" cap on free-text pairs is enforced in three places: the output schema, the server, and the client.
