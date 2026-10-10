// Flashcards: choose packs, study them (multiple choice or flip), or review everything due.
import { h, choiceGrid } from '../ui/kit.js?v=202610100431';
import { header, go, back } from '../ui/app.js?v=202610100431';
import { popup } from '../ui/popup.js?v=202610100431';
import { sfx, haptic, confetti } from '../ui/fx.js?v=202610100431';
import { addStars } from '../ui/stickers.js?v=202610100431';
import { getIndex } from '../core/packs.js?v=202610100431';
import { themeTree, getPack, itemsFor, refOf, factRows, kidsOn } from './data.js?v=202610100431';
import { getCards, updateCards, gradeCard, today, deckCounts, dueCount } from './model.js?v=202610100431';
import { studyQueue, cramQueue, packOf, INTERVALS, MAX_BOX } from './srs.js?v=202610100431';
import { cardFace, mcOptions } from './face.js?v=202610100431';
import { carousel } from './item.js?v=202610100431';
import { say, sayBtn, emptyState, notice, stopAudio, soundBtn, playAudio, put } from './ui.js?v=202610100431';
import { recordStudy } from '../core/stats.js?v=202610100431';

const KIDS_STAR_CAP = 10;

const packTitle = id => getIndex()?.packs?.[id]?.title || id;
const packIcon = id => getIndex()?.packs?.[id]?.icon || '❓';
function deckLabel(ids) {
  if (ids.length === 1) return packTitle(ids[0]);
  if (ids.length === 2) return `${packTitle(ids[0])} & ${packTitle(ids[1])}`;
  return `${ids.length} packs`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function modeToggle({ short = false, onChange } = {}) {
  const cur = getCards().study;
  const opts = [['mc', short ? '🅰 Choices' : '🅰 Multiple choice'], ['flip', short ? '🔄 Flip' : '🔄 Flip cards']];
  const seg = h('div.l-seg', { role: 'group', 'aria-label': 'Study mode' }, ...opts.map(([k, label]) =>
    h('button.l-segb', { type: 'button', class: cur === k ? 'on' : '', 'aria-pressed': String(cur === k), dataset: { study: k } }, label)));
  seg.addEventListener('click', ev => {
    const b = ev.target.closest('.l-segb');
    if (!b || b.classList.contains('on')) return;
    updateCards(x => { x.study = b.dataset.study; });
    seg.querySelectorAll('.l-segb').forEach(z => { z.classList.toggle('on', z === b); z.setAttribute('aria-pressed', String(z === b)); });
    sfx('button');
    onChange?.(b.dataset.study);
  });
  return seg;
}

export async function deckSetup(el) {
  const kids = kidsOn();
  const idx = getIndex();
  el.append(header('Flashcards'));
  const tree = themeTree({ kids, need: p => kids ? (p.caps?.img > 0 || p.caps?.audio > 0) && (p.caps?.kidsItems ?? 1) > 0 : true });
  const allIds = tree.flatMap(t => t.packs.map(p => p.id));
  const shown = new Set(allIds);
  // packs picked earlier that kids mode hides stay picked but out of this session's selection
  const sel = () => getCards().decks.filter(id => shown.has(id));

  const selRow = h('div.l-selrow');
  const startBtn = h('button.btn.primary.big.wide.l-start', { type: 'button', dataset: { act: 'start' } });
  const startSub = h('p.tiny.muted.center.l-startsub');
  const allBtn = h('button.btn.wide.l-allbtn', { type: 'button', dataset: { act: 'all' }, onclick: () => go('l-review', { all: true }) });
  const allSub = h('p.tiny.muted.center.l-allsub');
  el.append(h('div.panel.l-deckhead', {},
    h('div.l-studyline', {}, h('b.l-studylbl', {}, kids ? 'Play:' : 'Study:'), selRow),
    modeToggle(), startBtn, startSub,
    kids ? null : h('div.l-allwrap', {}, allBtn, allSub)));

  const chips = new Map();
  const clear = h('button.btn.ghost.small.l-clear', { type: 'button', onclick: () => { updateCards(x => { x.decks = x.decks.filter(id => !shown.has(id)); }); refresh(); } }, 'Clear');
  el.append(h('div.l-pickhead', {}, h('h2.sec-title', {}, kids ? 'Pick your cards' : 'Choose packs'), clear),
    h('p.muted.tiny', {}, kids ? 'Tap the packs you want to play.' : 'Tick the packs you want to study. Up to 10 new cards a day from each pack.'));
  for (const t of tree) {
    const wrap = h('div.l-deckpacks', {});
    for (const p of t.packs) {
      const n = h('span.dp-n');
      const b = h('button.l-dp', { type: 'button', dataset: { pack: p.id } }, h('span.dp-ico', {}, p.icon || '❓'), h('span.dp-name', {}, p.title), n, h('span.dp-tick', {}, '✓'));
      b.addEventListener('click', () => {
        updateCards(x => { x.decks = x.decks.includes(p.id) ? x.decks.filter(z => z !== p.id) : [...x.decks, p.id]; });
        sfx('button');
        refresh();
      });
      chips.set(p.id, { b, n });
      wrap.append(b);
    }
    el.append(h('div.l-deckt', {}, h('div.l-flabel', {}, `${t.icon} ${t.title}`), wrap));
  }

  if (!kids) {
    const box = h('input', { type: 'checkbox', checked: getCards().feed, dataset: { set: 'feed' } });
    box.addEventListener('change', () => { updateCards(x => { x.feed = box.checked; }); refresh(); });
    el.append(h('label.panel.l-feedset', {}, box, h('span', {}, h('b', {}, 'Add missed game questions to flashcards'),
      h('small.muted', {}, 'They join their own pack, so they only show up when you study that pack or review everything.'))));
  }

  function refresh() {
    const d = getCards();
    const picked = sel();
    const counts = deckCounts(idx, allIds, kids, d);
    for (const [id, { b, n }] of chips) {
      const on = picked.includes(id);
      const c = counts[id] || { due: 0, fresh: 0 };
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      n.textContent = on ? [c.due ? `${c.due} due` : '', c.fresh ? `${c.fresh} new` : ''].filter(Boolean).join(' · ') : c.due ? `${c.due} due` : '';
      n.hidden = !n.textContent;
    }
    selRow.innerHTML = '';
    if (!picked.length) selRow.append(h('span.muted', {}, kids ? 'pick a pack below' : 'pick packs below'));
    for (const id of picked) {
      selRow.append(h('button.l-selchip', { type: 'button', 'aria-label': `Remove ${packTitle(id)}`, dataset: { pack: id }, onclick: () => { updateCards(x => { x.decks = x.decks.filter(z => z !== id); }); refresh(); } },
        `${packIcon(id)} ${packTitle(id)}`, h('span.x', {}, '×')));
    }
    const due = picked.reduce((a, id) => a + (counts[id]?.due || 0), 0);
    const fresh = picked.reduce((a, id) => a + (counts[id]?.fresh || 0), 0);
    startBtn.disabled = !picked.length;
    startBtn.onclick = () => go('l-review', { packs: picked, cram: due + fresh === 0 });
    startBtn.dataset.cram = String(due + fresh === 0);
    if (!picked.length) { startBtn.textContent = kids ? 'Pick a pack below' : 'Pick a pack to study'; startSub.textContent = ''; }
    else if (due + fresh) {
      startBtn.textContent = `▶ ${kids ? 'Play' : 'Study'} ${deckLabel(picked)}`;
      startSub.textContent = [due ? `${due} due` : '', fresh ? `${fresh} new` : ''].filter(Boolean).join(' + ') + ` · only from ${picked.length === 1 ? 'this pack' : 'these packs'}`;
    } else {
      startBtn.textContent = `▶ ${kids ? 'Play' : 'Study'} ${deckLabel(picked)} anyway`;
      startSub.textContent = 'Nothing due today. Go through the pack again for practice.';
    }
    const all = dueCount(d);
    const games = Object.values(d.cards).filter(c => c.g && c.due <= today()).length;
    allBtn.disabled = !all;
    allBtn.textContent = all ? `Review all due (${all})` : 'Nothing due in any pack';
    allSub.textContent = all ? `Mixes every pack${games ? `, including ${plural(games, 'card')} from questions you missed in games` : ', including cards from questions you miss in games'}.` : '';
  }
  refresh();
}

const ivl = b => { const d = INTERVALS[Math.min(MAX_BOX, b)]; return d >= 30 ? `${Math.round(d / 30)}mo` : `${d}d`; };

// params: { packs: [ids], cram } studies only those packs; { all: true } reviews every due card.
export async function review(el, params = {}) {
  const kids = kidsOn();
  const d0 = getCards();
  const all = !!params.all;
  const packIds = all ? [] : (params.packs?.length ? params.packs : d0.decks);
  el.append(header(all ? 'All due cards' : packIds.length ? deckLabel(packIds) : 'Flashcards'));
  const stage = h('div.l-review', {}, h('p.muted.center', {}, 'Shuffling…'));
  el.append(stage);
  const limit = kids ? 12 : 30;

  const dueRefs = studyQueue(d0.cards, {}, today(), { packs: all ? null : packIds, fresh: false, limit: 400 });
  const pids = [...new Set([...packIds, ...dueRefs.map(packOf)])];
  const packs = Object.fromEntries((await Promise.all(pids.map(id => getPack(id).catch(() => null)))).filter(Boolean).map(p => [p.id, p]));
  const pools = {};
  const pool = pack => pools[pack.id] || (pools[pack.id] = (() => { const k = itemsFor(pack, kids); return k.length >= (kids ? 3 : 4) ? k : pack.items; })());
  const entry = (ref, fresh) => {
    const pack = packs[packOf(ref)];
    const item = pack?.items.find(x => x.id === ref.slice(ref.indexOf('/') + 1));
    if (!item) return null;
    // a due card for an item kids can't picture (e.g. a missed capital) falls back to the grown-up face
    const face = cardFace(pack, item, { kids }) || (!fresh && kids ? cardFace(pack, item) : null);
    return face ? { pack, item, ref, face } : null;
  };
  const refsByPack = {};
  for (const id of packIds) if (packs[id]) refsByPack[id] = itemsFor(packs[id], kids).filter(it => cardFace(packs[id], it, { kids })).map(it => refOf(packs[id], it));

  let cram = !!params.cram && !all;
  let refs = all ? dueRefs.slice(0, limit) : cram ? [] : studyQueue(d0.cards, refsByPack, today(), { packs: packIds, newBy: d0.newBy, limit });
  let q = refs.map(r => entry(r, !d0.cards[r])).filter(Boolean);
  if (!q.length && !all && Object.keys(refsByPack).length) {
    cram = true;
    q = cramQueue(d0.cards, Object.values(refsByPack).flat(), kids ? 12 : 20).map(r => entry(r, true)).filter(Boolean);
  }
  const total = q.length;
  let done = 0, right = 0, stars = 0;
  const again = new Set();
  stage.innerHTML = '';
  if (!total) {
    stage.append(emptyState('🎉', all ? 'Nothing due' : 'No cards here',
      all ? 'You are all caught up. Come back tomorrow!' : 'Pick some packs to study first.',
      h('button.btn.primary', { type: 'button', onclick: () => go('l-cards', {}, { replace: true }) }, 'Choose packs')));
    return;
  }
  const bar = h('div.l-prog', {}, h('i'));
  const counter = h('span.tiny.muted.l-count');
  const setBar = () => { bar.firstChild.style.width = `${Math.round(100 * done / total)}%`; counter.textContent = `${Math.min(done + 1, total)} / ${total}`; };
  const top = h('div.l-rv-top', {}, bar, counter, modeToggle({ short: true, onChange: () => { if (!answered) show(); } }));
  const note = all ? h('p.tiny.muted.l-rv-note', {}, 'Every pack mixed, including questions you missed in games.')
    : cram ? h('p.tiny.muted.l-rv-note', {}, `Nothing due${packIds.length === 1 ? ` in ${packTitle(packIds[0])}` : ''} today, so this is extra practice.`) : null;
  let grid = null, answered = false;

  function buildFront(e) {
    const f = e.face;
    const front = h('div.l-face.front', { class: 'k-' + f.kind });
    if (f.kind === 'img') {
      front.append(carousel([f.img], ''));
      if (f.audio) front.append(h('div.l-front-snd', {}, soundBtn(f.audio, { label: 'Play its sound', text: 'Sound' })));
    } else if (f.kind === 'audio') {
      front.append(h('div.l-bigplay', {}, soundBtn(f.audio, { big: true, label: 'Play the clip', text: 'Listen' })));
      if (f.hint) {
        const hint = h('button.btn.ghost.small.l-hint', { type: 'button' }, 'Need a hint?');
        hint.addEventListener('click', ev => { ev.stopPropagation(); hint.replaceWith(h('p.l-hinttext', {}, f.hint)); });
        front.append(hint);
      }
    } else {
      front.append(h('div.l-clue', {}, ...f.lines.map(l => h('p', {}, l))));
    }
    front.append(h('p.l-ask', {}, f.ask));
    return front;
  }

  function buildBack(e) {
    const { item, pack, face } = e;
    // with a picture front the thumb only shows in short landscape, where the front is hidden once flipped
    const pic = item.media?.img?.[0] || (item.media?.audio?.[0]?.apple?.art ? { src: item.media.audio[0].apple.art } : null);
    return h('div.l-face.back', { hidden: true },
      pic ? h('img.l-card-thumb', { src: pic.src, alt: '', referrerpolicy: 'no-referrer', class: face.kind === 'img' ? 'pic' : '' }) : null,
      h('h2.l-card-name', {}, item.name), item.sci && !kids ? h('div.l-sci', {}, item.sci) : null,
      item.blurb ? h('p.l-blurb', {}, item.blurb) : null,
      kids ? null : h('table.l-facts.sm', {}, h('tbody', {}, ...factRows(pack, item).filter(r => r.key !== 'iso3').slice(0, 4).map(r => h('tr', {}, h('th', {}, r.label), h('td', {}, r.text))))),
      pack.notice && !kids ? notice(pack.notice) : null);
  }

  function show() {
    stopAudio();
    grid?.destroy(); grid = null;
    answered = false;
    stage.innerHTML = '';
    if (!q.length) return finish();
    const e = q[0];
    const f = e.face;
    const mode = getCards().study;
    const card = h('div.l-card', { dataset: { ref: e.ref, kind: f.kind } });
    const front = buildFront(e);
    const backF = buildBack(e);
    const reveal = () => {
      if (!backF.hidden) return;
      backF.hidden = false; card.classList.add('flipped');
      if (kids) say(e.item.name);
    };
    const tools = h('div.l-card-say', {}, f.kind === 'audio' ? null : sayBtn(() => (backF.hidden ? [...(f.lines || []), f.ask].join('. ') : `${e.item.name}. ${e.item.blurb || ''}`)));
    const b = getCards().cards[e.ref]?.b || 0;
    const grades = kids
      ? [['again', 'Not yet 🙈', ''], ['good', 'I knew it! ⭐', 'go']]
      : [['again', 'Again', 'danger', 'now'], ['hard', 'Hard', 'sun', ivl(Math.max(1, b))], ['good', 'Good', 'go', ivl(b + 1)], ['easy', 'Easy', 'grape', ivl(b + 2)]];
    const gradeRow = h('div.l-grades', { hidden: true }, ...grades.map(([g, label, cls, hint]) =>
      h('button.btn' + (cls ? '.' + cls : ''), { type: 'button', dataset: { grade: g }, onclick: () => { commit(e, g); show(); } }, label, hint ? h('small', {}, hint) : null)));
    const panel = h('div.l-answer');
    const opts = mode === 'mc' ? mcOptions(e.pack, e.item, pool(e.pack), kids ? 3 : 4) : null;
    if (opts) {
      const nextBtn = h('button.btn.primary.big.wide.l-next', { type: 'button', dataset: { act: 'next' }, hidden: true, onclick: () => show() }, q.length > 1 ? 'Next ›' : 'Finish');
      const showAns = kids ? null : h('button.btn.ghost.small.l-showans', { type: 'button', dataset: { act: 'show' } }, 'Just show me the answer');
      grid = choiceGrid(panel, opts.options.map(t => ({ text: t })), {
        onPick: i => {
          if (answered) return;
          answered = true;
          grid.lock(); grid.mark(opts.answer, i);
          const ok = i === opts.answer;
          if (!ok) sfx('wrong');
          reveal();
          commit(e, ok ? 'good' : 'again');
          if (showAns) showAns.hidden = true;
          nextBtn.hidden = false;
          nextBtn.focus({ preventScroll: true });
          requestAnimationFrame(() => nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        },
      });
      showAns?.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        grid.lock(); grid.mark(opts.answer, -1);
        reveal();
        showAns.hidden = true; gradeRow.hidden = false;
        requestAnimationFrame(() => gradeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      });
      put(panel, showAns, nextBtn, gradeRow);
    } else {
      const showBtn = h('button.btn.sun.big.wide', { type: 'button', dataset: { act: 'flip' } }, 'Show answer');
      const flip = () => {
        if (!backF.hidden) return;
        answered = true; reveal(); showBtn.hidden = true; gradeRow.hidden = false;
        requestAnimationFrame(() => gradeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      };
      showBtn.addEventListener('click', flip);
      front.addEventListener('click', ev => { if (!ev.target.closest('button')) flip(); });
      panel.append(showBtn, gradeRow);
    }
    card.append(tools, front, backF);
    stage.append(top, ...(note ? [note] : []), card, panel);
    setBar();
    if (f.kind === 'audio') {
      const btn = front.querySelector('.l-bigplay .l-sound');
      setTimeout(() => { if (btn.isConnected && !btn.classList.contains('playing')) playAudio(f.audio, btn); }, kids ? 150 : 250);
    } else if (kids) setTimeout(() => { if (card.isConnected) say(f.ask); }, 250);
  }

  function commit(e, g) {
    gradeCard(e.ref, g);
    q.shift();
    if (g === 'again') {
      haptic('wrong');
      if (!again.has(e.ref)) { again.add(e.ref); q.splice(Math.min(3, q.length), 0, e); }
      else done++;
    } else {
      done++; right++;
      sfx('correct'); haptic('correct');
      if (kids && getCards().stars < KIDS_STAR_CAP) { updateCards(x => { x.stars++; }); stars++; }
    }
    setBar();
  }

  async function finish() {
    setBar();
    stopAudio();
    let stickers = [];
    if (kids && stars) stickers = addStars(stars);
    if (right && total >= 3) confetti();
    sfx('fanfare');
    recordStudy({ cards: total, right, kids, packs: Object.keys(packs), mode: getCards().study });
    stage.append(h('div.l-done', {},
      h('div.e-ico', {}, '🎉'), h('h2', {}, kids ? 'Great job!' : 'Session done'),
      h('p.muted', {}, `${right} of ${total} remembered${again.size ? `, ${again.size} to practise again` : ''}.`),
      kids && stars ? h('p', {}, `⭐ +${stars} star${stars === 1 ? '' : 's'}`) : null,
      stickers.length ? h('div.sticker-shelf', {}, ...stickers.map(x => h('span.sticker', {}, x))) : null,
      h('div.row', { style: { justifyContent: 'center' } },
        h('button.btn', { type: 'button', onclick: () => back() }, 'Done'),
        h('button.btn.primary', { type: 'button', dataset: { act: 'more' }, onclick: () => go('l-review', all ? { all } : { packs: packIds }, { replace: true }) }, 'More'))));
    if (stickers.length) popup({ title: 'New sticker!', body: `<div style="font-size:64px;text-align:center">${stickers.join(' ')}</div>` });
  }

  const onKey = ev => {
    if (ev.target.closest?.('input,select,textarea')) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.closest?.('button')) return;   // the focused button handles it
    const vis = sel => stage.querySelector(sel + ':not([hidden])');
    const btn = vis('[data-act=flip]') || vis('[data-act=next]');
    if ((ev.key === ' ' || ev.key === 'Enter') && btn) { ev.preventDefault(); btn.click(); return; }
    const gr = vis('.l-grades');
    if (gr && /^[1-4]$/.test(ev.key)) gr.children[+ev.key - 1]?.click();
  };
  document.addEventListener('keydown', onKey);
  show();
  return () => { document.removeEventListener('keydown', onKey); grid?.destroy(); stopAudio(); };
}
