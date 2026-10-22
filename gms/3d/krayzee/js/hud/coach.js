// First-flight coach marks: four short, non-blocking bubbles pointing at the real controls. Shown once per device.
const KEY = 'krayzee.coach';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

// sel: element to point at; when: (w) => ready to show; done: (w) => goal reached (marks it done early)
const STEPS = [
  { id: 'goal', sel: () => '.krz-score', secs: 9,
    text: () => '<b>Goal: earn Royal Privilege (PP)</b> by breaking the rules in style. <b>Land and stop</b> to bank it.',
    when: (w) => w.t > 0.8, done: () => false },
  { id: 'stick', sel: (touch) => (touch ? '.krz-stick-zone' : '.krz-ap'), secs: 9,
    text: (touch) => (touch ? '<b>Drag here to fly yourself.</b> Any touch overrides the autopilot.' : '<b>Arrow keys or WASD to fly yourself.</b> Any input overrides the autopilot.'),
    when: () => true, done: (w) => w.manual },
  { id: 'release', sel: () => '.krz-ap', secs: 7,
    text: () => '<b>Let go and the autopilot takes back over</b>, carrying on from wherever you left it.',
    when: (w) => w.manual || w.t > 40, done: (w) => w.seenManual && w.mode === 'AUTOPILOT' },
  { id: 'radio', sel: () => '.krz-r-btn', secs: 8,
    text: () => '<b>RADIO:</b> bark at the tower or other pilots. Cheek scores too.',
    when: (w) => w.t > 14, done: (w) => w.barked },
  { id: 'bank', sel: () => '.krz-score', secs: 8,
    text: () => 'Points stay <b>pending</b> until you <b>land and stop</b>. Then they are banked for good.',
    when: (w) => w.pending > 0 || w.t > 75, done: (w) => w.banked },
];

export function createCoach(root, { force = false } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-coach';
  el.hidden = true;
  el.innerHTML = '<div class="krz-coach-ring"></div><div class="krz-coach-bub"><p></p><button type="button" class="krz-coach-ok">Got it</button></div>';
  // On body above RADIO's layer (z 20) but under every UI popup (z 30), so subtitles never cover a coach bubble.
  document.body.append(el);
  const ring = el.querySelector('.krz-coach-ring'), bub = el.querySelector('.krz-coach-bub'), p = el.querySelector('p');
  const S = { done: force ? {} : read(), cur: null, t: 0, gap: 0, w: {}, log: [] };
  let touchSeen = false;
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchSeen = true; }, { capture: true, passive: true });
  const isTouch = () => touchSeen || navigator.maxTouchPoints > 0 || !!matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  const stop = (e) => e.stopPropagation();
  bub.addEventListener('pointerdown', stop);
  el.querySelector('.krz-coach-ok').addEventListener('click', (e) => { e.stopPropagation(); finish('ok'); });

  function finish(why) {
    if (!S.cur) return;
    S.done[S.cur.id] = 1; write(S.done);
    S.log.push({ id: S.cur.id, why });
    S.cur = null; S.gap = 2.5;
    el.classList.remove('in');
    setTimeout(() => { if (!S.cur) el.hidden = true; }, 250);
  }

  function place() {
    const target = document.querySelector(S.cur.sel(isTouch()));
    const r = target && !target.closest('[hidden]') ? target.getBoundingClientRect() : null;
    if (!r || !r.width) { ring.hidden = true; bub.style.left = '50%'; bub.style.top = '40%'; bub.dataset.dir = ''; return; }
    ring.hidden = false;
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const bw = bub.offsetWidth || 240, bh = bub.offsetHeight || 80, W = innerWidth, H = innerHeight;
    // never over the speed/alt strip
    const hud = document.querySelector('#krz-hud')?.getBoundingClientRect();
    const cx = Math.max(bw / 2 + 10, Math.min(W - bw / 2 - 10, r.left + r.width / 2));
    const above = r.top - bh - 18 > 8;
    const below = r.bottom + bh + 18 < H - 8;
    let top, dir;
    if (above && (r.top > H * 0.45 || !below)) { top = r.top - bh - 16; dir = 'down'; }
    else if (below) { top = r.bottom + 16; dir = 'up'; }
    else { top = Math.max(8, r.top + r.height / 2 - bh / 2); dir = ''; }
    if (hud && hud.height && top < hud.bottom + 6 && top + bh > hud.top - 6 && cx + bw / 2 > hud.left && cx - bw / 2 < hud.right) {
      top = hud.bottom + 8; dir = '';
    }
    bub.style.left = `${cx}px`; bub.style.top = `${top}px`; bub.dataset.dir = dir;
    bub.style.setProperty('--ax', `${Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - (cx - bw / 2)))}px`);
  }

  return {
    el,
    // w = { t (s in flight), manual, mode, pending, barked, banked, blocked }
    update(dt, w) {
      S.w = w;
      if (w.manual) w.seenManual = S.seenManual = true; else w.seenManual = S.seenManual;
      if (S.cur) {
        if (w.stable === false && S.cur.id !== 'stick') { el.hidden = true; return; } // a dive started: hold the mark, don't burn its time
        S.t += dt;
        if (S.cur.done(w)) return finish('done');
        if (S.t > S.cur.secs) return finish('timeout');
        el.hidden = !!w.blocked;
        if (!w.blocked) place();
        return;
      }
      // only start a mark while the plane is calm (on the ground or flying steady), never mid-dive
      if (w.blocked || !w.stable || (S.gap -= dt) > 0) return;
      const step = STEPS.find((s) => !S.done[s.id]);
      if (!step || !step.when(w)) return;
      if (step.done(w)) { S.done[step.id] = 1; write(S.done); return; }
      S.cur = step; S.t = 0;
      p.innerHTML = step.text(isTouch());
      el.dataset.step = step.id;
      el.hidden = false;
      place();
      requestAnimationFrame(() => el.classList.add('in'));
    },
    complete() { for (const st of STEPS) S.done[st.id] = 1; write(S.done); this.end(); },
    end() { if (S.cur) { S.cur = null; el.classList.remove('in'); el.hidden = true; } S.seenManual = false; },
    get active() { return S.cur?.id || null; },
    get state() { return { active: S.cur?.id || null, done: { ...S.done }, log: S.log.slice() }; },
  };
}
