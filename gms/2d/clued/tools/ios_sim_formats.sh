#!/bin/zsh
# Fresh-load a build in the iOS Simulator's Safari N times and count format-load failures from the debug log.
# Needs: an iOS runtime (xcodebuild -downloadPlatform iOS), a booted device, the local server, and the build served no-store:
#   cd server && go build -o /tmp/clued-dbg .
#   CLUED_ADDR=127.0.0.1:8098 CLUED_DATA=/tmp/dbgdata-sim CLUED_ORIGINS=http://localhost:18091 /tmp/clued-dbg &
#   git archive HEAD gms/2d/clued | tar -x -C $DIR; python3 nostore-server 18091 $DIR   (Cache-Control: no-store)
# Usage: tools/ios_sim_formats.sh <device-udid> <port> [runs]
# 2026-10-20: pre-933878f9 build failed 10/10 (neighbours + flag-map TDZ), HEAD 0/10.
D=$1 PORT=$2 N=${3:-10}
API=$(python3 -c "import urllib.parse;print(urllib.parse.quote('http://127.0.0.1:8098/gms/2d/clued/api',safe=''))")
CLI=(env CLUED_DATA=/tmp/dbgdata-sim /tmp/clued-dbg)
$CLI debuglog on >/dev/null
tag=sim$RANDOM
for i in $(seq 1 $N); do
  xcrun simctl terminate $D com.apple.mobilesafari 2>/dev/null; sleep 1
  xcrun simctl openurl $D "http://localhost:$PORT/gms/2d/clued/?api=$API&run=$tag-$i"; sleep 12
done
out=$($CLI debuglog dump --since 30m --limit 5000)
boots=$(print -r -- "$out" | grep -c "boot .*run=$tag-")
bad=$(print -r -- "$out" | awk -v t="run=$tag-" '/ boot /{s=($0 ~ t)} s && /format failed/{print $2}' | sort -u | wc -l | tr -d ' ')
echo "$boots/$N loads booted, $bad with format failures"
[[ $boots == $N && $bad == 0 ]]
