// GAMBIT piece name tags: a DOM pill that tracks a piece's projected head position.
// One tag at a time. Shown on: selecting your own piece, tapping an enemy piece with
// nothing selected, or hovering a piece for HOVER_MS on a fine pointer. Fades after LABEL_MS.
export const LABEL_MS = 4000;
export const HOVER_MS = 250;
const CHESS_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

const CSS = `
.gb-tag{position:absolute;left:0;top:0;z-index:3;pointer-events:none;opacity:0;
  transition:opacity .2s ease-out,margin-top .22s cubic-bezier(.2,1.4,.4,1);margin-top:5px;
  background:rgba(13,15,21,.8);border:1px solid rgba(227,183,96,.9);border-radius:999px;
  padding:3px 11px 4px;color:#f4e7c6;text-align:center;white-space:nowrap;
  font:600 13px/1.15 'Cinzel',Georgia,'Times New Roman',serif;font-variant:small-caps;letter-spacing:.06em;
  box-shadow:0 2px 10px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,230,170,.08);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.gb-tag.on{opacity:1;margin-top:0}
.gb-tag small{display:block;font-size:9.5px;letter-spacing:.1em;opacity:.72;margin-top:1px}
.gb-tag.two{border-radius:12px;padding:3px 12px 4px}`;
let cssDone = false;

export class NameTags {
  /** host: container element; project(sq) -> {x,y,visible} in container CSS px (head point). */
  constructor(host, { project, size }) {
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    this.el = document.createElement('div'); this.el.className = 'gb-tag';
    host.appendChild(this.el);
    this.project = project; this.size = size;
    this.sq = null; this.kind = null; this.timer = 0; this.hoverTimer = 0; this.hoverSq = null;
    this.names = null; this.enabled = true;
  }
  setNames(names) { this.names = names || null; }
  /** kind: 'select' | 'tap' | 'hover'. piece: {type,color}. */
  show(sq, piece, kind) {
    if (!this.enabled || !piece) return;
    const chess = CHESS_NAMES[piece.type] || '';
    const themed = this.names?.[piece.type];
    if (themed && themed !== chess) { this.el.innerHTML = `${esc(themed)}<small>${chess}</small>`; this.el.classList.add('two'); }
    else { this.el.textContent = chess; this.el.classList.remove('two'); }
    this.sq = sq; this.kind = kind;
    this.update();
    void this.el.offsetWidth;            // restart the scale-in
    this.el.classList.add('on');
    clearTimeout(this.timer);
    if (kind !== 'hover') this.timer = setTimeout(() => this.hide(), LABEL_MS);
  }
  hide(kind) {
    if (kind && this.kind !== kind) return;
    clearTimeout(this.timer);
    this.el.classList.remove('on');
    this.sq = null; this.kind = null;
  }
  get visible() { return !!this.sq; }
  /** Called every rendered frame (and on show) to follow the piece and the camera. */
  update() {
    if (!this.sq) return;
    // your own selected piece: tag BELOW it (its moves mostly go up-screen, keep the dots clear)
    const below = this.kind === 'select';
    const p = this.project(this.sq, below);
    if (!p) { this.hide(); return; }
    const { w: W, h: H } = this.size();
    const w = this.el.offsetWidth || 60, h = this.el.offsetHeight || 22, pad = 4;
    const x = Math.min(W - w / 2 - pad, Math.max(w / 2 + pad, p.x));
    let top = below ? p.y + 4 : p.y - 6 - h;
    if (below && top + h > H - pad) top = p.y - 6 - h - 40;     // no room below: go above instead
    top = Math.min(H - h - pad, Math.max(pad, top));             // always inside the board area
    // plain left/top (no transforms: cheaper, and avoids a compositor quirk over WebGL)
    this.el.style.left = `${(x - w / 2).toFixed(1)}px`; this.el.style.top = `${top.toFixed(1)}px`;
  }
  /** Hover tracking for fine pointers: call with the hovered square (or null). */
  hover(sq, piece) {
    if (sq === this.hoverSq) return;
    this.hoverSq = sq; clearTimeout(this.hoverTimer);
    if (!sq) { this.hide('hover'); return; }
    if (this.kind === 'hover') this.hide('hover');
    if (this.kind && this.kind !== 'hover' && this.sq === sq) return;
    this.hoverTimer = setTimeout(() => { if (this.hoverSq === sq && (!this.kind || this.kind === 'hover')) this.show(sq, piece, 'hover'); }, 250);
  }
  dispose() { clearTimeout(this.timer); clearTimeout(this.hoverTimer); this.el.remove(); }
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
