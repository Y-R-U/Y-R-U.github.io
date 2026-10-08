import { defineLevel2, V, flat, prop, A, apos, sofaTV } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { LINES } from '../../game/lines.js';

// C2 L10 "Silent Whistle" (no opening cutscene): open Jon's sock drawer, jump in and play, sock Odie (ears, tail,
// mouth), run from Jon, pick up the whistle, blow it ("Must be broken.") → Odie shaking downstairs. Chapter end.
const T = (k) => LINES[k]?.text;
const drawerPos = (ctx) => apos(ctx, 'sockDrawer', V(4.1, 3.62, 6.2));
const whistlePos = (ctx) => apos(ctx, 'whistleSpot', V(2.75, 3, 5.35));
const PARTS = ['ears', 'tail', 'mouth'];

export default defineLevel2({
  id: 'c2:10', title: 'Silent Whistle',
  objectives: ["Open Jon's sock drawer", 'Jump in and play', 'Sock Odie (0/3)', 'Run from Jon', 'Pick up the whistle', 'Blow the whistle'],
  hints: ['c2_l10_hint_1', 'c2_l10_hint_2', 'c2_l10_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    L.flags.socks = 0;
    const dresser = () => prop(ctx, 'dresser');
    L.interact({ id: 'sockDrawer', radius: 0.8, heightTol: 0.8, markerHeight: 0.3,
      get label() { return !L.objDone[0] ? 'Open the sock drawer' : L.flags.inDrawer ? 'Play!' : 'Jump in!'; },
      pos: () => drawerPos(ctx),
      enabled: () => !L.objDone[1] && !L.flags.busy,
      onInteract: () => drawer(L) });
    L.interact({ id: 'sock', radius: 0.95, heightTol: 0.9, label: 'Sock him!', pos: () => L.odie.root.position.clone(),
      enabled: () => L.flags.odieHere && !L.objDone[2] && !L.flags.busy, onInteract: () => sockOdie(L) });
    L.interact({ id: 'whistle', radius: 0.7, heightTol: 0.5,
      get label() { return L.flags.haveWhistle ? 'Blow!' : 'Pick it up'; },
      pos: () => (L.flags.haveWhistle ? ctx.controller.pos.clone() : whistlePos(ctx)),
      enabled: () => L.objDone[3] && !L.objDone[5] && !L.flags.busy, onInteract: () => whistle(L) });
  },
  start(L) {
    const { ctx } = L;
    sofaTV(L);
    try { prop(ctx, 'lymanDoor')?.close?.(); ctx.odie.setSocks?.(false); } catch {}
    L.odieAI.place(apos(ctx, 'lymanInside', V(7.9, 3, 8.1)), Math.PI);
    L.odieAI.sit('sit_pant');
  },
  update(L) {
    const { ctx, flags } = L;
    if (L.objDone[3] && !flags.whistleSaid && flat(ctx.controller.pos, whistlePos(ctx)) < 1.4 && Math.abs(ctx.controller.pos.y - 3) < 0.6) {
      flags.whistleSaid = true; L.say('c2_g_l10_whistle', { force: true });
    }
    if (flags.haveWhistle && flags.whistleObj) {
      (ctx.garfield.sockets?.mouth || ctx.garfield.root).getWorldPosition(flags.whistleObj.position);
    }
    const n = L.next();
    if (n <= 1) L.target((o) => o.copy(drawerPos(ctx)), { height: 0.3 });
    else if (n === 2 && flags.odieHere) L.target((o) => o.copy(L.odie.root.position).setY(L.odie.root.position.y + 0.7), { height: 0.3 });
    else if (n === 4) L.target((o) => o.copy(whistlePos(ctx)), { height: 0.3 });
    else L.target(null);
  },
  teardown(L) {
    showPlates(L);
    const { ctx } = L;
    ctx.controller.animHold = false;
    try { ctx.odie.setSocks?.(false); prop(ctx, 'dresser')?.reset?.(); prop(ctx, 'whistle')?.reset?.(); prop(ctx, 'whistle')?.setActive?.(false); prop(ctx, 'lymanDoor')?.close?.(); } catch {}
  },
});

async function drawer(L) {
  const { ctx } = L;
  const dr = prop(ctx, 'dresser')?.sockDrawer;
  L.flags.busy = true;
  try {
    if (!L.objDone[0]) {
      try { ctx.garfield.play?.('interact', { once: true }); } catch {}
      ctx.audio?.sfx?.('drawer');
      try { await dr?.open?.(); } catch {}
      L.obj(0);
    } else if (!L.flags.inDrawer) {
      const p = dr?.standPos?.() || drawerPos(ctx);
      ctx.controller.teleport(p.clone().add(V(0, 0.05, 0)), ctx.garfield.root.rotation.y);
      ctx.audio?.sfx?.('jump');
      L.flags.inDrawer = true;
    } else {
      ctx.controller.animHold = true;
      try { ctx.garfield.play?.('play_socks'); ctx.garfield.setExpression?.('happy'); } catch {}
      try { dr?.play?.(2.5); } catch {}
      L.say('c2_g_l10_socks', { force: true });
      await new Promise((r) => setTimeout(r, 2600));
      ctx.controller.animHold = false;
      try { ctx.garfield.play?.('idle'); } catch {}
      L.obj(1);
      odieWalksIn(L);
    }
  } finally { L.flags.busy = false; }
}

function odieWalksIn(L) {
  const { ctx, odieAI } = L;
  try { prop(ctx, 'lymanDoor')?.open?.(); } catch {}
  const d = drawerPos(ctx), a = A(ctx, 'sockDrawer');
  const r = a?.rotY ?? Math.PI;
  const front = V(d.x + Math.sin(r) * 1.0, 3, d.z + Math.cos(r) * 1.0);
  odieAI.run('walkIn', async (t) => {
    odieAI.noise('o_sniff');
    await t.walkTo(front, { speed: 0.85 });
    odieAI.face(d);
    L.flags.odieHere = true;
    t.loop('sniff', { fallback: 'idle_pant' });
    L.say('c2_g_l10_idea', { force: true });
  });
}

async function sockOdie(L) {
  const { ctx } = L;
  L.flags.busy = true;
  const i = L.flags.socks;
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  ctx.audio?.sfx?.('pop');
  const on = {}; PARTS.slice(0, i + 1).forEach((p) => (on[p] = true));
  try { ctx.odie.setSocks?.(on); } catch {}
  L.flags.socks = i + 1;
  L.setObjText(2, `Sock Odie (${i + 1}/3)`);
  L.say('c2_g_l10_sock_' + (i + 1), { force: true });
  await new Promise((r) => setTimeout(r, 700));
  L.flags.busy = false;
  if (i + 1 < 3) return;
  L.obj(2);
  // he wobbles off downstairs, Jon sees him
  const { odieAI, jon } = L;
  odieAI.run('socked', async (t) => {
    await t.wait(1.0);
    odieAI.clip('walk_socked', { force: true });
    await t.walkTo(apos(ctx, 'sofaFoot', V(3, 0, 2.75)).add(V(0.4, 0, 0.6)), { speed: 0.9 });
    odieAI.clip('idle', { force: true });
    L.say('c2_j_l10_socks', { force: true });
    jon.noChase = false;
    L.ly.noChase = true;
    jon.chase(10, { solo: true });
    // the run counts once the chase (or the catch) is over
    const poll = () => {
      if (L.dead) return;
      if (L.humans.chasing() || jon.state === 'catch') return L.later(0.3, poll);
      L.obj(3);
      try { prop(ctx, 'whistle')?.setActive?.(true); } catch {}
      odieAI.run('waits', async (t2) => { t2.loop('sit'); await t2.wait(999); });
    };
    L.later(1.0, poll);
  });
}

async function whistle(L) {
  const { ctx } = L;
  const w = prop(ctx, 'whistle');
  if (!L.flags.haveWhistle) {
    L.flags.haveWhistle = true;
    L.obj(4);
    ctx.audio?.sfx?.('pop');
    if (w?.root) { ctx.world.scene.attach(w.root); L.flags.whistleObj = w.root; }
    return;
  }
  L.flags.busy = true;
  ctx.controller.lock(true);
  try { ctx.garfield.play?.('blow_whistle', { once: true }); } catch {}
  await new Promise((r) => setTimeout(r, 600));
  try { w?.blow?.(); } catch {}
  ctx.audio?.sfx?.('whistle', { vol: 0.4 });
  await new Promise((r) => setTimeout(r, 900));
  L.obj(5);
  ctx.controller.lock(false);
  L.cut(async (d) => {
    await d.say('garfield', 'c2_g_l10_broken', { text: T('c2_g_l10_broken') });
    const g = ctx.garfield.root;
    d.cut(L.shot(g.position.clone().setY(g.position.y + 0.4), { dist: 1.8, h: 0.3, prefer: g.rotation.y + 0.8 }));
    ctx.garfield.play?.('throw_behind', { once: true });
    await d.wait(0.4);
    if (L.flags.whistleObj) {
      const from = L.flags.whistleObj.position.clone();
      const to = g.position.clone().add(V(-Math.sin(g.rotation.y) * 1.0, 0.02, -Math.cos(g.rotation.y) * 1.0));
      await d.tween((k) => { L.flags.whistleObj.position.lerpVectors(from, to, k); L.flags.whistleObj.position.y += Math.sin(k * Math.PI) * 0.4; }, 0.5);
      L.flags.haveWhistle = false;
    }
    ctx.garfield.play?.('walk');
    const start = g.position.clone();
    const fwd = V(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    await d.tween((k) => g.position.copy(start).addScaledVector(fwd, k * 0.9), 1.0, (k) => k);
    ctx.garfield.play?.('idle');
    // downstairs: Odie trembling
    const op = L.odie.root.position;
    L.odieAI.run('shake', async (t) => { t.loop('shake_scared', { fallback: 'dizzy' }); await t.wait(999); });
    try { ctx.odie.setExpression?.('scared'); } catch {}
    L.odieAI.noise('o_whimper');
    d.cut(L.shot(op.clone().setY(0.5), { dist: 1.8, h: 0.3 }));
    await d.wait(2.4);
    await d.say('garfield', 'c2_g_l10_end', { text: T('c2_g_l10_end') });
  }).then(() => L.win(0.2));
}
