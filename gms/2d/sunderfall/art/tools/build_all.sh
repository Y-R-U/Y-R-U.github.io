#!/bin/sh
# Full regeneration from the raw Flux renders. Assumes art/raw/ is populated
# (see art/src/*.json + art/tools/batch.py).
set -e
cd "$(dirname "$0")"
node keyall.js
node build_bg.js
node build_props.js
node build_terrain.js
node build_manifest.js
