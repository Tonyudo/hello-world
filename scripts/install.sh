#!/usr/bin/env bash
# One-command setup of the family dashboard on a Raspberry Pi 5
# (Raspberry Pi OS 64-bit "Bookworm" or newer, desktop edition, logged-in user — not root).
#
#   git clone <this repo> ~/family-dashboard && ~/family-dashboard/scripts/install.sh
#
# Safe to run again: it skips what is already done.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
NODE_MAJOR=22

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
	echo "Run this as your normal user (it uses sudo where needed), not as root." >&2
	exit 1
fi

say "System packages (git, Hebrew fonts, HDMI-CEC tools)"
sudo apt-get update
sudo apt-get install -y git curl fonts-noto-core v4l-utils

say "Node.js $NODE_MAJOR"
need_node=1
if command -v node >/dev/null; then
	major="$(node -p 'process.versions.node.split(".")[0]')"
	[ "$major" -ge "$NODE_MAJOR" ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
	sudo apt-get install -y nodejs
fi
node -v

say "MagicMirror² in $MM_DIR"
if [ ! -d "$MM_DIR/.git" ]; then
	git clone --depth 1 https://github.com/MagicMirrorOrg/MagicMirror.git "$MM_DIR"
fi
(cd "$MM_DIR" && npm run install-mm)

say "Third-party modules"
cd "$MM_DIR/modules"
if [ ! -d MMM-CalendarExt3 ]; then
	git clone https://github.com/MMRIZE/MMM-CalendarExt3
fi
(cd MMM-CalendarExt3 && git submodule update --init --recursive && npm ci --omit=dev --no-audit --no-fund)
if [ ! -d MMM-Todoist ]; then
	git clone https://github.com/cbrooker/MMM-Todoist
fi
(cd MMM-Todoist && npm install --omit=dev --no-audit --no-fund)

say "Linking this repo's config and news module into MagicMirror"
for f in config.js custom.css; do
	ln -sfn "$REPO_DIR/config/$f" "$MM_DIR/config/$f"
done
if [ ! -f "$REPO_DIR/config/config.env" ]; then
	cp "$REPO_DIR/config/config.env.example" "$REPO_DIR/config/config.env"
	chmod 600 "$REPO_DIR/config/config.env"
	echo "Created config/config.env — fill in your calendar links and keys (see README)."
fi
ln -sfn "$REPO_DIR/config/config.env" "$MM_DIR/config/config.env"
ln -sfn "$REPO_DIR/modules/MMM-DailyTLDR" "$MM_DIR/modules/MMM-DailyTLDR"
(cd "$REPO_DIR/modules/MMM-DailyTLDR" && npm install --omit=dev --no-audit --no-fund)

say "Start on boot (desktop autostart) and keep running if it crashes"
chmod +x "$REPO_DIR"/scripts/*.sh
AUTOSTART_DIR="$HOME/.config/labwc"
mkdir -p "$AUTOSTART_DIR"
touch "$AUTOSTART_DIR/autostart"
if ! grep -q "family-dashboard" "$AUTOSTART_DIR/autostart"; then
	echo "MM_DIR=\"$MM_DIR\" \"$REPO_DIR/scripts/run.sh\" &  # family-dashboard" >> "$AUTOSTART_DIR/autostart"
fi

say "Done"
cat <<EOF
Next steps:
  1. Edit $REPO_DIR/config/config.env (calendar links, Todoist token, Anthropic key).
  2. Check the news feeds:   cd $MM_DIR && node modules/MMM-DailyTLDR/check-feeds.js
  3. Reboot (or run $REPO_DIR/scripts/run.sh) — the dashboard opens full screen.
Optional: turn the TV on/off on a schedule — see "TV schedule" in the README.
EOF
