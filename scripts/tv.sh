#!/usr/bin/env bash
# Turn the TV on or off over HDMI-CEC (most TVs support it; it may be called
# Anynet+, Bravia Sync, SimpLink or similar in the TV's settings — turn it on there).
#   scripts/tv.sh on | off | status
set -euo pipefail
DEV="${CEC_DEV:-/dev/cec0}" # Pi 5: /dev/cec0 = the HDMI port next to the USB-C power port
cec-ctl -d "$DEV" --playback >/dev/null
case "${1:-}" in
	on)     cec-ctl -d "$DEV" --to 0 --image-view-on && cec-ctl -d "$DEV" --to 0 --active-source phys-addr="$(cec-ctl -d "$DEV" | awk '/Physical Address/{print $4; exit}')" ;;
	off)    cec-ctl -d "$DEV" --to 0 --standby ;;
	status) cec-ctl -d "$DEV" --to 0 --give-device-power-status ;;
	*)      echo "usage: $0 on|off|status" >&2; exit 2 ;;
esac
