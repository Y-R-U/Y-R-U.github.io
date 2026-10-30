// Learn: the course map. Units as banners, lessons as a gold trail of nodes with checkmarks + stars.
// Every lesson is open (improving players can skip ahead); the first unfinished one is "Next".
import { esc, icon } from '../app/ui.js';
import { UNITS, LESSONS } from './data.js';
import { getProgress, onProgress } from './progress.js';
import { starRow, glyph, COACH } from './art.js';

export function nextLesson(p = getProgress()) {
  return LESSONS.find(l => p.l[l.id] === undefined) || null;
}

export function mountMap(el, app) {
  function render() {
    const p = getProgress();
    const done = LESSONS.filter(l => p.l[l.id] !== undefined).length;
    const stars = LESSONS.reduce((s, l) => s + (p.l[l.id] || 0), 0);
    const nx = nextLesson(p);
    const pct = Math.round(done / LESSONS.length * 100);
    let n = 0;
    el.innerHTML = `
      <div class="ln-hero card card-accent">
        <div class="ln-hero-crest">${COACH}</div>
        <div class="ln-hero-txt"><small>Learn chess</small><b>${done ? (nx ? 'Welcome back!' : 'Course complete!') : 'Start from zero'}</b>
          <p>${done ? `${done} of ${LESSONS.length} lessons done.` : 'Short lessons with a friendly coach, from how the pieces move to your first checkmates.'}</p></div>
        <div class="ln-hero-stats">
          <div class="ln-ring" style="--p:${pct}"><span>${pct}<i>%</i></span></div>
          <div class="ln-hero-stars">★ ${stars}<span>/${LESSONS.length * 3}</span></div>
        </div>
      </div>
      ${UNITS.map(u => {
        const ls = LESSONS.filter(l => l.unit === u.id);
        const ud = ls.filter(l => p.l[l.id] !== undefined).length;
        return `<section class="ln-unit" data-unit="${u.id}">
          <header class="ln-banner">
            <div class="ln-uglyph">${glyph(u.glyph)}</div>
            <div class="ln-btxt"><small>Unit ${UNITS.indexOf(u) + 1}</small><h2>${esc(u.name)}</h2><p>${esc(u.blurb)}</p></div>
            <div class="ln-bprog"><b>${ud}<span>/${ls.length}</span></b><i style="--p:${Math.round(ud / ls.length * 100)}%"></i></div>
          </header>
          <ol class="ln-trail">${ls.map(l => {
            n++;
            const st = p.l[l.id];
            const cls = st !== undefined ? 'st-done' : nx === l ? 'st-next' : 'st-open';
            return `<li><a class="ln-node ${cls}" href="#/learn/${l.id}" data-id="${l.id}">
              <span class="ln-disc">${st !== undefined ? icon('check') : glyph(l.glyph)}<em>${n}</em></span>
              <span class="ln-ntxt"><b>${esc(l.title)}</b><small>${esc(l.blurb)}</small></span>
              <span class="ln-nstars">${st !== undefined ? starRow(st) : nx === l ? '<span class="ln-play-tag">Start</span>' : icon('chevron')}</span>
            </a></li>`;
          }).join('')}</ol>
        </section>`;
      }).join('')}
      <div class="ln-foot"><p>Ready for more? <a href="#/puzzles">Puzzles</a> train your tactics, and the <a href="#/play/bot">bots</a> are waiting.</p></div>
      ${nx ? `<a class="btn btn-primary ln-continue" href="#/learn/${nx.id}">${icon('play')}<span>${done ? 'Continue' : 'Start'}: ${esc(nx.title)}</span></a>` : ''}`;
  }
  render();
  const off = onProgress(render);
  return { leave() { off(); } };
}
