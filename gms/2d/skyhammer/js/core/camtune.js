// A live slider panel for the climb-and-follow camera. `?camtune=1`, or
// window.__game.camTune.set({...}) from the console. Debug only; never shipped on.

const FIELDS = [
  { k: 'topBand', min: 0.02, max: 0.45, step: 0.01 },
  { k: 'lerpUp', min: 0.5, max: 20, step: 0.1 },
  { k: 'lerpDown', min: 0.2, max: 12, step: 0.1 },
  { k: 'anchorX', min: 0.1, max: 0.8, step: 0.01 },
  { k: 'lookahead', min: 0, max: 1.2, step: 0.01 },
  { k: 'lerpX', min: 0.5, max: 20, step: 0.1 },
  { k: 'baseY', min: -400, max: 200, step: 5 },
];

const ALIAS = { topband: 'topBand', lerpup: 'lerpUp', lerpdown: 'lerpDown', anchorx: 'anchorX', lookahead: 'lookahead', lerpx: 'lerpX', basey: 'baseY' };

/** Applies ?topband=&lerpup=&lerpdown=&anchorx=&lookahead=&lerpx=&basey= to a live world. */
export function applyCamParams(world, params) {
  let n = 0;
  for (const [q, k] of Object.entries(ALIAS)) {
    if (!params.has(q)) continue;
    const v = Number(params.get(q));
    if (Number.isFinite(v)) { world.camTune[k] = v; n++; }
  }
  return n;
}

export function makeCamPanel(getWorld, host) {
  const el = document.createElement('div');
  el.id = 'camtune';
  el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:70;' +
    'background:rgba(12,16,22,.9);border:1px solid #2b3342;border-radius:10px;padding:8px 10px;' +
    'font:11px ui-monospace,monospace;color:#cfd6dd;display:grid;grid-template-columns:auto 130px 46px;' +
    'gap:3px 8px;align-items:center;pointer-events:auto;';
  const outs = [];
  for (const f of FIELDS) {
    const lab = document.createElement('span'); lab.textContent = f.k;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = f.min; inp.max = f.max; inp.step = f.step;
    inp.style.cssText = 'width:130px;accent-color:#ffc46b;';
    const out = document.createElement('span');
    inp.addEventListener('input', () => {
      const w = getWorld(); if (!w) return;
      w.camTune[f.k] = Number(inp.value);
      out.textContent = inp.value;
    });
    el.append(lab, inp, out);
    outs.push({ f, inp, out });
  }
  (host || document.body).appendChild(el);

  // Keep the panel off the steering path.
  let rectFn = null;
  import('../ui/hitrects.js').then((m) => { rectFn = m.register; sync(); }).catch(() => {});

  function sync() {
    const w = getWorld(); if (!w) return;
    for (const { f, inp, out } of outs) { inp.value = w.camTune[f.k]; out.textContent = w.camTune[f.k]; }
    if (rectFn) { const r = el.getBoundingClientRect(); rectFn('camtune', { x: r.left, y: r.top, w: r.width, h: r.height }); }
  }
  sync();
  return { el, sync };
}
