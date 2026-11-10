/* Family dashboard — MagicMirror² config
 *
 * Personal values (calendar links, API keys) live in config/config.env, not here,
 * so this file can stay in git. Copy config/config.env.example to config/config.env and fill it in.
 * Variables named SECRET_* are hidden from the browser and only used by the server.
 *
 * Demo mode (MM_DEMO=1, used by scripts/local.sh): calendars and chores come from sample data
 * served by modules/MMM-Demo, so it runs with no accounts. Weather and news are real.
 *
 * Layout on a 1920x1080 TV (Hebrew, right-to-left):
 *   ┌──────────────────────────┬──────────────────────────┐
 *   │ weather + news briefing  │ clock + date + todos     │
 *   ├──────────────────────────┴──────────────────────────┤
 *   │ 2-week family calendar (color per person)           │
 *   └─────────────────────────────────────────────────────┘
 * Phones get a single stacked column instead (config/custom.css).
 */
const DEMO = process.env.MM_DEMO === "1";
const PORT = 8080;
const DEMO_BASE = "http://localhost:" + PORT + "/demo";
const path = require("node:path");

// One list of calendars, used by both the TV grid and the phone agenda.
const CALENDARS = [
	{ name: "family", color: "#f5b942", symbol: "house", url: DEMO ? DEMO_BASE + "/calendar/family.ics" : "${SECRET_CAL_FAMILY}" },
	{ name: "person1", color: "#5ab0ff", symbol: "user", url: DEMO ? DEMO_BASE + "/calendar/person1.ics" : "${SECRET_CAL_PERSON1}" },
	{ name: "person2", color: "#ff7eb6", symbol: "user", url: DEMO ? DEMO_BASE + "/calendar/person2.ics" : "${SECRET_CAL_PERSON2}" },
	{
		name: "holidays",
		// Google's public Jewish holidays calendar (Hebrew)
		url: "https://calendar.google.com/calendar/ical/iw.jewish%23holiday%40group.v.calendar.google.com/public/basic.ics",
		color: "#7ddc8a",
		symbol: "star-of-david",
		fetchInterval: 24 * 60 * 60 * 1000
	}
];

let config = {
	address: "0.0.0.0", // reachable from other devices on the home network (e.g. an Android TV browser)
	port: PORT,
	basePath: "/",
	// Allow localhost, the home network, and your Tailscale devices (100.64.0.0/10) only.
	// MagicMirror has no login: never port-forward it on the router. Use Tailscale (scripts/remote-access.sh).
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.0.0/16", "::ffff:10.0.0.0/8", "::ffff:100.64.0.0/10"],

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
		"modules/MMM-Demo/lib/demo-data.js"
	].map((f) => path.join(__dirname, "..", f)),

	modules: [
		// ── Sample data + "demo" badge (only with MM_DEMO=1) ──
		...(DEMO ? [{ module: "MMM-Demo" }] : []),

		// ── Makes phones use the stacked layout (see config/custom.css) ──
		{ module: "MMM-PhoneView" },

		// ── Clock & date (top right = start of the line in Hebrew) ──
		{
			module: "clock",
			position: "top_right",
			config: {
				displaySeconds: false,
				dateFormat: "dddd, D בMMMM",
				showSunTimes: false
			}
		},

		// ── Todos & recurring chores (Todoist) ──
		{
			module: "MMM-Todoist",
			position: "top_right",
			header: "משימות",
			config: {
				accessToken: DEMO ? "demo" : "${SECRET_TODOIST_TOKEN}",
				...(DEMO ? { apiBase: DEMO_BASE + "/todoist" } : {}),
				// Empty = every task the token's owner can see. To show only the shared
				// household project, put its ID here, e.g. projects: ["6Jf8VQXxpwv56VQ7"].
				projects: [],
				displayTasksWithinDays: 0, // today + overdue (recurring chores appear on their day)
				displayTasksWithoutDue: true,
				maximumEntries: 10,
				showProject: false,
				displayAvatar: false,
				wrapEvents: true,
				maxTitleLength: 40,
				fade: false,
				updateInterval: 5 * 60 * 1000
			}
		},

		// ── Phone only: next 7 days as a list (the 2-week grid is too wide for a phone) ──
		{
			module: "calendar",
			position: "top_right",
			header: "השבוע",
			classes: "phone-only",
			config: {
				broadcastEvents: false, // the grid already gets events from the hidden calendar below
				maximumEntries: 15,
				maximumNumberOfDays: 7,
				fetchInterval: 5 * 60 * 1000,
				timeFormat: "absolute",
				dateFormat: "ddd D/M",
				fullDayEventDateFormat: "ddd D/M",
				showEnd: false,
				maxTitleLength: 40,
				wrapEvents: true,
				fade: false,
				coloredSymbol: true,
				calendars: CALENDARS
			}
		},

		// ── Weather: Rehovot (Open-Meteo, free, no key) ──
		{
			module: "weather",
			position: "top_left",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 31.8928,
				lon: 34.8113,
				appendLocationNameToHeader: false,
				showHumidity: "below",
				showSun: true,
				roundTemp: true
			}
		},
		{
			module: "weather",
			position: "top_left",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 31.8928,
				lon: 34.8113,
				maxNumberOfDays: 4,
				showPrecipitationProbability: true,
				roundTemp: true,
				fade: false,
				appendLocationNameToHeader: false
			}
		},

		// ── Daily news TL;DR (custom module in this repo) ──
		{
			module: "MMM-DailyTLDR",
			position: "top_left",
			header: "תקציר בוקר",
			config: {
				apiKey: "${SECRET_ANTHROPIC_API_KEY}", // without a key: plain headlines
				refreshTime: "06:00",
				bullets: 5,
				language: "Hebrew",
				// Check these with: node modules/MMM-DailyTLDR/check-feeds.js
				feeds: [
					{ name: "ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml" },
					{ name: "הארץ", url: "https://www.haaretz.co.il/srv/htz---all-articles" },
					{ name: "TheMarker", url: "https://www.themarker.com/srv/tm-all-articles" },
					{ name: "גלובס", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2" }
				]
			}
		},

		// ── Calendar data source (no position = hidden; it feeds the grid below) ──
		{
			module: "calendar",
			config: {
				broadcastPastEvents: true,
				maximumNumberOfDays: 31,
				maximumEntries: 200,
				fetchInterval: 5 * 60 * 1000,
				calendars: CALENDARS
			}
		},

		// ── Two-week family calendar grid ──
		{
			module: "MMM-CalendarExt3",
			position: "bottom_bar",
			classes: "tv-only",
			config: {
				mode: "week",
				weekIndex: 0, // start with the current week
				weeksInView: 2,
				firstDayOfWeek: 0, // Sunday
				weekends: [5, 6], // Friday, Saturday
				locale: "he-IL",
				maxEventLines: 5,
				fontSize: "22px",
				eventHeight: "30px",
				showWeekNumber: false,
				useWeather: true,
				displayLegend: false,
				headerWeekDayOptions: { weekday: "long" },
				cellDateOptions: { day: "numeric", month: "short" }
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
