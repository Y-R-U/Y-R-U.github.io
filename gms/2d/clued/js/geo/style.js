// Map CSS, injected once. Colours are tokens so formats/themes can override them on .gm.
const CSS = `
.gm{--gm-ocean:#a9d3e7;--gm-ocean2:#cfe8f2;--gm-land:#f6efdc;--gm-edge:#9d8b6c;--gm-ctx:#e7e1d1;--gm-ctx-edge:#c4b89e;
--gm-hover:#fde4a0;--gm-hint:#ffd25e;--gm-ok:#4fb477;--gm-bad:#e5604f;--gm-sel:#79aef7;--gm-grat:rgba(255,255,255,.5);
overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
background:radial-gradient(ellipse at 50% 40%,var(--gm-ocean2),var(--gm-ocean) 75%);border-radius:inherit;contain:strict}
.gm-svg{position:absolute;left:-50%;top:-50%;width:200%;height:200%;transform-origin:25% 25%;display:block}
.gm.live .gm-svg{will-change:transform}
.gm-f,.gm-c{vector-effect:non-scaling-stroke;stroke-linejoin:round}
.gm-f{fill:var(--gm-land);stroke:var(--gm-edge);stroke-width:.7px}
.gm-c{fill:var(--gm-ctx);stroke:var(--gm-ctx-edge);stroke-width:.6px}
.gm-f.off{fill:var(--gm-ctx);stroke:var(--gm-ctx-edge)}
.gm-f.np{fill:#e2dccd;stroke:var(--gm-ctx-edge);stroke-dasharray:2 2}
.gm-marine .gm-f{fill:rgba(255,255,255,0);stroke:none}
.gm-marine .gm-f[class*=is-]{stroke:rgba(40,90,120,.5);stroke-width:1px}
.gm-grat{fill:none;stroke:var(--gm-grat);stroke-width:.6px;vector-effect:non-scaling-stroke}
.gm-sphere{fill:none;stroke:rgba(60,110,140,.35);stroke-width:1px;vector-effect:non-scaling-stroke}
.gm-inset{fill:rgba(255,255,255,.18);stroke:rgba(60,110,140,.45);stroke-width:1px;vector-effect:non-scaling-stroke;stroke-dasharray:4 3}
.gm-dot{fill:var(--gm-land);stroke:var(--gm-edge);stroke-width:1.3px;vector-effect:non-scaling-stroke}
.gm-dot.hide{display:none}
@media (hover:hover){.gm:not(.locked) .gm-f.on:hover,.gm:not(.locked) .gm-dot.on:hover{fill:var(--gm-hover)}
.gm:not(.locked) .gm-marine .gm-f.on:hover{fill:rgba(255,255,255,.35)}}
.gm .is-sel{fill:var(--gm-sel)!important}
.gm .is-hint{fill:var(--gm-hint)!important}
.gm .is-target{fill:var(--gm-hint)!important;stroke:#a07400!important;stroke-width:1.4px}
.gm .is-correct{fill:var(--gm-ok)!important;stroke:#21733f!important;stroke-width:1.2px}
.gm .is-wrong{fill:var(--gm-bad)!important;stroke:#8f2418!important;stroke-width:1.2px}
.gm .is-soft{fill:#bfe3c8!important}
.gm .is-pulse{animation:gm-pulse 1s ease-in-out infinite alternate}
.gm-marine .is-correct{fill:rgba(79,180,119,.55)!important}.gm-marine .is-wrong{fill:rgba(229,96,79,.5)!important}
.gm-marine .is-target{fill:rgba(255,210,94,.6)!important}
@keyframes gm-pulse{from{opacity:1}to{opacity:.55}}
.gm-lbl{font:700 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;fill:#2b2418;stroke:#fffaf0;stroke-width:3.5px;paint-order:stroke;stroke-linejoin:round;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
.gm-lbl.sea{fill:#1f5671;font-style:italic;font-weight:600}
.gm-line{fill:none;stroke:#2b2418;stroke-width:2px;stroke-dasharray:6 5;vector-effect:non-scaling-stroke}
.gm-mk{cursor:pointer}
.gm-mk .mk-dot{fill:#fff;stroke:#2b2418;stroke-width:2.5px}
.gm-mk.ok .mk-dot{fill:var(--gm-ok)}.gm-mk.bad .mk-dot{fill:var(--gm-bad)}.gm-mk.sel .mk-dot{fill:var(--gm-sel)}
.gm-mk.dim{opacity:.45}
.gm-mk .mk-pin{fill:var(--gm-bad);stroke:#fff;stroke-width:1.5px}
.gm-mk.true .mk-pin{fill:var(--gm-ok)}
.gm-mk .mk-star{fill:#ffcf33;stroke:#6b4a00;stroke-width:1.5px}
.gm-mk text{font:700 12px system-ui,sans-serif;fill:#2b2418;stroke:#fff;stroke-width:3px;paint-order:stroke;pointer-events:none}
.gm-ui{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;z-index:2}
.gm-ui button{width:40px;height:40px;border-radius:12px;border:0;background:rgba(255,255,255,.92);color:#2b2418;font:600 22px/1 system-ui,sans-serif;
box-shadow:0 1px 4px rgba(0,0,0,.18);cursor:pointer;display:grid;place-items:center;padding:0}
.gm-ui button:active{transform:scale(.94)}
.gm-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(30,30,30,.82);color:#fff;font:600 14px system-ui,sans-serif;
padding:8px 14px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .2s;z-index:3;white-space:nowrap}
.gm-toast.show{opacity:1}
.gm-load{position:absolute;inset:0;display:grid;place-items:center;font:600 14px system-ui,sans-serif;color:#30586c}
.gm.big .gm-dot{stroke-width:2px}
`;

export function injectStyle() {
  if (document.getElementById('gm-style')) return;
  const s = document.createElement('style');
  s.id = 'gm-style';
  s.textContent = CSS;
  document.head.append(s);
}

export const POLITICAL = ['#f3e2b0', '#d5e8bd', '#f5d0c2', '#d3e0f0', '#e7d8ef', '#f9eac0'];
export const CONTINENT_FILL = { AF: '#f5b46e', AS: '#ee9283', EU: '#a99be6', NA: '#7cc896', SA: '#f1d264', OC: '#f0a3cc', AN: '#f4f4f4' };
