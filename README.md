# Family Dashboard

A Skylight-style family screen for the TV, built on [MagicMirror²](https://magicmirror.builders) and running on a Raspberry Pi 5.
Hebrew, right-to-left, with weather for Rehovot.

```
┌──────────────────────────────┬──────────────────────────────┐
│ Weather now + 4-day forecast │ Clock + Hebrew date          │
│ News briefing (5 bullets)    │ Todos & recurring chores     │
├──────────────────────────────┴──────────────────────────────┤
│ 2-week calendar: Family · Person 1 · Person 2 · Holidays    │
└─────────────────────────────────────────────────────────────┘
```

| Panel | Source | Who updates it |
|---|---|---|
| Calendar | Google Calendar (private iCal links) | Everyone, from Google Calendar on their phone |
| Todos + recurring chores | Todoist (free) | Everyone, from the Todoist app |
| Weather | Open-Meteo (free, no key) | Automatic |
| News briefing | ynet, Haaretz, TheMarker, Globes → summarized by Claude at 06:00 | Automatic |

**The TV only displays. All input happens on your phones.**

## What you need

- Raspberry Pi 5 (4 GB is plenty) + official 27 W USB-C power supply + case + 32 GB microSD + micro-HDMI to HDMI cable. About ₪400–500.
- A Google account with a shared **Family** calendar and one calendar per person
- A Todoist account (free) with a shared project, e.g. "בית"
- An Anthropic API key, for the AI news summary. This is optional: without one the screen shows plain headlines.

## Setup (about 30 minutes)

### 1. Prepare the Pi
Flash **Raspberry Pi OS (64-bit, with desktop)** with Raspberry Pi Imager. In the Imager settings, set your Wi-Fi, a username, and turn on SSH. Boot the Pi plugged into the TV.

### 2. Install
On the Pi (in a terminal or over SSH):
```bash
git clone https://github.com/tonyudo/hello-world.git ~/family-dashboard
~/family-dashboard/scripts/install.sh
```
This installs Node.js, MagicMirror², the calendar and Todoist modules, and the news module from this repo. It also sets the dashboard to start on boot.

### 3. Fill in your links and keys
Edit `~/family-dashboard/config/config.env`. Git ignores this file, so it never leaves the Pi.

| Setting | Where to get it |
|---|---|
| `SECRET_CAL_FAMILY`, `SECRET_CAL_PERSON1`, `SECRET_CAL_PERSON2` | Google Calendar on a computer → ⚙ Settings → click the calendar → **Integrate calendar** → **Secret address in iCal format** |
| `SECRET_TODOIST_TOKEN` | Todoist → Settings → Integrations → Developer → API token |
| `SECRET_ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (leave `REPLACE` for headlines only) |

To change who is who and their colors, edit the `calendars` list in `config/config.js` (`person1` = blue, `person2` = pink, `family` = amber, holidays = green).

### 4. Check the news feeds, then reboot
```bash
cd ~/MagicMirror && node modules/MMM-DailyTLDR/check-feeds.js
sudo reboot
```
`check-feeds` shows ✔ or ✘ for each feed. If one fails, find the outlet's current RSS link and replace it in `config/config.js`.

## Everyday use

- **Add an event:** add it to the Family calendar (or your own) in Google Calendar. It shows up on the TV within 5 minutes.
- **Add a chore:** add it to the shared Todoist project with a repeat ("every Sunday", "every day at 8pm"). The TV shows today's tasks, overdue tasks and tasks with no date.
- **News:** a new briefing is written every morning at 06:00 and stays up all day.

## Maintenance

| Task | Command |
|---|---|
| Restart the screen | `~/family-dashboard/scripts/restart.sh` |
| Pull config changes from GitHub | `~/family-dashboard/scripts/update.sh` |
| Also update MagicMirror and the modules | `~/family-dashboard/scripts/update.sh --all` |
| See the logs | `tail -f ~/.cache/family-dashboard.log` |
| Open the dashboard from another device | `http://<pi-ip>:8080` |

### TV schedule (saves power, prevents burn-in)
Turn on **HDMI-CEC** in the TV's settings. Samsung calls it Anynet+, LG calls it SimpLink, Sony calls it Bravia Sync. Then test it:
```bash
~/family-dashboard/scripts/tv.sh off
~/family-dashboard/scripts/tv.sh on
```
If both work, run `crontab -e` and add these lines. The TV turns on at 06:30 and off at 23:00:
```
30 6 * * * /home/<you>/family-dashboard/scripts/tv.sh on
0 23 * * * /home/<you>/family-dashboard/scripts/tv.sh off
```
**OLED TV?** Use the schedule. A screen that never changes can burn in.

## Costs

| Item | Cost |
|---|---|
| Raspberry Pi 5 kit | one-time, about ₪400–500 |
| Google Calendar, Todoist free tier, Open-Meteo | free |
| News summary (Claude Opus 5.5, once a day) | about $2 a month. Set `model: "claude-haiku-5-5"` in the news module config to pay about $0.05 a month. |

## Repo layout

```
config/config.js            layout, calendars, location, feeds (no secrets)
config/config.env.example   template for your private links and keys
config/custom.css           TV styling: large Hebrew font, RTL, overscan margins
modules/MMM-DailyTLDR/      custom module: RSS → Claude → 5-bullet Hebrew briefing
scripts/                    install, run, restart, update, TV on/off
```

## Roadmap

- [ ] Photo slideshow at night or when idle (Google Photos album)
- [ ] Forward a school or clinic email → an event is created automatically
- [ ] Shopping list panel (a Todoist "קניות" project)
- [ ] Touch screen: tap to check off chores
