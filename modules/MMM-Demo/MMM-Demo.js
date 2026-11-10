/* MMM-Demo: marks the screen as demo data so nobody mistakes it for the real schedule. */
Module.register("MMM-Demo", {
	start () {
		const badge = document.createElement("div");
		badge.textContent = "מצב הדגמה · נתונים לדוגמה";
		badge.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:9999;padding:4px 10px;border-radius:6px;"
			+ "background:#f5b942;color:#000;font:600 13px sans-serif;pointer-events:none;opacity:.85";
		const add = () => document.body.appendChild(badge);
		if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
	}
});
