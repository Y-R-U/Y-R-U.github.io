// The upgrade shop. Every special shows its gesture being drawn, so you learn the
// input at the moment you buy it.

import {
  MOVES, PERKS, MOVE_MAX_LV, moveBuyCost, movePowerCost, moveCdCost, perkCost,
  playerRankAt, RANKS,
} from './config.js';
import { glyphPoints } from './gestures.js';
import { stroke } from './ink.js';
import { sfx } from './audio.js';
import * as haptic from './haptic.js';

let tickHandle = null;
const glyphs = [];

function dots(n, max) {
  let s = '<span class="dots">';
  for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
  return s + '</span>';
}

function drawGlyph(g, id, u) {
  const c = g.canvas, ctx = g.ctx;
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);
  const s = Math.min(w, h) * 0.42;
  const full = glyphPoints(id, 34, 1).map(([x, y]) => [w / 2 + x * s, h / 2 + y * s]);
  if (full.length > 1) {
    stroke(ctx, full, { w: 2.4, passes: 1, wob: 0.5, seed: 12, col: '#c9c3b2', a: 1, step: 5 });
  }
  const part = glyphPoints(id, 34, Math.max(0.03, u)).map(([x, y]) => [w / 2 + x * s, h / 2 + y * s]);
  if (part.length > 1) {
    stroke(ctx, part, { w: 3.4, passes: 2, wob: 0.6, seed: 12, col: '#20242c', a: 1, step: 5 });
    const tip = part[part.length - 1];
    ctx.fillStyle = '#2f6ad0';
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], 3.6, 0, 6.283);
    ctx.fill();
  }
}

function startTicker() {
  if (tickHandle) cancelAnimationFrame(tickHandle);
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / 1000;
    for (const g of glyphs) {
      const u = Math.min(1, ((t + g.offset) % 2.4) / 1.5);
      drawGlyph(g, g.id, u);
    }
    tickHandle = requestAnimationFrame(step);
  };
  step();
}

export function stopShopTicker() {
  if (tickHandle) cancelAnimationFrame(tickHandle);
  tickHandle = null;
}

export function buildShop(listEl, inkEl, S, onChange) {
  let tab = 'moves';
  const tabs = document.querySelectorAll('#shop .tab');
  // Reopening the shop resets `tab` to moves, so the buttons have to be reset too —
  // otherwise SKILLS stays highlighted while the MOVES list is showing.
  tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  tabs.forEach((b) => {
    b.onclick = () => {
      tabs.forEach((x) => x.classList.toggle('on', x === b));
      tab = b.dataset.tab;
      sfx.click();
      haptic.tap();
      render();
    };
  });

  function buy(cost, apply) {
    if (S.ink < cost) { sfx.fail(); return; }
    S.ink -= cost;
    apply();
    sfx.coin();
    onChange();
    render();
  }

  function render() {
    glyphs.length = 0;
    inkEl.textContent = S.ink;
    listEl.innerHTML = '';
    const rank = S.bully ? RANKS.length - 1 : playerRankAt(S.level);

    if (tab === 'moves') {
      MOVES.forEach((m, i) => {
        const st = S.moves[m.id] || { owned: false, power: 0, cd: 0 };
        const locked = !st.owned && m.tier > rank;
        const card = document.createElement('div');
        card.className = 'card' + (locked ? ' locked' : '');
        const cv = document.createElement('canvas');
        cv.width = 62; cv.height = 62;
        card.appendChild(cv);
        glyphs.push({ canvas: cv, ctx: cv.getContext('2d'), id: m.gesture, offset: i * 0.35 });

        const body = document.createElement('div');
        body.className = 'cbody';
        body.innerHTML =
          `<div class="cname">${m.name}</div>` +
          `<div class="cdesc">${m.desc}</div>` +
          `<div class="chint">${m.hint}</div>`;
        const row = document.createElement('div');
        row.className = 'crow';

        if (locked) {
          // Show the price anyway — you want to know what you are saving towards.
          const b = document.createElement('button');
          b.className = 'buy';
          b.textContent = `LEARN · ${moveBuyCost(m)}`;
          b.disabled = true;
          row.appendChild(b);
          row.insertAdjacentHTML('beforeend',
            `<span class="lv">needs ${RANKS[m.tier].name} bandana</span>`);
        } else if (!st.owned) {
          const cost = moveBuyCost(m);
          const b = document.createElement('button');
          b.className = 'buy';
          b.textContent = `LEARN · ${cost}`;
          b.disabled = S.ink < cost;
          b.onclick = () => buy(cost, () => { S.moves[m.id] = { owned: true, power: 0, cd: 0 }; });
          row.appendChild(b);
        } else {
          const mk = (label, lv, cost, apply) => {
            const wrap = document.createElement('span');
            wrap.className = 'crow';
            const b = document.createElement('button');
            b.className = 'buy';
            if (lv >= MOVE_MAX_LV) { b.textContent = `${label} MAX`; b.disabled = true; }
            else {
              b.textContent = `${label} · ${cost}`;
              b.disabled = S.ink < cost;
              b.onclick = () => buy(cost, apply);
            }
            wrap.appendChild(b);
            wrap.insertAdjacentHTML('beforeend', dots(lv, MOVE_MAX_LV));
            return wrap;
          };
          row.appendChild(mk('POWER', st.power, movePowerCost(m, st.power), () => { S.moves[m.id].power++; }));
          row.appendChild(mk('COOLDOWN', st.cd, moveCdCost(m, st.cd), () => { S.moves[m.id].cd++; }));
        }
        body.appendChild(row);
        card.appendChild(body);
        listEl.appendChild(card);
      });
    } else {
      PERKS.forEach((p) => {
        const lv = S.perks[p.id] || 0;
        const cost = perkCost(p, lv);
        const maxed = lv >= p.max;
        const card = document.createElement('div');
        card.className = 'card';
        const body = document.createElement('div');
        body.className = 'cbody';
        body.innerHTML =
          `<div class="cname">${p.name}</div>` +
          `<div class="cdesc">${p.desc}</div>` +
          `<div class="chint">${lv > 0 ? p.fmt(lv) : '—'}</div>`;
        const row = document.createElement('div');
        row.className = 'crow';
        const b = document.createElement('button');
        b.className = 'buy';
        if (maxed) { b.textContent = 'MAX'; b.disabled = true; }
        else {
          b.textContent = `UPGRADE · ${cost}`;
          b.disabled = S.ink < cost;
          b.onclick = () => buy(cost, () => { S.perks[p.id] = lv + 1; });
        }
        row.appendChild(b);
        row.insertAdjacentHTML('beforeend', dots(lv, p.max));
        body.appendChild(row);
        card.appendChild(body);
        listEl.appendChild(card);
      });
    }
    startTicker();
  }

  render();
}
