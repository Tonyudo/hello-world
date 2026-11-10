#!/usr/bin/env bash
# Start MagicMirror full screen and restart it if it exits or crashes.
# Launched from ~/.config/labwc/autostart by install.sh. To restart it: scripts/restart.sh
MM_DIR="${MM_DIR:-$HOME/MagicMirror}"
LOG="$HOME/.cache/family-dashboard.log"
mkdir -p "$(dirname "$LOG")"
cd "$MM_DIR" || exit 1
while true; do
	echo "--- start $(date) ---" >> "$LOG"
	npm run start >> "$LOG" 2>&1
	sleep 5
done
