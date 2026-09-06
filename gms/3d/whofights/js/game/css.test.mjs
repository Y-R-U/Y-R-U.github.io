// The class-collision guard.
//
// docs/HANDOFF.md records this hazard once already: every class in style.css is `wf-` prefixed
// because a bare `.row` silently reshaped a dev-hub toolbar. game.css is one 1500-line stylesheet
// shared by a dozen screens, and the same thing happened three times in one afternoon — `.g-chip`
// was already the HUD's absolutely-positioned notification, so four essence names stacked on top
// of the player sheet's title; `.g-sheet` was already the full-screen slide-in panel, so the sheet
// pinned itself to the left edge; `.g-head` was already the pause menu's header.
//
// All three had the same shape: a class given a whole rule block of its own in two places by two
// features that had never heard of each other. That is what this checks. A class may appear in as
// many grouped, descendant and modifier selectors as it likes — the rule is only that a class with
// a rule block to itself has exactly one.

import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(HERE, 'game.css'), 'utf8');

// Media-query bodies are re-statements of rules declared above them, which is the point of them.
function topLevel(text) {
  const out = [];
  let skip = 0, depth = 0;
  for (const line of text.split('\n')) {
    if (skip) {
      depth += count(line, '{') - count(line, '}');
      if (depth <= 0) skip = 0;
      continue;
    }
    if (line.trim().startsWith('@media')) {
      skip = 1;
      depth = count(line, '{') - count(line, '}');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
const count = (s, c) => s.split(c).length - 1;

// Every block whose selector is one class and nothing else — `#game .g-thing { … }`.
function soloBlocks(text) {
  const seen = new Map();
  for (const m of text.matchAll(/(?:^|})\s*([^{}]+?)\{/gs)) {
    const sel = m[1].split(/\s+/).join(' ').trim();
    if (sel.includes(',')) continue;
    const one = /^#game \.(g-[a-z0-9-]+)$/.exec(sel);
    if (!one) continue;
    seen.set(one[1], (seen.get(one[1]) || 0) + 1);
  }
  return seen;
}

// `.g-prompt` is declared twice on purpose — the second block is the touch layout, which the file
// keeps beside the rest of the touch rules rather than in a media query. Anything else appearing
// here is a new feature that has taken a name an old one already owns.
const ALLOWED = new Set(['g-prompt']);

test('no two features own the same class', () => {
  const dupes = [...soloBlocks(topLevel(css))].filter(([k, n]) => n > 1 && !ALLOWED.has(k));
  eq(dupes.map(([k]) => k), [], `these classes have a rule block in two places: ${dupes.map(([k, n]) => `${k} ×${n}`).join(', ')}`);
});

// The other half of the same bug: a class the JS creates that game.css has never heard of is a
// screen that will render as unstyled divs, and one the JS never creates is dead weight.
const files = readdirSync(HERE).filter(f => f.endsWith('.js'));
const used = new Set();
for (const f of files) {
  const src = readFileSync(path.join(HERE, f), 'utf8');
  // Every string literal in the file, split on spaces, keeping whatever looks like one of ours.
  // Template literals are cut at the first `${`, so `g-seal-${rank}` contributes nothing rather
  // than a truncated name — the interpolated half is checked by the screen tests, not here.
  for (const m of src.matchAll(/(['"`])((?:[^\\'"`\n]|\\.)*)\1/g)) {
    for (const c of m[2].split('${')[0].split(/\s+/)) {
      if (/^g-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c)) used.add(c);
    }
  }
}

test('every class the game builds is one the stylesheet knows about', () => {
  const missing = [...used].filter(c => !css.includes(`.${c}`));
  eq(missing, [], `built but never styled: ${missing.join(', ')}`);
});

test('the guard is actually looking at something', () => {
  ok(used.size > 60, `only found ${used.size} classes in the game's own JS`);
  ok(soloBlocks(topLevel(css)).size > 60, 'only found a handful of rule blocks');
});
