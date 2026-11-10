"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../lib/core");

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Ynet</title>
<item>
  <title><![CDATA[הכנסת אישרה את התקציב בקריאה ראשונה]]></title>
  <link>https://example.com/a</link>
  <description><![CDATA[<div><img src="x.jpg"/>הצבעה לילית &amp; סוערת</div>]]></description>
  <pubDate>Tue, 10 Nov 2026 05:00:00 +0200</pubDate>
</item>
<item>
  <title>Old story &#8211; yesterday</title>
  <link>https://example.com/b</link>
  <pubDate>Sun, 08 Nov 2026 05:00:00 +0200</pubDate>
</item>
<item><title>Undated story</title></item>
</channel></rss>`;

const ATOM = `<feed><entry><title>Atom title</title><link href="https://example.com/c"/><updated>2026-11-10T04:00:00Z</updated><summary>Sum</summary></entry></feed>`;

test("parseFeed reads RSS with CDATA, HTML descriptions and entities", () => {
	const items = core.parseFeed(RSS);
	assert.equal(items.length, 3);
	assert.equal(items[0].title, "הכנסת אישרה את התקציב בקריאה ראשונה");
	assert.equal(items[0].description, "הצבעה לילית & סוערת");
	assert.equal(items[0].link, "https://example.com/a");
	assert.equal(items[1].title, "Old story – yesterday");
	assert.equal(items[2].date, null);
});

test("parseFeed reads Atom", () => {
	const [e] = core.parseFeed(ATOM);
	assert.equal(e.title, "Atom title");
	assert.equal(e.link, "https://example.com/c");
	assert.equal(e.description, "Sum");
});

test("selectItems drops items older than maxAgeHours but keeps undated ones", () => {
	const now = new Date("2026-11-10T08:00:00+02:00");
	const titles = core.selectItems(core.parseFeed(RSS), { now }).map((i) => i.title);
	assert.deepEqual(titles, ["הכנסת אישרה את התקציב בקריאה ראשונה", "Undated story"]);
});

test("decodeBody honours windows-1255 (Hebrew legacy encoding)", () => {
	// "שלום" in windows-1255
	const buf = Buffer.from([0xf9, 0xec, 0xe5, 0xed]);
	assert.equal(core.decodeBody(buf, "text/xml; charset=windows-1255"), "שלום");
	const decl = Buffer.concat([Buffer.from("<?xml version=\"1.0\" encoding=\"windows-1255\"?>"), buf]);
	assert.ok(core.decodeBody(decl, "text/xml").endsWith("שלום"));
});

test("shouldRefresh schedule", () => {
	const at = (h, m = 0) => new Date(2026, 10, 10, h, m);
	const today = { date: "2026-11-10", mode: "ai" };
	const yesterday = { date: "2026-11-09", mode: "ai" };

	assert.equal(core.shouldRefresh(null, { now: at(3) }), true, "no cache: build immediately");
	assert.equal(core.shouldRefresh(yesterday, { now: at(5, 59) }), false, "keep yesterday's until 06:00");
	assert.equal(core.shouldRefresh(yesterday, { now: at(6) }), true);
	assert.equal(core.shouldRefresh(today, { now: at(14) }), false, "once a day");

	const fallback = { date: "2026-11-10", mode: "headlines", attemptedAt: at(6).toISOString() };
	assert.equal(core.shouldRefresh(fallback, { now: at(6, 30), aiEnabled: true }), false);
	assert.equal(core.shouldRefresh(fallback, { now: at(7), aiEnabled: true }), true, "retry AI hourly");
	assert.equal(core.shouldRefresh(fallback, { now: at(7), aiEnabled: false }), false, "no key: don't loop");
});

test("headlineBullets round-robins across feeds", () => {
	const feeds = [
		{ name: "A", items: [{ title: "a1" }, { title: "a2" }, { title: "a3" }] },
		{ name: "B", items: [{ title: "b1" }] }
	];
	assert.deepEqual(core.headlineBullets(feeds, 4).map((b) => b.text), ["a1", "b1", "a2", "a3"]);
	assert.equal(core.headlineBullets(feeds, 10).length, 4);
});

test("prompts include every source and the bullet count", () => {
	const feeds = [{ name: "Ynet", items: [{ title: "t1", description: "d1" }] }, { name: "Globes", items: [{ title: "t2" }] }];
	const user = core.buildUserPrompt(feeds);
	assert.match(user, /<source name="Ynet">\n- t1 — d1/);
	assert.match(user, /<source name="Globes">\n- t2/);
	assert.match(core.buildSystemPrompt({ bullets: 5, language: "Hebrew" }), /exactly 5 bullets in Hebrew/);
});
