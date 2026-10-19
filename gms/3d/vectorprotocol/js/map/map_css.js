// Styles for the story map + chapter select (injected once; css/* belongs to the ui agent).
const CSS = `
.vpm{position:absolute;inset:0;overflow:hidden;background:#03060e;touch-action:none;user-select:none;-webkit-user-select:none;
  font-family:"Rajdhani","Segoe UI",sans-serif;color:#eaf6ff;--elite:#ff9a3a;--boss:#ff3a62;--gold:#ffd25a}
.vpm *{box-sizing:border-box}
.vpm-bg{position:absolute;inset:0;overflow:hidden}
.vpm-bg::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.vpm-bg img{position:absolute;left:0;top:0;max-width:none;will-change:transform;opacity:0;transition:opacity .6s;filter:saturate(1.08) contrast(1.05)}
.vpm.bg-ready .vpm-bg img,.vpm-bg img[src^="data:"]{opacity:1}
.vpm-shade{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(2,5,14,.88) 0,rgba(2,5,14,.35) 18%,rgba(2,5,14,0) 32%,rgba(2,5,14,0) 70%,rgba(2,5,14,.75) 90%,rgba(2,5,14,.92) 100%),
  radial-gradient(120% 70% at 50% 55%,rgba(0,0,0,0) 55%,rgba(0,0,0,.45) 100%)}
.r-fantasy .vpm-shade{background:linear-gradient(180deg,rgba(6,5,3,.85) 0,rgba(6,5,3,.3) 18%,rgba(0,0,0,0) 32%,rgba(0,0,0,0) 70%,rgba(6,5,3,.7) 90%,rgba(6,5,3,.92) 100%),
  radial-gradient(120% 70% at 50% 55%,rgba(0,0,0,0) 50%,rgba(0,0,0,.5) 100%)}
.vpm-motes{position:absolute;inset:0;pointer-events:none;transform:translateX(var(--mx,0))}
.vpm-motes i{position:absolute;width:3px;height:3px;border-radius:50%;background:var(--a);box-shadow:0 0 6px 1px var(--a);opacity:0;animation:vpmMote 11s linear infinite}
.r-fantasy .vpm-motes i{background:#fff3b0;box-shadow:0 0 8px 2px rgba(220,255,140,.7);width:4px;height:4px}
@keyframes vpmMote{0%{transform:translate(0,30px);opacity:0}15%{opacity:.8}85%{opacity:.6}100%{transform:translate(26px,-120px);opacity:0}}
.vpm-track{position:absolute;left:0;top:0;height:100%;will-change:transform}
.vpm-road{position:absolute;left:0;top:0;overflow:visible}
.vpm-road path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.rd-shadow{stroke:rgba(0,0,0,.5);stroke-width:26}
.rd-base{stroke:rgba(8,18,34,.9);stroke-width:13}
.rd-rail{stroke:var(--a);stroke-width:1.6;stroke-dasharray:1 7;opacity:.55}
.rd-glow{stroke:var(--a);stroke-width:10;opacity:.38}
.rd-core{stroke:#effcff;stroke-width:3}
.rd-todo{stroke:rgba(150,175,210,.4);stroke-width:2.2;stroke-dasharray:5 9}
.r-fantasy .rd-shadow,.r-rift .rd-shadow{stroke:rgba(0,0,0,.55);stroke-width:30}
.r-fantasy .rd-base,.r-rift .rd-base{stroke:#2b251d;stroke-width:22}
.rd-stones{stroke:#6a604c;stroke-width:17}
.rd-stones2{stroke:#4a4234;stroke-width:12;stroke-dasharray:2 7}
.r-fantasy .rd-glow{stroke:#ffd36a;stroke-width:8;opacity:.32}
.r-fantasy .rd-core{stroke:#fff0c4;stroke-width:2.2;opacity:.9}
.r-rift .rd-glow{stroke:var(--a);stroke-width:9;opacity:.42}
.r-rift .rd-core{stroke:#f2e4ff;stroke-width:2.4}
.r-fantasy .rd-todo,.r-rift .rd-todo{stroke:rgba(15,12,8,.55);stroke-width:15;stroke-dasharray:none}
.vpm-nodes{position:absolute;inset:0}
.vpm-node{position:absolute;width:52px;height:52px;margin:0;padding:0;border:0;background:none;cursor:pointer;color:inherit;font:inherit;
  transform:translate(-50%,-50%);-webkit-tap-highlight-color:transparent;--c:var(--a)}
.vpm-node.k-elite{width:58px;height:58px;--c:var(--elite)}
.vpm-node.k-boss{width:76px;height:76px;--c:var(--boss)}
.vpm-node .hex{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  clip-path:polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%);background:var(--c);transition:transform .15s}
.vpm-node .hex::after{content:"";position:absolute;inset:2.5px;clip-path:inherit;background:linear-gradient(180deg,#0c1d33,#050b16);z-index:0}
.vpm-node .hex>*{position:relative;z-index:1}
.vpm-node b{font:800 19px/1 "Orbitron","Rajdhani",sans-serif;color:var(--c);text-shadow:0 0 8px var(--c)}
.vpm-node.k-boss b{font-size:13px;margin-top:2px}
.vpm-node.k-boss .hex{flex-direction:column}
.vpm-node svg{width:20px;height:20px;fill:currentColor}
.vpm-node.k-boss .hex svg{width:28px;height:28px;color:var(--c);filter:drop-shadow(0 0 5px var(--c))}
.vpm-node{filter:drop-shadow(0 0 7px color-mix(in srgb,var(--c) 70%,transparent))}
.vpm-node.s-done .hex::after{background:linear-gradient(180deg,color-mix(in srgb,var(--c) 32%,#06101e),#050b16)}
.vpm-node.s-next .hex{background:#fff}
.vpm-node.s-next .hex::after{background:linear-gradient(180deg,color-mix(in srgb,var(--c) 85%,#fff),color-mix(in srgb,var(--c) 70%,#02040a))}
.vpm-node.s-next b{color:#04101c;text-shadow:none}
.vpm-node.s-next.k-boss .hex svg{color:#14040a;filter:none}
.vpm-node.s-locked{filter:none;--c:#4b5a70}
.vpm-node.s-locked .hex::after{background:linear-gradient(180deg,#0e1520,#070b12);opacity:.92}
.vpm-node.s-locked .hex{color:#6d7d94}
.vpm-node.s-locked b{color:#6d7d94;text-shadow:none}
.vpm-node .ring{position:absolute;inset:-9px;clip-path:polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%);background:var(--c);opacity:0;pointer-events:none;
  -webkit-mask:radial-gradient(closest-side,transparent 82%,#000 84%);mask:radial-gradient(closest-side,transparent 82%,#000 84%)}
.vpm-node.cur .ring{animation:vpmRing 1.8s ease-out infinite}
@keyframes vpmRing{0%{opacity:.9;transform:scale(.85)}100%{opacity:0;transform:scale(1.45)}}
.vpm-node.cur .hex{animation:vpmBob 2.2s ease-in-out infinite}
@keyframes vpmBob{50%{transform:translateY(-3px)}}
.vpm-node .stars{position:absolute;left:50%;top:100%;transform:translate(-50%,2px);display:flex;gap:1px}
.vpm-node .stars i{width:13px;height:13px;color:rgba(160,170,190,.35)}
.vpm-node .stars i svg{width:13px;height:13px;fill:currentColor}
.vpm-node .stars i.on{color:var(--gold);filter:drop-shadow(0 0 3px rgba(255,200,60,.8))}
.vpm-node .stars i:nth-child(2){transform:translateY(3px)}
.vpm-node .tag{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-6px);padding:2px 7px 1px;font:800 10px/1.2 "Orbitron",sans-serif;letter-spacing:.14em;
  color:#04101c;background:var(--c);white-space:nowrap;display:flex;flex-direction:column;align-items:center;clip-path:polygon(6px 0,100% 0,100% 100%,0 100%,0 6px)}
.vpm-node .tag svg{position:absolute;top:100%;width:14px;height:10px;fill:var(--c)}
.vpm-node.cur .tag{animation:vpmBob 2.2s ease-in-out infinite}
.vpm-node .tag.dim{background:none;color:var(--c);padding:0;transform:translate(-50%,-3px);font-size:9px;text-shadow:0 0 6px var(--c);clip-path:none}
.vpm-node.s-locked .tag.dim{color:#7a879b;text-shadow:none}
.vpm-node .nm{position:absolute;left:50%;top:100%;transform:translate(-50%,6px);white-space:nowrap;font:700 13px/1 "Rajdhani",sans-serif;letter-spacing:.06em;
  color:#fff;text-shadow:0 0 6px #000,0 0 10px var(--c);text-transform:uppercase;padding:3px 8px;background:rgba(3,8,18,.7);border-bottom:1.5px solid var(--c)}
.vpm-node.tap .hex{transform:scale(.9)}
.vpm-node.shake{animation:vpmShake .3s}
@keyframes vpmShake{25%{margin-left:-4px}75%{margin-left:4px}}
.vpm-node.pop .hex{animation:vpmPop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes vpmPop{0%{transform:scale(.3)}100%{transform:scale(1)}}
/* fantasy: stone medallions with a gold rim, shield-crest bosses */
.r-fantasy .vpm-node,.r-rift .vpm-node{--c:#e2b85a;--elite:#ff8a3a;--boss:#d8323a}
.r-rift .vpm-node{--c:var(--a)}
.r-fantasy .vpm-node .hex,.r-rift .vpm-node .hex,.r-fantasy .vpm-node .ring,.r-rift .vpm-node .ring{clip-path:circle(48%)}
.r-fantasy .vpm-node.k-boss .hex,.r-rift .vpm-node.k-boss .hex,.r-fantasy .vpm-node.k-boss .ring,.r-rift .vpm-node.k-boss .ring{clip-path:polygon(50% 0,96% 14%,92% 60%,50% 100%,8% 60%,4% 14%)}
.r-fantasy .vpm-node .hex::after,.r-rift .vpm-node .hex::after{inset:3.5px;background:radial-gradient(circle at 40% 35%,#7a7262,#3e382e 60%,#26221b)}
.r-fantasy .vpm-node b,.r-rift .vpm-node b{font:700 20px/1 "Cinzel","Georgia",serif;color:#ffe7a8;text-shadow:0 1px 0 #000,0 0 8px var(--c)}
.r-fantasy .vpm-node.s-next .hex::after,.r-rift .vpm-node.s-next .hex::after{background:radial-gradient(circle at 40% 35%,#fff3c8,var(--c) 55%,#7a5a20)}
.r-fantasy .vpm-node.s-next b,.r-rift .vpm-node.s-next b{color:#2a1a06;text-shadow:0 1px 0 rgba(255,255,255,.4)}
.r-fantasy .vpm-node.s-done .hex::after,.r-rift .vpm-node.s-done .hex::after{background:radial-gradient(circle at 40% 35%,#8a7d62,#4a4232 60%,#2a251c)}
.r-fantasy .vpm-node.s-locked,.r-rift .vpm-node.s-locked{--c:#4a4438}
.r-fantasy .vpm-node.s-locked .hex::after,.r-rift .vpm-node.s-locked .hex::after{background:radial-gradient(circle at 40% 35%,#3a362e,#1e1b16)}
.r-fantasy .vpm-node .tag,.r-rift .vpm-node .tag{font-family:"Cinzel","Georgia",serif;letter-spacing:.1em;clip-path:none;border-radius:2px}
.r-fantasy .vpm-node .nm,.r-rift .vpm-node .nm{font-family:"Cinzel","Georgia",serif;text-transform:none;letter-spacing:.03em;font-size:13px;background:rgba(14,10,4,.72)}
.vpm-head{position:absolute;left:0;right:0;top:0;padding:calc(14px + var(--sat,env(safe-area-inset-top,0px))) 16px 0;display:flex;align-items:flex-start;gap:10px;pointer-events:none}
.vpm-head>*{pointer-events:auto}
.vpm-back{width:44px;height:44px;flex:none;padding:0;border:1.5px solid var(--a);background:rgba(4,12,26,.7);color:var(--a);display:flex;align-items:center;justify-content:center;
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);cursor:pointer}
.vpm-back svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.5}
.vpm-title{flex:1;min-width:0}
.vpm-title .k{font:800 10px/1.2 "Orbitron",sans-serif;letter-spacing:.22em;color:var(--a);text-shadow:0 0 8px var(--a)}
.vpm-title .k span{color:rgba(220,235,255,.55);letter-spacing:.16em}
.vpm-title .n{font:900 24px/1.05 "Orbitron","Rajdhani",sans-serif;letter-spacing:.04em;text-transform:uppercase;margin-top:3px;color:#fff;
  text-shadow:0 0 14px color-mix(in srgb,var(--a) 70%,transparent),0 2px 0 rgba(0,0,0,.6);font-size:clamp(18px,6.2vw,24px);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.r-fantasy .vpm-title .n,.r-rift .vpm-title .n{font-family:"Cinzel","Georgia",serif;font-weight:700;text-transform:none;font-size:26px}
.vpm-prog{text-align:right;flex:none;padding-top:2px}
.vpm-prog .s{display:flex;align-items:center;gap:3px;justify-content:flex-end;font:700 15px/1 "Rajdhani",sans-serif;color:rgba(230,240,255,.75)}
.vpm-prog .s b{color:var(--gold);font-size:18px}
.vpm-prog .s svg{width:16px;height:16px;fill:var(--gold);filter:drop-shadow(0 0 4px rgba(255,200,60,.7))}
.vpm-prog .c{font:700 10px/1.4 "Orbitron",sans-serif;letter-spacing:.12em;color:rgba(200,220,245,.6);margin-top:3px}
.vpm-cta{position:absolute;left:16px;right:16px;bottom:calc(34px + var(--sab,env(safe-area-inset-bottom,0px)));display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;
  background:linear-gradient(90deg,rgba(4,12,26,.88),rgba(4,12,26,.7));border:1px solid color-mix(in srgb,var(--a) 55%,transparent);
  clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)}
.vpm-cta::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--a);box-shadow:0 0 8px var(--a)}
.vpm-cta .i{flex:1;min-width:0;cursor:pointer}
.vpm-cta .k{font:800 9.5px/1.2 "Orbitron",sans-serif;letter-spacing:.18em;color:var(--a)}
.vpm-cta .n{font:700 18px/1.15 "Rajdhani",sans-serif;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vpm-cta .p{font:600 12px/1.2 "Rajdhani",sans-serif;letter-spacing:.1em;color:rgba(200,215,240,.7)}
.vpm-cta .p b{color:#fff}
.vpm-cta .go{flex:none;display:flex;align-items:center;gap:6px;height:46px;padding:0 16px 0 18px;border:0;cursor:pointer;font:900 14px/1 "Orbitron",sans-serif;letter-spacing:.12em;
  color:#03101c;background:linear-gradient(180deg,#fff,var(--a) 60%);box-shadow:0 0 18px -2px var(--a);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
.vpm-cta .go svg{width:14px;height:14px;fill:currentColor}
.vpm-cta .go:active{filter:brightness(1.2);transform:scale(.97)}
.r-fantasy .vpm-cta,.r-rift .vpm-cta{background:linear-gradient(90deg,rgba(20,14,6,.9),rgba(20,14,6,.72));border-color:rgba(226,184,90,.55)}
.r-fantasy .vpm-cta .n,.r-rift .vpm-cta .n{font-family:"Cinzel","Georgia",serif;text-transform:none}
.r-fantasy .vpm-cta .go{color:#2a1a06;background:linear-gradient(180deg,#fff3c8,#e2b85a 60%,#a07a2a);font-family:"Cinzel","Georgia",serif;font-weight:700;box-shadow:none}
.vpm-rail{position:absolute;left:16px;right:16px;bottom:calc(18px + var(--sab,env(safe-area-inset-bottom,0px)));height:4px;background:rgba(120,140,170,.18);pointer-events:none}
.vpm-rail-fill{position:absolute;left:0;top:0;bottom:0;background:var(--a);box-shadow:0 0 8px var(--a);opacity:.75}
.vpm-rail-thumb{position:absolute;top:-4px;bottom:-4px;border:1px solid rgba(230,245,255,.55)}
/* chapter select */
.vpms{position:absolute;inset:0;overflow-y:auto;background:radial-gradient(120% 60% at 50% 0,#0c1c3a,#03060e 70%);font-family:"Rajdhani",sans-serif;color:#eaf6ff;
  padding:calc(18px + var(--sat,env(safe-area-inset-top,0px))) 14px 40px;-webkit-overflow-scrolling:touch}
.vpms *{box-sizing:border-box}
.vpms-head{padding:0 4px 14px}
.vpms-head .k{font:800 10px/1 "Orbitron",sans-serif;letter-spacing:.3em;color:#38e8ff;text-shadow:0 0 8px #38e8ff}
.vpms-head .n{font:900 26px/1.1 "Orbitron",sans-serif;letter-spacing:.06em;margin-top:5px}
.vpms-list{display:flex;flex-direction:column;gap:12px}
.vpms-card{position:relative;display:block;width:100%;height:118px;border:0;padding:0;cursor:pointer;color:inherit;font:inherit;text-align:left;overflow:hidden;background:#060c18;
  clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px);-webkit-tap-highlight-color:transparent}
.vpms-card .ph{position:absolute;inset:0;background:var(--img) center 45%/cover no-repeat,linear-gradient(90deg,#0a1830,#060c18);transition:transform .4s}
.vpms-card .sh{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,6,14,.92) 0,rgba(3,6,14,.55) 55%,rgba(3,6,14,.15));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--a) 70%,transparent)}
.vpms-card.active .sh{box-shadow:inset 0 0 0 2px var(--a),inset 0 0 24px -6px var(--a)}
.vpms-card .no{position:absolute;right:12px;bottom:-14px;font:900 74px/1 "Orbitron",sans-serif;color:transparent;-webkit-text-stroke:1.5px color-mix(in srgb,var(--a) 60%,transparent);opacity:.8}
.vpms-card .tx{position:absolute;left:16px;right:16px;top:16px;bottom:14px;display:flex;flex-direction:column}
.vpms-card .k{font:800 9.5px/1.2 "Orbitron",sans-serif;letter-spacing:.18em;color:var(--a);text-shadow:0 0 6px var(--a)}
.vpms-card .k em{font-style:normal;color:#0b0414;background:var(--a);padding:0 4px;margin-left:4px;text-shadow:none}
.vpms-card .n{font:900 21px/1.15 "Orbitron",sans-serif;letter-spacing:.03em;text-transform:uppercase;margin-top:5px;text-shadow:0 2px 6px #000}
.vpms-card.r-fantasy .n,.vpms-card.r-rift .n{font-family:"Cinzel","Georgia",serif;font-weight:700;text-transform:none;font-size:23px}
.vpms-card .meta{margin-top:auto;display:flex;align-items:center;gap:10px;max-width:72%}
.vpms-card .bar{flex:1;height:4px;background:rgba(150,170,200,.25)}
.vpms-card .bar i{display:block;height:100%;background:var(--a);box-shadow:0 0 6px var(--a)}
.vpms-card .st{display:flex;align-items:center;gap:3px;font-weight:700;font-size:14px;color:#ffd25a}
.vpms-card .st svg{width:14px;height:14px;fill:#ffd25a}
.vpms-card .lk{display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;letter-spacing:.06em;color:#9aa8bc}
.vpms-card .lk svg{width:14px;height:14px;fill:currentColor}
.vpms-card.locked .ph{filter:grayscale(.85) brightness(.45)}
.vpms-card.locked .sh{box-shadow:inset 0 0 0 1px rgba(120,135,160,.4)}
.vpms-card.locked .k,.vpms-card.locked .n{color:#8592a6;text-shadow:none}
.vpms-card.shake{animation:vpmShake .3s}
.vpms-card:active .ph{transform:scale(1.04)}
/* ---- landscape (.wide = container w/h >= 1, .short = also under 400 px tall); portrait rules above stay untouched ---- */
.vpm-slot{display:none}
.vpm.wide .vpm-head{padding:calc(10px + var(--sat,env(safe-area-inset-top,0px))) calc(16px + var(--sar,env(safe-area-inset-right,0px)) + var(--vpm-head-r,0px)) 0 calc(16px + var(--sal,env(safe-area-inset-left,0px)));align-items:center;max-height:calc(64px + var(--sat,env(safe-area-inset-top,0px)))}
.vpm.wide .vpm-title{flex:0 1 auto;max-width:36%}
.vpm.wide .vpm-title .n{display:block;font-size:22px;white-space:nowrap;text-overflow:ellipsis}
.vpm.wide.r-fantasy .vpm-title .n,.vpm.wide.r-rift .vpm-title .n{font-size:23px}
.vpm.wide .vpm-slot{display:flex;flex:1 1 0;min-width:0;align-items:center;justify-content:center}
.vpm.wide .vpm-prog{padding-top:0}
.vpm.wide .vpm-cta{left:50%;right:auto;width:min(760px,calc(100% - 32px - var(--sal,env(safe-area-inset-left,0px)) - var(--sar,env(safe-area-inset-right,0px))));transform:translateX(-50%);
  height:52px;padding:0 6px 0 16px;bottom:calc(30px + var(--sab,env(safe-area-inset-bottom,0px)))}
.vpm.wide .vpm-cta .i{display:flex;align-items:baseline;gap:8px;white-space:nowrap;overflow:hidden}
.vpm.wide .vpm-cta .k{flex:none;font-size:10px}
.vpm.wide .vpm-cta .n{flex:0 1 auto;min-width:0;font-size:17px}
.vpm.wide .vpm-cta .p{flex:none}
.vpm.wide .vpm-cta .n::before,.vpm.wide .vpm-cta .p::before{content:"·";margin-right:8px;color:var(--a);font-weight:800}
.vpm.wide .vpm-cta .go{height:44px}
.vpm.wide .vpm-rail{left:calc(16px + var(--sal,env(safe-area-inset-left,0px)));right:calc(16px + var(--sar,env(safe-area-inset-right,0px)));bottom:calc(14px + var(--sab,env(safe-area-inset-bottom,0px)))}
.vpm.short .vpm-node{width:46px;height:46px}
.vpm.short .vpm-node.k-elite{width:51px;height:51px}
.vpm.short .vpm-node.k-boss{width:67px;height:67px}
.vpm.short .vpm-node b{font-size:17px}
.vpm.short .vpm-node.k-boss b{font-size:11.5px}
.vpm.short .vpm-node svg{width:18px;height:18px}
.vpm.short .vpm-node.k-boss .hex svg{width:25px;height:25px}
.vpm.short .vpm-node .stars i,.vpm.short .vpm-node .stars i svg{width:11.5px;height:11.5px}
.vpm.short .vpm-node .tag{font-size:9px}
.vpm.short .vpm-node .tag.dim{font-size:8px}
.vpm.short .vpm-node .nm{font-size:12px;padding:2px 7px}
.vpms.wide{padding-left:calc(14px + var(--sal,env(safe-area-inset-left,0px)));padding-right:calc(14px + var(--sar,env(safe-area-inset-right,0px)))}
.vpms.wide .vpms-head,.vpms.wide .vpms-list{max-width:1180px;margin-left:auto;margin-right:auto}
.vpms.wide .vpms-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.vpms-more{display:none}
.vpms.wide{scroll-snap-type:y proximity;scroll-padding-top:10px}
.vpms.wide .vpms-card{scroll-snap-align:start}
.vpms.wide .vpms-more{display:flex;position:sticky;bottom:-40px;height:64px;margin:-24px -14px 0;align-items:flex-end;justify-content:center;
  padding-bottom:calc(10px + var(--sab,env(safe-area-inset-bottom,0px)));background:linear-gradient(180deg,rgba(3,6,14,0),rgba(3,6,14,.92) 72%);pointer-events:none;transition:opacity .2s}
.vpms.wide.end .vpms-more{opacity:0}
.vpms.wide.end .vpms-more button{pointer-events:none}
.vpms-more button{pointer-events:auto;display:flex;align-items:center;gap:6px;height:44px;padding:0 16px;border:1px solid rgba(56,232,255,.55);background:rgba(4,12,26,.9);
  color:#bff6ff;font:800 10.5px/1 "Orbitron",sans-serif;letter-spacing:.22em;cursor:pointer;-webkit-tap-highlight-color:transparent;
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);box-shadow:inset 0 0 12px -4px #38e8ff}
.vpms-more svg{width:14px;height:14px;fill:#38e8ff;filter:drop-shadow(0 0 4px #38e8ff);animation:vpmsBob 1.6s ease-in-out infinite}
@keyframes vpmsBob{50%{transform:translateY(2px)}}
.vpms.short .vpms-card{height:96px}
.vpms.short .vpms-card .tx{top:12px;bottom:11px}
.vpms.short .vpms-card .no{font-size:60px;bottom:-11px}
.vpms.short .vpms-card .n{font-size:19px}
.vpms.short .vpms-card.r-fantasy .n,.vpms.short .vpms-card.r-rift .n{font-size:21px}
`;
export function injectMapCss() {
  if (document.getElementById('vp-map-style')) return;
  const s = document.createElement('style'); s.id = 'vp-map-style'; s.textContent = CSS; document.head.appendChild(s);
  if (!document.getElementById('vp-map-font')) {
    const l = document.createElement('link'); l.id = 'vp-map-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap'; document.head.appendChild(l);
  }
}
