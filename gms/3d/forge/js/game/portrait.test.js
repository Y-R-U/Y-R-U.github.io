// The portrait layout's two load-bearing claims, asserted against the source because neither has
// a runtime seam: CSS media queries and a deleted event listener are only visible in the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('./game.css', import.meta.url), 'utf8');
const SESSION = readFileSync(new URL('./session.js', import.meta.url), 'utf8');

function mediaBlock(css, at) {
  let depth = 0, i = css.indexOf('{', at);
  for (let j = i; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(i, j);
  }
  throw new Error('unterminated @media');
}

const at = CSS.indexOf('@media (orientation: portrait)');
const BLOCK = mediaBlock(CSS, at);

test('the portrait block is gated on a phone-shaped viewport, not merely a tall one', () => {
  assert.ok(at > 0, 'no portrait media query');
  const query = CSS.slice(at, CSS.indexOf('{', at));
  assert.match(query, /max-width:\s*\d+px/, `an ungated query gives an 890 x 900 desktop the phone HUD: ${query.trim()}`);
  assert.ok(+query.match(/max-width:\s*(\d+)px/)[1] < 744, 'a tablet in portrait keeps the side-by-side layout');
});

test('portrait brings the cog into thumb reach instead of leaving it in the far corner', () => {
  const rule = BLOCK.match(/\.g-cog\s*\{[^}]*\}/);
  assert.ok(rule, 'the cog is the only touch route to pause and settings');
  assert.match(rule[0], /bottom:/, 'it has to leave the top corner, 818px from a portrait thumb');
  assert.match(BLOCK, /--stack:[^;]*var\(--cog\)/, 'the bubble must clear the taller cluster');
});

test('a rotate is no longer an event the session handles', () => {
  assert.doesNotMatch(SESSION, /orientationchange/);
  assert.doesNotMatch(SESSION, /'portrait'/, 'nothing has pushed a portrait pause since the prompt went');
});
