#!/bin/bash
# tools/engine_arttour.sh <outdir> <prefix> [W H] — the full art-review tour (needs cdp on port 9312). DPR=2 env for retina.
OUT=${1:-.}; P=${2:-art}; W=${3:-915}; H=${4:-412}; cd "$(dirname "$0")/.."
shot() { node tools/engine_shot.mjs "$OUT/${P}_$1.png" "$2" $W $H ${4:-2500} "${3:-}" | head -1 | cut -c1-90 | sed "s/^/$1 /"; }
V='?shot=1&noshell=1'
MOBS="(async()=>{const g=__game.ctx,c=g.camera.position,w=g.world;const ks=['ibis','glitchfuse','reboot','archer','spider','bull','voidlinker','gelcore'];
 ks.forEach((k,i)=>{const x=c.x-4-(i%4)*1.8, z=c.z-3+Math.floor(i/4)*3.2-1.5+(i%4)*0.1; const y=w.surfaceY(Math.floor(x),Math.floor(z)); const m=g.game.mobs.spawn(k,x,y,z); if(m){m.yaw=-Math.PI/2; m.provoked=0;}});
 await new Promise(r=>setTimeout(r,400)); for(const m of g.game.mobs.list){m.yaw=-Math.PI/2;} g.session.paused=true; return g.game.mobs.list.length})()"
for TT in "day:0.3" "dusk:0.73" "night:0.88"; do n=${TT%%:*}; t=${TT##*:}
  shot forest_$n "$V&t=$t&cam=-14,42,10.4,1.57,-0.2"
  shot shore_$n "$V&t=$t&cam=8,39,10,-1.2,-0.3"
  shot plains_$n "$V&t=$t&cam=82,48,412,0.8,-0.25"
  shot desert_$n "$V&t=$t&cam=222,44,333,0.8,-0.25"
  shot mount_$n "$V&t=$t&cam=566,104,26,-2.4,-0.2"
done
shot canopy "$V&t=0.3&cam=-30,60,40,0.9,-0.25"
shot under "$V&t=0.3&cam=24,30.5,12,-1.57,0.1"
shot cave "$V&t=0.3&cam=-58,26.6,-34,1.57,-0.05"
shot outpost "$V&t=0.3&cam=-13,44,-54,0,-0.35"
shot outpost_n "$V&t=0.85&cam=-13,44,-54,0,-0.35"
shot vault "$V&t=0.3&cam=-93,17,-510,0,-0.3"
shot mobs_day "$V&t=0.3&cam=-14,41,10.4,1.57,-0.25" "$MOBS" 1500
shot mobs_night "$V&t=0.88&cam=-14,41,10.4,1.57,-0.25" "$MOBS" 1500
HAND="(async()=>{const g=__game.ctx,i=g.game.inv,it=g.game.items;i.clear();i.add(it.id('ITEM'),1);i.select(0);g.player.pitch=-0.3;return 1})()"
shot hand_block "$V&t=0.3" "${HAND/ITEM/neon_cyan}" 1500
shot hand_tool "$V&t=0.3" "${HAND/ITEM/ferrite_cutter}" 1500
shot hand_food "$V&t=0.3" "${HAND/ITEM/sun_fruit}" 1500
shot hud "?shot=1&t=0.3" "" 3000
