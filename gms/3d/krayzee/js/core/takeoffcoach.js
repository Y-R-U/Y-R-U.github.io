// First-run coach mark for D21 DEMAND TAKEOFF (PLAYTEST_2 B6): a parked or lined-up plane waiting on the tower gets
// pointed at the button instead of at RADIO. Same look as js/hud/coach.js; shown once per device.
const KEY = 'krayzee.coachTakeoff';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
const write = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ } };

export function createTakeoffCoach({ force = false, sel = '.krz-gbtn-to', waitSecs = 4, secs = 12 } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-coach';
  el.dataset.step = 'takeoff';
  el.hidden = true;
  el.innerHTML = '<div class="krz-coach-ring"></div><div class="krz-coach-bub"><p><b>Stuck waiting for the tower?</b> DEMAND TAKEOFF and the autopilot goes right now. Queue-jumping scores.</p><button type="button" class="krz-coach-ok">Got it</button></div>';
  document.body.append(el);
  const ring = el.querySelector('.krz-coach-ring'), bub = el.querySelector('.krz-coach-bub');
  const S = { done: !force && read(), active: false, wait: 0, t: 0, why: '' };
  bub.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('.krz-coach-ok').addEventListener('click', (e) => { e.stopPropagation(); finish('ok'); });

  function finish(why) {
    if (S.done) return;
    S.done = true; S.why = why; write();
    if (S.active) { S.active = false; el.classList.remove('in'); setTimeout(() => { el.hidden = true; }, 250); }
  }
  function place() {
    const t = document.querySelector(sel);
    const r = t && !t.closest('[hidden]') ? t.getBoundingClientRect() : null;
    if (!r || !r.width) { el.hidden = true; return false; }
    el.hidden = false;
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const bw = bub.offsetWidth || 260, bh = bub.offsetHeight || 80;
    const cx = Math.max(bw / 2 + 10, Math.min(innerWidth - bw / 2 - 10, r.left + r.width / 2));
    const up = r.top - bh - 16 > 8;
    bub.style.left = `${cx}px`;
    bub.style.top = `${up ? r.top - bh - 16 : r.bottom + 16}px`;
    bub.dataset.dir = up ? 'down' : 'up';
    bub.style.setProperty('--ax', `${Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - (cx - bw / 2)))}px`);
    return true;
  }

  return {
    el,
    // w = { waiting (on the ground, stopped, DEMAND TAKEOFF offered), blocked, pressed, airborne }
    update(dt, w) {
      if (S.done) return;
      if (w.pressed || (w.airborne && S.active)) return finish(w.pressed ? 'pressed' : 'airborne');
      if (S.active) {
        S.t += dt;
        if (!w.waiting && S.t < 3) return this.hide();
        if (S.t > secs || !w.waiting) return finish(S.t > secs ? 'timeout' : 'moved');
        if (w.blocked) { el.hidden = true; return; }
        place();
        return;
      }
      S.wait = w.waiting ? S.wait + dt : 0;
      if (w.blocked || S.wait < waitSecs) return;
      S.active = true; S.t = 0;
      if (place()) requestAnimationFrame(() => el.classList.add('in'));
    },
    get wants() { return !S.done && (S.active || S.wait > 0); },
    get active() { return S.active; },
    get state() { return { active: S.active, done: S.done, why: S.why, wait: +S.wait.toFixed(1) }; },
    hide() { if (S.active) { S.active = false; S.wait = 0; el.classList.remove('in'); el.hidden = true; } },
  };
}
