/* MMM-DailyTLDR node helper: fetches RSS feeds once a day, asks Claude for a short
 * briefing, caches it to disk, and pushes it to every connected screen.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const core = require("./lib/core");

let Anthropic = null;
try {
	Anthropic = require("@anthropic-ai/sdk");
} catch {
	// Not installed: the module still works in headlines-only mode.
}

const CACHE_FILE = path.join(__dirname, "cache.json");
const TICK_MS = 5 * 60 * 1000;

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.cache = this.readCache();
		this.timer = null;
		this.running = false;
	},

	stop () {
		clearInterval(this.timer);
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "TLDR_START") return;
		// Several screens (TV + a phone) may connect; keep one schedule for all of them.
		this.config = payload;
		if (this.cache) this.sendSocketNotification("TLDR_DATA", this.cache);
		if (!this.timer) {
			this.timer = setInterval(() => this.tick(), TICK_MS);
			this.tick();
		}
	},

	apiKey () {
		const k = (this.config.apiKey || process.env.ANTHROPIC_API_KEY || "").trim();
		// An unset config.env variable is left as the literal "${...}" (or redacted "**...**");
		// "REPLACE" is the placeholder from config.env.example.
		return (/^\$\{|^\*\*|^REPLACE$/).test(k) ? "" : k;
	},

	aiEnabled () {
		return Boolean(Anthropic && this.apiKey());
	},

	async tick () {
		if (this.running) return;
		const opts = { refreshTime: this.config.refreshTime, aiEnabled: this.aiEnabled() };
		if (!core.shouldRefresh(this.cache, opts)) return;
		this.running = true;
		try {
			await this.refresh();
		} catch (e) {
			Log.error(`[MMM-DailyTLDR] refresh failed: ${e.message}`);
		} finally {
			this.running = false;
		}
	},

	async refresh () {
		const feeds = await this.fetchAll();
		const usable = feeds.filter((f) => f.items.length);
		if (!usable.length) {
			Log.warn("[MMM-DailyTLDR] no feed returned any items; keeping previous briefing");
			return;
		}

		const now = new Date();
		let bullets = null;
		let mode = "headlines";
		if (this.aiEnabled()) {
			try {
				bullets = await this.summarize(usable);
				mode = "ai";
			} catch (e) {
				Log.error(`[MMM-DailyTLDR] AI summary failed, showing headlines: ${e.message}`);
			}
		}
		if (!bullets) bullets = core.headlineBullets(usable, this.config.bullets);

		this.cache = {
			date: core.localDate(now),
			generatedAt: now.toISOString(),
			attemptedAt: now.toISOString(),
			mode,
			sources: usable.map((f) => f.name),
			bullets
		};
		this.writeCache();
		this.sendSocketNotification("TLDR_DATA", this.cache);
		Log.info(`[MMM-DailyTLDR] briefing updated (${mode}, ${bullets.length} bullets)`);
	},

	async fetchAll () {
		return Promise.all(this.config.feeds.map(async (feed) => {
			try {
				const res = await fetch(feed.url, {
					headers: { "User-Agent": "Mozilla/5.0 (MagicMirror MMM-DailyTLDR)" },
					signal: AbortSignal.timeout(20000)
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const buf = Buffer.from(await res.arrayBuffer());
				const xml = core.decodeBody(buf, res.headers.get("content-type"));
				const items = core.selectItems(core.parseFeed(xml), {
					maxAgeHours: this.config.maxAgeHours,
					maxItems: this.config.maxItemsPerFeed
				});
				return { name: feed.name, items };
			} catch (e) {
				Log.warn(`[MMM-DailyTLDR] feed "${feed.name}" failed: ${e.message}`);
				return { name: feed.name, items: [] };
			}
		}));
	},

	async summarize (feeds) {
		const client = new Anthropic({ apiKey: this.apiKey() });
		const { bullets, language, model, effort } = this.config;
		let response;
		try {
			response = await client.beta.messages.create({
				model,
				max_tokens: 16000,
				// If the model declines (e.g. a sensitive security story), the API retries on a fallback model.
				betas: ["server-side-fallback-2026-07-01"],
				fallbacks: "default",
				output_config: {
					effort,
					format: { type: "json_schema", schema: core.BULLET_SCHEMA }
				},
				system: core.buildSystemPrompt({ bullets, language }),
				messages: [{ role: "user", content: core.buildUserPrompt(feeds) }]
			});
		} catch (e) {
			if (e instanceof Anthropic.AuthenticationError) throw new Error("invalid Anthropic API key", { cause: e });
			if (e instanceof Anthropic.RateLimitError) throw new Error("rate limited; will retry", { cause: e });
			if (e instanceof Anthropic.APIError) throw new Error(`API error ${e.status}: ${e.message}`, { cause: e });
			throw e;
		}

		if (response.stop_reason === "refusal") throw new Error("model declined the request");
		if (response.stop_reason === "max_tokens") throw new Error("response was cut off");

		const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
		const parsed = JSON.parse(text);
		const out = (parsed.bullets || [])
			.filter((b) => b && typeof b.text === "string" && b.text.trim())
			.slice(0, bullets)
			.map((b) => ({ text: b.text.trim(), source: String(b.source || "").trim() }));
		if (!out.length) throw new Error("empty summary");
		return out;
	},

	readCache () {
		try {
			return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
		} catch {
			return null;
		}
	},

	writeCache () {
		try {
			fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
		} catch (e) {
			Log.warn(`[MMM-DailyTLDR] could not write cache: ${e.message}`);
		}
	}
});
