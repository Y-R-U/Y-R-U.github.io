/**
 * The review panel. `?debug`, or Backquote on a keyboard.
 *
 * It is a feedback instrument, not a cheat menu: everything it shows is read
 * off `window.__state`, which is the same snapshot the gates assert on, so a
 * number that looks wrong here is wrong in the gate too. It never blocks the
 * world and it never opens a modal.
 */

const CSS = `
.kh-dbg{position:fixed;left:0;bottom:0;z-index:60;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#d8d2c2;-webkit-user-select:none;user-select:none;pointer-events:none}
.kh-dbg[hidden]{display:none}
.kh-dbg *{pointer-events:auto;box-sizing:border-box}
.kh-dbg-tab{display:block;margin:0 0 6px 6px;padding:6px 10px;border:1px solid #5a4b30;border-radius:3px;
  background:rgba(14,13,10,.86);color:#e0b96a;font:inherit;letter-spacing:.14em;cursor:pointer}
.kh-dbg-panel{margin:0 0 6px 6px;width:min(320px,calc(100vw - 12px));max-height:min(62vh,520px);overflow-y:auto;
  padding:9px 10px;border:1px solid #5a4b30;border-radius:3px;background:rgba(11,10,8,.95);white-space:pre-wrap}
.kh-dbg-panel[hidden]{display:none}
.kh-dbg-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.kh-dbg button{padding:5px 8px;border:1px solid #3f3a2c;border-radius:2px;background:#1b1913;color:#d8d2c2;
  font:inherit;cursor:pointer;min-height:28px}
.kh-dbg button:hover{border-color:#e0b96a;color:#fff}
.kh-dbg b{color:#e0b96a;font-weight:400}
`;

export function createDebug(ctx) {
  const q = new URLSearchParams(location.search);
  let on = q.has('debug');

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'kh-dbg';
  root.hidden = !on;
  const tab = document.createElement('button');
  tab.className = 'kh-dbg-tab';
  tab.textContent = 'DEBUG';
  const panel = document.createElement('div');
  panel.className = 'kh-dbg-panel';
  panel.hidden = true;
  const rows = document.createElement('div');
  rows.className = 'kh-dbg-row';
  panel.appendChild(rows);
  root.appendChild(tab);
  root.appendChild(panel);
  (document.getElementById('ui') || document.body).appendChild(root);

  const text = document.createElement('div');
  panel.insertBefore(text, rows);

  tab.onclick = () => { panel.hidden = !panel.hidden; };

  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    rows.appendChild(b);
    return b;
  };

  btn('bias', () => {
    const order = ['tight', 'normal', 'wide'];
    const next = order[(order.indexOf(ctx.cam.bias) + 1) % 3];
    ctx.cam.setBias(next);
    ctx.save.data.settings.zoomBias = next;
    ctx.save.write();
  });
  btn('punch', () => ctx.cam.punch(0.04));
  btn('rotate', () => {
    // what the orientation gate does, by hand
    const el = document.getElementById('stage');
    if (!el) return;
    const p = el.style.width === '844px';
    el.style.width = p ? '390px' : '844px';
    el.style.height = p ? '844px' : '390px';
    ctx.view.refresh();
  });
  btn('low', () => ctx.quality.set(!ctx.quality.low));
  btn('reset save', () => { ctx.save.reset(); ctx.save.write(); });
  btn('copy state', () => {
    try { navigator.clipboard.writeText(JSON.stringify(window.__state, null, 1)); } catch { /* no clipboard */ }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    on = !on;
    root.hidden = !on;
  });

  const dbg = {
    get visible() { return on; },
    show(v) { on = !!v; root.hidden = !on; },
    render() {
      if (!on || panel.hidden) return;
      const s = window.__state;
      if (!s) return;
      const c = ctx.cam;
      text.innerHTML =
        `<b>tick</b> ${s.tick}  <b>fps</b> ${s.fps.toFixed(1)}  <b>ms</b> ${s.frameMs.toFixed(1)}\n` +
        `<b>draws</b> ${s.drawCalls}  <b>spr</b> ${s.sprites}  <b>lit</b> ${s.lights}  <b>par</b> ${s.particles}\n` +
        `<b>view</b> ${s.view.mode} ${s.view.w}x${s.view.h}@${s.view.dpr} worldW ${s.view.worldW.toFixed(1)}\n` +
        `<b>zoom</b> ${c.zoom.toFixed(4)} <- ${c.zoomTarget.toFixed(4)} (${c.zoomReason}) bias ${c.bias}\n` +
        `<b>box</b> ${c.box.w.toFixed(0)} x ${c.box.h.toFixed(0)} wu, ${c.memberCount} member(s)\n` +
        `<b>dwell</b> ${c.dwell.toFixed(2)} granted ${c.granted} nearest ${Number.isFinite(c.nearestHostile) ? c.nearestHostile.toFixed(0) : '-'}\n` +
        `<b>cam</b> ${c.x.toFixed(0)}, ${c.y.toFixed(0)}   <b>band</b> ${s.player.band} ${s.player.altFt.toFixed(0)} ft\n` +
        `<b>axis</b> ${ctx.input.axisX.toFixed(2)}, ${ctx.input.axisY.toFixed(2)}  stickR ${ctx.input.stickRadius().toFixed(1)}px\n` +
        `<b>audio</b> ready ${!!ctx.audio.ready} available ${!!ctx.audio.available}\n` +
        (s.errors.length ? `<b>errors</b> ${s.errors.length}: ${s.errors[s.errors.length - 1]}\n` : '');
    },
  };
  return dbg;
}
