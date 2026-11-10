#!/usr/bin/env bash
# Run the family dashboard on your Mac (or Linux laptop) in a browser — no Raspberry Pi needed.
#
#   scripts/local.sh            demo mode: sample calendars & chores, real weather & news
#   scripts/local.sh --real     your real accounts from config/config.env
#   scripts/local.sh --update   re-install MagicMirror and modules, then start
#
# Opens http://localhost:8080. Saving config/config.js, config/custom.css or a module file
# restarts the server and reloads the page. Stop with Ctrl+C.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${MM_DIR:-$REPO_DIR/.magicmirror}" # kept inside the repo folder, ignored by git
URL="http://localhost:8080"
# shellcheck source=lib.sh
source "$REPO_DIR/scripts/lib.sh"

MODE=demo
UPDATE=0
for arg in "$@"; do
	case "$arg" in
		--real) MODE=real ;;
		--update) UPDATE=1 ;;
		-h|--help) sed -n '2,10p' "$0"; exit 0 ;;
		*) echo "Unknown option: $arg" >&2; exit 2 ;;
	esac
done

if ! node_ok; then
	cat >&2 <<'EOF'
Node.js 22 (22.22.2 or newer) is needed.
  Easiest: download the "LTS" installer from https://nodejs.org and run it.
  With Homebrew: brew install node@22 && brew link --overwrite --force node@22
Then run this script again.
EOF
	exit 1
fi
command -v git >/dev/null || { echo "git is needed: run  xcode-select --install  and try again." >&2; exit 1; }

# The browser does the displaying here, so skip downloading Electron (~100 MB).
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
if [ ! -d "$MM_DIR/node_modules" ] || [ "$UPDATE" -eq 1 ]; then
	[ "$UPDATE" -eq 1 ] && [ -d "$MM_DIR/.git" ] && git -C "$MM_DIR" pull --ff-only
	install_magicmirror "$MM_DIR"
	install_third_party_modules "$MM_DIR"
fi
link_repo "$REPO_DIR" "$MM_DIR"

if [ "$MODE" = demo ]; then
	export MM_DEMO=1
	say "Starting in DEMO mode (sample calendars & chores; weather and news are real)"
else
	unset MM_DEMO
	if grep -q "REPLACE" "$REPO_DIR/config/config.env"; then
		echo "Note: config/config.env still has REPLACE values — those panels will be empty."
	fi
	say "Starting with your real accounts"
fi

# Open the browser once the server answers.
(
	for _ in $(seq 1 60); do
		if curl -fs -o /dev/null "$URL"; then
			if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL"; fi
			echo; echo "Dashboard: $URL   (phone layout: open DevTools → device toolbar, or narrow the window)"
			exit 0
		fi
		sleep 1
	done
) &

cd "$MM_DIR"
exec npm run server:watch
