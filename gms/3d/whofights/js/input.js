// Keyboard + mouse on desktop, floating stick + attack half on touch.
// Screen halves: one moves, one looks and attacks. `flip` swaps them for left-handers.
// Sprint is Shift on a keyboard and a push past full stick deflection on touch.
//
// Three edges leave here, and every one of them is a TAP rather than a press, because the same
// pointer that attacks is the one that turns the camera: a drag has to look and only a drag that
// went nowhere is a click. On a mouse, button 0 attacks and button 2 opens the interact menu; on
// touch there is no second button, so a short tap attacks and a long press opens the menu.
// Space is jump, which is what it is for — it used to be attack, and a jump button and an attack
// button are not the same button on any keyboard anyone has used.
//
// The number row casts. 1-9 and 0 are the first ten abilities and Shift with the same key is the
// second ten, which is twenty — four essences at five each, and the most anyone can hold. The
// interact menu is the authored route to a spell and it stays, but reaching a spell through a menu
// takes about a second and an earth elemental is already swinging by then; a fight needs the
// abilities under a finger.
//
// `read()` returns the banked slot. It did not, for a while, and nothing noticed: the player asks
// for `cmd.spell` and `read()` was clearing `spellEdge` without ever putting it in what it
// returned, so the number keys were dead and only the interact menu could cast. The UI test cast
// by calling the session directly, which is why it stayed green. `input.test.mjs` presses keys
// now.

// Which ability a key press means, or null if it means nothing. Pure and exported because it is
// the one piece of the keyboard worth a test, and because js/game/actionbar.js has to be able to
// print the same label beside a slot that the key press will reach.
export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function slotFor(code, shift = false) {
  const m = /^Digit([0-9])$/.exec(code);
  if (!m) return null;
  const d = +m[1];
  // 0 is the tenth key, not the zeroth: it sits at the end of the row and that is where the tenth
  // ability is.
  return (d === 0 ? 9 : d - 1) + (shift ? 10 : 0);
}

// The label to print on slot `i` — "4", or "⇧4".
export const keyLabel = i => (i < 0 || i >= 20 ? '' : `${i >= 10 ? '⇧' : ''}${SLOT_KEYS[i % 10]}`);

const STICK_R = 62;
const TAP_MS = 400, TAP_PX = 16;
// A press this long that went nowhere is a deliberate hold, not a slow tap.
const HOLD_MS = 450;
// Longer than a frame, short enough that a stalled loop banks nothing worth applying.
const STALE_MS = 120;
// Two thresholds, or a thumb resting on the rim flickers between walk and run every frame.
const SPRINT_ON = STICK_R * 1.55, SPRINT_OFF = STICK_R * 1.35;

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.attack = false;
    this.attackEdge = false;
    this.jumpEdge = false;
    this.interactEdge = false;
    // 0-19, or null. A slot rather than a boolean, so the player can only ever bank one cast: a
    // second key pressed in the same frame replaces the first rather than queueing behind it.
    this.spellEdge = null;
    this.sprint = false;
    this.stickSprint = false;
    this.flip = false;
    this.locked = false;

    this.keys = new Set();
    this.pointers = new Map();
    this.stickId = null;
    this.lookId = null;
    this.readAt = 0;

    this.el = {
      touch: document.getElementById('touch'),
      knob: document.querySelector('#stick i'),
      fire: document.getElementById('fire'),
    };

    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    addEventListener('keydown', e => {
      if (e.repeat || typing(e)) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpEdge = true; e.preventDefault(); }
      const slot = slotFor(e.code, e.shiftKey);
      if (slot != null) { this.spellEdge = slot; e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.jumpEdge = this.interactEdge = this.attackEdge = false;
      this.spellEdge = null;
      this.stickId = this.lookId = null;
      this.stickSprint = false;
      this.hideStick();
    });

    const down = e => this.onDown(e);
    for (const id of ['stage', 'touch']) document.getElementById(id)?.addEventListener('pointerdown', down);
    addEventListener('pointermove', e => this.onMove(e), { passive: false });
    addEventListener('pointerup', e => this.onUp(e));
    addEventListener('pointercancel', e => this.onUp(e));
    // #game is in here for the two long-presses that live over text — the school dial and the
    // quest tracker — which otherwise raise the context menu on Android.
    addEventListener('contextmenu', e => { if (e.target.closest('#touch, #stage, #game')) e.preventDefault(); });
  }

  moveSide(clientX) {
    const left = clientX < innerWidth / 2;
    return this.flip ? !left : left;
  }

  onDown(e) {
    if (e.target.closest('#panel, #hud')) return;
    if (e.pointerType === 'touch') document.body.classList.add('touch');
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0, button: e.button, touch: e.pointerType === 'touch' });

    if (e.pointerType !== 'touch') {
      this.lookId = e.pointerId;
      return;
    }
    if (this.moveSide(e.clientX) && this.stickId === null) {
      this.stickId = e.pointerId;
      this.showStick(e.clientX, e.clientY, 0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);

    if (e.pointerId === this.stickId) {
      const vx = e.clientX - p.x0, vy = e.clientY - p.y0;
      const len = Math.hypot(vx, vy) || 1;
      const k = Math.min(1, len / STICK_R);
      this.move.x = (vx / len) * k;
      this.move.y = -(vy / len) * k;
      this.stickSprint = len > (this.stickSprint ? SPRINT_OFF : SPRINT_ON);
      this.showStick(p.x0, p.y0, (vx / len) * k * STICK_R, (vy / len) * k * STICK_R);
      e.preventDefault();
    } else if (e.pointerId === this.lookId) {
      // A drag made while nothing is reading — the dev hub pauses the loop — would otherwise pile
      // up and arrive as one whip the frame it comes back, so a stale accumulator is replaced
      // rather than added to. The clamp is the ceiling for a read that stops without warning.
      if (performance.now() - this.readAt > STALE_MS) this.look.x = this.look.y = 0;
      this.look.x = Math.max(-2000, Math.min(2000, this.look.x + dx));
      this.look.y = Math.max(-2000, Math.min(2000, this.look.y + dy));
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.move.x = this.move.y = 0;
      this.stickSprint = false;
      this.hideStick();
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      if (!p || p.moved >= TAP_PX) return;
      const held = performance.now() - p.t;
      // Right button, or a long press where there is no right button, opens the interact menu.
      if (p.button === 2 || (p.touch && held >= HOLD_MS)) this.interactEdge = true;
      else if (held < TAP_MS) this.attackEdge = true;
    }
  }

  showStick(cx, cy, dx, dy) {
    const k = this.el.knob;
    if (!k) return;
    k.classList.toggle('sprint', this.stickSprint);
    k.style.display = 'block';
    k.style.left = `${cx}px`;
    k.style.top = `${cy}px`;
    k.style.setProperty('--dx', `${dx}px`);
    k.style.setProperty('--dy', `${dy}px`);
  }

  hideStick() {
    if (!this.el.knob) return;
    this.el.knob.style.display = 'none';
    this.el.knob.classList.remove('sprint');
  }

  // Set every frame from whether something else is driving the player, never latched: a lock
  // nobody clears is a game that has stopped accepting input, which is worse than what it fixes.
  lock(v) { this.locked = !!v; }

  // Called once per frame by the player; keyboard folds into the same vector the stick fills.
  // A locked read still drains — a look delta that piled up behind the lock would arrive as one
  // whip the frame control came back.
  read() {
    const k = this.keys;
    this.readAt = performance.now();
    if (this.stickId === null) {
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const l = Math.hypot(x, y) || 1;
      this.move.x = x / l * Math.min(1, Math.hypot(x, y));
      this.move.y = y / l * Math.min(1, Math.hypot(x, y));
    }
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.stickSprint;
    // A locked read still drains every edge as well as the look delta: a jump banked behind a
    // conversation and applied the frame it closes is a player launched into the air by a button
    // they pressed a minute ago.
    const out = this.locked
      ? { mx: 0, my: 0, lx: 0, ly: 0, attack: false, jump: false, interact: false, sprint: false }
      : {
        mx: this.move.x, my: this.move.y, lx: this.look.x, ly: this.look.y,
        attack: this.attackEdge, jump: this.jumpEdge, interact: this.interactEdge, sprint: this.sprint,
        spell: this.spellEdge,
      };
    this.look.x = this.look.y = 0;
    this.attackEdge = false;
    this.jumpEdge = false;
    this.interactEdge = false;
    this.spellEdge = null;
    return out;
  }
}
