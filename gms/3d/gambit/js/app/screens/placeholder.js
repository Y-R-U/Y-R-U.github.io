import { h, icon } from '../ui.js';
export const ROUTE = 'placeholder';

const CHEAT = 'The server does not try to detect cheating yet — if you think an opponent cheated, try not to stress about it. Playing people you know is the most fun anyway.';
const PAGES = {
  online: {
    title: 'Play Online', ic: 'globe', head: 'Online play is on its way',
    body: `<p>Quick match by time control, public rooms in the lobby, and private room codes to play friends.</p>
      <ul class="feat"><li>${icon('clock')} Bullet, blitz, rapid and classical</li><li>${icon('user')} Private codes for friends</li><li>${icon('chart')} Online rating and leaderboard</li></ul>
      <p class="fine">Free: 2 games a day without signing in, 5 when signed in, unlimited with BR8T Pass. Bots and puzzles are always unlimited.</p>
      <div class="warn">${icon('info')}<span>${CHEAT}</span></div>`,
  },
  puzzles: {
    title: 'Puzzles', ic: 'puzzle', head: 'The puzzle map is being drawn',
    body: `<p>A winding trail of puzzles from mate-in-one to fiendish three-movers and tactics, with stars to earn and every puzzle replayable.</p>`,
  },
  learn: {
    title: 'Learn', ic: 'book', head: 'Lessons are coming soon',
    body: '<p>Step-by-step lessons for new players: how the pieces move, checkmate patterns, and opening ideas.</p>',
  },
};

export function render(app, { kind }) {
  const p = PAGES[kind];
  const el = h(`<section class="screen placeholder">
    <div class="ph-art">${icon(p.ic)}</div><span class="badge">Coming soon</span>
    <h2>${p.head}</h2>${p.body}
    <div class="ph-cta"><a class="btn btn-primary" href="#/play/bot">${icon('robot')} Play a bot meanwhile</a></div>
  </section>`);
  return { el, top: { title: p.title, back: '#/home' } };
}
