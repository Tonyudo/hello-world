"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../lib/week");

const NOW = new Date(2026, 10, 10, 9, 0); // Tue 10 Nov 2026
const ev = (title, start, end, calendarName, fullDayEvent = false) => ({
	title, calendarName, fullDayEvent, startDate: String(start.getTime()), endDate: String(end.getTime())
});
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m);

const RAW = [
	ev("אסיפת הורים", at(10, 18), at(10, 19, 30), "family"),
	ev("חדר כושר", at(8, 7), at(8, 8), "person1"),
	ev("תכנון שבועי", at(8, 20, 30), at(8, 21), "family"),
	ev("טיול משפחתי", at(21, 0), at(22, 0), "family", true),
	ev("יום הולדת לנועה", at(17, 0), at(18, 0), "person2", true),
	ev("ארוחת צהריים עם דני", at(16, 13), at(16, 14), "person1"),
	ev("כנס", at(11, 0), at(14, 0), "person2", true) // multi-day all-day: Wed–Fri
];

test("normalize sorts and parses the calendar module payload", () => {
	const e = lib.normalize(RAW);
	assert.equal(e[0].title, "חדר כושר");
	assert.equal(e[0].calendar, "person1");
	assert.ok(e[0].start instanceof Date);
});

test("buildWeek: Sunday–Saturday, today flagged, Hebrew range", () => {
	const w = lib.buildWeek(lib.normalize(RAW), NOW);
	assert.equal(w.range, "8–14 בנובמבר");
	assert.deepEqual(w.days.map((d) => d.dayNum), [8, 9, 10, 11, 12, 13, 14]);
	assert.equal(w.days[2].isToday, true);
	assert.equal(w.days[2].dow, "שלישי");
	assert.deepEqual(w.days.map((d) => d.isWeekend), [false, false, false, false, false, true, true]);
	assert.equal(w.days[0].isPast, true);
	assert.deepEqual(w.days[0].events.map((e) => `${e.time} ${e.title}`), ["07:00 חדר כושר", "20:30 תכנון שבועי"]);
});

test("multi-day all-day events appear on each day they cover, and not after", () => {
	const w = lib.buildWeek(lib.normalize(RAW), NOW);
	const has = (i) => w.days[i].events.some((e) => e.title === "כנס");
	assert.deepEqual([3, 4, 5, 6].map(has), [true, true, true, false]);
	assert.equal(w.days[3].events[0].time, "");
});

test("nextWeek gives the first events of next week with short day labels", () => {
	const n = lib.nextWeek(lib.normalize(RAW), NOW);
	assert.deepEqual(n.map((e) => `${e.label} · ${e.title}`), ["ב׳ 16 · ארוחת צהריים עם דני", "ג׳ 17 · יום הולדת לנועה", "ש׳ 21 · טיול משפחתי"]);
});

test("nextWeek skips routine events that also happen this week", () => {
	const raw = [...RAW, ev("חדר כושר", at(15, 7), at(15, 8), "person1"), ev("חדר כושר", at(18, 7), at(18, 8), "person1")];
	const n = lib.nextWeek(lib.normalize(raw), NOW);
	assert.ok(!n.some((e) => e.title === "חדר כושר"));
	assert.equal(n.length, 3);
});

test("today lists today's events with an end time", () => {
	const t = lib.today(lib.normalize(RAW), NOW);
	assert.equal(t.length, 1);
	assert.equal(t[0].time, "18:00");
	assert.equal(t[0].until, "עד 19:30");
});

test("week crossing months uses both month names", () => {
	assert.equal(lib.rangeLabel(new Date(2026, 10, 29), new Date(2026, 11, 5)), "29 בנובמבר – 5 בדצמבר");
});

test("an event spanning midnight shows on both days", () => {
	const late = lib.normalize([ev("מסיבה", at(12, 22), at(13, 2), "family")]);
	const w = lib.buildWeek(late, NOW);
	assert.equal(w.days[4].events[0].time, "22:00");
	assert.equal(w.days[5].events[0].time, "עד 02:00");
});
