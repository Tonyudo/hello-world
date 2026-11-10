/* MMM-DailyTLDR: a once-a-day, AI-written news briefing for the family screen. */
Module.register("MMM-DailyTLDR", {
	defaults: {
		title: "תקציר בוקר",
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
			this.updateDom(0);
		}
	},

	getDom () {
		const root = document.createElement("div");
		root.className = "tldr";
		root.dir = "rtl";

		const head = document.createElement("div");
		head.className = "card-head";
		const h = document.createElement("h2");
		h.className = "card-title";
		h.textContent = this.config.title;
		head.appendChild(h);
		const b = this.briefing;
		if (b && b.generatedAt) {
			const t = new Date(b.generatedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
			const meta = document.createElement("span");
			meta.className = "card-meta";
			meta.textContent = `${this.config.updatedLabel} ${t}${b.mode === "ai" ? "" : " · כותרות"}`;
			head.appendChild(meta);
		}
		root.appendChild(head);

		if (!b || !b.bullets?.length) {
			const empty = document.createElement("div");
			empty.className = "card-empty";
			empty.textContent = this.config.emptyText;
			root.appendChild(empty);
			return root;
		}

		const list = document.createElement("ul");
		list.className = "tldr-list";
		for (const item of b.bullets) {
			const li = document.createElement("li");
			const text = document.createElement("span");
			text.className = "tldr-text";
			text.textContent = item.text;
			li.appendChild(text);
			if (this.config.showSources && item.source) {
				const src = document.createElement("span");
				src.className = "tldr-source";
				src.textContent = item.source;
				li.appendChild(src);
			}
			list.appendChild(li);
		}
		root.appendChild(list);
		return root;
	}
});
