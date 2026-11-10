/* MMM-Chores: today's household tasks from Todoist — overdue, due today and undated. */
Module.register("MMM-Chores", {
	defaults: {
		title: "משימות היום",
		accessToken: "", // "${SECRET_TODOIST_TOKEN}" from config.env
		apiBase: "https://api.todoist.com/api/v1",
		projects: [], // Todoist project ids to include; empty = all
		max: 8,
		updateInterval: 5 * 60 * 1000
	},

	getScripts () {
		return [this.file("lib/chores.js")];
	},

	getStyles () {
		return ["MMM-Chores.css"];
	},

	start () {
		this.items = null;
		this.error = null;
		this.sendSocketNotification("CHORES_START", this.config);
		setInterval(() => this.updateDom(0), 10 * 60 * 1000); // re-evaluate "today" / "overdue"
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "CHORES_DATA") {
			this.items = payload.items;
			this.error = null;
			this.updateDom(0);
		} else if (notification === "CHORES_ERROR") {
			this.error = payload.message;
			this.updateDom(0);
		}
	},

	esc (s) {
		return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
	},

	getDom () {
		const root = document.createElement("div");
		root.className = "ch";
		root.dir = "rtl";
		const repeatIcon = "<svg class=\"ch-repeat\" width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-label=\"משימה חוזרת\"><path d=\"M17 2l4 4-4 4\"/><path d=\"M3 11V9a3 3 0 0 1 3-3h15\"/><path d=\"M7 22l-4-4 4-4\"/><path d=\"M21 13v2a3 3 0 0 1-3 3H3\"/></svg>";

		let body;
		let count = "";
		if (this.items) {
			const { shown, total } = window.ChoresLib.select(this.items, new Date(), this.config);
			count = total ? `<span class="ch-count">${total}</span>` : "";
			body = shown.length
				? shown.map((t) => `
					<div class="ch-row ch-${t.state}">
						<span class="ch-box" aria-hidden="true"></span>
						<span class="ch-title">${this.esc(t.title)}</span>
						${t.state === "overdue" ? "<span class=\"ch-tag ch-tag-overdue\">באיחור</span>" : ""}
						${t.state === "none" ? "<span class=\"ch-tag\">ללא תאריך</span>" : ""}
						${t.recurring ? repeatIcon : ""}
					</div>`).join("")
				: "<div class=\"card-empty\">אין משימות להיום</div>";
		} else {
			body = `<div class="card-empty">${this.error ? this.esc(this.error) : "טוען…"}</div>`;
		}
		root.innerHTML = `<div class="card-head"><h2 class="card-title">${this.esc(this.config.title)}</h2>${count}</div>${body}`;
		return root;
	}
});
