/* MMM-DailyTLDR: a once-a-day, AI-written news briefing for the family screen. */
Module.register("MMM-DailyTLDR", {
	defaults: {
		feeds: [], // [{ name: "Ynet", url: "https://..." }]
		bullets: 5,
		language: "Hebrew",
		refreshTime: "06:00", // local time to build the new day's briefing
		maxAgeHours: 24,
		maxItemsPerFeed: 15,
		apiKey: "", // use "${SECRET_ANTHROPIC_API_KEY}" from config/config.env
		model: "claude-opus-5-5",
		effort: "low",
		showSources: true,
		showUpdated: true,
		updatedLabel: "עודכן",
		emptyText: "התקציר יופיע כאן אחרי העדכון הראשון"
	},

	getStyles () {
		return ["MMM-DailyTLDR.css"];
	},

	start () {
		this.briefing = null;
		this.sendSocketNotification("TLDR_START", this.config);
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "TLDR_DATA") {
			this.briefing = payload;
			this.updateDom(1000);
		}
	},

	getDom () {
		const root = document.createElement("div");
		root.className = "tldr";
		root.dir = "rtl";

		if (!this.briefing || !this.briefing.bullets?.length) {
			root.innerHTML = `<div class="tldr-empty dimmed">${this.config.emptyText}</div>`;
			return root;
		}

		const list = document.createElement("ul");
		list.className = "tldr-list";
		for (const b of this.briefing.bullets) {
			const li = document.createElement("li");
			const text = document.createElement("span");
			text.className = "tldr-text";
			text.textContent = b.text;
			li.appendChild(text);
			if (this.config.showSources && b.source) {
				const src = document.createElement("span");
				src.className = "tldr-source";
				src.textContent = b.source;
				li.appendChild(src);
			}
			list.appendChild(li);
		}
		root.appendChild(list);

		if (this.config.showUpdated && this.briefing.generatedAt) {
			const t = new Date(this.briefing.generatedAt);
			const foot = document.createElement("div");
			foot.className = "tldr-foot dimmed";
			const time = t.toLocaleTimeString(config.locale || undefined, { hour: "2-digit", minute: "2-digit" });
			foot.textContent = `${this.config.updatedLabel} ${time}${this.briefing.mode === "ai" ? "" : " · כותרות"}`;
			root.appendChild(foot);
		}
		return root;
	}
});
