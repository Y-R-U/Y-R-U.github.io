#!/bin/bash
# tools/engine_tour.sh <outdir> [prefix] — the art-review views at 915x412 (needs cdp on port 9312)
OUT=${1:-.}; P=${2:-tour}; cd "$(dirname "$0")/.."
shot() { node tools/engine_shot.mjs "$OUT/${P}_$1.png" "?shot=1&noshell=1&$2" 915 412 ${3:-2500} | head -1 | sed "s/^/$1 /"; }
shot forest   "t=0.3&cam=-14,42,10.4,1.57,-0.2"
shot shore    "t=0.25&cam=8,39,10,-1.2,-0.3"
shot plains    "t=0.3&cam=82,48,412,0.8,-0.25"
shot desert    "t=0.35&cam=222,44,333,0.8,-0.25"
shot mountains "t=0.3&cam=566,104,26,-2.4,-0.2"
shot cave     "t=0.3&cam=-58,26.6,-34,1.57,-0.05"
shot night    "t=0.88&cam=-14,42,10.4,1.57,-0.2"
shot close    "t=0.3&cam=-15.2,43.3,12.7,1.2,-0.55"
