// The arena's leaderboards and your own stats card. Read-only: everything here comes from the
// arena server's agreed results (ghost fights never reach it). On the family LAN the base is
// the LAN server, so these are that server's own boards.

export const BOARDS = [
  { id: 'today', label: 'TODAY', head: 'most battles today', typed: false },
  { id: 'battles', label: 'BATTLES', head: 'most arena battles', typed: true },
  { id: 'wins', label: 'WINS', head: 'most wins', typed: true },
  { id: 'streak', label: 'STREAK', head: 'best win streak', typed: false },
  { id: 'kos', label: 'KOs', head: 'most knockouts', typed: false },
  { id: 'losses', label: 'LOSSES', head: 'most losses (keep going!)', typed: true },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param o.base   () => the arena base URL, or null
 * @param o.token  async () => a bearer token ('' when signed out)
 * @param o.types  () => [{id, short}] arena types that have their own boards
 * @param o.paint  () => repaint the panel
 */
export function createBoards(o) {
  let board = 'today', type = '', rows = null, card = null, cardState = 'loading', err = '', seq = 0;

  async function get(path, tok) {
    const r = await fetch(o.base() + path, { cache: 'no-store', headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
    return { status: r.status, body: r.ok ? await r.json() : null };
  }

  async function refresh() {
    const my = ++seq;
    rows = null; err = '';
    o.paint();
    const tok = await o.token().catch(() => '');
    const B = BOARDS.find((b) => b.id === board);
    const q = `/leaderboard?board=${board}&n=25${B.typed && type ? `&type=${encodeURIComponent(type)}` : ''}`;
    const [lb, me] = await Promise.all([
      get(q, tok).catch(() => null),
      tok ? get('/me', tok).catch(() => null) : Promise.resolve({ status: 401 }),
    ]);
    if (my !== seq) return;
    if (!lb || lb.status !== 200) err = 'The boards are offline right now — try again in a bit.';
    else rows = lb.body.rows || [];
    if (me?.status === 200) { card = me.body; cardState = 'ok'; }
    else { card = null; cardState = me?.status === 401 ? 'signedout' : 'error'; }
    o.paint();
  }

  function cardHTML() {
    if (cardState === 'loading') return `<div class="statcard"><p class="fine">loading your stats…</p></div>`;
    if (cardState === 'signedout') return `<div class="statcard"><p class="fine">Sign in (the account button) to get on the boards. Friend links and ghosts work without one.</p></div>`;
    if (cardState === 'error' || !card) return '';
    if (!card.battles) {
      return `<div class="statcard"><p class="fine">No ranked battles yet — your first arena fight puts you on the boards.</p></div>`;
    }
    const cell = (k, v) => `<div><b>${esc(v)}</b><small>${k}</small></div>`;
    const types = o.types().filter((t) => card.types?.[t.id]).map((t) => {
      const x = card.types[t.id];
      return `${esc(t.short)} ${x.wins}–${x.losses}`;
    });
    return `<div class="statcard"><div class="who"><b>${esc(card.name)}</b><span>#${card.rank} for wins</span></div>
      <div class="cells">${cell('battles', card.battles)}${cell('wins', card.wins)}${cell('losses', card.losses)}${cell('best streak', card.bestStreak)}${cell('KOs', card.kos)}${cell('today', card.today)}</div>
      ${types.length ? `<p class="fine">${types.join(' · ')}${card.streak ? ` · on a ${card.streak}-win streak` : ''}</p>` : ''}</div>`;
  }

  function html() {
    const B = BOARDS.find((b) => b.id === board);
    let h = cardHTML();
    h += `<div class="seg" role="tablist">${BOARDS.map((b) => `<button class="${b.id === board ? 'on' : ''}" data-b="${b.id}" role="tab" aria-selected="${b.id === board}">${b.label}</button>`).join('')}</div>`;
    const types = o.types();
    if (B.typed && types.length > 1) {
      h += `<div class="seg sub">${[{ id: '', short: 'ALL TYPES' }, ...types].map((t) => `<button class="${t.id === type ? 'on' : ''}" data-bt="${esc(t.id)}">${esc(t.short)}</button>`).join('')}</div>`;
    }
    h += `<p class="boardhead">${esc(B.head)}${B.typed && type ? ` · ${esc(types.find((t) => t.id === type)?.short || type)}` : ''}</p>`;
    if (err) h += `<p class="fine">${esc(err)}</p>`;
    else if (!rows) h += `<p class="fine">loading…</p>`;
    else if (!rows.length) h += `<p class="fine">${board === 'today' ? 'Nobody has fought today yet — be the first.' : 'Nobody on this board yet.'}</p>`;
    else {
      h += `<ol class="board">${rows.map((r, i) => `<li class="${r.you ? 'you' : ''}"><span class="pos">${i + 1}</span><span class="lname">${esc(r.name)}${r.you ? ' <small>(you)</small>' : ''}</span><b>${r.value}</b></li>`).join('')}</ol>`;
    }
    return h;
  }

  /** Handles a click inside the panel; true if it was ours. */
  function click(el) {
    if (el.dataset.b) { board = el.dataset.b; if (!BOARDS.find((b) => b.id === board).typed) type = ''; refresh(); return true; }
    if (el.dataset.bt !== undefined) { type = el.dataset.bt; refresh(); return true; }
    return false;
  }

  return { html, refresh, click, get board() { return board; }, get rows() { return rows; } };
}
