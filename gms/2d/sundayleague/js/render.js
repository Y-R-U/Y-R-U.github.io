// ---- canvas renderer: world, goals, entities, touch controls, radar ----
import {
  PX, PY, PITCH_W, PITCH_H, CX, GOAL_W, GOAL_DEPTH, BAR_Z, WORLD_W, WORLD_H,
} from './const.js';
import { clamp } from './util.js';
import { drawSprite, bakeBall, BALL_SIZE, BALL_FRAMES } from './sprites.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 100; this.h = 100;
    this.pitchCanvas = null;
    this.ballSheet = bakeBall();
    this.drawList = [];
    this.t = 0;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  setPitch(canvas) { this.pitchCanvas = canvas; }

  _worldTransform(cam, shakeX, shakeY) {
    const s = cam.scale * this.dpr;
    this.ctx.setTransform(s, 0, 0, s,
      (this.w / 2 - cam.x * cam.scale + shakeX) * this.dpr,
      (this.h / 2 - cam.y * cam.scale + shakeY) * this.dpr);
  }

  _screenTransform() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(match, dt, opts = {}) {
    this.t += dt;
    const ctx = this.ctx;
    const cam = match.camera;
    const shake = match.fx.shake;
    const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.imageSmoothingEnabled = false;
    this._screenTransform();
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, this.w, this.h);

    this._worldTransform(cam, shakeX, shakeY);

    // pitch
    if (this.pitchCanvas) ctx.drawImage(this.pitchCanvas, 0, 0);

    // top goal (net behind entities)
    this._goalNet(ctx, PY, -1);

    // selection indicator under player
    const sel = match.sel;
    if (sel && match.userTeam >= 0 && !opts.demo) {
      const a = 0.25 + sel.controlBlend * 0.65;
      ctx.strokeStyle = `rgba(255,235,90,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sel.x, sel.y + 1, 11, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // aim arrow + pass target hint
    if (sel && !opts.demo && (match.state === 'play' || match.state === 'ready')) {
      const inp = match.input;
      const aiming = inp.stick.active && inp.stick.mag > 0.25;
      const hasBall = match.ball.owner === sel || match.state === 'ready';
      if (aiming && hasBall) {
        const ax = inp.stick.x, ay = inp.stick.y;
        const l = Math.hypot(ax, ay) || 1;
        const charge = inp.kick.held ? inp.kick.charge : 0;
        const len = 52 + charge * 68;
        const ex = sel.x + ax / l * len, ey = sel.y + ay / l * len;
        ctx.strokeStyle = charge > 0.7 ? 'rgba(255,120,80,0.9)' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -this.t * 30;
        ctx.beginPath(); ctx.moveTo(sel.x + ax / l * 14, sel.y + ay / l * 14); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        // arrowhead
        const px = -ay / l, py = ax / l;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(ex + ax / l * 8, ey + ay / l * 8);
        ctx.lineTo(ex + px * 5, ey + py * 5);
        ctx.lineTo(ex - px * 5, ey - py * 5);
        ctx.fill();
        // pass target highlight
        const mate = match._pickPassTarget(sel, ax, ay);
        if (mate) {
          ctx.strokeStyle = 'rgba(120,255,160,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(mate.x, mate.y + 1, 12, 7, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // penalty reticle
    if (match.pen && match.pen.phase === 'aim' && match.pen.userKicker) {
      const p = match.pen;
      const rx = CX + p.aimX * (GOAL_W / 2 - 12); // matches _penaltyKick aim
      const rz = 6 + p.power * (BAR_Z - 4);
      const ry = p.goalY - rz;
      ctx.strokeStyle = 'rgba(255,235,90,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx - 11, ry); ctx.lineTo(rx + 11, ry); ctx.moveTo(rx, ry - 11); ctx.lineTo(rx, ry + 11); ctx.stroke();
    }

    // ---- entities (players + ball) sorted by y ----
    const list = this.drawList;
    list.length = 0;
    const viewTop = cam.y - this.h / 2 / cam.scale - 60;
    const viewBot = cam.y + this.h / 2 / cam.scale + 60;
    for (const f of match.all) {
      if (f.y < viewTop || f.y > viewBot) continue;
      list.push(f);
    }
    const ball = match.ball;
    list.push(ball);
    list.sort((a, b) => a.y - b.y);

    for (const e of list) {
      if (e === ball) {
        // ball shadow + ball
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, 5 - Math.min(2, e.z * 0.01), 3, 0, 0, Math.PI * 2); ctx.fill();
        const fr = Math.abs(e.anim | 0) % BALL_FRAMES;
        const sc = 1 + Math.min(0.9, e.z * 0.006);
        const bs = BALL_SIZE * sc;
        ctx.drawImage(this.ballSheet, fr * BALL_SIZE, 0, BALL_SIZE, BALL_SIZE,
          e.x - bs / 2, e.y - e.z * 0.8 - bs / 2, bs, bs);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, e.grounded ? 12 : 8, 4, 0, 0, Math.PI * 2); ctx.fill();
        let d, p;
        if (e.replayPose !== undefined && e.replayPose >= 0) { d = e.replayDir | 0; p = e.replayPose | 0; }
        else { const pose = e.pose(); d = pose.d; p = pose.p; }
        drawSprite(ctx, e.sheet, d, p, e.x, e.y);
      }
    }

    // bottom goal (net in front)
    this._goalNet(ctx, PY + PITCH_H, 1);

    // world fx
    match.fx.drawWorld(ctx);

    // ---- screen space ----
    this._screenTransform();
    match.fx.drawScreen(ctx, this.w, this.h);

    const inReplay = match.state === 'replay' || match.state === 'replayhold';
    if (!opts.demo) {
      if (inReplay) this._replayOverlay(ctx);
      if (match.pens) this._shootoutBoard(ctx, match);
      if (match.userTeam >= 0 && !inReplay) {
        this._controls(ctx, match);
        if (match.settings.radar && match.mode !== 'shootout') this._radar(ctx, match);
      }
      if (match.state === 'ready' && match.restart && match.restart.team === match.userTeam) {
        this._prompt(ctx, match.restart.type === 'throwin' ? 'AIM & TAP KICK TO THROW' : 'AIM & TAP KICK');
      }
      if (match.pen && match.pen.phase === 'aim' && match.pen.userKicker) {
        this._prompt(ctx, 'STICK TO AIM • HOLD KICK FOR POWER');
      }
      if (match.pen && match.pen.phase === 'aim' && match.pen.userKeeper) {
        this._prompt(ctx, 'LEAN WITH STICK TO PICK YOUR DIVE');
      }
    }
  }

  _goalNet(ctx, lineY, dir) {
    // dir -1 = net extends up (top goal), +1 down
    const x0 = CX - GOAL_W / 2, x1 = CX + GOAL_W / 2;
    const yBack = lineY + dir * GOAL_DEPTH;
    ctx.fillStyle = 'rgba(235,235,235,0.16)';
    ctx.fillRect(x0, Math.min(lineY, yBack), GOAL_W, GOAL_DEPTH);
    // mesh
    ctx.strokeStyle = 'rgba(240,240,240,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 8) { ctx.moveTo(x, lineY); ctx.lineTo(x, yBack); }
    for (let i = 0; i <= GOAL_DEPTH; i += 7) { ctx.moveTo(x0, lineY + dir * i); ctx.lineTo(x1, lineY + dir * i); }
    ctx.stroke();
    // frame: posts + crossbar drawn slightly "up" for height feel
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, yBack); ctx.lineTo(x0, lineY - 4); ctx.lineTo(x0, lineY);
    ctx.moveTo(x1, yBack); ctx.lineTo(x1, lineY);
    ctx.moveTo(x0, lineY - (dir === -1 ? 6 : -6)); ctx.lineTo(x1, lineY - (dir === -1 ? 6 : -6));
    ctx.stroke();
  }

  _controls(ctx, match) {
    const inp = match.input;
    // joystick
    const showStick = inp.stick.active && inp.stick.id !== -99;
    const anchor = inp.joyMode === 'fixed' ? inp.stickAnchor : null;
    if (showStick || anchor) {
      const ox = showStick ? inp.stick.ox : anchor.x;
      const oy = showStick ? inp.stick.oy : anchor.y;
      ctx.globalAlpha = showStick ? 0.5 : 0.22;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, 42, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = showStick ? 0.65 : 0.25;
      ctx.beginPath(); ctx.arc(ox + inp.stick.x * 34, oy + inp.stick.y * 34, 17, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // kick button
    const k = inp.kickAnchor;
    if (k) {
      const held = inp.kick.held;
      ctx.globalAlpha = held ? 0.85 : 0.4;
      ctx.fillStyle = held ? '#ffde59' : '#ffffff';
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r * (held ? 0.94 : 1), 0, Math.PI * 2);
      ctx.globalAlpha = held ? 0.28 : 0.14;
      ctx.fill();
      ctx.globalAlpha = held ? 0.95 : 0.5;
      ctx.strokeStyle = held ? '#ffde59' : '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = held ? '#ffde59' : '#fff';
      ctx.fillText('KICK', k.x, k.y);
      // charge arc
      if (held && inp.kick.charge > 0) {
        ctx.strokeStyle = inp.kick.charge > 0.95 ? '#ff5c5c' : '#ffde59';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(k.x, k.y, k.r + 7, -Math.PI / 2, -Math.PI / 2 + inp.kick.charge * Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  _radar(ctx, match) {
    const rw = 62, rh = 96;
    const rx = this.w / 2 - rw / 2, ry = 54;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(10,25,14,0.65)';
    this._rr(ctx, rx, ry, rw, rh, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    this._rr(ctx, rx, ry, rw, rh, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh / 2); ctx.stroke();
    const mx = (x) => rx + ((x - PX) / PITCH_W) * rw;
    const my = (y) => ry + ((y - PY) / PITCH_H) * rh;
    for (const f of match.all) {
      ctx.fillStyle = f === match.sel ? '#ffde59' : (f.team === 0 ? match.teams[0].kit.shirt : match.teams[1].kit.shirt);
      ctx.fillRect(mx(f.x) - 1.5, my(f.y) - 1.5, 3, 3);
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mx(match.ball.x), my(match.ball.y), 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  _replayOverlay(ctx) {
    const bh = this.h * 0.1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, bh);
    ctx.fillRect(0, this.h - bh, this.w, bh);
    if ((this.t * 2 | 0) % 2 === 0) {
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffde59';
      ctx.fillText('▶ REPLAY', 16, bh / 2 + 6);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff99';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('tap to skip', this.w - 16, bh / 2 + 5);
    }
  }

  _shootoutBoard(ctx, match) {
    const s = match.pens;
    if (!s) return;
    const rows = [
      { ti: s.firstTi, arr: s.a },
      { ti: 1 - s.firstTi, arr: s.b },
    ];
    const bw = 190, bh = 52;
    const bx = this.w / 2 - bw / 2, by = 46;
    ctx.fillStyle = 'rgba(8,14,10,0.8)';
    this._rr(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    rows.forEach((row, i) => {
      const y = by + 15 + i * 24;
      ctx.textAlign = 'left';
      ctx.fillStyle = match.teams[row.ti].kit.shirt;
      ctx.fillText(match.teams[row.ti].def.short, bx + 10, y);
      const n = Math.max(5, row.arr.length);
      for (let k = 0; k < n; k++) {
        const px = bx + 56 + k * 17;
        if (k < row.arr.length) {
          ctx.fillStyle = row.arr[k] ? '#5ce87a' : '#ff5c5c';
          ctx.beginPath(); ctx.arc(px, y, 5.5, 0, Math.PI * 2); ctx.fill();
          if (!row.arr[k]) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(px - 3, y - 3); ctx.lineTo(px + 3, y + 3);
            ctx.moveTo(px + 3, y - 3); ctx.lineTo(px - 3, y + 3); ctx.stroke();
          }
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, y, 5.5, 0, Math.PI * 2); ctx.stroke();
        }
      }
    });
  }

  _prompt(ctx, str) {
    if ((this.t * 1.6 | 0) % 2) return;
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#08120cdd';
    this._rr(ctx, this.w / 2 - 130, this.h - 190, 260, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffde59';
    ctx.fillText(str, this.w / 2, this.h - 170);
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
