// hud.js — screen-space HUD: vitals, radar, status, kill feed, scoreboard.

import { PALETTE, TEAMS, TILE } from './config.js';
import { clamp, fmtTime, TAU } from './util.js';

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Hud {
  render(ctx, game, W, H, insets, input) {
    const s = clamp(Math.min(W, H) / 430, 0.82, 1.5);
    const top = insets.top + 8;
    const player = game.player;

    this._statusBar(ctx, game, W, top, s);
    const radarSize = Math.min(W, H) * 0.27;
    this._radar(ctx, game, W - insets.right - radarSize - 10, top + 38 * s, radarSize, s);
    this._vitals(ctx, game, insets.left + 10, top + 38 * s, W - insets.left - insets.right - radarSize - 32, s);
    this._killFeed(ctx, game, W - insets.right - 12, top + 44 * s + radarSize + 10, s);
    this._objectiveArrows(ctx, game, W, H, insets);
    this._banner(ctx, game, W, H, s);
    if (player && !player.alive && game.state === 'playing') this._respawn(ctx, player, W, H, s);
    if (player && player.alive && player.energy / player.maxEff() < 0.25) this._lowVignette(ctx, W, H, game.time);
    if (input && input.showScores) this._scoreboard(ctx, game, W, H, s);
  }

  _panel(ctx, x, y, w, h, r = 8) {
    ctx.fillStyle = 'rgba(10,14,34,0.62)';
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(110,140,255,0.28)'; ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
  }

  _statusBar(ctx, game, W, top, s) {
    const txt = game.mode.statusLine();
    const time = fmtTime(game.matchTime);
    ctx.font = `bold ${Math.round(15 * s)}px system-ui`;
    const tw = ctx.measureText(txt).width;
    const timeW = ctx.measureText(time).width + 22 * s;
    const w = Math.min(W - 24, tw + 40 * s + timeW);
    const x = (W - w) / 2;
    this._panel(ctx, x, top, w, 30 * s, 10);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(txt, x + 16 * s, top + 15 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = game.matchTime < 30 ? '#ff6b6b' : '#fff';
    ctx.font = `bold ${Math.round(15 * s)}px ui-monospace, monospace`;
    ctx.fillText('⏱ ' + time, x + w - 14 * s, top + 15 * s);
  }

  _vitals(ctx, game, x, y, w, s) {
    const p = game.player;
    if (!p) return;
    const barH = 16 * s;
    this._panel(ctx, x, y, w, barH + 30 * s, 8);
    const bx = x + 8 * s, by = y + 8 * s, bw = w - 16 * s;
    // energy bar
    const ratio = clamp(p.energy / p.maxEff(), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx, by, bw, barH, 5); ctx.fill();
    const col = ratio > 0.5 ? PALETTE.energyHi : ratio > 0.25 ? PALETTE.energyMid : PALETTE.energyLo;
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, col); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, Math.max(4, bw * ratio), barH, 5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(10 * s)}px ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(p.energy)} / ${p.maxEff()}`, bx + bw / 2, by + barH / 2 + 0.5);

    // ammo chips
    let cx = bx;
    const cy = by + barH + 5 * s;
    const chips = [
      { t: 'GUN ' + p.guns, c: '#ffec8b' },
      { t: 'BMB ' + p.bombs, c: '#ff9d5c' },
      { t: (p.def.special === 'repel' ? 'REP ' : 'BST ') + p.specialAmmo, c: '#9fe8ff' },
    ];
    if (p.multifire) chips.push({ t: 'MULTI', c: '#ff8bd0' });
    if (p.bounce) chips.push({ t: 'BNC', c: '#caff8b' });
    ctx.textAlign = 'left'; ctx.font = `bold ${Math.round(10 * s)}px system-ui`;
    for (const ch of chips) {
      const tw = ctx.measureText(ch.t).width + 12 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, cx, cy, tw, 16 * s, 4); ctx.fill();
      ctx.fillStyle = ch.c;
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.t, cx + 6 * s, cy + 8 * s);
      cx += tw + 5 * s;
      if (cx > x + w - 40 * s) break;
    }
  }

  _radar(ctx, game, x, y, size, s) {
    const W = game.world;
    this._panel(ctx, x, y, size, size, 8);
    ctx.save();
    roundRect(ctx, x, y, size, size, 8); ctx.clip();
    const sc = size / Math.max(W.w, W.h);
    const ox = x + (size - W.w * sc) / 2, oy = y + (size - W.h * sc) / 2;
    const px = (wx) => ox + wx * sc, py = (wy) => oy + wy * sc;

    // zone
    if (game.zone) {
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#7a86c8';
      ctx.beginPath(); ctx.arc(px(game.zone.x), py(game.zone.y), game.zone.r * sc, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // bases
    for (const b of W.bases) {
      ctx.fillStyle = TEAMS[b.team].color; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(px(b.x), py(b.y), 4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    // prizes
    ctx.fillStyle = PALETTE.prize; ctx.globalAlpha = 0.7;
    for (const pr of game.prizes) { ctx.fillRect(px(pr.x) - 1, py(pr.y) - 1, 2, 2); }
    ctx.globalAlpha = 1;
    // flags
    for (const f of game.flags) {
      ctx.fillStyle = TEAMS[f.team].color;
      ctx.beginPath(); ctx.arc(px(f.x), py(f.y), 3, 0, TAU); ctx.fill();
    }
    // ships
    for (const sh of game.ships) {
      if (!sh.alive) continue;
      ctx.fillStyle = sh.isPlayer ? '#ffffff' : sh.color.color;
      const r = sh.isPlayer ? 3.5 : 2.4;
      ctx.beginPath(); ctx.arc(px(sh.x), py(sh.y), r, 0, TAU); ctx.fill();
    }
    // viewport rect
    const c = game.camera;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(px(c.x - game.W / 2 / c.zoom), py(c.y - game.H / 2 / c.zoom),
      (game.W / c.zoom) * sc, (game.H / c.zoom) * sc);
    ctx.restore();
  }

  _killFeed(ctx, game, rx, y, s) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(12 * s)}px system-ui`;
    let yy = y;
    for (let i = game.killFeed.length - 1; i >= 0; i--) {
      const k = game.killFeed[i];
      ctx.globalAlpha = clamp(k.t, 0, 1);
      if (k.suicide) {
        ctx.fillStyle = '#aab';
        ctx.fillText(`💥 ${k.b}`, rx, yy);
      } else {
        let cur = rx;
        ctx.fillStyle = k.bc; const bw = ctx.measureText(k.b).width;
        ctx.fillText(k.b, cur, yy); cur -= bw + 6;
        ctx.fillStyle = '#fff'; ctx.fillText('✦', cur, yy); cur -= 14;
        ctx.fillStyle = k.ac; ctx.fillText(k.a, cur, yy);
      }
      yy += 18 * s;
    }
    ctx.globalAlpha = 1;
  }

  _objectiveArrows(ctx, game, W, H, insets) {
    const targets = [];
    for (const f of game.flags) targets.push({ x: f.x, y: f.y, c: TEAMS[f.team].color });
    if (game.zone) targets.push({ x: game.zone.x, y: game.zone.y, c: '#ffd23f' });
    const c = game.camera;
    const cx = W / 2, cy = H / 2;
    for (const t of targets) {
      const sx = (t.x - c.x) * c.zoom + cx, sy = (t.y - c.y) * c.zoom + cy;
      if (sx > 0 && sx < W && sy > 0 && sy < H) continue; // on-screen
      const ang = Math.atan2(sy - cy, sx - cx);
      const m = 40;
      const ex = clamp(cx + Math.cos(ang) * 9999, m, W - m);
      const ey = clamp(cy + Math.sin(ang) * 9999, m + insets.top, H - m);
      // place along the screen edge in the target direction
      const ix = clamp(cx + Math.cos(ang) * (Math.min(W, H) / 2 - m), m, W - m);
      const iy = clamp(cy + Math.sin(ang) * (Math.min(W, H) / 2 - m), m + insets.top, H - m);
      ctx.save();
      ctx.translate(ix, iy); ctx.rotate(ang);
      ctx.fillStyle = t.c; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _banner(ctx, game, W, H, s) {
    if (!game.banner) return;
    const big = game.state === 'over';
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = big ? H * 0.4 : H * 0.26;
    const fs = big ? 34 * s : 22 * s;
    ctx.font = `900 ${Math.round(fs)}px system-ui`;
    ctx.globalAlpha = clamp(game.banner.life, 0, 1);
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(game.banner.text, W / 2, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(game.banner.text, W / 2, y);
    ctx.restore();
  }

  _respawn(ctx, p, W, H, s) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `900 ${Math.round(26 * s)}px system-ui`;
    ctx.fillText('SHIP DESTROYED', W / 2, H * 0.42);
    ctx.font = `${Math.round(15 * s)}px system-ui`;
    ctx.fillStyle = '#bcd0ff';
    ctx.fillText('Respawning in ' + Math.ceil(p.respawnTimer), W / 2, H * 0.42 + 30 * s);
    ctx.restore();
  }

  _lowVignette(ctx, W, H, time) {
    const a = 0.18 + Math.sin(time * 8) * 0.08;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,30,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  _scoreboard(ctx, game, W, H, s) {
    const rows = game.scoreboard();
    const w = Math.min(W - 40, 360 * s);
    const rowH = 22 * s;
    const h = (rows.length + 2) * rowH + 16;
    const x = (W - w) / 2, y = (H - h) / 2;
    ctx.fillStyle = 'rgba(6,9,24,0.9)';
    roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,255,0.4)'; roundRect(ctx, x, y, w, h, 12); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(14 * s)}px system-ui`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(game.mode.name.toUpperCase(), W / 2, y + rowH * 0.8);
    ctx.font = `${Math.round(12 * s)}px system-ui`;
    ctx.textAlign = 'left'; ctx.fillStyle = '#8da';
    const ix = x + 14 * s;
    ctx.fillText('PLAYER', ix, y + rowH * 1.7);
    ctx.textAlign = 'right';
    ctx.fillText('K', x + w - 110 * s, y + rowH * 1.7);
    ctx.fillText('D', x + w - 74 * s, y + rowH * 1.7);
    ctx.fillText('PTS', x + w - 18 * s, y + rowH * 1.7);
    let yy = y + rowH * 2.5;
    for (const r of rows) {
      ctx.globalAlpha = r.isPlayer ? 1 : 0.92;
      if (r.isPlayer) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(ctx, x + 6, yy - rowH * 0.5, w - 12, rowH, 5); ctx.fill(); }
      ctx.textAlign = 'left'; ctx.fillStyle = r.color;
      ctx.fillText('●', ix, yy);
      ctx.fillStyle = r.isPlayer ? '#fff' : '#cdd8ff';
      ctx.fillText(r.name, ix + 16 * s, yy);
      ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
      ctx.fillText(r.kills, x + w - 110 * s, yy);
      ctx.fillStyle = '#9aa';
      ctx.fillText(r.deaths, x + w - 74 * s, yy);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(r.score + r.kills, x + w - 18 * s, yy);
      yy += rowH;
    }
    ctx.globalAlpha = 1;
  }
}
