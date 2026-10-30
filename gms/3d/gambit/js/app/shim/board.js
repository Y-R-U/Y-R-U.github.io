// UI-side SHIM of js/board/board.js (TEAM_BRIEF): a flat DOM board with the
// same interface, so the shell can be built and tested before the Three.js
// board lands. deps.js swaps in the real one.
const FILES = 'abcdefgh';
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

export async function createBoard(container, opts = {}) {
  const root = document.createElement('div');
  root.className = 'shimboard';
  container.appendChild(root);
  const style = document.createElement('style');
  style.textContent = `
  .shimboard{position:absolute;inset:0;display:grid;grid-template:repeat(8,1fr)/repeat(8,1fr);user-select:none;touch-action:none;border-radius:6px;overflow:hidden}
  .shimboard .sq{position:relative;display:flex;align-items:center;justify-content:center}
  .shimboard .lt{background:#ead9b9}.shimboard .dk{background:#b0835a}
  .shimboard .pc{font-size:min(9.5vw,9vh,74px);line-height:1;pointer-events:none;transition:transform .12s}
  .shimboard .pc.w{color:#fbf7ef;text-shadow:0 0 1px #000,0 0 2px #000,0 2px 2px rgba(0,0,0,.4)}
  .shimboard .pc.b{color:#1d1b1a;text-shadow:0 0 1px #fff8,0 2px 2px rgba(0,0,0,.35)}
  .shimboard .sel{box-shadow:inset 0 0 0 100vmax rgba(245,165,36,.45)}
  .shimboard .last{box-shadow:inset 0 0 0 100vmax rgba(245,200,60,.35)}
  .shimboard .chk{background:radial-gradient(circle,#ff4d3d 0%,#e5534b66 45%,transparent 72%)}
  .shimboard .hint{box-shadow:inset 0 0 0 4px #4fb3ff}
  .shimboard .dot::after{content:'';position:absolute;width:30%;height:30%;border-radius:50%;background:rgba(20,20,20,.28)}
  .shimboard .ring::after{content:'';position:absolute;inset:4%;border-radius:50%;border:5px solid rgba(20,20,20,.28)}
  .shimboard .co{position:absolute;font:600 10px system-ui;opacity:.75;pointer-events:none}
  .shimboard .co.f{right:3px;bottom:1px}.shimboard .co.r{left:3px;top:2px}
  .shimboard .lt .co{color:#b0835a}.shimboard .dk .co{color:#ead9b9}
  .shimboard .ghost{position:fixed;pointer-events:none;z-index:50;transform:translate(-50%,-50%) scale(1.2)}`;
  root.appendChild(style);

  let pos = {};                // square -> {type,color}
  let orient = 'w', interactive = null, sel = null, hl = {}, coords = opts.coords !== false;
  const cells = {};
  const board = {
    onMoveAttempt: null,
    camera: { preset() {}, reset() {} },
    setPosition(fen) {
      pos = {};
      const rows = fen.split(' ')[0].split('/');
      rows.forEach((row, r) => {
        let f = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) { f += +ch; continue; }
          pos[FILES[f] + (8 - r)] = { type: ch.toLowerCase(), color: ch === ch.toLowerCase() ? 'b' : 'w' };
          f++;
        }
      });
      sel = null; render();
    },
    async applyMove(m) {
      const p = pos[m.from];
      delete pos[m.from];
      const cs = m.captureSquare || m.capturedSquare; if (cs) delete pos[cs];
      pos[m.to] = m.promotion ? { type: m.promotion, color: p ? p.color : m.color } : p;
      if (m.rookFrom) { pos[m.rookTo] = pos[m.rookFrom]; delete pos[m.rookFrom]; }
      sel = null; render();
      await new Promise(r => setTimeout(r, m.captured && speed !== 'off' ? 260 / (+speed || 1) : 60));
    },
    setOrientation(c) { orient = c; build(); },
    async setTheme() {},
    setAnimSpeed(s) { speed = s; },
    setInteractive(c) { interactive = c; if (!c) { sel = null; render(); } },
    setCoords(on) { coords = on; build(); },
    highlight(h) { hl = h || {}; render(); },
    showArrows() {},
    resize() {},
    dispose() { root.remove(); },
  };
  let speed = 1;

  function build() {
    [...root.querySelectorAll('.sq')].forEach(n => n.remove());
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const file = orient === 'w' ? f : 7 - f, rank = orient === 'w' ? 8 - r : r + 1;
      const sq = FILES[file] + rank;
      const d = document.createElement('div');
      d.className = 'sq ' + ((file + rank) % 2 ? 'lt' : 'dk');
      d.dataset.sq = sq;
      if (coords && r === 7) d.insertAdjacentHTML('beforeend', `<span class="co f">${FILES[file]}</span>`);
      if (coords && f === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${rank}</span>`);
      root.appendChild(d);
      cells[sq] = d;
    }
    render();
  }
  function targets(sq) { return opts.legalMoves ? opts.legalMoves(sq) : []; }
  function render() {
    const tg = sel ? targets(sel) : (hl.legalTargets || []);
    for (const [sq, d] of Object.entries(cells)) {
      const old = d.querySelector('.pc'); if (old) old.remove();
      const p = pos[sq];
      if (p) d.insertAdjacentHTML('beforeend', `<span class="pc ${p.color}">${GLYPH[p.type]}</span>`);
      d.classList.toggle('sel', sq === sel);
      d.classList.toggle('last', !!hl.lastMove && (hl.lastMove.from === sq || hl.lastMove.to === sq) && sq !== sel);
      d.classList.toggle('chk', hl.check === sq);
      d.classList.toggle('hint', !!hl.hint && (hl.hint.from === sq || hl.hint.to === sq));
      d.classList.toggle('dot', tg.includes(sq) && !p);
      d.classList.toggle('ring', tg.includes(sq) && !!p);
    }
  }
  const canMove = sq => pos[sq] && (interactive === 'both' || pos[sq].color === interactive);
  function attempt(from, to) {
    const ok = board.onMoveAttempt ? board.onMoveAttempt({ from, to }) : false;
    sel = null; render();
    return ok;
  }
  // tap-tap and drag-drop
  let drag = null;
  root.addEventListener('pointerdown', e => {
    const d = e.target.closest('.sq'); if (!d || !interactive) return;
    const sq = d.dataset.sq;
    if (sel && sel !== sq && targets(sel).includes(sq)) { attempt(sel, sq); return; }
    if (canMove(sq)) {
      sel = sq; render();
      const g = document.createElement('span');
      g.className = 'pc ghost ' + pos[sq].color; g.textContent = GLYPH[pos[sq].type];
      drag = { from: sq, g, moved: false, x: e.clientX, y: e.clientY };
      root.setPointerCapture(e.pointerId);
    } else { sel = null; render(); }
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      drag.moved = true; document.body.appendChild(drag.g);
      const pc = cells[drag.from].querySelector('.pc'); if (pc) pc.style.opacity = '.3';
    }
    if (drag.moved) { drag.g.style.left = e.clientX + 'px'; drag.g.style.top = e.clientY + 'px'; }
  });
  root.addEventListener('pointerup', e => {
    if (!drag) return;
    const dd = drag; drag = null; dd.g.remove();
    if (!dd.moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const d = el && el.closest && el.closest('.sq');
    if (d && d.dataset.sq !== dd.from) attempt(dd.from, d.dataset.sq); else render();
  });
  build();
  if (opts.fen) board.setPosition(opts.fen);
  return board;
}
