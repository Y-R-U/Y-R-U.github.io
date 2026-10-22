// In-flight online HUD: the Court ladder (ONLINE §7, D4) and a connection pill under the pause button.
// Fed by polling: sync(session, net) every frame (self-throttled), or set({ standings, me, link, connected }) from a bench.
// Network names only ever go through textContent.
import { titleFor } from '../ui/ranks.js';

const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 38 L2 10 L18 22 L32 4 L46 22 L62 10 L58 38 Z" fill="currentColor"/><circle cx="2" cy="10" r="3" fill="currentColor"/><circle cx="32" cy="4" r="3.4" fill="currentColor"/><circle cx="62" cy="10" r="3" fill="currentColor"/></svg>';
const CHEV = '<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const KEY = 'krayzee.courtCollapsed';
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const fmt = (n) => Math.round(n || 0).toLocaleString('en-GB');
const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n || 0)));
const store = { get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }, set(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* */ } } };

export function linkQuality(link, connected = true) {
  if (link?.autopilot) return { kind: 'ap', label: 'AUTOPILOT', bars: 1, text: 'The tower autopilot has your plane' };
  if (link?.reconnecting || (!connected && link)) return { kind: 'recon', label: 'RECONNECTING', bars: 0, text: 'Reconnecting to the room…' };
  if (!connected) return { kind: 'off', label: 'OFFLINE', bars: 0, text: 'Offline' };
  if (!link) return null;
  if (link.alone) return { kind: 'solo', label: 'SOLO', bars: 4, text: 'Waiting for other royals' };
  const rtt = link.rtt || 0, bars = rtt < 90 ? 4 : rtt < 160 ? 3 : rtt < 260 ? 2 : 1;
  const kind = !link.relayed ? 'direct' : link.relayed >= link.total ? 'relay' : 'mixed';
  const label = kind === 'direct' ? 'DIRECT' : kind === 'relay' ? 'RELAY' : 'MIXED';
  const text = `${kind === 'direct' ? 'Direct' : kind === 'relay' ? 'Relayed' : `${link.relayed}/${link.total} relayed`} · ${rtt} ms`;
  return { kind, label, bars, text };
}

export function createOnlineHUD(root, { onToggle } = {}) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'krz-net';
  pill.hidden = true;
  pill.innerHTML = '<i class="krz-net-bars" aria-hidden="true"><b></b><b></b><b></b><b></b></i><span class="krz-net-l"></span>';
  const court = document.createElement('div');
  court.className = 'krz-court';
  court.hidden = true;
  court.innerHTML = `<button type="button" class="krz-crt-head" aria-expanded="true"><span class="krz-crt-ico">${CROWN}</span><span class="krz-crt-h">COURT</span><span class="krz-crt-me"></span><span class="krz-crt-chev">${CHEV}</span></button>
    <div class="krz-crt-news" aria-live="polite"></div><ol class="krz-crt-list"></ol>`;
  root.append(pill, court);
  const head = court.querySelector('.krz-crt-head'), list = court.querySelector('.krz-crt-list'), news = court.querySelector('.krz-crt-news');
  const meEl = court.querySelector('.krz-crt-me'), pillL = pill.querySelector('.krz-net-l'), bars = [...pill.querySelectorAll('.krz-net-bars b')];
  for (const n of [pill, court]) n.addEventListener('pointerdown', (e) => e.stopPropagation());

  const S = { on: false, collapsed: store.get(), peek: 0, holder: null, crowns: 0, key: '', lkey: '', last: 0, lastLink: 0, rows: 5, measured: 0,
    standings: [], me: null, link: null, detail: 0, newsT: 0 };
  const rowEls = new Map();

  function applyCollapsed() {
    const c = S.collapsed && !S.peek;
    court.dataset.collapsed = c ? '1' : '0';
    head.setAttribute('aria-expanded', String(!c));
    head.setAttribute('aria-label', c ? 'Show the Court' : 'Hide the Court');
  }
  head.addEventListener('click', (e) => {
    e.stopPropagation();
    S.collapsed = !(S.collapsed && !S.peek);
    clearTimeout(S.peek); S.peek = 0;
    store.set(S.collapsed);
    applyCollapsed();
    onToggle?.(S.collapsed);
  });
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(S.detail);
    pill.classList.add('open');
    S.detail = setTimeout(() => { pill.classList.remove('open'); S.detail = 0; paintLink(true); }, 3000);
    paintLink(true);
  });

  // Rows that fit between the ladder's top and whatever sits below it in the same column (radio, stick, LAND, actions).
  function measure() {
    S.measured = performance.now();
    if (court.hidden) return;
    // Landscape with the stick on the right: the subtitles take the left column, so the pill moves beside the tower badge.
    const tower = document.querySelector('.krz-r-tower')?.getBoundingClientRect();
    const swap = innerWidth > innerHeight && document.documentElement.dataset.krzHand === 'right' && tower?.width;
    pill.style.top = swap ? `${Math.round(tower.top + (tower.height - 20) / 2)}px` : '';
    pill.style.left = swap ? 'auto' : '';
    pill.style.right = swap ? `${Math.round(innerWidth - tower.left + 8)}px` : '';
    const box = court.getBoundingClientRect(), top = box.top + 30;
    let bottom = innerHeight - 8;
    for (const sel of ['.krz-r-btn', '.krz-stick-base', '.krz-thr', '.krz-pad', '.krz-land', '.krz-finish', '.krz-prompt', '.krz-ground', '.krz-coach-bub']) {
      for (const n of document.querySelectorAll(sel)) {
        const r = n.getBoundingClientRect();
        if (!r.width || r.top < top || r.left > box.right || r.right < box.left) continue;
        bottom = Math.min(bottom, r.top - 6);
      }
    }
    const rowH = parseFloat(getComputedStyle(court).getPropertyValue('--row')) || 22;
    const n = Math.max(3, Math.min(5, Math.floor((bottom - top) / rowH)));
    if (n !== S.rows) { S.rows = n; S.key = ''; paint(); }
  }
  addEventListener('resize', () => { S.measured = 0; });

  function visibleRows() {
    const st = S.standings, max = S.rows;
    if (st.length <= max) return st.map((p) => ({ p }));
    const mine = st.findIndex((p) => p.id === S.me);
    if (mine < max) return st.slice(0, max).map((p) => ({ p }));
    return [...st.slice(0, max - 1).map((p) => ({ p })), { p: st[mine], gap: true }];
  }

  function paint() {
    const st = S.standings, mine = st.findIndex((p) => p.id === S.me), holder = st.find((p) => p.crown)?.id ?? null;
    const vis = visibleRows();
    const key = `${S.rows}|${S.me}|${holder}|${vis.map(({ p, gap }) => `${p.id}:${p.rankIndex}:${Math.round(p.roomPP)}:${p.name}:${gap ? 1 : 0}`).join(',')}|${st.length}`;
    if (key === S.key) return;
    S.key = key;
    const before = new Map();
    for (const [id, li] of rowEls) if (li.isConnected) before.set(id, li.getBoundingClientRect().top);
    const keep = new Set();
    vis.forEach(({ p, gap }) => {
      let li = rowEls.get(p.id);
      if (!li) {
        li = document.createElement('li');
        li.innerHTML = '<span class="krz-crt-pl"></span><span class="krz-crt-who"><small></small><b></b></span><span class="krz-crt-pp"></span>';
        rowEls.set(p.id, li);
      }
      keep.add(p.id);
      const you = p.id === S.me, crown = p.id === holder;
      li.dataset.id = p.id;
      li.classList.toggle('you', you);
      li.classList.toggle('crown', crown);
      li.classList.toggle('gap', !!gap);
      const pl = li.querySelector('.krz-crt-pl');
      if (crown) { if (!pl.querySelector('svg')) pl.innerHTML = CROWN; } else pl.textContent = String(p.place + 1);
      li.querySelector('small').textContent = titleFor(p.gender, p.rankIndex);
      li.querySelector('b').textContent = you ? 'You' : (p.name || 'Royal');
      const pp = li.querySelector('.krz-crt-pp');
      pp.textContent = short(p.roomPP);
      pp.title = `${fmt(p.roomPP)} PP`;
      list.append(li);
    });
    for (const [id, li] of rowEls) if (!keep.has(id)) { li.remove(); rowEls.delete(id); }
    meEl.textContent = mine < 0 ? '' : holder === S.me ? 'YOURS' : `${ord(mine + 1)}/${st.length}`;
    court.dataset.mine = holder === S.me ? 'crown' : '';
    if (holder !== S.holder) {
      S.holder = holder;
      if (holder && S.seeded) crowned(holder);
    }
    S.seeded = true;
    // FLIP: rows slide to their new places when the order changes.
    for (const li of list.children) {
      const was = before.get(li.dataset.id);
      if (was == null) continue;
      const dy = was - li.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${dy}px)`;
      li.getBoundingClientRect();
      li.style.transition = '';
      li.style.transform = '';
    }
  }

  function crowned(id) {
    S.crowns++;
    const p = S.standings.find((x) => x.id === id);
    const li = rowEls.get(id);
    if (li) { li.classList.remove('crowned'); li.getBoundingClientRect(); li.classList.add('crowned'); }
    news.textContent = id === S.me ? 'You take the Crown!' : `${p?.name || 'A rival'} takes the Crown`;
    court.classList.remove('krz-crt-flash'); court.getBoundingClientRect(); court.classList.add('krz-crt-flash');
    clearTimeout(S.newsT);
    S.newsT = setTimeout(() => { court.classList.remove('krz-crt-flash'); news.textContent = ''; }, 3200);
    if (S.collapsed) {
      clearTimeout(S.peek);
      S.peek = setTimeout(() => { S.peek = 0; applyCollapsed(); }, 4000);
      applyCollapsed();
    }
  }

  function paintLink(force = false) {
    const q = linkQuality(S.link, S.connected);
    const k = q ? `${q.kind}|${q.bars}|${pill.classList.contains('open') ? q.text : q.label}` : '';
    if (!force && k === S.lkey) return;
    S.lkey = k;
    pill.hidden = !S.on || !q;
    if (!q) return;
    pill.dataset.q = q.kind;
    pillL.textContent = pill.classList.contains('open') ? q.text : q.label;
    pill.setAttribute('aria-label', `Connection: ${q.text}`);
    bars.forEach((b, i) => b.classList.toggle('on', i < q.bars));
  }

  function set({ standings = [], me = null, link = null, connected = true } = {}) {
    if (!S.on) return;
    S.standings = standings; S.me = me; S.link = link; S.connected = connected;
    if (!S.measured || performance.now() - S.measured > 2000) measure();
    paint();
    paintLink();
  }

  function setVisible(on) {
    if (on === S.on) return;
    S.on = on;
    court.hidden = !on; pill.hidden = !on;
    root.classList?.toggle('has-court', on);
    if (!on) {
      S.key = ''; S.lkey = ''; S.holder = null; S.seeded = false; S.crowns = 0; S.measured = 0;
      for (const li of rowEls.values()) li.remove();
      rowEls.clear();
      clearTimeout(S.peek); S.peek = 0; clearTimeout(S.newsT); news.textContent = ''; court.classList.remove('krz-crt-flash');
    }
    applyCollapsed();
  }

  applyCollapsed();
  return {
    pill, court, set, setVisible, measure,
    // Call every frame; reads the session at ~5 Hz and the link at ~1 Hz.
    sync(session, net) {
      const live = !!(session?.attached && net);
      if (!live) { if (S.on) setVisible(false); return; }
      if (!S.on) setVisible(true);
      const now = performance.now();
      if (now - S.last < 200) return;
      S.last = now;
      let link = S.link, connected = S.connected;
      if (now - S.lastLink > 1000 || !S.lastLink) {
        S.lastLink = now;
        try { link = net.linkSummary?.() ?? null; connected = net.connected !== false; } catch (e) { link = null; }
      }
      let st = [];
      try { st = session.standings() || []; } catch (e) { /* */ }
      set({ standings: st, me: `p:${net.id}`, link, connected });
    },
    get state() {
      return { on: S.on, collapsed: court.dataset.collapsed === '1', peek: !!S.peek, rows: S.rows, holder: S.holder, crowns: S.crowns, news: news.textContent,
        shown: [...list.children].map((li) => li.dataset.id), me: meEl.textContent, link: pill.hidden ? null : { q: pill.dataset.q, label: pillL.textContent, bars: bars.filter((b) => b.classList.contains('on')).length } };
    },
  };
}
