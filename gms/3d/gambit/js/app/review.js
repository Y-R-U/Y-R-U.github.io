// Move-list review (ui-2): tap a move to see that position, ◀ ▶ (or ← →) to step,
// "Live" to go back. Shared by the bot game and the online game.
//
//   const review = createReview({ chess: () => G.chess, board: () => board, onExit: () => resyncLive() });
//   review.bind(screenEl);        // clicks on .m[data-ply] and [data-rev], arrow keys; returns an unbind fn
//   review.on / review.ply        // reviewing? / plies shown (position after `ply` moves)
//   review.exit({ beforeLast })   // leave review; beforeLast = show the position before the newest
//                                 // move (the caller is about to animate it) instead of calling onExit
//   review.sync()                 // re-mark the move list + nav after the list re-rendered
//
// While reviewing the board is non-interactive and the screen gets `.reviewing` (gold frame).
export function createReview({ chess, board, onExit, onChange }) {
  let root = null;
  const r = {
    on: false, ply: 0,
    hist() { const c = chess(); return c ? c.history({ verbose: true }) : []; },
    fenAt(n) {
      const c = chess(); if (!c) return null;
      const C = c.constructor, x = new C();
      const h = r.hist();
      for (let i = 0; i < n && i < h.length; i++) x.move(h[i].lan || { from: h[i].from, to: h[i].to, promotion: h[i].promotion });
      return { fen: x.fen(), chess: x, last: n > 0 ? h[n - 1] : null };
    },
    show(n) {
      const len = r.hist().length;
      n = Math.max(0, Math.min(n, len));
      if (n >= len) { if (r.on) r.exit(); return; }
      const b = board(); if (!b) return;
      const at = r.fenAt(n);
      r.on = true; r.ply = n;
      b.setInteractive(null);
      b.setPosition(at.fen, { animate: false });
      let check = null;
      if (at.chess.inCheck()) check = kingSq(at.chess, at.chess.turn());
      b.highlight({ lastMove: at.last ? { from: at.last.from, to: at.last.to } : null, check, checkPopup: false, hint: null, legalTargets: [] });   // checkalert: badge only while reviewing
      b.showArrows?.([]);
      r.sync();
      onChange && onChange(true);
    },
    step(d) { const len = r.hist().length; r.show((r.on ? r.ply : len) + d); },
    exit({ beforeLast = false } = {}) {
      if (!r.on) return;
      r.on = false;
      if (beforeLast) {
        const b = board(), len = r.hist().length;
        if (b) { const at = r.fenAt(len - 1); b.setPosition(at.fen, { animate: false }); }
      } else onExit && onExit();
      r.sync();
      onChange && onChange(false);
    },
    sync() {
      if (!root) return;
      const len = r.hist().length;
      root.classList.toggle('reviewing', r.on);
      root.querySelectorAll('.moves .m[data-ply]').forEach(m => {
        const p = +m.dataset.ply;
        m.classList.toggle('sel', r.on && p === r.ply - 1);
        m.classList.toggle('cur', !r.on && p === len - 1);
      });
      const prev = root.querySelector('[data-rev="prev"]'), next = root.querySelector('[data-rev="next"]'), live = root.querySelector('[data-rev="live"]');
      const at = r.on ? r.ply : len;
      if (prev) prev.disabled = at <= 0;
      if (next) next.disabled = !r.on;
      if (live) { live.hidden = !r.on; live.querySelector('b') && (live.querySelector('b').textContent = r.on ? `${Math.ceil(r.ply / 2) || 0}${r.ply % 2 ? '.' : '…'}` : ''); }
      const sel = root.querySelector('.moves .m.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    bind(el) {
      root = el;
      const click = e => {
        const m = e.target.closest('.moves .m[data-ply]');
        if (m) { r.show(+m.dataset.ply + 1); return; }
        const a = e.target.closest('[data-rev]'); if (!a || a.disabled) return;
        if (a.dataset.rev === 'prev') r.step(-1);
        else if (a.dataset.rev === 'next') r.step(1);
        else r.exit();
      };
      const key = e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (document.querySelector('.scrim')) return;
        const b = board();
        if (b && b.camera && b.camera.view === 'free') return;   // arrows orbit in Free view
        e.preventDefault();
        r.step(e.key === 'ArrowLeft' ? -1 : 1);
      };
      el.addEventListener('click', click);
      window.addEventListener('keydown', key);
      r.sync();
      return () => { el.removeEventListener('click', click); window.removeEventListener('keydown', key); if (root === el) root = null; r.on = false; };
    },
  };
  return r;
}

function kingSq(c, color) {
  const b = c.board();
  for (let i = 0; i < 8; i++) for (let f = 0; f < 8; f++) {
    const p = b[i][f];
    if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - i);
  }
  return null;
}

/** Nav cluster markup: ◀ ▶ + the "back to live" chip (hidden until reviewing). */
export const reviewNavHtml = () => `<div class="mv-nav">
  <button class="rev-live" data-rev="live" hidden aria-label="Back to the live position"><span>Move <b></b></span><span class="rl-go">Live ▸</span></button>
  <button class="mv-btn" data-rev="prev" aria-label="Previous move">◀</button>
  <button class="mv-btn" data-rev="next" aria-label="Next move" disabled>▶</button>
</div>`;

/** The move list body: `<li>` pairs with data-ply on every move. */
export function movesHtml(sans, { cur = true } = {}) {
  let html = '';
  for (let i = 0; i < sans.length; i += 2) {
    const m = j => `<span class="m${cur && j === sans.length - 1 ? ' cur' : ''}" data-ply="${j}" role="button" tabindex="-1">${esc(sans[j])}</span>`;
    html += `<li><span class="n">${i / 2 + 1}.</span>${m(i)}${sans[i + 1] ? m(i + 1) : ''}</li>`;
  }
  return html;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
