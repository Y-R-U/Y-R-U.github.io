import { el, btn } from './dom.js?v=20261004h';

// Letterboxed cutscene captions over the hero (acquisitions, Deeds, Fake Your Death). One sequence at a time;
// later ones queue. Lines are [text, ms]; a tap advances when the sequence is skippable.
export const SCRIPTS = {
  poker: [
    ['🃏 High-stakes poker for the Thirsty Gizzard', 1700],
    ['Slick Vinnie: “Full house. Read ’em and weep.”', 1900],
    ['You lay down… five aces.', 1700],
    ['“…That’s five aces.”  “Hrm.”', 1500],
    ['🥃 The Gizzard is yours. Mabel comes with it.', 1600],
  ],
  takeover: [
    ['⚰️ Boot Hill Undertakers: a hostile takeover', 1800],
    ['Mortimer: “How deliciously final.”', 1900],
    ['He measures you for the paperwork.', 1700],
    ['You sign in his best black ink.', 1600],
  ],
  jail: [
    ['⭐ Sheriff Wendell is selling the jail', 1800],
    ['“Here’s the badge. Don’t let it get shot.”', 2000],
    ['He leaves at a brisk, cowardly jog.', 1700],
    ['The jail is yours. So are the drunks.', 1500],
  ],
  bank: [
    ['🏦 Thrupp counts your offer. Twice.', 1900],
    ['Then a third time, to be safe.', 1600],
    ['Thrupp faints.', 1500],
    ['Sold, to the fainting man’s signature.', 1700],
  ],
  rebrand: [
    ['🪧 Pomfrey’s sign comes down…', 1400],
    ['…and yours goes up. Again.', 1400],
  ],
  deed: [
    ['📜 A Deed showdown with Pomfrey', 1500],
    ['His sign comes down. Splendidly.', 1500],
  ],
  fakeDeath: [
    ['⚰️ A funeral procession winds up Boot Hill', 2600],
    ['Mortimer is overjoyed.', 2200],
    ['Mabel blows her nose on the bar rag.', 2400],
    ['Pickles: “He owed me a dollar.”', 2400],
    ['Pomfrey laughs. His men tear down your signs.', 2600],
    ['The coffin leaves town on the stagecoach…', 2600],
    ['…and a stranger with a new moustache steps off.', 2600],
    ['Mabel: “…Ain’t you—”   You: “No.”', 2800],
  ],
  halfTown: [
    ['🏘️ HALF THE TOWN', 1600],
    ['Pomfrey is wearing a thimble.', 1800],
  ],
};

export function createCaptions(hero, { onTap, sfx } = {}) {
  const box = el('div', 'captions');
  box.hidden = true;
  const top = el('div', 'cap-bar cap-top');
  const bot = el('div', 'cap-bar cap-bot');
  const line = el('div', 'cap-line');
  const skip = btn('cap-skip', 'Skip ›', (e) => { e.stopPropagation(); end(true); }, 'Skip');
  bot.append(line, skip);
  box.append(top, bot);
  hero.appendChild(box);
  box.addEventListener('click', (e) => { if (cur?.skippable) { e.stopPropagation(); advance(); } });

  const queue = [];
  let cur = null, timer = 0;

  function begin(seq) {
    cur = { ...seq, i: -1 };
    box.hidden = false;
    hero.classList.add('cap-on');
    box.classList.toggle('dark', !!seq.dark);
    skip.hidden = !seq.skippable;
    requestAnimationFrame(() => box.classList.add('in'));
    advance();
  }

  function advance() {
    if (!cur) return;
    clearTimeout(timer);
    cur.i++;
    if (cur.i >= cur.lines.length) { end(false); return; }
    const [text, ms] = cur.lines[cur.i];
    line.textContent = text;
    line.classList.remove('show');
    void line.offsetWidth;
    line.classList.add('show');
    sfx?.tick?.();
    timer = setTimeout(advance, ms * (cur.speed || 1));
  }

  function end(skipped) {
    clearTimeout(timer);
    const done = cur;
    cur = null;
    box.classList.remove('in');
    hero.classList.remove('cap-on');
    setTimeout(() => { if (!cur) box.hidden = true; }, 260);
    done?.onEnd?.(skipped);
    if (queue.length) setTimeout(() => { if (!cur && queue.length) begin(queue.shift()); }, 280);
  }

  return {
    // seq: { lines: [[text, ms]], skippable, dark, onEnd, speed }
    play(seq) {
      if (!seq?.lines?.length) return;
      if (cur) { if (queue.length < 3) queue.push(seq); return; }
      begin(seq);
    },
    script(id, opts = {}) {
      const lines = SCRIPTS[id];
      if (lines) this.play({ lines, ...opts });
    },
    // Fit a script into `sec` (an acquisition cutscene lasts the build's T).
    fit(id, sec, opts = {}) {
      const lines = SCRIPTS[id];
      if (!lines) return;
      const total = lines.reduce((s, l) => s + l[1], 0);
      this.play({ lines, speed: Math.max(0.35, Math.min(1.4, (sec * 1000) / total)), ...opts });
    },
    end,
    get active() { return !!cur; },
  };
}
