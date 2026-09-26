import { h, fmt, fmtTime, clamp, onTap, haptic } from './core.js';
import { icon } from './icons.js';
import { bindFullscreen } from './fullscreen.js';
import { framePortrait } from './portrait.js';

const KIND_LABEL = { rental: 'Rental', brawler: 'Brawler', gunner: 'Gunner', ghost: 'Ghost' };

export function createHud(bus) {
  const el = h('div.hf-hud.hf-layer');
  el.innerHTML = `
  <div class="hf-vignette"></div>
  <div class="hf-tl">
    <div class="hf-vitals">
      <button class="hf-pchip hf-live" aria-label="Warehouse">
        <div class="hf-hex"><div class="hf-hex-in"></div></div>
        <div class="hf-lvl hf-num"><span>1</span></div>
      </button>
      <div class="hf-vbars">
        <div class="hf-vname"><span class="n">&nbsp;</span><span class="k hf-chip off"></span></div>
        <div class="hf-bar sh none"><i class="lag"></i><i class="fill"></i></div>
        <div class="hf-bar hp"><i class="lag"></i><i class="fill"></i><b class="v hf-num"></b></div>
        <div class="hf-bar en"><i class="fill"></i><b class="v hf-num"></b></div>
        <div class="hf-xp"><i class="fill"></i><span class="hf-num"></span></div>
      </div>
    </div>
    <div class="hf-buffs"></div>
    <div class="hf-tracker hf-glass hf-live off">
      <div class="hd"><span class="hf-label">${icon('contracts')}Contract</span><span class="tm hf-num"></span></div>
      <div class="tt"></div>
      <div class="ob"><i></i><span class="ot"></span><em class="hf-num"></em></div>
      <div class="pg"><i></i></div>
    </div>
    <div class="hf-goal off">${icon('star')}<span></span><i class="gp"></i></div>
  </div>
  <div class="hf-tc">
    <div class="hf-heat"><div class="pips">${'<i><b></b></i>'.repeat(5)}</div><span class="hf-label">${icon('heat')}<span class="hl">Heat</span></span></div>
  </div>
  <div class="hf-tr">
    <div class="hf-trcol">
      <div class="hf-menu">
        <button class="hf-ibtn hf-live" data-evt="codex" aria-label="Codex">${icon('codex')}<span class="hf-badge"></span></button>
        <button class="hf-ibtn hf-live" data-evt="warehouse" aria-label="Warehouse">${icon('warehouse')}<span class="hf-badge"></span></button>
        <button class="hf-ibtn hf-live" data-evt="contracts" aria-label="Contracts">${icon('contracts')}<span class="hf-badge"></span></button>
        <button class="hf-ibtn hf-live hf-fs" aria-label="Fullscreen">${icon('fs_enter')}</button>
        <button class="hf-ibtn hf-live" data-evt="pause" aria-label="Pause">${icon('pause')}</button>
      </div>
      <div class="hf-credits"><span class="ci">${icon('credits')}</span><span class="cv hf-num hf-gold-text">0</span></div>
      <div class="hf-surch off"><span>HireFrame surcharge</span><b class="hf-num"></b></div>
    </div>
    <div class="hf-mapwrap">
      <div class="hf-map">
        <canvas></canvas>
        <div class="ring"></div>
        <div class="compass"><b>N</b></div>
        <div class="me"></div>
      </div>
      <div class="hf-district"></div>
    </div>
  </div>`;

  const $ = s => el.querySelector(s);
  const r = {
    hexIn: $('.hf-hex-in'), lvl: $('.hf-lvl span'), name: $('.hf-vname .n'), kind: $('.hf-vname .k'),
    sh: $('.hf-bar.sh'), hp: $('.hf-bar.hp'), en: $('.hf-bar.en'), xp: $('.hf-xp'),
    hpV: $('.hf-bar.hp .v'), enV: $('.hf-bar.en .v'), xpV: $('.hf-xp span'),
    buffs: $('.hf-buffs'), tracker: $('.hf-tracker'), tTitle: $('.hf-tracker .tt'), tObj: $('.hf-tracker .ot'),
    tCount: $('.hf-tracker em'), tTime: $('.hf-tracker .tm'), tPg: $('.hf-tracker .pg i'),
    heat: $('.hf-heat'), pips: [...el.querySelectorAll('.hf-heat .pips i')], heatLbl: $('.hf-heat .hl'),
    credits: $('.hf-credits'), cv: $('.hf-credits .cv'), map: $('.hf-map'), canvas: $('.hf-map canvas'),
    compass: $('.hf-map .compass'), district: $('.hf-district'), vig: $('.hf-vignette'),
    goal: $('.hf-goal'), goalT: $('.hf-goal span'), surch: $('.hf-surch'), surchV: $('.hf-surch b'),
  };

  el.querySelectorAll('[data-evt]').forEach(b => onTap(b, () => { haptic(); bus.emit('sfx', 'click'); bus.emit(b.dataset.evt); }));
  onTap($('.hf-pchip'), () => { haptic(); bus.emit('sfx', 'click'); bus.emit('warehouse'); });
  bindFullscreen($('.hf-fs'), bus);
  onTap(r.tracker, () => { r.tracker.classList.toggle('min'); bus.emit('sfx', 'click'); });

  const s = {};
  let creditsShown = 0, creditsAnim = 0, prevLevel = null;

  function bar(node, v, max, prev) {
    const f = max > 0 ? clamp(v / max, 0, 1) : 0;
    node.style.setProperty('--f', f);
    const lag = node.querySelector('.lag');
    if (lag) {
      if (prev != null && f < prev) lag.style.transition = '';
      else lag.style.transition = 'none';
      lag.style.setProperty('--f', f);
    }
    return f;
  }

  const fr = { hp: null, sh: null };

  function setCredits(v) {
    const from = creditsShown, to = v, t0 = performance.now();
    cancelAnimationFrame(creditsAnim);
    if (to > from && from > 0) {
      const pop = h('span.hf-cpop.hf-num', { text: `+${fmt(to - from)}` });
      r.credits.append(pop);
      setTimeout(() => pop.remove(), 1200);
      r.credits.classList.remove('bump'); void r.credits.offsetWidth; r.credits.classList.add('bump');
    }
    const step = now => {
      const k = Math.min(1, (now - t0) / 650), e = 1 - (1 - k) ** 3;
      creditsShown = from + (to - from) * e;
      r.cv.textContent = fmt(creditsShown);
      if (k < 1) creditsAnim = requestAnimationFrame(step);
    };
    if (from === 0) { creditsShown = to; r.cv.textContent = fmt(to); } else creditsAnim = requestAnimationFrame(step);
  }

  const buffEls = new Map();
  function setBuffs(list) {
    const seen = new Set();
    for (const b of list || []) {
      seen.add(b.id);
      let n = buffEls.get(b.id);
      if (!n) {
        n = h('div.hf-buff', { class: b.kind === 'debuff' ? 'debuff' : '', html: `${icon(b.icon || 'sparkle')}<i></i><b class="hf-num"></b>` });
        buffEls.set(b.id, n); r.buffs.append(n);
      }
      n.style.setProperty('--p', b.tMax ? clamp(1 - b.t / b.tMax, 0, 1) : 0);
      n.querySelector('b').textContent = b.stacks > 1 ? b.stacks : (b.t != null ? Math.ceil(b.t) : '');
      n.classList.toggle('ending', b.t != null && b.t < 3);
    }
    for (const [id, n] of buffEls) if (!seen.has(id)) { n.remove(); buffEls.delete(id); }
  }

  function set(p) {
    const prev = { ...s };
    const ch = k => k in p && p[k] !== prev[k];
    Object.assign(s, p);
    if (ch('hp') || ch('hpMax')) {
      const f = bar(r.hp, s.hp, s.hpMax, fr.hp);
      if (fr.hp != null && f < fr.hp - .001) { r.hp.classList.remove('hit'); void r.hp.offsetWidth; r.hp.classList.add('hit'); }
      fr.hp = f;
      r.hpV.textContent = s.hpMax ? `${fmt(s.hp)} / ${fmt(s.hpMax)}` : '';
      el.classList.toggle('low', f < .25 && f > 0);
    }
    if (ch('shield') || ch('shieldMax')) {
      fr.sh = bar(r.sh, s.shield || 0, s.shieldMax || 0, fr.sh);
      r.sh.classList.toggle('none', !s.shieldMax);
    }
    if (ch('energy') || ch('energyMax')) { bar(r.en, s.energy, s.energyMax); r.enV.textContent = fmt(s.energy || 0); r.en.classList.toggle('none', !s.energyMax); }
    if (ch('xp') || ch('xpMax')) {
      bar(r.xp, s.xp, s.xpMax);
      r.xpV.textContent = s.xpMax ? `${fmt(s.xp)} / ${fmt(s.xpMax)} XP` : '';
    }
    if (ch('level')) {
      if (prevLevel != null && s.level > prevLevel) {
        r.lvl.parentElement.classList.remove('up'); void r.lvl.offsetWidth; r.lvl.parentElement.classList.add('up');
        bus.emit('sfx', 'levelup');
      }
      prevLevel = s.level;
      r.lvl.textContent = s.level;
    }
    if (ch('credits')) setCredits(s.credits);
    if ('frame' in p && p.frame) {
      const f = p.frame, key = `${f.kind}|${f.name}|${f.tier}`;
      if (key !== s._fkey) {
        s._fkey = key;
        r.name.textContent = f.name || '\u00a0';
        const kl = [KIND_LABEL[f.kind] || f.kind || '', f.kind !== 'rental' && f.tierName ? f.tierName : ''].filter(Boolean).join(' · ');
        r.kind.textContent = kl;
        r.kind.className = `k hf-chip ${f.kind === 'rental' ? 'bad' : 'gold'}${kl ? '' : ' off'}`;
        r.hexIn.innerHTML = framePortrait(f.kind, f.seed || 3);
        el.dataset.frame = f.kind;
      }
    }
    if (ch('heat')) {
      const v = clamp(s.heat || 0, 0, 5);
      r.pips.forEach((pip, i) => pip.style.setProperty('--f', clamp(v - i, 0, 1)));
      if (r.heat.classList.contains('on') !== v > 0.01) { r.heat.classList.toggle('on', v > 0.01); bus.emit('_restack'); }
      r.heat.classList.toggle('hot', v >= 3);
      r.heatLbl.textContent = v < 1 ? 'Noticed' : v < 2 ? 'Heat' : v < 3 ? 'Wanted' : v < 4 ? 'Hunted' : 'Lockdown';
    }
    if ('district' in p) r.district.textContent = s.district || '';
    if ('mission' in p) {
      const m = s.mission && (s.mission.title || s.mission.objective) ? s.mission : null;
      r.tracker.classList.toggle('off', !m);
      if (m) {
        if (r.tTitle.textContent !== (m.title || '')) {
          r.tTitle.textContent = m.title || '';
          r.tracker.classList.remove('new'); void r.tracker.offsetWidth; r.tracker.classList.add('new');
        }
        if (r.tObj.textContent !== (m.objective || '')) {
          r.tObj.textContent = m.objective || '';
          r.tObj.parentElement.classList.remove('flash'); void r.tObj.offsetWidth; r.tObj.parentElement.classList.add('flash');
        }
        r.tCount.textContent = m.count || '';
        r.tPg.style.transform = `scaleX(${clamp(m.progress ?? 0, 0, 1)})`;
        r.tTime.textContent = m.timer != null ? fmtTime(m.timer) : '';
        r.tTime.classList.toggle('urgent', m.timer != null && m.timer < 30);
      }
    }
    if ('buffs' in p) setBuffs(s.buffs);
    if ('goal' in p) {
      // string, or the sim's {label, cost, progress}
      const g = s.goal, txt = !g ? '' : typeof g === 'string' ? g : g.cost ? `${g.label} · ${fmt(g.cost)} cr` : g.label || '';
      const pg = g && typeof g === 'object' && g.progress != null ? clamp(g.progress, 0, 1) : null;
      r.goal.classList.toggle('off', !txt);
      r.goal.classList.toggle('has-p', pg != null);
      r.goal.classList.toggle('ready', pg === 1);
      if (txt && r.goalT.textContent !== txt) r.goalT.textContent = txt;
      if (pg != null) r.goal.style.setProperty('--gp', pg);
    }
    if (ch('surcharge')) { r.surch.classList.toggle('off', !s.surcharge); r.surchV.textContent = `−${fmt(s.surcharge || 0)} cr`; }
  }

  function badge(evt, n) {
    const b = el.querySelector(`[data-evt="${evt}"] .hf-badge`);
    if (b) b.textContent = n ? String(n) : '';
  }

  return {
    el, set, badge,
    minimap: r.canvas,
    heading(rad) { r.compass.style.transform = `rotate(${-rad}rad)`; },
    flash(kind = 'hit') {
      r.vig.className = 'hf-vignette'; void r.vig.offsetWidth; r.vig.className = `hf-vignette ${kind}`;
    },
    get state() { return { ...s }; },
  };
}
