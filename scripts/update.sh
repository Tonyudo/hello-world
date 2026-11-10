#!/usr/bin/env bash
# Pull the latest dashboard config and modules, then restart the screen.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${MM_DIR:-$HOME/MagicMirror}"

git -C "$REPO_DIR" pull --ff-only
# shellcheck source=lib.sh
source "$REPO_DIR/scripts/lib.sh"
(cd "$REPO_DIR/modules/MMM-DailyTLDR" && npm install --omit=dev --no-audit --no-fund)
link_repo "$REPO_DIR" "$MM_DIR" # also links modules added since the first install

if [ "${1:-}" = "--all" ]; then
	git -C "$MM_DIR" pull --ff-only && (cd "$MM_DIR" && npm run install-mm)
	(cd "$MM_DIR/modules/MMM-CalendarExt3" && git pull --ff-only && git submodule update --init --recursive && npm ci --omit=dev --no-audit --no-fund)
	(cd "$MM_DIR/modules/MMM-Todoist" && git pull --ff-only && npm install --omit=dev --no-audit --no-fund)
fi

"$REPO_DIR/scripts/restart.sh"
echo "Updated. The screen restarts in a few seconds."
