/* MMM-Chores node helper: reads tasks from Todoist (Sync API v1) every few minutes. */
"use strict";

const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
	start () {
		this.timer = null;
		this.last = null;
	},

	stop () {
		clearInterval(this.timer);
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "CHORES_START") return;
		this.config = payload;
		if (this.last) this.sendSocketNotification("CHORES_DATA", this.last);
		if (!this.timer) {
			this.timer = setInterval(() => this.load(), payload.updateInterval);
			this.load();
		}
	},

	token () {
		const t = String(this.config.accessToken || "").trim();
		return (/^\$\{|^\*\*|^REPLACE$/).test(t) ? "" : t;
	},

	async load () {
		if (!this.token()) {
			this.sendSocketNotification("CHORES_ERROR", { message: "חסר טוקן של Todoist ב-config.env" });
			return;
		}
		try {
			const body = new URLSearchParams({ sync_token: "*", resource_types: "[\"items\"]" });
			const res = await fetch(`${this.config.apiBase}/sync`, {
				method: "POST",
				headers: { Authorization: `Bearer ${this.token()}`, "Content-Type": "application/x-www-form-urlencoded" },
				body,
				signal: AbortSignal.timeout(20000)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			this.last = { items: json.items || [] };
			this.sendSocketNotification("CHORES_DATA", this.last);
		} catch (e) {
			Log.warn(`[MMM-Chores] Todoist fetch failed: ${e.message}`);
			if (!this.last) this.sendSocketNotification("CHORES_ERROR", { message: "לא ניתן לטעון משימות" });
		}
	}
});
