#!/usr/bin/env bash
# Shared install steps for scripts/install.sh (Raspberry Pi) and scripts/local.sh (Mac/Linux laptop).
# Source it; don't run it.

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# MagicMirror requires Node >= 22.22.2 (or >= 24).
node_ok() {
	command -v node >/dev/null || return 1
	node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);
	         process.exit((a===22&&(b>22||(b===22&&c>=2)))||a>=24?0:1)'
}

install_magicmirror() { # $1 = MagicMirror dir
	local mm="$1"
	if [ ! -d "$mm/.git" ]; then
		say "Downloading MagicMirror² into $mm"
		git clone --depth 1 https://github.com/MagicMirrorOrg/MagicMirror.git "$mm"
	fi
	say "Installing MagicMirror² (a few minutes the first time)"
	(cd "$mm" && npm run install-mm)
}

install_third_party_modules() { # $1 = MagicMirror dir
	local mods="$1/modules"
	say "Installing calendar grid and Todoist modules"
	[ -d "$mods/MMM-CalendarExt3" ] || git clone https://github.com/MMRIZE/MMM-CalendarExt3 "$mods/MMM-CalendarExt3"
	(cd "$mods/MMM-CalendarExt3" && git submodule update --init --recursive && npm ci --omit=dev --no-audit --no-fund)
	[ -d "$mods/MMM-Todoist" ] || git clone https://github.com/cbrooker/MMM-Todoist "$mods/MMM-Todoist"
	(cd "$mods/MMM-Todoist" && npm install --omit=dev --no-audit --no-fund)
}

link_repo() { # $1 = repo dir, $2 = MagicMirror dir
	local repo="$1" mm="$2"
	say "Linking this repo's config and modules into MagicMirror"
	for f in config.js custom.css; do
		ln -sfn "$repo/config/$f" "$mm/config/$f"
	done
	if [ ! -f "$repo/config/config.env" ]; then
		cp "$repo/config/config.env.example" "$repo/config/config.env"
		chmod 600 "$repo/config/config.env"
	fi
	ln -sfn "$repo/config/config.env" "$mm/config/config.env"
	for m in MMM-DailyTLDR MMM-PhoneView MMM-Demo; do
		ln -sfn "$repo/modules/$m" "$mm/modules/$m"
	done
	if [ ! -d "$repo/modules/MMM-DailyTLDR/node_modules" ]; then
		(cd "$repo/modules/MMM-DailyTLDR" && npm install --omit=dev --no-audit --no-fund)
	fi
}
