// What the controls are actually reporting. Input.read() drains the stick and the look delta
// every frame, so the panel shows the last command the player consumed rather than re-reading it
// — re-reading would eat the frame's input and the character would stop moving.

import { state } from '../core.js';
import { handles } from '../game.js';
import { h, section, table, button, clear, num } from '../ui.js';
import * as hud from '../hud.js';

export const panel = {
  id: 'input',
  label: 'Input',

  mount(el, ctx) {
    const dial = h('canvas', 'dbg-stick');
    dial.width = 180;
    dial.height = 180;
    const readout = h('div');
    const keys = h('div', 'dbg-chips');
    const raw = h('div');

    const bar = h('div', 'row');
    bar.append(
      button('Mini-HUD', hud.visible() ? 'primary' : '', e => {
        hud.show(ctx, !hud.visible());
        hud.lane('input', true);
        e.target.className = hud.visible() ? 'primary' : '';
      }),
      button('Flip move / attack side', '', () => {
        const q = handles(ctx).quality;
        q?.set('flipTouch', !q.get('flipTouch'));
        ctx.toast(`flip ${q?.get('flipTouch') ? 'on' : 'off'}`);
      }),
    );

    el.append(section('Controls', bar,
      h('p', 'dbg-note', 'This is the last command the player read, not a fresh one — reading the '
        + 'input here would swallow the frame\'s stick and the character would stall. Press a key or '
        + 'drag on the game with the hub closed and the mini-HUD up to watch it live.'),
      h('div', 'dbg-cols', dial, readout)),
      section('Keys held', keys),
      section('Raw', raw));

    function paint() {
      const i = state.lastInput;
      const g = handles(ctx);
      stick(dial, i);
      clear(readout).append(i ? table(null, [
        ['move', `${num(i.mx, 3)}, ${num(i.my, 3)} · ${num(Math.hypot(i.mx, i.my), 3)}`],
        ['look delta', `${num(i.lx, 0)}, ${num(i.ly, 0)} px`],
        ['sprint', { html: i.sprint ? 'yes' : 'no', cls: i.sprint ? 'good' : 'dim' }],
        ['attack edge', { html: i.attack ? 'FIRED' : 'no', cls: i.attack ? 'good' : 'dim' }],
        ['stick / look pointer', `${i.stick ? 'down' : '—'} / ${i.look ? 'down' : '—'}`],
        ['pointers down', String(i.pointers)],
        ['flip sides', i.flip ? 'yes' : 'no'],
        ['age', `${num((performance.now() - i.at) / 1000, 1)} s ago`],
      ]) : h('div', 'empty', 'no input read yet — the game loop has to run at least once'));

      clear(keys);
      for (const k of i?.keys || []) keys.append(h('span', 'dbg-chip on', k));
      if (!i?.keys?.length) keys.append(h('span', 'dim', 'nothing held'));

      const p = g.player;
      clear(raw).append(p ? table(null, [
        ['player enabled', { html: p.enabled ? 'yes' : 'no', cls: p.enabled ? 'good' : 'warnc' }],
        ['free (orbit) camera', p.free ? 'yes' : 'no'],
        ['driven by door script', p.driven ? 'yes' : 'no'],
        ['speed', `${num(Math.hypot(p.vel?.x || 0, p.vel?.z || 0), 2)} m/s of ${num(p.speed, 1)}`],
        ['camera yaw / pitch', `${num(p.camYaw, 3)} / ${num(p.camPitch, 3)}`],
        ['look sensitivity', num(p.sens, 4)],
        ['coarse pointer', matchMedia('(pointer: coarse)').matches ? 'yes — touch layout' : 'no — keyboard layout'],
      ]) : h('div', 'dim', 'no player'));
    }

    paint();
    this._t = setInterval(paint, 120);
  },

  unmount() { clearInterval(this._t); },
};

function stick(canvas, i) {
  const c = canvas.getContext('2d');
  const R = 78, cx = 90, cy = 90;
  c.clearRect(0, 0, 180, 180);
  c.strokeStyle = '#232d3b';
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.moveTo(cx - R, cy);
  c.lineTo(cx + R, cy);
  c.moveTo(cx, cy - R);
  c.lineTo(cx, cy + R);
  c.stroke();
  if (!i) return;
  c.fillStyle = i.sprint ? '#ffc861' : '#6cc0ff';
  c.beginPath();
  c.arc(cx + i.mx * R, cy - i.my * R, 9, 0, Math.PI * 2);
  c.fill();
  if (i.lx || i.ly) {
    c.strokeStyle = '#8fe0dc';
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.max(-R, Math.min(R, i.lx)), cy + Math.max(-R, Math.min(R, i.ly)));
    c.stroke();
  }
}
