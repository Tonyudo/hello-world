"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const demo = require("../lib/demo-data");

const NOW = new Date(2026, 10, 10, 9, 0); // Tue 10 Nov 2026

test("calendars contain events in the current week", () => {
	for (const name of ["family", "person1", "person2"]) {
		const ics = demo.buildCalendar(name, NOW);
		assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
		assert.match(ics, /END:VCALENDAR\r\n$/);
		const starts = [...ics.matchAll(/DTSTART(?:;VALUE=DATE)?:(\d{8})/g)].map((m) => m[1]);
		assert.ok(starts.some((d) => d >= "20261108" && d <= "20261114"), `${name} has events this week`);
		assert.equal(ics.split("BEGIN:VEVENT").length - 1, ics.split("END:VEVENT").length - 1);
	}
});

test("timed and all-day events are encoded correctly", () => {
	const ics = demo.buildCalendar("family", NOW);
	assert.match(ics, /DTSTART:20261110T180000\r\nDTEND:20261110T193000/); // parents' meeting, Tue 18:00–19:30
	assert.match(ics, /DTSTART;VALUE=DATE:20261121\r\nDTEND;VALUE=DATE:20261122/); // trip, next Saturday
});

test("unknown calendar returns null", () => {
	assert.equal(demo.buildCalendar("nope", NOW), null);
});

test("todoist response has the shape MMM-Chores reads", () => {
	const r = demo.buildTodoist(NOW);
	assert.ok(Array.isArray(r.items) && r.items.length === 5);
	assert.equal(r.items[0].due.date, "2026-11-10");
	assert.equal(r.items[2].due.date, "2026-11-09"); // overdue
	assert.equal(r.items[3].due, null); // no date
	for (const i of r.items) {
		for (const k of ["id", "content", "project_id", "child_order", "priority", "labels", "parent_id"]) assert.ok(k in i, k);
	}
	assert.equal(r.projects[0].id, r.items[0].project_id);
});
