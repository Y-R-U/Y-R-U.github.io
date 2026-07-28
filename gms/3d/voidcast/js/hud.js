// hud.js — the broadcast overlay: viewer counter, hype meter, objective,
// minimap, and the alien chat that will not stop talking.

import { fmt, fmtTime, damp, clamp, alienName, makeRng, TAU } from './utils.js';
import { TIER_NAMES, TIER_R, VIEW } from './config.js';
import { typeLabel } from './story.js';

const CHAT = {
  start: ['first', 'here early', 'lets go unit', 'clearance asmr', 'i have this on in the background at work',
    'day 400 of watching a satellite eat a planet'],
  small: ['nice', 'yum', 'gone', 'bye little guy', 'that was somebodys shed', 'clean', 'satisfying'],
  big: ['OH', 'THE WHOLE BUILDING', 'no way', 'it just went', 'my jaw', 'clip that', 'CLIP THAT',
    'that was load-bearing', 'the physics on this feed', 'ok that was actually huge'],
  landmark: ['NOT THE LANDMARK', 'they let you do that??', 'thats a heritage site', 'HISTORY IS OVER',
    'i was born there', 'this is going to be on the news'],
  combo: ['COMBO', 'unit is COOKING', 'chain chain chain', 'the algorithm loves this', 'unstoppable',
    'someone check on the planet'],
  tierup: ['BIGGER', 'growth arc', 'he grow', 'aperture check', 'we are eating GOOD tonight', 'upgrade!!'],
  bored: ['boring', 'do something', 'zzz', 'is the feed frozen', 'im switching to the other unit',
    'this is why i unsubscribed last time', 'hello?', 'engagement is dropping and so am i'],
  hit: ['LMAO', 'he got shot', 'get well soon', 'the planet fought back', 'skill issue', 'defences 1 unit 0'],
  hazard: ['turret DOWN', 'no more shooting', 'good riddance', 'that thing was annoying'],
  eaten: ['{who} ATE YOU', 'humiliating', '{who} is better than you sorry', 'get bigger idiot', 'oh no'],
  drain: ['{who} is FOOD', 'we are the villain now', 'drained', 'cannibalism arc'],
  boon: ['{name}!!', 'sponsor came through', 'buff', 'we love {name}'],
  clock: ['TEN SECONDS', 'GO GO GO', 'clock clock clock', 'not enough time', 'HURRY'],
  win: ['GG', 'clean sweep', 'that planet is gone forever', 'see you next contract'],
  lose: ['unlucky', 'the Guild saw that', 'refund', 'we go again'],
};

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = {
      viewers: root.querySelector('#hud-viewers'),
      viewLabel: root.querySelector('#hud-viewlabel'),
      hype: root.querySelector('#hud-hype-fill'),
      hypeMul: root.querySelector('#hud-hypemul'),
      timer: root.querySelector('#hud-timer'),
      clear: root.querySelector('#hud-clear'),
      clearBar: root.querySelector('#hud-clear-fill'),
      target: root.querySelector('#hud-target'),
      obj: root.querySelector('#hud-obj'),
      tier: root.querySelector('#hud-tier'),
      combo: root.querySelector('#hud-combo'),
      chat: root.querySelector('#hud-chat'),
      banner: root.querySelector('#hud-banner'),
      map: root.querySelector('#hud-map'),
      board: root.querySelector('#hud-board'),
      live: root.querySelector('#hud-live'),
    };
    this.mapCtx = this.el.map ? this.el.map.getContext('2d') : null;
    this.shown = 0;
    this.chatT = 0;
    this.rng = makeRng(Date.now() & 0xffff);
    this.lines = [];
    this.mapT = 0;
    this.bannerT = 0;
  }

  reset(run) {
    this.run = run;
    this.shown = 0;
    this.lines.length = 0;
    if (this.el.chat) this.el.chat.innerHTML = '';
    if (this.el.banner) this.el.banner.classList.remove('show');
    const s = run.spec;
    if (this.el.obj) {
      this.el.obj.textContent = s.kind === 'story'
        ? `${typeLabel(s.type)} · ${s.name}`
        : s.kind === 'event' ? `EVENT · ${s.name}` : 'OPEN CONTRACT · score as high as you can';
    }
    if (this.el.target) {
      this.el.target.style.display = s.target ? 'block' : 'none';
      if (s.target) this.el.target.style.left = clamp(s.target, 0, 100) + '%';
    }
    this.say('start');
  }

  say(kind, data) {
    const pool = CHAT[kind];
    if (!pool || !this.el.chat) return;
    let text = pool[Math.floor(this.rng() * pool.length)];
    if (data) for (const k in data) text = text.replace('{' + k + '}', data[k]);
    const who = alienName((Math.random() * 4294967295) >>> 0);
    const row = document.createElement('div');
    row.className = 'chat-row' + (kind === 'bored' || kind === 'eaten' ? ' cold' : kind === 'big' || kind === 'landmark' || kind === 'combo' ? ' hot' : '');
    row.innerHTML = `<b>${who}</b> ${escapeHtml(text)}`;
    this.el.chat.appendChild(row);
    this.lines.push(row);
    const keep = window.innerHeight < 760 || window.innerWidth < 520 ? 4 : 7;
    while (this.lines.length > keep) { const r = this.lines.shift(); r.remove(); }
    requestAnimationFrame(() => row.classList.add('in'));
  }

  banner(text, cls) {
    const b = this.el.banner;
    if (!b) return;
    b.textContent = text;
    b.className = 'hud-banner show ' + (cls || '');
    this.bannerT = 1.9;
  }

  update(dt, run) {
    if (!run) return;
    // viewer counter eases toward the true number so it always feels alive
    this.shown = damp(this.shown, run.viewers, 6, dt);
    if (Math.abs(this.shown - run.viewers) < 1) this.shown = run.viewers;
    if (this.el.viewers) this.el.viewers.textContent = fmt(this.shown);

    const hp = clamp(run.hype / run.hypeMax, 0, 1);
    if (this.el.hype) {
      this.el.hype.style.width = (hp * 100).toFixed(1) + '%';
      this.el.hype.className = 'bar-fill' + (hp > 0.75 ? ' max' : hp > 0.4 ? ' hot' : hp < 0.12 ? ' cold' : '');
    }
    if (this.el.hypeMul) this.el.hypeMul.textContent = '×' + (1 + run.hype * VIEW.HYPE_MASS).toFixed(2);

    if (this.el.timer) {
      if (run.timeLimit > 0) {
        this.el.timer.textContent = fmtTime(run.timeLeft);
        this.el.timer.classList.toggle('urgent', run.timeLeft < 15);
      } else {
        this.el.timer.textContent = fmtTime(run.elapsed);
        this.el.timer.classList.remove('urgent');
      }
    }
    const pct = run.clearPct();
    if (this.el.clear) this.el.clear.textContent = pct.toFixed(1) + '%';
    if (this.el.clearBar) this.el.clearBar.style.width = clamp(pct, 0, 100) + '%';

    if (this.el.tier) {
      const t = run.player.tier;
      const next = TIER_R[Math.min(8, t + 1)];
      const prog = t >= 8 ? 1 : clamp((run.player.radius - TIER_R[t]) / (next - TIER_R[t]), 0, 1);
      this.el.tier.innerHTML = `<span>${TIER_NAMES[t] || '—'}</span><i style="width:${(prog * 100).toFixed(0)}%"></i>`;
    }
    if (this.el.combo) {
      if (run.combo > 2) {
        this.el.combo.style.display = 'block';
        this.el.combo.textContent = '×' + run.combo;
        this.el.combo.style.transform = `translateX(-50%) scale(${1 + Math.min(0.5, run.combo * 0.02)})`;
      } else this.el.combo.style.display = 'none';
    }
    if (this.el.live) this.el.live.classList.toggle('dim', run.idleT > (run.idleAfter || 3.4));

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0 && this.el.banner) this.el.banner.classList.remove('show');
    }

    // idle chatter
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = 2.2 + this.rng() * 3.4;
      if (run.idleT > 3) this.say('bored');
      else if (run.combo > 4) this.say('combo');
      else this.say('small');
    }

    // minimap + rival board
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.14; this.drawMap(run); this.drawBoard(run); }
  }

  drawMap(run) {
    const c = this.mapCtx;
    if (!c) return;
    const el = this.el.map;
    const W = el.width, H = el.height;
    const R = run.sector.R;
    const k = (W / 2 - 3) / R;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,10,18,0.72)';
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 1, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1;
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 1, 0, TAU); c.stroke();

    const props = run.sector.props;
    const stride = Math.max(1, Math.floor(props.length / 300));
    c.fillStyle = 'rgba(190,205,235,0.55)';
    for (let i = 0; i < props.length; i += stride) {
      const p = props[i];
      if (p.dead) continue;
      const x = W / 2 + p.x * k, y = H / 2 + p.z * k;
      const s = p.tier >= 7 ? 2.6 : p.tier >= 5 ? 1.8 : 1.1;
      c.fillRect(x - s / 2, y - s / 2, s, s);
    }
    for (const r of run.rivals) {
      if (!r.hole.alive) continue;
      c.fillStyle = '#' + r.hole.colA.getHexString();
      c.beginPath(); c.arc(W / 2 + r.x * k, H / 2 + r.z * k, Math.max(2.5, r.hole.radius * k), 0, TAU); c.fill();
    }
    for (const h of run.hazards.list) {
      if (h.dead || h.kind !== 'turret') continue;
      c.fillStyle = '#ff6a4a';
      c.fillRect(W / 2 + h.x * k - 1.5, H / 2 + h.z * k - 1.5, 3, 3);
    }
    const p = run.player;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(W / 2 + p.x * k, H / 2 + p.z * k, Math.max(3, p.radius * k), 0, TAU); c.fill();
    c.strokeStyle = '#' + p.colA.getHexString(); c.lineWidth = 2;
    c.beginPath(); c.arc(W / 2 + p.x * k, H / 2 + p.z * k, Math.max(4.5, p.radius * k + 2), 0, TAU); c.stroke();
  }

  drawBoard(run) {
    const el = this.el.board;
    if (!el) return;
    if (!run.rivals.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const rows = run.rivals.map((r) => ({ name: r.name, m: r.eatenArea, you: false }));
    rows.push({ name: 'YOU', m: run._myArea(), you: true });
    rows.sort((a, b) => b.m - a.m);
    const total = run.sector.totalArea || 1;
    el.innerHTML = rows.slice(0, 5).map((r, i) =>
      `<div class="bd-row${r.you ? ' you' : ''}"><s>${i + 1}</s><b>${escapeHtml(r.name)}</b><i>${((r.m / total) * 100).toFixed(1)}%</i></div>`
    ).join('');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
