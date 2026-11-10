/* MMM-ClockWeather: the clock + weather card (mode "full") or a forecast-only card (mode "forecast"). */
Module.register("MMM-ClockWeather", {
	defaults: {
		mode: "full", // "full" | "forecast"
		lat: 31.8928,
		lon: 34.8113,
		place: "רחובות",
		forecastDays: 4,
		forecastTitle: "תחזית"
	},

	getScripts () {
		return [this.file("lib/weather.js")];
	},

	getStyles () {
		return ["MMM-ClockWeather.css"];
	},

	start () {
		this.weather = null;
		this.key = `${this.config.lat},${this.config.lon}`;
		this.sendSocketNotification("CW_START", this.config);
		if (this.config.mode === "full") {
			this.lastMinute = -1;
			setInterval(() => {
				const m = new Date().getMinutes();
				if (m !== this.lastMinute) {
					this.lastMinute = m;
					this.updateDom(0);
				}
			}, 1000);
		}
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "CW_DATA" && payload.key === this.key) {
			this.weather = payload.data;
			this.updateDom(0);
		}
	},

	daysHtml (w) {
		const lib = window.ClockWeatherLib;
		return `<div class="cw-days">${w.days.map((d) => `
			<div class="cw-day">
				<span class="cw-dow">${d.dow}</span>
				${lib.iconSvg(d.icon, 32)}
				<span class="cw-range"><b>${d.max}°</b> ${d.min}°</span>
			</div>`).join("")}</div>`;
	},

	getDom () {
		const lib = window.ClockWeatherLib;
		const root = document.createElement("div");
		root.dir = "rtl";
		const w = this.weather;

		if (this.config.mode === "forecast") {
			root.className = "cw cw-forecast";
			root.innerHTML = `<div class="card-head"><h2 class="card-title">${this.config.forecastTitle} · ${this.config.place}</h2></div>`
				+ (w ? this.daysHtml(w) : "<div class=\"card-empty\">טוען תחזית…</div>");
			return root;
		}

		const now = new Date();
		const time = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
		const date = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
		root.className = "cw cw-full";
		root.innerHTML = `
			<div class="cw-top">
				<div class="cw-clock">
					<div class="cw-time">${time}</div>
					<div class="cw-date">${date}</div>
				</div>
				${w ? `<div class="cw-now">${lib.iconSvg(w.icon, 76)}<div class="cw-now-text"><div class="cw-temp">${w.temp}°</div><div class="cw-hilo">↑${w.todayMax}° ↓${w.todayMin}°</div></div></div>` : ""}
			</div>
			${w ? `<div class="cw-strip"><span>${this.config.place} · ${w.label}</span><span class="cw-strip-range">↑ ${w.todayMax}° &#160; ↓ ${w.todayMin}°</span></div>${this.daysHtml(w)}` : ""}`;
		return root;
	}
});
