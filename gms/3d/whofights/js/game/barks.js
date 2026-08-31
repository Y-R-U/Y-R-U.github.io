// Barks — DEV_CONTRACT §8. Which line a character says, and which clip that line is.
//
// The naming lives here rather than in js/dev/chars/vo.js because the shipped game plays barks and
// DEVTOOLS §1 promises a live origin fetches nothing under js/dev/ but gate.js. vo.js re-exports
// these, so the tool that writes a clip and the game that fetches it cannot disagree about its name.

import { CODEC } from './clip.js';

export const BARK_CATEGORIES = ['idle', 'greet', 'farewell', 'curious', 'grumble', 'success',
  'failure', 'hurt', 'combat', 'spot', 'thanks', 'refuse', 'wander', 'weather'];

export const VO_DIR = 'audio/vo';

export const clipKey = (who, category, i) => `${who}__${category}__${String(i + 1).padStart(2, '0')}`;
export const clipFile = key => `${VO_DIR}/${key}${CODEC.ext}`;

// A character's category list REPLACES the shared one for that category — never a union, because a
// union gives no way to take a shared line off one character. The tab's "copy shared in" button is
// how you extend instead.
export function effectiveBarks(barksDoc, character) {
  const shared = barksDoc?.shared || {};
  const own = character?.barks || {};
  const out = {};
  for (const c of BARK_CATEGORIES) {
    const list = Array.isArray(own[c]) ? own[c] : Array.isArray(shared[c]) ? shared[c] : [];
    out[c] = list.map(l => String(l == null ? '' : l)).filter(l => l.trim());
  }
  return out;
}

// The ledger's keys, minus anything it says has no encoded clip yet. Reading data/vo.json is what
// separates "there are twelve idle lines" from "eight of them have a take", and picking a line
// with no take is silence the author cannot tell from a broken wire.
export const ledgerKeys = doc => new Set(Object.entries(doc?.clips || {})
  .filter(([, v]) => v && v.encoded !== false).map(([k]) => k));

// `have` null means the ledger has not loaded: every authored line is a candidate, and a line with
// no take is simply silent.
export function barkChoices(barksDoc, character, who, category, have = null) {
  const lines = effectiveBarks(barksDoc, character)[category];
  if (!lines) return [];
  const out = [];
  lines.forEach((text, i) => {
    const key = clipKey(who, category, i);
    if (!have || have.has(key)) out.push({ key, text, i });
  });
  return out;
}

// A character stays quiet this long after barking, and the whole cast stays quiet for the shorter
// floor, so two people crossing a hotspot together do not talk over each other.
const COOLDOWN = 8;
const FLOOR = 1.5;

export class Barks {
  // `voice` is js/game/voice.js — one player, so a bark and a dialogue line cannot overlap and the
  // character's own voicePitch is applied as the resample it is. `busy` is why a bark is dropped
  // rather than queued: a line the player is reading is not a line to talk over.
  constructor({ voice, cast = {}, busy = () => false, cooldown = COOLDOWN,
    now = () => Date.now() / 1000, rnd = Math.random } = {}) {
    this.voice = voice;
    this.cast = cast;
    this.busy = busy;
    this.cooldown = cooldown;
    this.now = now;
    this.rnd = rnd;
    this.docs = null;
    this.until = new Map();
    this.last = new Map();
    this.floor = 0;
  }

  setDocs(barksDoc, ledger) {
    this.docs = { barks: barksDoc || { shared: {} }, have: ledger ? ledgerKeys(ledger) : null };
    return this;
  }

  // Returns the clip key it played, or a string starting with '-' saying why it did not. Never
  // throws: a bark is decoration and must not take a frame down.
  say(who, category) {
    if (!this.docs) return '-not loaded';
    if (!BARK_CATEGORIES.includes(category)) return '-unknown category';
    const c = this.cast[who];
    if (!c) return '-no such character';
    if (this.busy()) return '-busy';
    const t = this.now();
    if (t < this.floor || t < (this.until.get(who) || 0)) return '-cooling down';

    const choices = barkChoices(this.docs.barks, c, who, category, this.docs.have);
    if (!choices.length) return '-nothing to say';
    // Never the same line twice running, unless it is the only one there is.
    const prev = this.last.get(`${who}/${category}`);
    const pool = choices.length > 1 ? choices.filter(x => x.key !== prev) : choices;
    const pick = pool[Math.min(pool.length - 1, Math.floor(this.rnd() * pool.length))];

    this.last.set(`${who}/${category}`, pick.key);
    this.until.set(who, t + this.cooldown);
    this.floor = t + FLOOR;
    this.voice?.say({ vo: pick.key, who });
    return pick.key;
  }
}
