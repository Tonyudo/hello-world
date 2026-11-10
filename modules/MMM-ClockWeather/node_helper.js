/* MMM-ClockWeather node helper: fetches Open-Meteo every 15 minutes and shares it with every screen. */
"use strict";

const NodeHelper = require("node_helper");
const Log = require("logger");
const lib = require("./lib/weather");

const INTERVAL_MS = 15 * 60 * 1000;

module.exports = NodeHelper.create({
	start () {
		this.places = new Map(); // "lat,lon" → { timer, data }
	},

	stop () {
		for (const p of this.places.values()) clearInterval(p.timer);
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "CW_START") return;
		const key = `${payload.lat},${payload.lon}`;
		let place = this.places.get(key);
		if (!place) {
			place = { data: null, timer: null };
			this.places.set(key, place);
			const load = () => this.load(key, payload, place);
			place.timer = setInterval(load, INTERVAL_MS);
			load();
		} else if (place.data) {
			this.sendSocketNotification("CW_DATA", { key, data: place.data });
		}
	},

	async load (key, { lat, lon, forecastDays }, place) {
		try {
			const res = await fetch(lib.forecastUrl(lat, lon), { signal: AbortSignal.timeout(20000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			place.data = lib.parseForecast(await res.json(), forecastDays);
			this.sendSocketNotification("CW_DATA", { key, data: place.data });
		} catch (e) {
			Log.warn(`[MMM-ClockWeather] weather fetch failed: ${e.message}`);
		}
	}
});
