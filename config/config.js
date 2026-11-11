/* Family dashboard — MagicMirror² config
 *
 * Personal values (calendar links, API keys) live in config/config.env, not here,
 * so this file can stay in git. Copy config/config.env.example to config/config.env and fill it in.
 * Variables named SECRET_* are hidden from the browser and only used by the server.
 *
 * Demo mode (MM_DEMO=1, used by scripts/local.sh): calendars and chores come from sample data
 * served by modules/MMM-Demo, so it runs with no accounts. Weather and news are real.
 *
 * Layout on a 1920x1080 TV (Hebrew, right-to-left), Material 3 cards:
 *   ┌──────────────┬──────────────────────────────────────┐
 *   │ clock+weather│                                      │
 *   ├──────────────┤        week calendar (7 days)        │
 *   │ chores       │        color per person              │
 *   ├──────────────┤                                      │
 *   │ news         │        next-week strip               │
 *   └──────────────┴──────────────────────────────────────┘
 * Phones get one stacked column instead (config/custom.css).
 */
const DEMO = process.env.MM_DEMO === "1";
const PORT = 8080;
const DEMO_BASE = "http://localhost:" + PORT + "/demo";
const path = require("node:path");

// One list of calendars. The hidden calendar module reads them; MMM-WeekCalendar colors events by name.
// label = what the legend shows (change "שם 1" / "שם 2" to your names); bg/fg = event chip colors.
const CALENDARS = [
	{ name: "family", label: "משפחה", swatch: "#F2B84B", bg: "#FFE3A6", fg: "#3A2A00", url: DEMO ? DEMO_BASE + "/calendar/family.ics" : "${SECRET_CAL_FAMILY}" },
	{ name: "person1", label: "שם 1", swatch: "#4F7BE8", bg: "#D8E2FF", fg: "#001A41", url: DEMO ? DEMO_BASE + "/calendar/person1.ics" : "${SECRET_CAL_PERSON1}" },
	{ name: "person2", label: "שם 2", swatch: "#D9508A", bg: "#FFD9E6", fg: "#3D0020", url: DEMO ? DEMO_BASE + "/calendar/person2.ics" : "${SECRET_CAL_PERSON2}" },
	{
		name: "holidays",
		label: "חגים",
		swatch: "#3E9B5A",
		bg: "#C8EFCF",
		fg: "#00210B",
		// Google's public Jewish holidays calendar (Hebrew)
		url: "https://calendar.google.com/calendar/ical/iw.jewish%23holiday%40group.v.calendar.google.com/public/basic.ics",
		fetchInterval: 24 * 60 * 60 * 1000
	}
];
const CALENDAR_STYLES = Object.fromEntries(CALENDARS.map((c) => [c.name, { label: c.label, swatch: c.swatch, bg: c.bg, fg: c.fg }]));
const PLACE = { lat: 31.8928, lon: 34.8113, place: "רחובות" };

let config = {
	address: "0.0.0.0", // reachable from other devices on the home network (e.g. an Android TV browser)
	port: PORT,
	basePath: "/",
	// Allow localhost, the home network, and your Tailscale devices (100.64.0.0/10) only.
	// MagicMirror has no login: never port-forward it on the router. Use Tailscale (scripts/remote-access.sh).
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.0.0/16", "::ffff:10.0.0.0/8", "::ffff:100.64.0.0/10"],

	// Quiet terminal: only warnings and errors. Run with MM_LOG=all to see every fetch and broadcast.
	logLevel: process.env.MM_LOG === "all" ? ["DEBUG", "INFO", "LOG", "WARN", "ERROR"] : ["WARN", "ERROR"],

	language: "he",
	locale: "he-IL",
	timeFormat: 24,
	units: "metric",

	// Local development (scripts/local.sh): saving any of these restarts the server and reloads the browser.
	watchTargets: [
		"config/config.js",
		"config/custom.css",
		"modules/MMM-DailyTLDR/MMM-DailyTLDR.js",
		"modules/MMM-DailyTLDR/MMM-DailyTLDR.css",
		"modules/MMM-DailyTLDR/node_helper.js",
		"modules/MMM-DailyTLDR/lib/core.js",
		"modules/MMM-PhoneView/MMM-PhoneView.js",
		"modules/MMM-ClockWeather/MMM-ClockWeather.js",
		"modules/MMM-ClockWeather/MMM-ClockWeather.css",
		"modules/MMM-WeekCalendar/MMM-WeekCalendar.js",
		"modules/MMM-WeekCalendar/MMM-WeekCalendar.css",
		"modules/MMM-Chores/MMM-Chores.js",
		"modules/MMM-Chores/MMM-Chores.css",
		"modules/MMM-Demo/lib/demo-data.js"
	].map((f) => path.join(__dirname, "..", f)),

	modules: [
		// ── Sample data + "demo" badge (only with MM_DEMO=1) ──
		...(DEMO ? [{ module: "MMM-Demo" }] : []),

		// ── Makes phones use the stacked layout (see config/custom.css) ──
		{ module: "MMM-PhoneView" },

		// Every visible module goes in top_bar; config/custom.css places each by its card-* class.

		// ── Clock + weather (TV: first card; phone: header) ──
		{
			module: "MMM-ClockWeather",
			position: "top_bar",
			classes: "card card-now",
			config: { mode: "full", ...PLACE }
		},

		// ── Phone only: today's events ──
		{
			module: "MMM-WeekCalendar",
			position: "top_bar",
			classes: "card card-today phone-only",
			config: { mode: "today", title: "היום", calendars: CALENDAR_STYLES }
		},

		// ── Chores (Todoist): overdue, today and undated ──
		{
			module: "MMM-Chores",
			position: "top_bar",
			classes: "card card-chores",
			config: {
				accessToken: DEMO ? "demo" : "${SECRET_TODOIST_TOKEN}",
				apiBase: DEMO ? DEMO_BASE + "/todoist/v1" : "https://api.todoist.com/api/v1",
				// Only the shared household project: put its id here, e.g. ["6Jf8VQXxpwv56VQ7"]. Empty = all tasks.
				projects: [],
				max: 6
			}
		},

		// ── Week calendar (TV: 7-day grid; phone: day-by-day list) ──
		{
			module: "MMM-WeekCalendar",
			position: "top_bar",
			classes: "card card-cal",
			config: { mode: "week", title: "השבוע", calendars: CALENDAR_STYLES }
		},

		// ── Daily news TL;DR ──
		{
			module: "MMM-DailyTLDR",
			position: "top_bar",
			classes: "card card-news",
			config: {
				title: "תקציר בוקר",
				apiKey: "${SECRET_ANTHROPIC_API_KEY}", // without a key: plain headlines
				refreshTime: "06:00",
				bullets: 5,
				language: "Hebrew",
				// Check these with: npm run check-feeds
				feeds: [
					{ name: "ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml" },
					{ name: "הארץ", url: "https://www.haaretz.co.il/srv/htz---all-articles" },
					{ name: "TheMarker", url: "https://www.themarker.com/srv/tm-all-articles" },
					{ name: "גלובס", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2" }
				]
			}
		},

		// ── Phone only: 4-day forecast ──
		{
			module: "MMM-ClockWeather",
			position: "top_bar",
			classes: "card card-forecast phone-only",
			config: { mode: "forecast", ...PLACE }
		},

		// ── Calendar data source (no position = hidden; feeds MMM-WeekCalendar) ──
		{
			module: "calendar",
			config: {
				broadcastPastEvents: true,
				maximumNumberOfDays: 21,
				maximumEntries: 300,
				fetchInterval: 5 * 60 * 1000,
				calendars: CALENDARS.map(({ name, url, color = "", symbol = "calendar", fetchInterval }) => ({ name, url, color, symbol, ...(fetchInterval ? { fetchInterval } : {}) }))
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
