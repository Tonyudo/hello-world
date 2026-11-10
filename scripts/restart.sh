#!/usr/bin/env bash
# Restart MagicMirror (run.sh brings it back up within a few seconds).
pkill -f "electron js/electron.js" || true
