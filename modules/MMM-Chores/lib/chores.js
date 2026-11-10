/* Picks the household chores to show from a Todoist Sync API v1 response. */
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.ChoresLib = factory();
}(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	const pad = (n) => String(n).padStart(2, "0");
	const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const RANK = { overdue: 0, today: 1, none: 2 };

	/**
	 * Open tasks that are overdue, due today, or have no date — not future ones.
	 * Order: overdue, today, undated; within each, Todoist's own order.
	 * @param {object[]} items  Sync API "items"
	 * @param {Date} now
	 * @param {{projects?: string[], max?: number}} opts  projects: only these project ids (empty = all)
	 * @returns {{shown: object[], total: number}}
	 */
	function select (items, now = new Date(), { projects = [], max = 8 } = {}) {
		const today = isoDay(now);
		const list = (items || [])
			.filter((i) => !i.checked && !i.is_deleted && !i.parent_id)
			.filter((i) => projects.length === 0 || projects.map(String).includes(String(i.project_id)))
			.map((i) => {
				const due = i.due && i.due.date ? i.due.date.slice(0, 10) : null;
				const state = !due ? "none" : due < today ? "overdue" : due === today ? "today" : "future";
				return { id: i.id, title: String(i.content || "").trim(), state, recurring: Boolean(i.due && i.due.is_recurring), order: i.child_order || 0 };
			})
			.filter((i) => i.title && i.state !== "future")
			.sort((a, b) => (RANK[a.state] - RANK[b.state]) || (a.order - b.order));
		return { shown: list.slice(0, max), total: list.length };
	}

	return { select, isoDay };
}));
