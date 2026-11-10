#!/usr/bin/env node
/* Verify the news feeds in your config work, without starting MagicMirror.
 * Usage (from the MagicMirror folder):  node modules/MMM-DailyTLDR/check-feeds.js
 * Or pass URLs directly:                node modules/MMM-DailyTLDR/check-feeds.js https://... https://...
 */
"use strict";

const path = require("node:path");
const core = require("./lib/core");

function feedsFromConfig () {
	const cfgPath = path.resolve(__dirname, "../../config/config.js");
	// config.js may reference ${VARS}; we only need the feed list, so load it as plain JS.
	const cfg = require(cfgPath);
	const mod = (cfg.modules || []).find((m) => m.module === "MMM-DailyTLDR");
	return mod?.config?.feeds || [];
}

(async () => {
	const args = process.argv.slice(2);
	const feeds = args.length ? args.map((url) => ({ name: url, url })) : feedsFromConfig();
	if (!feeds.length) {
		console.error("No feeds found. Pass URLs as arguments or add them to config/config.js.");
		process.exit(1);
	}
	let failed = 0;
	for (const f of feeds) {
		try {
			const res = await fetch(f.url, {
				headers: { "User-Agent": "Mozilla/5.0 (MagicMirror MMM-DailyTLDR)" },
				signal: AbortSignal.timeout(20000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const xml = core.decodeBody(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type"));
			const all = core.parseFeed(xml);
			const recent = core.selectItems(all, { maxItems: 100 });
			if (!all.length) throw new Error("no <item> or <entry> found (not an RSS/Atom feed?)");
			console.log(`✔ ${f.name}: ${all.length} items, ${recent.length} from the last 24h`);
			for (const i of recent.slice(0, 3)) console.log(`    · ${i.title}`);
		} catch (e) {
			failed++;
			console.log(`✘ ${f.name}: ${e.message}\n    ${f.url}`);
		}
	}
	process.exit(failed ? 1 : 0);
})();
