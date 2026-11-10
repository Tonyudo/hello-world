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

# shellcheck source=lib.sh
source "$REPO_DIR/scripts/lib.sh"

if [ "$(id -u)" -eq 0 ]; then
	echo "Run this as your normal user (it uses sudo where needed), not as root." >&2
	exit 1
fi

say "System packages (git, Hebrew fonts, HDMI-CEC tools)"
sudo apt-get update
sudo apt-get install -y git curl fonts-noto-core v4l-utils

say "Node.js $NODE_MAJOR"
if ! node_ok; then
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
	sudo apt-get install -y nodejs
fi
node -v

install_magicmirror "$MM_DIR"
install_third_party_modules "$MM_DIR"
link_repo "$REPO_DIR" "$MM_DIR"

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
Optional: view it from your phone anywhere — run $REPO_DIR/scripts/remote-access.sh
Optional: turn the TV on/off on a schedule — see "TV schedule" in the README.
EOF
