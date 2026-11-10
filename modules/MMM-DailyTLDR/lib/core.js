/* Pure helpers for MMM-DailyTLDR: RSS parsing, scheduling, prompt building.
 * No MagicMirror or network dependencies, so they can be unit-tested with `node --test`.
 */
"use strict";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function decodeEntities (s) {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
		.replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Text of the first <tag>…</tag> inside xml, CDATA unwrapped, entities decoded, HTML stripped. */
function tagText (xml, tag) {
	const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
	if (!m) return "";
	let s = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
	s = decodeEntities(s);
	// Descriptions often contain HTML (images, links). Strip it, then decode once more
	// for feeds that double-encode.
	s = s.replace(/<[^>]+>/g, " ");
	s = decodeEntities(s);
	return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse RSS 2.0 or Atom into [{title, description, link, date}].
 * Deliberately forgiving: Israeli news feeds are not always well-formed XML.
 */
function parseFeed (xml) {
	const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
	return blocks.map((b) => {
		const dateStr = tagText(b, "pubDate") || tagText(b, "published") || tagText(b, "updated") || tagText(b, "dc:date");
		const d = dateStr ? new Date(dateStr) : null;
		let link = tagText(b, "link");
		if (!link) {
			const href = b.match(/<link[^>]*href="([^"]+)"/i);
			link = href ? decodeEntities(href[1]) : "";
		}
		return {
			title: tagText(b, "title"),
			description: tagText(b, "description") || tagText(b, "summary"),
			link,
			date: d && !isNaN(d) ? d : null
		};
	}).filter((i) => i.title);
}

/** Charset from a Content-Type header or the XML declaration; defaults to utf-8. */
function detectCharset (contentType, headBytes) {
	const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType || "");
	if (fromHeader) return fromHeader[1].toLowerCase();
	const head = Buffer.from(headBytes).toString("latin1");
	const fromDecl = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head);
	return fromDecl ? fromDecl[1].toLowerCase() : "utf-8";
}

function decodeBody (buf, contentType) {
	const charset = detectCharset(contentType, buf.subarray(0, 200));
	try {
		return new TextDecoder(charset).decode(buf);
	} catch {
		return new TextDecoder("utf-8").decode(buf);
	}
}

/** Keep recent items (undated items are kept) and cap per feed. */
function selectItems (items, { now = new Date(), maxAgeHours = 24, maxItems = 15 } = {}) {
	const cutoff = now.getTime() - maxAgeHours * 3600 * 1000;
	return items.filter((i) => !i.date || i.date.getTime() >= cutoff).slice(0, maxItems);
}

/** YYYY-MM-DD in local time. */
function localDate (d = new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minutesOfDay (hhmm) {
	const [h, m] = String(hhmm).split(":").map(Number);
	return h * 60 + (m || 0);
}

/**
 * Decide whether to (re)generate the briefing.
 * - No cache at all: generate now (even before refreshTime, so the screen is never empty).
 * - Cache from an earlier day: generate once the clock passes refreshTime.
 * - Today's cache fell back to headlines (AI failed or no key yet): retry hourly if AI is enabled.
 */
function shouldRefresh (cache, { now = new Date(), refreshTime = "06:00", aiEnabled = false, retryMinutes = 60 } = {}) {
	if (!cache || !cache.date) return true;
	const pastRefresh = now.getHours() * 60 + now.getMinutes() >= minutesOfDay(refreshTime);
	if (cache.date !== localDate(now)) return pastRefresh;
	if (cache.mode !== "ai" && aiEnabled) {
		const last = cache.attemptedAt ? new Date(cache.attemptedAt).getTime() : 0;
		return now.getTime() - last >= retryMinutes * 60 * 1000;
	}
	return false;
}

/** Fallback when there's no API key or the AI call fails: top headline(s) from each feed, round-robin. */
function headlineBullets (feeds, count) {
	const out = [];
	for (let i = 0; out.length < count; i++) {
		let added = false;
		for (const f of feeds) {
			if (f.items[i] && out.length < count) {
				out.push({ text: f.items[i].title, source: f.name });
				added = true;
			}
		}
		if (!added) break;
	}
	return out;
}

const BULLET_SCHEMA = {
	type: "object",
	properties: {
		bullets: {
			type: "array",
			items: {
				type: "object",
				properties: {
					text: { type: "string" },
					source: { type: "string" }
				},
				required: ["text", "source"],
				additionalProperties: false
			}
		}
	},
	required: ["bullets"],
	additionalProperties: false
};

function buildSystemPrompt ({ bullets, language }) {
	return [
		`You write the morning news briefing shown on a family's kitchen wall display in Israel.`,
		`Write exactly ${bullets} bullets in ${language}. Each bullet is one plain sentence of at most 18 words that a person can read from across the room.`,
		`Pick the ${bullets} most important distinct stories across all sources; merge duplicates reported by several outlets into one bullet.`,
		`Stay neutral and factual. Children may read the screen, so leave out graphic detail about violence or injuries while still reporting the event.`,
		`For each bullet, set "source" to the name of the outlet it came from (if several, the first one listed).`,
		`Use only the headlines provided; do not add facts that are not in them.`
	].join("\n");
}

function buildUserPrompt (feeds) {
	const parts = feeds.map((f) => {
		const lines = f.items.map((i) => {
			const desc = i.description ? ` — ${i.description.slice(0, 280)}` : "";
			return `- ${i.title}${desc}`;
		});
		return `<source name="${f.name}">\n${lines.join("\n")}\n</source>`;
	});
	return `Today's headlines:\n\n${parts.join("\n\n")}`;
}

module.exports = {
	decodeEntities,
	tagText,
	parseFeed,
	detectCharset,
	decodeBody,
	selectItems,
	localDate,
	shouldRefresh,
	headlineBullets,
	BULLET_SCHEMA,
	buildSystemPrompt,
	buildUserPrompt
};
