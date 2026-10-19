// Dev panel styles, injected by dev.js (kept out of css/* so a normal boot never ships them).
export const DEV_CSS = `
.vpdev-badge { position: absolute; z-index: 81; left: 0; top: 44%; width: 22px; height: 60px; padding: 0; border: 1px solid #ffe2a0;
  border-left: 0; border-radius: 0 10px 10px 0; writing-mode: vertical-rl; text-orientation: upright; font: 800 11px/1 var(--font-d);
  letter-spacing: .02em; color: #1a0f00; background: linear-gradient(90deg, #ffd986, #dc9a34); box-shadow: 0 2px 10px #0008; opacity: .7;
  cursor: pointer; touch-action: manipulation; }
.vpdev-badge.god { box-shadow: 0 0 0 2px var(--green), 0 2px 10px #0008; }
.vpdev-badge.open { opacity: 1; }
.vpdev { position: absolute; z-index: 80; inset: calc(var(--sat) + 8px) 8px calc(var(--sab) + 8px) 30px; overflow-y: auto; display: none;
  padding: 10px 12px 14px; color: var(--text); font: 600 14px/1.25 var(--font); background: rgba(4, 12, 28, .95);
  border: 1px solid #ffd27a88; border-radius: 10px; box-shadow: 0 10px 40px #000c; -webkit-user-select: none; user-select: none; }
.vpdev.show { display: block; }
.vpdev .top { display: flex; align-items: center; gap: 8px; position: sticky; top: -10px; margin: -10px -12px 4px; padding: 10px 12px;
  background: rgba(4, 12, 28, .98); border-bottom: 1px solid #ffd27a44; }
.vpdev .top b { font: 800 13px var(--font-d); letter-spacing: .14em; color: #ffd27a; }
.vpdev .top small { flex: 1; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vpdev h3 { margin: 12px 0 6px; font: 700 11px/1 var(--font-d); letter-spacing: .16em; color: #ffd27a; text-transform: uppercase; }
.vpdev .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
.vpdev button { min-height: 38px; min-width: 38px; padding: 0 10px; border-radius: 8px; border: 1px solid #2ee6ff55;
  background: #0a1d3d; color: var(--text); font: 700 14px var(--font); letter-spacing: .04em; touch-action: manipulation; cursor: pointer; }
.vpdev button.on { background: #3dffa833; border-color: var(--green); color: #d8ffe9; }
.vpdev button.here { border-color: var(--cyan); box-shadow: inset 0 0 0 1px var(--cyan); }
.vpdev button.done { color: var(--muted); }
.vpdev button.boss { border-color: var(--red); color: #ffb3c1; }
.vpdev button.fantasy { border-color: #8bd16a; color: #d6ffc4; }
.vpdev button.danger { border-color: var(--red); color: #ffb3c1; }
.vpdev .stat { margin-top: 6px; color: var(--text-2); font-size: 12px; font-weight: 500; }
.vpdev .lbl { color: var(--text-2); font-size: 12px; }
.vpdev .curs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
.vpdev label.cur { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-2); text-transform: uppercase; letter-spacing: .08em; }
.vpdev input, .vpdev select { min-height: 36px; padding: 0 8px; border-radius: 6px; border: 1px solid #2ee6ff44; background: #061229;
  color: var(--text); font: 600 15px var(--font); -webkit-user-select: text; user-select: text; }
.vpdev input[type=number] { width: 96px; }
.vpdev select { width: 100%; }
/* landscape (docs/LANDSCAPE.md §5): horizontal badge in the bottom-left corner, two-column panel inset by the notch */
html[data-orient=landscape] .vpdev-badge { top: auto; bottom: calc(var(--sab) + 8px); left: calc(var(--sal) + 8px); width: 64px; height: 28px;
  writing-mode: horizontal-tb; border: 1px solid #ffe2a0; border-radius: 8px; letter-spacing: .3em; opacity: .6; }
html[data-orient=landscape] .vpdev { left: calc(var(--sal) + 8px); right: calc(var(--sar) + 8px); bottom: calc(var(--sab) + 44px); max-width: 960px;
  margin: 0 auto; column-count: 2; column-gap: 20px; }
html[data-orient=landscape] .vpdev .top { column-span: all; }
html[data-orient=landscape] .vpdev h3 { break-after: avoid; }
html[data-orient=landscape] .vpdev .row, html[data-orient=landscape] .vpdev .curs { break-inside: avoid; }
`;
