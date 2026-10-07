// Flashcards: deck picker and the Leitner review session.
import { h } from '../ui/kit.js?v=202610071324';
import { header, go, back } from '../ui/app.js?v=202610071324';
import { popup } from '../ui/popup.js?v=202610071324';
import { sfx, haptic, confetti } from '../ui/fx.js?v=202610071324';
import { addStars } from '../ui/stickers.js?v=202610071324';
import { getIndex } from '../core/packs.js?v=202610071324';
import { themeTree, getPack, itemsFor, refOf, thumb, factRows, kidsOn } from './data.js?v=202610071324';
import { getCards, updateCards, gradeCard, today } from './model.js?v=202610071324';
import { buildQueue, dueSummary, INTERVALS, MAX_BOX } from './srs.js?v=202610071324';
import { carousel } from './item.js?v=202610071324';
import { say, sayBtn, emptyState, notice, stopAudio, soundBtn, put } from './ui.js?v=202610071324';

const KIDS_STAR_CAP = 10;

async function deckRefs(decks, kids) {
  const packs = (await Promise.all(decks.map(id => getPack(id).catch(() => null)))).filter(Boolean);
  const refs = [];
  for (const p of packs) for (const it of itemsFor(p, kids)) refs.push(refOf(p, it));
  return refs;
}

export async function deckSetup(el) {
  const kids = kidsOn();
  el.append(header('Flashcards'));
  const d = getCards();
  const sumEl = h('div.l-sum');
  const startBtn = h('button.btn.primary.big.wide', { type: 'button', dataset: { act: 'start' }, onclick: () => go('l-review') }, '▶ Review');
  el.append(h('div.panel.l-deckhead', {}, sumEl, startBtn));
  const refresh = async () => {
    const dd = getCards();
    const s = dueSummary(dd.cards, await deckRefs(dd.decks, kids), today(), dd.newSeen);
    const games = Object.values(dd.cards).filter(c => c.g).length;
    sumEl.innerHTML = '';
    put(sumEl,
      stat(s.due, 'due'), stat(s.fresh, 'new today'), stat(s.learning, 'learning'), stat(s.mastered, 'learned'),
      games ? h('p.tiny.muted.l-gamefeed', {}, `🎯 ${games} missed in games waiting for you`) : null);
    startBtn.disabled = s.total === 0;
    startBtn.textContent = s.total ? `▶ Review ${s.total} card${s.total === 1 ? '' : 's'}` : (dd.decks.length || dd.cards && Object.keys(dd.cards).length ? 'All done for today ✓' : 'Pick some packs below');
  };
  refresh();

  if (!kids) {
    const modes = [['auto', 'Auto'], ['pic', 'Picture → name'], ['name', 'Name → facts']];
    const chips = h('div.chips', {}, ...modes.map(([k, label]) => {
      const c = h('button.chip', { type: 'button', class: d.mode === k ? 'on' : '', dataset: { mode: k } }, label);
      c.addEventListener('click', () => { updateCards(x => { x.mode = k; }); chips.querySelectorAll('.chip').forEach(z => z.classList.toggle('on', z === c)); });
      return c;
    }));
    el.append(h('div.opt', {}, h('div.opt-label', {}, 'Card style'), chips));
  }
  el.append(h('h2.sec-title', {}, kids ? 'Pick your cards' : 'Your deck'), h('p.muted.tiny', {}, kids ? 'Tap the packs you want to learn.' : `Tick packs to add them. ${10} new cards a day, plus anything you miss in games.`));
  const tree = themeTree({ kids, need: p => kids ? p.caps?.img > 0 : true });
  for (const t of tree) {
    const wrap = h('div.l-deckpacks', {});
    for (const p of t.packs) {
      const on = () => getCards().decks.includes(p.id);
      const b = h('button.l-dp', { type: 'button', class: on() ? 'on' : '', dataset: { pack: p.id }, 'aria-pressed': String(on()) },
        h('span.dp-ico', {}, p.icon || '❓'), h('span.dp-name', {}, p.title), h('span.dp-tick', {}, '✓'));
      b.addEventListener('click', () => {
        updateCards(x => { x.decks = x.decks.includes(p.id) ? x.decks.filter(z => z !== p.id) : [...x.decks, p.id]; });
        b.classList.toggle('on', on()); b.setAttribute('aria-pressed', String(on()));
        sfx('button');
        refresh();
      });
      wrap.append(b);
    }
    el.append(h('div.l-deckt', {}, h('div.l-flabel', {}, `${t.icon} ${t.title}`), wrap));
  }
}
const stat = (n, label) => h('div.l-stat', {}, h('b', {}, String(n)), h('small', {}, label));

const ivl = b => { const d = INTERVALS[Math.min(MAX_BOX, b)]; return d >= 30 ? `${Math.round(d / 30)}mo` : `${d}d`; };

export async function review(el) {
  const kids = kidsOn();
  el.append(header(kids ? 'Flashcards' : 'Review'));
  const stage = h('div.l-review', {}, h('p.muted.center', {}, 'Shuffling…'));
  el.append(stage);
  const d = getCards();
  const deck = await deckRefs(d.decks, kids);
  const s = dueSummary(d.cards, deck, today(), d.newSeen);
  const queue = buildQueue(d.cards, deck, today(), s.fresh, kids ? 12 : 40);
  // load every pack the queue touches (game misses can come from packs outside the deck)
  const pids = [...new Set(queue.map(r => r.slice(0, r.indexOf('/'))))];
  const packs = Object.fromEntries((await Promise.all(pids.map(id => getPack(id).catch(() => null)))).filter(Boolean).map(p => [p.id, p]));
  const lookup = r => { const [pid, iid] = r.split('/'); const pack = packs[pid]; const item = pack?.items.find(x => x.id === iid); return item ? { pack, item, ref: r } : null; };
  const q = queue.map(lookup).filter(Boolean);
  const total = q.length;
  let done = 0, right = 0, stars = 0;
  const again = new Set();
  if (!total) {
    stage.innerHTML = '';
    stage.append(emptyState('🎉', 'Nothing to review', d.decks.length ? 'You are all caught up. Come back tomorrow!' : 'Pick some packs for your deck first.',
      h('button.btn.primary', { type: 'button', onclick: () => go('l-cards', {}, { replace: true }) }, d.decks.length ? 'Deck' : 'Pick packs')));
    return;
  }
  const mode = d.mode || 'auto';
  const bar = h('div.l-prog', {}, h('i'));
  const setBar = () => { bar.firstChild.style.width = `${Math.round(100 * done / total)}%`; };

  function show() {
    stopAudio();
    stage.innerHTML = '';
    if (!q.length) return finish();
    const e = q[0];
    const img = thumb(e.item);
    const pic = img && mode !== 'name';
    const card = h('div.l-card', { dataset: { ref: e.ref } });
    const front = h('div.l-face.front');
    if (pic) front.append(carousel([img], ''), h('p.l-ask', {}, kids ? 'Who is this?' : 'What is this?'));
    else front.append(h('div.l-card-ico', {}, e.pack.icon || '❓'), h('h2.l-card-name', {}, e.item.name), h('p.l-ask', {}, `What do you know about ${e.item.lname || e.item.name}?`));
    const audio = e.item.media?.audio?.[0];
    const backF = h('div.l-face.back', { hidden: true },
      h('h2.l-card-name', {}, e.item.name), e.item.sci && !kids ? h('div.l-sci', {}, e.item.sci) : null,
      img ? h('img.l-card-thumb', { src: img.src, alt: '', referrerpolicy: 'no-referrer', class: pic ? 'pic' : '' }) : null,
      e.item.blurb ? h('p.l-blurb', {}, e.item.blurb) : null,
      kids ? null : h('table.l-facts.sm', {}, h('tbody', {}, ...factRows(e.pack, e.item).slice(0, 4).map(r => h('tr', {}, h('th', {}, r.label), h('td', {}, r.text))))),
      e.pack.notice && !kids ? notice(e.pack.notice) : null);
    card.append(front, backF);
    const tools = h('div.l-card-tools', {}, audio ? soundBtn(audio) : null, sayBtn(() => (backF.hidden ? (pic ? 'What is this?' : e.item.name) : `${e.item.name}. ${e.item.blurb || ''}`)));
    const showBtn = h('button.btn.sun.big.wide', { type: 'button', dataset: { act: 'flip' } }, 'Show answer');
    const cur = getCards().cards[e.ref];
    const b = cur?.b || 0;
    const grades = kids
      ? [['again', 'Not yet 🙈', ''], ['good', 'I knew it! ⭐', 'go']]
      : [['again', 'Again', 'danger', 'now'], ['good', 'Good', 'go', ivl(b + 1)], ['easy', 'Easy', 'grape', ivl(b + 2)]];
    const gradeRow = h('div.l-grades', { hidden: true }, ...grades.map(([g, label, cls, hint]) =>
      h('button.btn' + (cls ? '.' + cls : ''), { type: 'button', dataset: { grade: g }, onclick: () => grade(e, g) }, label, hint ? h('small', {}, hint) : null)));
    const flip = () => {
      if (!backF.hidden) return;
      backF.hidden = false; card.classList.add('flipped');
      showBtn.hidden = true; gradeRow.hidden = false;
      if (kids) say(e.item.name);
    };
    showBtn.addEventListener('click', flip);
    front.addEventListener('click', flip);
    stage.append(h('div.l-rv-top', {}, bar, h('span.tiny.muted', {}, `${Math.min(done + 1, total)} / ${total}`)), card, tools, showBtn, gradeRow);
    setBar();
    if (kids) setTimeout(() => say(pic ? 'Who is this?' : e.item.name), 250);
  }

  function grade(e, g) {
    gradeCard(e.ref, g);
    q.shift();
    if (g === 'again') {
      haptic('wrong');
      if (!again.has(e.ref)) { again.add(e.ref); q.splice(Math.min(3, q.length), 0, e); }
      else { done++; }
    } else {
      done++; right++;
      sfx('correct'); haptic('correct');
      if (kids) {
        const dd = getCards();
        if (dd.stars < KIDS_STAR_CAP) { updateCards(x => { x.stars++; }); stars++; }
      }
    }
    show();
  }

  async function finish() {
    setBar();
    stopAudio();
    let stickers = [];
    if (kids && stars) stickers = addStars(stars);
    if (right && total >= 3) confetti();
    sfx('fanfare');
    stage.append(h('div.l-done', {},
      h('div.e-ico', {}, '🎉'), h('h2', {}, kids ? 'Great job!' : 'Session done'),
      h('p.muted', {}, `${right} of ${total} remembered${again.size ? `, ${again.size} to practise again` : ''}.`),
      kids && stars ? h('p', {}, `⭐ +${stars} star${stars === 1 ? '' : 's'}`) : null,
      stickers.length ? h('div.sticker-shelf', {}, ...stickers.map(x => h('span.sticker', {}, x))) : null,
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { type: 'button', onclick: () => back() }, 'Done'),
        h('button.btn.primary', { type: 'button', onclick: () => go('l-review', {}, { replace: true }) }, 'More'))));
    if (stickers.length) popup({ title: 'New sticker!', body: `<div style="font-size:64px;text-align:center">${stickers.join(' ')}</div>` });
  }

  const onKey = ev => {
    if (ev.target.closest?.('input,select,textarea')) return;
    const flipBtn = stage.querySelector('[data-act=flip]:not([hidden])');
    if ((ev.key === ' ' || ev.key === 'Enter') && flipBtn) { ev.preventDefault(); flipBtn.click(); return; }
    const gr = stage.querySelector('.l-grades:not([hidden])');
    if (gr && /^[1-3]$/.test(ev.key)) gr.children[+ev.key - 1]?.click();
  };
  document.addEventListener('keydown', onKey);
  show();
  return () => { document.removeEventListener('keydown', onKey); stopAudio(); };
}
