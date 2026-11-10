/* MMM-PhoneView: lets phones render the dashboard at their real width.
 *
 * MagicMirror's page has no <meta name="viewport">, so phone browsers lay it out as a
 * ~980px desktop page and shrink it. This adds the tag at startup; the stacked phone
 * layout itself lives in config/custom.css (@media max-width: 760px).
 * No position needed in config.js — it has nothing to display.
 */
Module.register("MMM-PhoneView", {
	start () {
		let meta = document.querySelector("meta[name=viewport]");
		if (!meta) {
			meta = document.createElement("meta");
			meta.name = "viewport";
			document.head.appendChild(meta);
		}
		meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
		document.title = this.config.title;
	},

	defaults: {
		title: "לוח המשפחה"
	}
});
