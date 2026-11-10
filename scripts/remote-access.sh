#!/usr/bin/env bash
# View the dashboard from anywhere, privately, with Tailscale (free for personal use).
# Nothing is opened to the internet: only devices signed in to your Tailscale account can reach it.
#
# Run once on the Pi:  ~/family-dashboard/scripts/remote-access.sh
# Then install the Tailscale app on your phones and sign in with the same account.
set -euo pipefail

HOSTNAME_TS="${TS_HOSTNAME:-family-dashboard}"

if ! command -v tailscale >/dev/null; then
	echo "==> Installing Tailscale"
	curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "==> Connecting this Pi to your Tailscale account as '$HOSTNAME_TS'"
echo "    (open the link it prints and sign in — use the same account on your phones)"
sudo tailscale up --hostname="$HOSTNAME_TS"

echo "==> Serving the dashboard over HTTPS inside your tailnet"
# Proxies https://<name>.<tailnet>.ts.net → http://localhost:8080. If HTTPS isn't enabled for your
# tailnet yet, Tailscale prints a link to turn it on; open it, then run this script again.
if sudo tailscale serve --bg 8080; then
	URL="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("https://"+j.Self.DNSName.replace(/\.$/,""))})')"
	echo
	echo "Done. On your phone (with Tailscale on), open:"
	echo "    $URL"
else
	echo
	echo "HTTPS serving isn't on yet — follow the link above, then re-run. Meanwhile this also works:"
	echo "    http://$HOSTNAME_TS:8080"
fi
echo "Tip: in Safari/Chrome use 'Add to Home Screen' so it opens like an app."
