/* MMM-Demo node helper: serves sample calendars and Todoist chores from MagicMirror itself,
 * so the dashboard can be tried with no accounts. Only loaded when MM_DEMO=1 (see config.js).
 *   GET  /demo/calendar/family.ics | person1.ics | person2.ics
 *   POST /demo/todoist/v1/sync
 */
"use strict";

const NodeHelper = require("node_helper");
const Log = require("logger");
const demo = require("./lib/demo-data");

module.exports = NodeHelper.create({
	start () {
		this.expressApp.get("/demo/calendar/:file", (req, res) => {
			const ics = demo.buildCalendar(req.params.file.replace(/\.ics$/, ""));
			if (!ics) return res.status(404).send("unknown demo calendar");
			res.type("text/calendar; charset=utf-8").send(ics);
		});
		this.expressApp.post("/demo/todoist/v1/sync", (req, res) => {
			res.json(demo.buildTodoist());
		});
		Log.info("[MMM-Demo] demo data is served at /demo/… (calendars and Todoist)");
	}
});
