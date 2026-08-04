#!/bin/bash
# Overnight scare + death generation for both hub-video horror games.
# Awake first, then The Horrors, so an interrupted run still leaves one
# game with complete coverage.
cd "$(dirname "$0")"
echo "=== batch start $(date) ==="
for game in awake the_horrors; do
  echo "=== $game $(date) ==="
  (cd "$game" && python3 gen_scares.py "$@")
done
echo "=== batch done $(date) ==="
