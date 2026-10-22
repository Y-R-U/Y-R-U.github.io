// D24 newspaper headlines: in flight only a small icon + counter + a one-line toast; after landing a reel (Skip / Skip all).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PAPER = '<svg viewBox="0 0 24 20" aria-hidden="true"><path d="M3 2h15v14a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2z" fill="currentColor" opacity=".9"/><path d="M18 6h3v10a2 2 0 0 1-4 0" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 5h9M6 8h9M6 11h5M6 14h5" stroke="#1c1a16" stroke-width="1.3"/></svg>';

// Only the big ones make the papers; {T} title, {N} name.
const STORIES = {
  cut_in_final: ['{T} {N} PUSHES IN ON FINAL', 'Commoners left circling as peer takes "their" runway'],
  runway_steal: ['RUNWAY THEFT: {T} {N} SAYS IT WAS "BASICALLY EMPTY"', 'Tower describes the incident as "a lot"'],
  taxiway_landing: ['{T} {N} LANDS ON THE TAXIWAY', '"It is a runway if I land on it," peer insists'],
  apron_landing: ['VALET PARKING: {T} {N} TOUCHES DOWN AT THE TERMINAL', 'Duty-free queue "never more alert"'],
  wrong_way: ['WRONG WAY, YOUR GRACE', '{T} {N} flies the circuit backwards, calls it "tradition"'],
  tower_buzz: ['OWL COLLECTION SHAKEN AS {T} {N} BUZZES TOWER', 'Controller found under desk with tea'],
  terminal_buzz: ['WINDOWS RATTLED: {T} {N} BUZZES TERMINAL', 'Passengers "thrilled", say peer\'s staff'],
  low_pass: ['ROYAL FLYPAST NOBODY ASKED FOR', '{T} {N} skims runway at knee height'],
  light_touch: ['CLOSE CALL! {T} {N} SWAPS PAINT WITH A COMMONER', 'Victim\'s paintwork "emotionally scarred"'],
  near_miss: ['NEAR MISS! {T} {N} "DIDN\'T SEE THEM, DIDN\'T LOOK"', 'Aviation authority sends strongly worded card'],
  double_occupancy: ['TWO PLANES, ONE RUNWAY, ONE {T}', 'Sharing is "for commoners", says {N}'],
  forced_goaround: ['COMMONERS SENT ROUND BY {T} {N}', 'Fuel bills mount across the shire'],
  intersection_dash: ['{T} {N} RUNS THE CROSSROADS', 'Both runways at once. "Efficient," says peer'],
  unauth_takeoff: ['{T} {N} DEPARTS WITHOUT ASKING', '"Asking is for people who might be told no"'],
};

export function createHeadlines(root, { onReel } = {}) {
  const badge = document.createElement('div');
  badge.className = 'krz-paper';
  badge.hidden = true;
  badge.innerHTML = `<span class="krz-paper-ico">${PAPER}</span><b>0</b>`;
  const toast = document.createElement('div');
  toast.className = 'krz-paper-toast';
  toast.hidden = true;
  root.append(badge, toast);
  const S = { list: [], seen: new Set(), ctx: {}, reel: null, toastT: 0, skipAll: false };

  const fill = (s) => s.replace(/\{T\}/g, (S.ctx.title || 'BARON').toUpperCase()).replace(/\{N\}/g, (S.ctx.name || 'DIRK').toUpperCase());
  function paint() {
    badge.hidden = !S.list.length || !!S.reel;
    badge.querySelector('b').textContent = S.list.length;
  }
  function add(h, sub = '', kind = 'story') {
    if (S.list.length >= 12) return;
    S.list.push({ h, sub, kind });
    paint();
    badge.classList.remove('krz-bump'); void badge.offsetWidth; badge.classList.add('krz-bump');
    toast.textContent = kind === 'scandal' ? 'Royal scandal! That\'ll hit the papers!' : 'That\'ll hit the papers!';
    toast.hidden = false;
    toast.classList.remove('in'); void toast.offsetWidth; toast.classList.add('in');
    clearTimeout(S.toastT);
    S.toastT = setTimeout(() => { toast.classList.remove('in'); setTimeout(() => { toast.hidden = true; }, 350); }, 2200);
  }

  function closeReel(all) {
    const r = S.reel;
    if (!r) return;
    S.reel = null;
    r.el.classList.add('out');
    setTimeout(() => r.el.remove(), 400);
    if (all) S.skipAll = true;
    paint();
    onReel?.(false);
  }
  function showCard(r) {
    const it = r.items[r.i];
    r.card.innerHTML = `<div class="krz-herald-mast">THE KRAYZEE HERALD</div><div class="krz-herald-rule"><span>${it.kind === 'scandal' ? 'STOP PRESS' : 'LATE EDITION'}</span><span>${r.i + 1} OF ${r.items.length}</span></div><div class="krz-herald-h">${esc(it.h)}</div>${it.sub ? `<div class="krz-herald-foot">${esc(it.sub)}</div>` : ''}`;
    r.card.classList.remove('in'); void r.card.offsetWidth; r.card.classList.add('in');
    r.next.textContent = r.i + 1 < r.items.length ? 'Next' : 'Done';
    r.all.hidden = r.i + 1 >= r.items.length;
  }

  const api = {
    badge, toast,
    setContext(ctx) { Object.assign(S.ctx, ctx); },
    reset() { S.list = []; S.seen.clear(); S.skipAll = false; closeReel(false); paint(); toast.hidden = true; },
    onPP(e) {
      if (e.frozen || !(e.amount > 0) || !STORIES[e.id] || S.seen.has(e.id)) return;
      S.seen.add(e.id);
      const [h, sub] = STORIES[e.id];
      add(fill(h), fill(sub));
    },
    onScandal(e) {
      const h = String(e.headline || '').replace(/^THE KRAYZEE HERALD:\s*/i, '');
      add(h || fill('{T} {N} DISGRACES AERODROME'), e.forfeit > 0 ? `${Math.round(e.forfeit).toLocaleString('en-GB')} PP forfeited` : 'Nothing counts for a while', 'scandal');
    },
    // After landing: DEMAND IT, mission complete, a flight ended by scandal. Returns true if a reel opened.
    reel() {
      if (S.reel || !S.list.length) return false;
      const items = S.list.splice(0);
      S.seen.clear();
      if (S.skipAll) { paint(); return false; }
      const el = document.createElement('div');
      el.className = 'krz-reel';
      el.innerHTML = '<div class="krz-herald krz-reel-card"></div><div class="krz-reel-btns"><button type="button" class="krz-reel-all">Skip all</button><button type="button" class="krz-reel-next">Next</button></div>';
      document.body.append(el);
      const r = { el, items, i: 0, card: el.querySelector('.krz-reel-card'), next: el.querySelector('.krz-reel-next'), all: el.querySelector('.krz-reel-all') };
      S.reel = r;
      for (const b of [r.next, r.all]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
      r.next.addEventListener('click', (e) => { e.stopPropagation(); if (++r.i >= r.items.length) closeReel(false); else showCard(r); });
      r.all.addEventListener('click', (e) => { e.stopPropagation(); closeReel(true); });
      showCard(r);
      paint();
      onReel?.(true);
      return true;
    },
    closeReel,
    get state() { return { count: S.list.length, reel: S.reel ? { i: S.reel.i, n: S.reel.items.length } : null, skipAll: S.skipAll, toast: !toast.hidden }; },
  };
  return api;
}
