// MSGFIX: one priority queue for every message on screen. At most `max` show at once (3 on a phone); the lowest-priority
// extras are shed (html[data-krz-shed] → visibility hidden in style.js) and come back when room frees up. The response
// sheet, the Herald reel, the rank-up ceremony and the TASKS set celebration are never shed; neither is a coach mark pointing at a control.
const PRIORITY = [
  ['sheet', '.krz-r-panel'],
  ['reel', '.krz-reel, .krz-cer, .kz-tk-cele.on'],
  ['banner', '#krz-hud.krz-flash .krz-banner'],
  ['story', '.krz-st-coach'],
  ['coach', '.krz-coach.in'],
  ['score', '.krz-pop.in'],
  ['tasks', '.kz-tk-toast.on'],
  ['radio', '.krz-r-pill.in:not(.out)'],
  ['prompt', '.krz-prompt.in'],
  ['paper', '.krz-paper-toast.in'],
];
const NEVER = new Set(['sheet', 'reel', 'coach']);

const shown = (e) => !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0;

export function createMsgCap({ phoneMax = 3, bigMax = 4 } = {}) {
  let t = 0, last = '';
  const html = document.documentElement;
  return {
    update(dt) {
      if ((t -= dt) > 0) return;
      t = 0.2;
      const max = Math.min(innerWidth, innerHeight) < 520 ? phoneMax : bigMax;
      const on = PRIORITY.filter(([, sel]) => [...document.querySelectorAll(sel)].some(shown)).map(([k]) => k);
      let room = max;
      const shed = [];
      for (const k of on) {
        if (room > 0 || NEVER.has(k)) room--;
        else shed.push(k);
      }
      const v = shed.join(' ');
      if (v !== last) { last = v; if (v) html.dataset.krzShed = v; else delete html.dataset.krzShed; }
    },
    reset() { last = ''; delete html.dataset.krzShed; },
    get shed() { return last; },
  };
}
