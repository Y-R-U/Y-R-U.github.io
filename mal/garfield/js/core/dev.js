// ?dev=1 overlay: fps, draw calls, triangles, Garfield pos, state, lanes; a few quick buttons.
export function createDev(sys, game) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:140px;z-index:400;font:10px/1.3 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.5);padding:4px 6px;border-radius:8px;pointer-events:none;white-space:pre;max-width:44vw;opacity:.85';
  const txt = document.createElement('div');
  const btns = document.createElement('div');
  btns.style.cssText = 'margin-top:4px;display:flex;flex-wrap:wrap;gap:3px';
  const b = (label, fn) => { const x = document.createElement('button'); x.textContent = label; x.style.cssText = 'font:10px monospace;padding:1px 4px;pointer-events:auto'; x.onclick = fn; btns.appendChild(x); };
  b('skip', () => sys.director.skip());
  b('win', () => game.win());
  b('menu', () => game.menu());
  for (let n = 1; n <= 10; n++) b('L' + n, () => game.startLevel(n));
  b('belly+', () => sys.controller.setBelly(sys.controller.belly + 0.15));
  el.append(txt, btns);
  document.body.appendChild(el);
  let t = 0;
  return {
    update(dt, fps) {
      if ((t += dt) < 0.25) return;
      t = 0;
      const i = sys.R.renderer.info, p = sys.garfield.root.position, c = sys.controller;
      txt.textContent =
        `${fps.toFixed(0)} fps  q=${sys.R.quality}  dpr=${sys.R.renderer.getPixelRatio().toFixed(2)}\n` +
        `calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(1)}k  geo ${i.memory.geometries}  tex ${i.memory.textures}\n` +
        `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  ${c.grounded ? 'gnd' : 'air'} ${c.surfaceId || ''}  v ${c.speed.toFixed(2)}\n` +
        `state ${game.state}${game.paused ? ' (paused)' : ''}${sys.director.active ? ' [cutscene]' : ''}  L${game.levelN}  belly ${c.belly.toFixed(2)}\n` +
        `interact ${sys.interact.current?.id || '-'}  scratch ${sys.scratch.lastHit ? (sys.scratch.lastHit.hit || 'miss') + ':' + (sys.scratch.lastHit.zone || sys.scratch.lastHit.propId || '') : '-'}\n` +
        Object.entries(sys.lanes).map(([k, v]) => `${k}: ${v.slice(0, 48)}`).join("\n");
    },
  };
}
