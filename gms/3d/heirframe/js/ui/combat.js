import { h, esc, clamp, onTap, haptic, centerBanner } from './core.js';
import { icon } from './icons.js';

export function createCombat(bus, root) {
  const el = h('div.hf-combat.hf-layer');

  // boss bar
  const boss = h('div.hf-boss', {
    html: `<div class="bb-name"><span class="bb-t"></span><b class="bb-n"></b></div>
    <div class="bb-bar"><i class="lag"></i><i class="fill"></i><i class="sh"></i><div class="bb-ph"></div></div>
    <div class="bb-sub"><span class="bb-phase"></span><span class="bb-pct hf-num"></span></div>`,
  });
  const bs = {};
  const bq = s => boss.querySelector(s);
  function bossSet(o = {}) {
    Object.assign(bs, o);
    if ('max' in o) bs.hpMax = o.max;
    if (!boss.classList.contains('on')) {
      boss.classList.add('on'); root.classList.add('hf-boss-on'); bus.emit('_restack');
      boss.classList.remove('intro'); void boss.offsetWidth; boss.classList.add('intro');
    }
    if ('name' in o) bq('.bb-n').textContent = bs.name || '';
    if ('title' in o) bq('.bb-t').textContent = bs.title || '';
    const f = bs.hpMax ? clamp(bs.hp / bs.hpMax, 0, 1) : 0;
    const prev = bs._f ?? 1;
    const lag = bq('.lag');
    lag.style.transition = f < prev ? '' : 'none';
    boss.style.setProperty('--f', f);
    if (f < prev - .001) { boss.classList.remove('hit'); void boss.offsetWidth; boss.classList.add('hit'); }
    bs._f = f;
    boss.style.setProperty('--s', bs.shieldMax ? clamp((bs.shield || 0) / bs.shieldMax, 0, 1) : 0);
    bq('.bb-pct').textContent = `${Math.ceil(f * 100)}%`;
    if ('phases' in o) {
      const ph = Array.isArray(bs.phases) ? bs.phases : Array.from({ length: Math.max(0, (bs.phases || 1) - 1) }, (_, i) => 1 - (i + 1) / bs.phases);
      bq('.bb-ph').innerHTML = ph.map(t => `<i style="left:${t * 100}%"></i>`).join('');
      bs._nph = ph.length + 1;
    }
    const n = bs._nph || 1;
    bq('.bb-phase').textContent = n > 1 ? `Phase ${bs.phase || 1} / ${n}` : (bs.rank || '');
    if ('phase' in o && o.phase !== bs._lastPhase && bs._lastPhase != null) { boss.classList.remove('phase'); void boss.offsetWidth; boss.classList.add('phase'); }
    bs._lastPhase = bs.phase;
    boss.classList.toggle('enraged', !!bs.enraged);
  }
  function bossHide() { boss.classList.remove('on'); root.classList.remove('hf-boss-on'); for (const k in bs) delete bs[k]; bus.emit('_restack'); }

  // detection
  const detWrap = h('div.hf-det');
  const detStatus = h('div.hf-detstat', { html: `<span class="ds-eye">${icon('eye')}</span><b></b>` });
  const observers = new Map();
  let statusOverride = null;
  function detSet(id, x, y, amount, o = {}) {
    let v = amount > 1 ? amount / 100 : amount;
    v = clamp(v || 0, 0, 1);
    let n = observers.get(id);
    if (!n) {
      n = { el: h('div.hf-dobs', { html: `<svg viewBox="0 0 40 24"><path class="bg" d="M4 22A16 16 0 0 1 36 22"/><path class="fg" d="M4 22A16 16 0 0 1 36 22" pathLength="100"/></svg><span class="de">${icon('eye')}</span><b>!</b><i class="arr">${icon('arrow')}</i>` }) };
      observers.set(id, n); detWrap.append(n.el);
    }
    n.v = v;
    const state = o.state || (v >= 1 ? 'alert' : v > 0 ? 'suspicious' : 'idle');
    n.el.className = `hf-dobs ${state}`;
    n.el.style.setProperty('--v', v);
    const W = innerWidth, H = innerHeight;
    const on = o.onScreen !== false && x > 20 && x < W - 20 && y > 30 && y < H - 20;
    n.el.classList.toggle('edge', !on);
    let px = x, py = y;
    if (!on) {
      const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy;
      const s = Math.min((W / 2 - 50) / Math.max(1e-3, Math.abs(dx)), (H / 2 - 50) / Math.max(1e-3, Math.abs(dy)));
      px = cx + dx * s; py = cy + dy * s;
      // keep edge pips out of the HUD corners (vitals, minimap, joystick, action buttons)
      if (Math.abs(px - cx) >= W / 2 - 51) py = clamp(py, H * .44, H * .62);
      else px = clamp(px, W * .3, W * .7);
      n.el.querySelector('.arr').style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    }
    n.el.style.transform = `translate(${px}px, ${py}px)`;
    refreshStatus();
  }
  function detClear(id) {
    if (id == null) { for (const n of observers.values()) n.el.remove(); observers.clear(); }
    else { observers.get(id)?.el.remove(); observers.delete(id); }
    refreshStatus();
  }
  function refreshStatus() {
    let max = 0;
    for (const n of observers.values()) max = Math.max(max, n.v);
    const st = statusOverride || (max >= 1 ? 'alert' : max > 0 ? 'suspicious' : null);
    const was = detStatus.classList.contains('on');
    detStatus.className = `hf-detstat ${st || ''} ${st ? 'on' : ''}`;
    if (was !== !!st) bus.emit('_restack');
    detStatus.style.setProperty('--v', max);
    detStatus.querySelector('b').textContent = { hidden: 'Hidden', suspicious: 'Suspicious', alert: 'Alert', search: 'Searching' }[st] || '';
  }

  // lens (surveillance / photo)
  const lens = h('div.hf-lens', {
    html: `<div class="ln-vig"></div><div class="ln-grid"></div>
    <div class="ln-frame"><i></i><i></i><i></i><i></i></div>
    <div class="ln-top"><span class="ln-rec"><i></i>REC</span><span class="ln-label"></span><span class="ln-count hf-num"></span></div>
    <div class="ln-side hf-num"><span>ZOOM</span><b>4.0×</b><span>ISO</span><b>200</b><span>RNG</span><b class="ln-rng">—</b></div>
    <div class="ln-ret"><i></i></div>
    <div class="ln-tgt"><svg viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="27"/><circle class="fg" cx="30" cy="30" r="27" pathLength="100"/></svg><i></i><i></i><i></i><i></i><b></b></div>
    <div class="ln-flash"></div><div class="ln-stamp">Captured</div>
    <button class="ln-x hf-ibtn hf-live" aria-label="Close lens">${icon('close')}</button>
    <button class="ln-shoot hf-live" aria-label="Capture"><span>${icon('camera')}</span></button>`,
  });
  const lq = s => lens.querySelector(s);
  onTap(lq('.ln-x'), () => { bus.emit('sfx', 'click'); bus.emit('lens:close'); });
  lq('.ln-shoot').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); haptic(15); bus.emit('lens:capture'); });
  const lensApi = {
    show(o = {}) {
      lq('.ln-label').textContent = o.label || 'Surveillance';
      lq('.ln-count').textContent = o.count || '';
      lens.classList.add('on'); root.classList.add('hf-in-lens');
      bus.emit('sfx', 'open');
    },
    hide() { lens.classList.remove('on', 'has-tgt', 'locked'); root.classList.remove('hf-in-lens'); },
    target(sx, sy, size = 90, o = {}) {
      if (sx == null) { lens.classList.remove('has-tgt'); return; }
      const t = lq('.ln-tgt');
      lens.classList.add('has-tgt');
      t.style.transform = `translate(${sx}px, ${sy}px)`;
      t.style.setProperty('--sz', `${size}px`);
      t.querySelector('b').textContent = o.label || '';
      if (o.dist != null) lq('.ln-rng').textContent = `${Math.round(o.dist)}m`;
      lens.classList.toggle('locked', !!o.locked);
    },
    progress(p) { lens.style.setProperty('--lp', clamp(p, 0, 1)); lens.classList.toggle('locked', p >= 1); },
    count(txt) { lq('.ln-count').textContent = txt; },
    flash(label = 'Captured') {
      lq('.ln-stamp').textContent = label;
      lens.classList.remove('shot'); void lens.offsetWidth; lens.classList.add('shot');
      bus.emit('sfx', 'confirm');
    },
    get open() { return lens.classList.contains('on'); },
  };

  // distance band (tail missions)
  const band = h('div.hf-band', { html: '<div class="bd-l"><span></span><b class="hf-num"></b></div><div class="bd-t"><i class="close"></i><i class="ok"></i><i class="far"></i><em></em></div><div class="bd-w"></div>' });
  function bandSet(o) {
    const { value, min = 0, max = 30, lo = 5, hi = 22 } = o;
    const pos = v => clamp((v - min) / (max - min), 0, 1) * 100;
    if (!band.classList.contains('on')) { band.classList.add('on'); bus.emit('_restack'); }
    band.style.setProperty('--lo', `${pos(lo)}%`); band.style.setProperty('--hi', `${pos(hi)}%`); band.style.setProperty('--x', `${pos(value)}%`);
    band.querySelector('.bd-l span').textContent = o.label || 'Target distance';
    band.querySelector('.bd-l b').textContent = `${Math.round(value)}m`;
    const zone = value < lo ? 'close' : value > hi ? 'far' : 'ok';
    band.dataset.zone = zone;
    band.querySelector('.bd-w').textContent = o.warn || (zone === 'close' ? 'Too close' : zone === 'far' ? 'Losing target' : '');
  }

  // sting (twist / level / alert banners)
  const sting = h('div.hf-sting');
  function stingShow(title, sub = '', kind = 'twist', ms = 3200) { centerBanner(() => stingNow(title, sub, kind, ms), ms + 100); }
  function stingNow(title, sub, kind, ms) {
    const kick = { twist: 'Twist', level: 'Level up', alert: 'Warning', story: 'Story', unlock: 'Unlocked' }[kind] || kind;
    sting.innerHTML = `<div class="sg ${esc(kind)}"><div class="sg-k">${esc(kick)}</div><div class="sg-t">${esc(title)}</div>${sub ? `<div class="sg-s">${esc(sub)}</div>` : ''}</div>`;
    sting.classList.remove('show'); void sting.offsetWidth; sting.classList.add('show');
    clearTimeout(stingShow.t); stingShow.t = setTimeout(() => sting.classList.remove('show'), ms);
    bus.emit('sfx', kind === 'level' ? 'levelup' : 'toast');
  }

  el.append(detWrap, boss, detStatus, band, sting, lens);

  return {
    el,
    boss: { set: bossSet, show: bossSet, hide: bossHide },
    detect: { set: detSet, clear: detClear, status(s) { statusOverride = s || null; refreshStatus(); } },
    lens: lensApi,
    band: { set: bandSet, hide() { band.classList.remove('on'); bus.emit('_restack'); } },
    sting: stingShow,
  };
}
