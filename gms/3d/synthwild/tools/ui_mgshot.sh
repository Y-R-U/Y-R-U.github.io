#!/bin/bash
# tools/ui_mgshot.sh <game> <out.png> [waitAfterStartMs] [extra-js]  — starts a mini-game from the real title and screenshots it.
cd "$(dirname "$0")/.." && POST_WAIT=${POST_WAIT:-800} DPR=${DPR:-1} node tools/ui_shot.mjs "http://localhost:8861/gms/3d/synthwild/?q=low" "$2" ${SIZE:-915x412} 9000 \
"(async()=>{const s=JSON.parse(localStorage.getItem('synthwild.settings')||'{}');s.introSeen=true;localStorage.setItem('synthwild.settings',JSON.stringify(s));
const u=__game.ctx.ui; u.shell.playMinigame('$1'); await new Promise(r=>setTimeout(r,${3:-9000})); ${4:-}
const r=u.shell.state; const m=window.__game.ctx; return [r, m.session.mode, m.player.pos.toArray().map(v=>+v.toFixed(1))]})()"
