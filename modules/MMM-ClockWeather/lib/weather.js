/* Weather helpers for MMM-ClockWeather, shared by the browser module and the node helper.
 * Open-Meteo returns WMO weather codes; this maps them to Hebrew labels and an icon key.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.ClockWeatherLib = factory();
}(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	function codeInfo (code, isDay = true) {
		const c = Number(code);
		if (c === 0) return { label: "בהיר", icon: isDay ? "sun" : "moon" };
		if (c === 1) return { label: "בהיר ברובו", icon: isDay ? "sun" : "moon" };
		if (c === 2) return { label: "מעונן חלקית", icon: "cloudSun" };
		if (c === 3) return { label: "מעונן", icon: "cloud" };
		if (c === 45 || c === 48) return { label: "ערפל", icon: "fog" };
		if (c >= 51 && c <= 57) return { label: "טפטוף", icon: "rain" };
		if (c === 65 || c === 67) return { label: "גשם כבד", icon: "rain" };
		if (c >= 61 && c <= 67) return { label: "גשם", icon: "rain" };
		if (c >= 80 && c <= 82) return { label: "ממטרים", icon: "rain" };
		if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: "שלג", icon: "snow" };
		if (c >= 95) return { label: "סופות רעמים", icon: "storm" };
		return { label: "", icon: "cloud" };
	}

	// 24×24 stroke icons (aria-hidden decoration); color comes from CSS via currentColor.
	const P = {
		sun: "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
		moon: "<path d=\"M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z\"/>",
		cloudSun: "<path d=\"M12 3v1.5M5.6 5.6l1 1M3 12h1.5M17.4 5.6l-1 1\"/><path d=\"M8.5 11.2A4 4 0 0 1 15.9 9\"/><path d=\"M17.5 21H9a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 17.5 21z\"/>",
		cloud: "<path d=\"M17.5 19H9a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 17.5 19z\"/>",
		rain: "<path d=\"M17.5 17H7a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 17.5 17z\"/><path d=\"M9 20l-1 2M13 20l-1 2M17 20l-1 2\"/>",
		storm: "<path d=\"M17.5 16H7a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 17.5 16z\"/><path d=\"M12 16l-2 3h3l-2 3\"/>",
		fog: "<path d=\"M4 9h16M3 13h18M5 17h14\"/>",
		snow: "<path d=\"M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9\"/>"
	};

	function iconSvg (name, size) {
		return `<svg class="wx wx-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
			+ `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.cloud}</svg>`;
	}

	const DOW = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

	/** Open-Meteo /v1/forecast JSON → what the module draws. */
	function parseForecast (json, forecastDays = 4) {
		const cur = json.current || {};
		const d = json.daily || {};
		const info = codeInfo(cur.weather_code, cur.is_day !== 0);
		const days = (d.time || []).map((date, i) => {
			const [y, m, dd] = date.split("-").map(Number);
			return {
				date,
				dow: DOW[new Date(y, m - 1, dd).getDay()],
				max: Math.round(d.temperature_2m_max[i]),
				min: Math.round(d.temperature_2m_min[i]),
				icon: codeInfo(d.weather_code[i]).icon
			};
		});
		return {
			temp: Math.round(cur.temperature_2m),
			label: info.label,
			icon: info.icon,
			todayMax: days[0] ? days[0].max : null,
			todayMin: days[0] ? days[0].min : null,
			days: days.slice(1, 1 + forecastDays) // upcoming days, today excluded
		};
	}

	function forecastUrl (lat, lon) {
		return "https://api.open-meteo.com/v1/forecast"
			+ `?latitude=${lat}&longitude=${lon}`
			+ "&current=temperature_2m,weather_code,is_day"
			+ "&daily=weather_code,temperature_2m_max,temperature_2m_min"
			+ "&timezone=auto&forecast_days=6";
	}

	return { codeInfo, iconSvg, parseForecast, forecastUrl, DOW };
}));
