"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../lib/chores");
const demo = require("../../MMM-Demo/lib/demo-data");

const NOW = new Date(2026, 10, 10, 9, 0);

test("demo data: overdue first, then today, then undated; tomorrow hidden", () => {
	const { shown, total } = lib.select(demo.buildTodoist(NOW).items, NOW);
	assert.deepEqual(shown.map((t) => `${t.state}:${t.title}`), [
		"overdue:להשקות את העציצים",
		"today:להוציא את הזבל",
		"today:לקנות חלב ולחם",
		"none:לתקן את הברז באמבטיה"
	]);
	assert.equal(total, 4);
	assert.equal(shown[0].recurring, true);
});

test("skips done, deleted and sub-tasks; filters by project; caps the list", () => {
	const items = [
		{ id: 1, content: "a", checked: true, due: null },
		{ id: 2, content: "b", is_deleted: true, due: null },
		{ id: 3, content: "c", parent_id: 9, due: null },
		{ id: 4, content: "d", project_id: "home", due: null, child_order: 2 },
		{ id: 5, content: "e", project_id: "work", due: null },
		{ id: 6, content: "f", project_id: "home", due: { date: "2026-11-10T18:00:00" }, child_order: 1 }
	];
	const r = lib.select(items, NOW, { projects: ["home"] });
	assert.deepEqual(r.shown.map((t) => t.title), ["f", "d"]);
	assert.equal(lib.select(items, NOW, { max: 1 }).shown.length, 1);
	assert.equal(lib.select(items, NOW, { max: 1 }).total, 3);
});
