/* Sample family data for trying the dashboard without real accounts.
 * Everything is generated relative to "now", so the demo always shows the current week.
 */
"use strict";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -d.getDay()); // Sunday

/* Weekly patterns: [weekday (0 = Sunday), "HH:MM" or null for all-day, minutes, title, weeks] */
const PATTERNS = {
	family: [
		[5, "19:30", 120, "ארוחת שישי אצל סבתא", [-1, 0, 1, 2]],
		[2, "18:00", 90, "אסיפת הורים", [0]],
		[6, null, 0, "טיול משפחתי", [1]],
		[0, "20:30", 30, "תכנון שבועי", [-1, 0, 1, 2]]
	],
	person1: [
		[0, "07:00", 60, "חדר כושר", [-1, 0, 1, 2]],
		[3, "07:00", 60, "חדר כושר", [-1, 0, 1, 2]],
		[4, "09:30", 45, "רופא שיניים", [0]],
		[1, "13:00", 60, "ארוחת צהריים עם דני", [1]]
	],
	person2: [
		[1, "17:00", 90, "חוג ציור", [-1, 0, 1, 2]],
		[4, "17:00", 90, "חוג ציור", [-1, 0, 1, 2]],
		[3, "14:00", 60, "פגישת עבודה", [0, 1]],
		[2, null, 0, "יום הולדת לנועה 🎂", [1]]
	]
};

function vevent (uid, start, timeHHMM, minutes, title, stamp) {
	const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${title}`];
	if (!timeHHMM) {
		lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(start, 1))}`);
	} else {
		const [h, m] = timeHHMM.split(":").map(Number);
		const s = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m);
		const e = new Date(s.getTime() + minutes * 60000);
		const fmt = (d) => `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`; // floating = local time
		lines.push(`DTSTART:${fmt(s)}`, `DTEND:${fmt(e)}`);
	}
	lines.push("END:VEVENT");
	return lines;
}

/** iCalendar text for one of the sample calendars: "family", "person1" or "person2". */
function buildCalendar (name, now = new Date()) {
	const patterns = PATTERNS[name];
	if (!patterns) return null;
	const week0 = startOfWeek(now);
	const stamp = `${ymd(now)}T000000Z`;
	const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//family-dashboard//demo//HE", `X-WR-CALNAME:${name}`];
	patterns.forEach(([weekday, time, minutes, title, weeks], p) => {
		for (const w of weeks) {
			const day = addDays(week0, w * 7 + weekday);
			lines.push(...vevent(`demo-${name}-${p}-${isoDay(day)}`, day, time, minutes, title, stamp));
		}
	});
	lines.push("END:VCALENDAR");
	return `${lines.join("\r\n")}\r\n`;
}

/** A Todoist Sync API v1 response with sample household chores. */
function buildTodoist (now = new Date()) {
	const today = isoDay(now);
	const project = { id: "demo-home", name: "בית", color: "blue", child_order: 1 };
	const task = (n, content, due, recurring, priority = 1) => ({
		id: `demo-${n}`,
		content,
		description: "",
		project_id: project.id,
		section_id: null,
		parent_id: null,
		child_order: n,
		day_order: n,
		priority,
		labels: [],
		checked: false,
		is_deleted: false,
		responsible_uid: null,
		due: due ? { date: due, is_recurring: recurring, string: recurring ? "every day" : due, lang: "he" } : null
	});
	return {
		sync_token: "demo",
		full_sync: true,
		items: [
			task(1, "להוציא את הזבל", today, true, 3),
			task(2, "לקנות חלב ולחם", today, false),
			task(3, "להשקות את העציצים", isoDay(addDays(now, -1)), true),
			task(4, "לתקן את הברז באמבטיה", null, false),
			task(5, "לשלם ארנונה", isoDay(addDays(now, 1)), false, 2) // tomorrow: hidden by displayTasksWithinDays: 0
		],
		projects: [project],
		collaborators: [],
		labels: [],
		user: { id: "demo", full_name: "Demo" }
	};
}

module.exports = { buildCalendar, buildTodoist, startOfWeek };
