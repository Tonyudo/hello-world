/* Week-building helpers for MMM-WeekCalendar, shared by the browser module and the tests.
 * Input: the CALENDAR_EVENTS payload broadcast by MagicMirror's calendar module.
 */
(function (root, factory) {
	if (typeof module === "object" && module.exports) module.exports = factory();
	else root.WeekCalendarLib = factory();
}(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	const DOW = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
	const DOW_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
	const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
	const DAY = 24 * 3600 * 1000;

	const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
	const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	const pad = (n) => String(n).padStart(2, "0");
	const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

	function startOfWeek (d, firstDay = 0) {
		const s = dayStart(d);
		return addDays(s, -((s.getDay() - firstDay + 7) % 7));
	}

	/** Calendar-module events → {title, start, end, allDay, calendar}, sorted by start. */
	function normalize (raw) {
		return (raw || []).map((e) => ({
			title: String(e.title || "").trim(),
			start: new Date(Number(e.startDate)),
			end: new Date(Number(e.endDate)),
			allDay: Boolean(e.fullDayEvent),
			calendar: e.calendarName || ""
		})).filter((e) => e.title && !isNaN(e.start)).sort((a, b) => a.start - b.start);
	}

	/** Events that touch the given day; all-day events first, then by start time. */
	function eventsOn (events, day) {
		const from = dayStart(day).getTime();
		const to = from + DAY;
		return events
			.filter((e) => e.start.getTime() < to && Math.max(e.end.getTime(), e.start.getTime() + 1) > from)
			.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
	}

	function timeLabel (e, day) {
		if (e.allDay) return "";
		const startsToday = sameDay(e.start, day);
		const endsToday = sameDay(e.end, day) || e.end.getTime() === dayStart(addDays(day, 1)).getTime();
		if (!startsToday) return endsToday ? `עד ${hhmm(e.end)}` : "כל היום";
		return hhmm(e.start);
	}

	function rangeLabel (from, to) {
		if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${to.getDate()} ב${MONTHS[from.getMonth()]}`;
		return `${from.getDate()} ב${MONTHS[from.getMonth()]} – ${to.getDate()} ב${MONTHS[to.getMonth()]}`;
	}

	/** The current week (7 days from the configured first day) with each day's events. */
	function buildWeek (events, now = new Date(), { firstDay = 0, weekend = [5, 6] } = {}) {
		const start = startOfWeek(now, firstDay);
		const days = [];
		for (let i = 0; i < 7; i++) {
			const date = addDays(start, i);
			days.push({
				date,
				dow: DOW[date.getDay()],
				dayNum: date.getDate(),
				isToday: sameDay(date, now),
				isPast: date < dayStart(now),
				isWeekend: weekend.includes(date.getDay()),
				events: eventsOn(events, date).map((e) => ({ ...e, time: timeLabel(e, date) }))
			});
		}
		return { start, end: addDays(start, 6), range: rangeLabel(start, addDays(start, 6)), days };
	}

	/**
	 * Highlights of next week, one line each: "ג׳ 17 · title". Routine events (a title that also
	 * appears this week, like a weekly gym slot) are skipped, and each title shows once.
	 */
	function nextWeek (events, now = new Date(), { firstDay = 0, max = 3 } = {}) {
		const thisWeek = startOfWeek(now, firstDay);
		const from = addDays(thisWeek, 7);
		const to = addDays(from, 7);
		const routine = new Set(events.filter((e) => e.start >= thisWeek && e.start < from).map((e) => e.title));
		const seen = new Set();
		return events
			.filter((e) => e.start >= from && e.start < to && !routine.has(e.title))
			.filter((e) => !seen.has(e.title) && seen.add(e.title))
			.slice(0, max)
			.map((e) => ({ ...e, label: `${DOW_SHORT[e.start.getDay()]} ${e.start.getDate()}` }));
	}

	/** Today's events with a time range for the phone's "today" card. */
	function today (events, now = new Date()) {
		return eventsOn(events, now).map((e) => ({
			...e,
			time: timeLabel(e, now),
			until: e.allDay ? "" : (sameDay(e.end, now) ? `עד ${hhmm(e.end)}` : "")
		}));
	}

	return { DOW, DOW_SHORT, startOfWeek, normalize, eventsOn, buildWeek, nextWeek, today, rangeLabel, hhmm };
}));
