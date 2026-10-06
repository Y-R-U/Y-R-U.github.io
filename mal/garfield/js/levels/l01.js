import { defineLevel, platePos } from './common.js';

// Tutorial. Jon wanders for 30 s, then sits to eat. Goal: scratch his face, then eat while he fetches his newspaper.
const WANDER = 30;
const CARDS = [
  { id: 'move', text: 'Walk around with W A S D (or the arrow keys / the stick)', icon: 'paw', keys: ['W', 'A', 'S', 'D'], touch: 'joystick',
    touchText: 'Walk around with the stick in the bottom-left corner' },
  { id: 'cam', text: 'Look around: drag with the mouse (or swipe the right side of the screen)', icon: 'hand', keys: null,
    touchText: 'Look around: swipe on the right side of the screen' },
  { id: 'jump', text: 'Space (or the Jump button) jumps. Hop up onto the sofa!', icon: 'jump', keys: ['Space'], touch: 'jump',
    touchText: 'Tap the Jump button to jump. Hop up onto the sofa!' },
  { id: 'scratch', text: "Scratch with J or a click (or the claw button). Try it on Jon! Leg = he hops then chases. Face = he throws a newspaper. Bottom = he chases!", icon: 'claw', keys: ['J'], touch: 'scratch',
    touchText: 'Tap the claw button to Scratch. Try it on Jon! Leg = he hops then chases. Face = he throws a newspaper. Bottom = he chases!' },
  { id: 'pause', text: 'Esc (or the ⏸ button) pauses the game any time', icon: 'pause', keys: ['Esc'], touchText: 'The ⏸ button (top right) pauses the game any time' },
];

export default defineLevel({
  id: 1, food: 'steak', title: 'Face First',
  objectives: ["Scratch Jon's face", "Eat Jon's steak"],
  hints: ['l01_hint_1', 'l01_hint_2', 'l01_hint_3'],
  jonStart: 'wander',
  guard: { grab: 6, warn: 0.6 },
  canEat: (L) => L.flags.face && L.ai.distracted(),
  guardLabel: 'Scratch his face first!',
  setup(L) {
    const { ctx } = L;
    L.flags.card = 0; L.flags.cardT = 0; L.flags.moved = 0; L.flags.yaw0 = null;
    L.flags.last = ctx.controller.pos.clone();
    ctx.events.on('jonReact', ({ zone }) => {
      if (L.flags.card === 3) L.flags.cardDone = true;
      if (zone === 'face') {
        L.obj(0);
        if (!L.flags.face) {
          L.flags.face = true;
          L.target(null);
          if (L.flags.seated) L.tutorial({ id: 'eat', text: 'Quick! Stand at his plate and press Space (or tap the food) to eat!', touchText: 'Quick! Stand at his plate and tap the green Eat button!', icon: 'steak', keys: ['Space'], touch: 'interact' });
        }
      }
    });
    ctx.events.on('scratch', () => { if (L.flags.card === 3) L.flags.cardDone = true; });
    ctx.events.on('land', (e) => { if (L.flags.card === 2 && e.y > 0.3) L.flags.cardDone = true; });
    ctx.events.on('chase', ({ on }) => {
      if (on && !L.flags.escapeShown) {
        L.flags.escapeShown = true;
        L.tutorial({ id: 'escape',  text: "Jon's chasing you! He can't jump, so hop up onto furniture to escape.", icon: 'jump', keys: ['Space'], touch: 'jump', dur: 6 });
      }
    });
  },
  start(L) { L.say('g_tut_2', { delay: 1.0, force: true }); showCard(L); },
  update(L, dt) {
    const { ctx, ai } = L;
    const c = ctx.controller;
    // Jon's 30 s wander, then dinner.
    if (!L.flags.seatCalled && L.t > WANDER && ai.state === 'wander') {
      L.flags.seatCalled = true;
      ai.setHome({ type: 'sit' });
      L.say('j_dinner_time', { force: true });
      ai.goSit();
    } else if (!L.flags.seatCalled && L.t > WANDER) ai.setHome({ type: 'sit' });
    if (!L.flags.seated && ai.state === 'sitEat') {
      L.flags.seated = true;
      L.say('g_tut_3', { delay: 1.5, force: true });
      L.progress();
      if (!L.flags.face) {
        L.tutorial({ id: 'face', text: "Jon's eating! Jump onto the table (or the bench) next to him and Scratch his face!", icon: 'claw', keys: ['Space', 'J'], touch: ['jump', 'scratch'] });
        L.target((o) => o.copy(ctx.jonAI.pos()).setY(1.25));
      }
    }
    // tutorial card progress
    L.flags.moved += c.pos.distanceTo(L.flags.last); L.flags.last.copy(c.pos);
    if (L.flags.yaw0 == null) L.flags.yaw0 = ctx.camera.yaw;
    L.flags.cardT += dt;
    const card = CARDS[L.flags.card];
    if (card) {
      if (card.id === 'move' && L.flags.moved > 2) L.flags.cardDone = true;
      if (card.id === 'cam' && Math.abs(Math.atan2(Math.sin(ctx.camera.yaw - L.flags.yaw0), Math.cos(ctx.camera.yaw - L.flags.yaw0))) > 0.7) L.flags.cardDone = true;
      if (card.id === 'pause' && L.flags.cardT > 5) L.flags.cardDone = true;
      if (L.flags.cardDone || L.flags.cardT > (card.id === 'scratch' ? 18 : 14)) {
        L.flags.cardDone = false; L.flags.card++; L.flags.cardT = 0;
        if (card.id === 'cam') L.flags.yaw0 = ctx.camera.yaw;
        ctx.audio?.sfx?.('pop');
        if (!L.flags.seated) showCard(L); else L.tutorialHide();
      }
    }
    if (L.flags.face && ai.distracted() && !L.eating) L.target((o) => o.copy(platePos(ctx)), { height: 0.4 });
    else if (L.flags.face && ai.isAlert()) L.target(null);
    if (L.flags.seated && L.flags.face && ai.isAlert() && !L.flags.faceAgain) {
      L.flags.faceAgain = true;
      L.say('g_guarded_3', { delay: 0.5 });
      L.target((o) => o.copy(ctx.jonAI.pos()).setY(1.25));
    }
    if (ai.distracted()) L.flags.faceAgain = false;
  },
});

function showCard(L) {
  const c = CARDS[L.flags.card];
  if (!c) return L.tutorialHide();
  L.tutorial(c);
  if (c.id === 'jump') L.target((o) => { const a = L.ctx.world.anchors?.get('sofa'); return a ? o.copy(a.pos) : null; }, { height: 0.4 });
  else if (c.id === 'scratch') L.target((o) => o.copy(L.ctx.jonAI.pos()).setY(1.0));
  else if (c.id !== 'pause') L.target(null);
}
