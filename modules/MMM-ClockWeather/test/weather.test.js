"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../lib/weather");

const SAMPLE = {
	current: { temperature_2m: 21.6, weather_code: 2, is_day: 1 },
	daily: {
		time: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
		weather_code: [2, 0, 61, 3, 0, 95],
		temperature_2m_max: [24.2, 23.4, 20.1, 21, 24.4, 19],
		temperature_2m_min: [15.1, 14, 12.6, 14.3, 15, 12]
	}
};

test("parseForecast: current conditions, today's range, next 4 days", () => {
	const w = lib.parseForecast(SAMPLE);
	assert.equal(w.temp, 22);
	assert.equal(w.label, "מעונן חלקית");
	assert.equal(w.icon, "cloudSun");
	assert.equal(w.todayMax, 24);
	assert.equal(w.todayMin, 15);
	assert.deepEqual(w.days.map((d) => d.dow), ["רביעי", "חמישי", "שישי", "שבת"]);
	assert.deepEqual(w.days.map((d) => d.icon), ["sun", "rain", "cloud", "sun"]);
	assert.equal(w.days[1].min, 13);
});

test("codeInfo covers the WMO groups, with a night icon for clear skies", () => {
	assert.equal(lib.codeInfo(0, false).icon, "moon");
	assert.equal(lib.codeInfo(45).label, "ערפל");
	assert.equal(lib.codeInfo(65).label, "גשם כבד");
	assert.equal(lib.codeInfo(81).label, "ממטרים");
	assert.equal(lib.codeInfo(73).icon, "snow");
	assert.equal(lib.codeInfo(99).icon, "storm");
});

test("iconSvg is decorative and sized", () => {
	const svg = lib.iconSvg("rain", 32);
	assert.match(svg, /aria-hidden="true"/);
	assert.match(svg, /width="32"/);
	assert.match(svg, /class="wx wx-rain"/);
});

test("forecastUrl asks for current + daily in local time", () => {
	const u = lib.forecastUrl(31.89, 34.81);
	assert.match(u, /latitude=31.89&longitude=34.81/);
	assert.match(u, /timezone=auto/);
});
