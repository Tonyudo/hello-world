/* MMM-WeekCalendar: Material-style week view for the TV, a day-by-day list on phones,
 * and (mode "today") a card with today's events. Data comes from MagicMirror's own
 * calendar module via the CALENDAR_EVENTS notification, so that module can stay hidden.
 */
Module.register("MMM-WeekCalendar", {
	defaults: {
		mode: "week", // "week" | "today"
		title: "השבוע",
		firstDay: 0, // Sunday
		weekend: [5, 6], // Friday, Saturday
		maxPerDay: 6, // TV: more than this shows "+N נוספים"
		nextWeekCount: 3,
		// name (as in the calendar module) → { label, bg, fg, swatch }
		calendars: {}
	},

	getScripts () {
		return [this.file("lib/week.js")];
	},

	getStyles () {
		return ["MMM-WeekCalendar.css"];
	},

	start () {
		this.events = [];
		this.received = false;
		// Re-render every 5 minutes so "today" moves at midnight.
		setInterval(() => this.updateDom(0), 5 * 60 * 1000);
	},

	notificationReceived (notification, payload) {
		if (notification === "CALENDAR_EVENTS") {
			this.events = window.WeekCalendarLib.normalize(payload);
			this.received = true;
			this.updateDom(0);
		}
	},

	esc (s) {
		return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
	},

	colorStyle (calendar) {
		const c = this.config.calendars[calendar];
		return c ? `--ev-bg:${c.bg};--ev-fg:${c.fg}` : "";
	},

	chip (e, extraClass = "") {
		const time = e.time ? `<span class="wc-time">${this.esc(e.time)}</span>` : "";
		return `<div class="wc-ev ${extraClass}" style="${this.colorStyle(e.calendar)}">${time}<span class="wc-title">${this.esc(e.title)}</span></div>`;
	},

	legend () {
		return Object.values(this.config.calendars)
			.filter((c) => c.label)
			.map((c) => `<span class="wc-legend-item"><span class="wc-swatch" style="background:${c.swatch}"></span>${this.esc(c.label)}</span>`)
			.join("");
	},

	getDom () {
		const lib = window.WeekCalendarLib;
		const root = document.createElement("div");
		root.dir = "rtl";
		const now = new Date();

		if (this.config.mode === "today") {
			root.className = "wc wc-today-card";
			const items = lib.today(this.events, now);
			root.innerHTML = `<div class="card-head"><h2 class="card-title">${this.esc(this.config.title)}</h2></div>`
				+ (items.length
					? items.map((e) => {
						const label = (this.config.calendars[e.calendar] || {}).label;
						const meta = [label, e.until].filter(Boolean).join(" · ");
						return this.chip(e, "wc-ev-row") + (meta ? `<div class="wc-meta">${this.esc(meta)}</div>` : "");
					}).join("")
					: `<div class="card-empty">${this.received ? "אין אירועים היום" : "טוען…"}</div>`);
			return root;
		}

		const week = lib.buildWeek(this.events, now, this.config);
		const max = this.config.maxPerDay;

		// TV: 7-column grid
		const grid = week.days.map((d) => {
			const shown = d.events.slice(0, max);
			const more = d.events.length - shown.length;
			const cls = ["wc-day", d.isToday && "is-today", d.isWeekend && "is-weekend", d.isPast && "is-past"].filter(Boolean).join(" ");
			return `<div class="${cls}">
				<div class="wc-dayhead"><span class="wc-dow">${d.dow}${d.isToday ? " · היום" : ""}</span><span class="wc-num">${d.dayNum}</span></div>
				${shown.map((e) => this.chip(e)).join("")}
				${more > 0 ? `<div class="wc-more">+${more} נוספים</div>` : ""}
				${d.events.length === 0 ? "<div class=\"wc-none\">אין אירועים</div>" : ""}
			</div>`;
		}).join("");

		// Phone: list of the remaining days of the week (today has its own card)
		const list = week.days.filter((d) => !d.isPast && !d.isToday).map((d) => `
			<div class="wc-listday">
				<div class="wc-listhead">${d.dow} ${d.dayNum}</div>
				${d.events.length ? d.events.map((e) => this.chip(e, "wc-ev-row")).join("") : "<div class=\"wc-none\">אין אירועים</div>"}
			</div>`).join("");

		const next = lib.nextWeek(this.events, now, { firstDay: this.config.firstDay, max: this.config.nextWeekCount });
		const nextHtml = next.length
			? `<div class="wc-next"><span class="wc-next-label">בשבוע הבא</span>${next.map((e) => `<span class="wc-next-item" style="${this.colorStyle(e.calendar)}">${this.esc(e.label)} · ${this.esc(e.title)}</span>`).join("")}</div>`
			: "";

		root.className = "wc wc-week";
		root.innerHTML = `
			<div class="card-head wc-head">
				<h2 class="card-title wc-heading">${this.esc(this.config.title)} <span class="wc-range">${week.range}</span></h2>
				<div class="wc-legend">${this.legend()}</div>
			</div>
			<div class="wc-grid">${grid}</div>
			<div class="wc-list">${list || "<div class=\"wc-none\">סוף השבוע</div>"}</div>
			${nextHtml}`;
		return root;
	}
});
