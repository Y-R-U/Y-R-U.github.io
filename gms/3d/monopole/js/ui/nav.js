// The back button. A phone's back gesture, Android's key and the browser's arrow all walk the same
// chain the player walked in — the system, the room, the terminal, whatever screen the terminal is
// on — instead of throwing them out of the game on the first press.
//
// History is the source of truth for going back and only for going back. Every screen that nests
// pushes an entry with the function that undoes it; every back control in the UI calls in here and
// lets `popstate` do the work, so there is one code path and the depths cannot drift apart.
//
// Depth 0 is before the game. Reaching it does not leave the page — it puts up a card that offers
// to carry on, and a second press from there is a real exit, which is what a back button should do.

const stack = [];
let gate = null;
let gateTimer = 0;
let onResume = null;
let owed = 0;

// `history.go` is asynchronous. Two of them raised in the same task can be coalesced by the browser
// into one, and a `push` raised between a `drop` and its traversal lands on an entry the traversal
// then walks off again — which is how a panel that reopens itself on the way out (the end card)
// used to be closed by its own dismissal. Every way back out of here therefore books its steps and
// one traversal goes out per task. `mono` is the depth of the current entry, so it is also the
// furthest back there is anywhere to go.
function rewind(n) {
  if (n <= 0) return;
  const first = owed === 0;
  owed += n;
  if (!first) return;
  queueMicrotask(() => {
    const d = Math.min(owed, history.state?.mono ?? owed);
    owed = 0;
    if (d > 0) history.go(-d);
  });
}

export const nav = {
  start(resume = null) {
    if (stack.length) return nav;
    onResume = resume;
    history.replaceState({ mono: 0 }, '');
    addEventListener('popstate', onPop);
    nav.push('system', showGate);
    return nav;
  },

  push(id, exit) {
    if (stack.length && stack[stack.length - 1].id === id) return nav;
    stack.push({ id, exit });
    history.pushState({ mono: stack.length }, '');
    return nav;
  },

  back() { if (stack.length) rewind(1); },

  // Several levels at once, for the keys that mean a place rather than a step — the terminal's
  // Room key from four screens deep, or Applications from one.
  backTo(id) {
    const i = stack.findIndex(s => s.id === id);
    if (i < 0) return nav.back();
    rewind(stack.length - (i + 1));
    return nav;
  },

  // The player left this place by some other door — a swipe on a sheet, a camera move that put
  // them back in the room. Take it and everything above it off without running their exits, and
  // wind history back to match so one back press is still one place.
  drop(id) {
    const i = stack.findIndex(s => s.id === id);
    if (i < 0) return nav;
    const n = stack.length - i;
    stack.length = i;
    rewind(n);
    return nav;
  },

  at(id) { return stack.some(s => s.id === id); },
  get depth() { return stack.length; },
  get path() { return stack.map(s => s.id); },
};

function onPop(e) {
  const want = e.state?.mono ?? 0;
  // A forward press lands past where the game is; put history back where the game actually is
  // rather than trying to replay a screen the player never re-opened.
  if (want > stack.length) { rewind(want - stack.length); return; }
  while (stack.length > want) stack.pop().exit?.();
}

/* ── the gate at the bottom of the stack ────────────────────────────────── */

function showGate() {
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'navgate';
    gate.innerHTML = `
<div class="ng-card">
  <i>Tamber Reach</i>
  <b>Still trading</b>
  <p>Your company is where you left it. Going back again closes the game — the run is saved either
  way.</p>
  <button type="button" data-ng="stay">Carry on</button>
</div>`;
    gate.addEventListener('click', e => {
      if (e.target.closest('[data-ng="stay"]') || e.target === gate) hideGate();
    });
    document.body.appendChild(gate);
  }
  clearTimeout(gateTimer);
  gate.classList.add('live');
  requestAnimationFrame(() => gate.classList.add('in'));
}

function hideGate() {
  gate?.classList.remove('in');
  clearTimeout(gateTimer);
  gateTimer = setTimeout(() => gate?.classList.remove('live'), 260);
  nav.push('system', showGate);
  onResume?.();
}

export default nav;
