// C5 sheep scatter: ties the flock logic (flock.js) to the game. main.js calls world.sheep?.update(...) once a frame.
// Bleats are synthesised (audio.playBleat), placed at the sheep. A player scatter goes to the score as 'sheep_scatter'
// (D38 Woolly Jumper bonus: the score owns airborne-only, minSheep and the per-flock cooldown). Farmer Mudge grumbles on
// the radio with his own sheep_scatter lines ("You've upset Doreen!"), or scold_buzz if those clips are missing.
export const MUDGE = { chance: 0.6, gap: 60, minSheep: 3 };
// SHEEP2: flock.js reports the sheep a plane reaches frame by frame (1–2 at a time on a pass), so one panic is the
// running tally of a flock's fresh scares by the player from the air, until it has been quiet for `gap` seconds.
export const PANIC = { gap: 5 };

// SHEEP2: the radio has a line for intent with a rendered clip (any voice: the sheep only live at the farm)
function voiced(radio, intent) {
  const b = radio?.bank;
  if (!b?.byKey) return false;
  for (const [k, l] of b.byKey) if (k.endsWith(`|${intent}`) && !l.fallback && l.some((e) => b.clip(e.voice, e.id))) return true;
  return false;
}

export function createSheepHerd({ flock, write, heightAt }) {
  const planes = [];
  const H = { flock, bleats: [], mudge: 0, mudgeAt: -1e9, mudgeIntent: null, sent: 0, ctx: null, panic: {} };

  flock.onBleat = (b) => {
    H.bleats.push({ t: flock.now(), scatter: b.scatter, flock: b.flock });
    if (H.bleats.length > 40) H.bleats.shift();
    const a = H.ctx?.audio;
    if (!a?.playBleat) return;
    const y = (heightAt ? heightAt(b.x, b.z) : 0) + 0.8;
    try { a.playBleat({ position: [b.x, y, b.z], delay: b.delay || 0, gain: b.gain ?? 0.6, pitch: b.scatter ? 1 + Math.random() * 0.25 : 0.9 + Math.random() * 0.2 }); } catch (e) { /* sound is optional */ }
  };
  flock.onScatter = (ev) => {
    const c = H.ctx;
    if (!ev.player || !ev.air) return;
    const now = flock.now();
    const P = H.panic[ev.flock] && now - H.panic[ev.flock].t < PANIC.gap ? H.panic[ev.flock] : (H.panic[ev.flock] = { n: 0, t: now });
    P.n += ev.n; P.t = now;
    // the score owns minSheep and the per-flock cooldown (D38): it pays the first report that reaches 3 sheep
    if (c?.game) try { c.game.handleEvent({ type: 'sheep_scatter', actor: 'player', flock: ev.flock, n: P.n, air: true }); H.sent++; } catch (e) { /* */ }
    if (P.n < MUDGE.minSheep || P.rolled || !c?.radio || c.story) return;
    P.rolled = true; // one roll of the dice per panic
    if (now - H.mudgeAt < MUDGE.gap || Math.random() > MUDGE.chance) return;
    H.mudgeAt = now;
    try { const intent = voiced(c.radio, 'sheep_scatter') ? 'sheep_scatter' : 'scold_buzz'; if (c.radio.say('tower', intent, { about: 'player', stale: 10 })) { H.mudge++; H.mudgeIntent = intent; } } catch (e) { /* */ }
  };

  // traffic: TRAFFIC's entity list ({ ac, player }); listener: camera position; ctx: { audio, radio, story }
  H.update = (dt, traffic = [], listener = null, ctx = {}) => {
    H.ctx = ctx;
    planes.length = 0;
    for (const e of traffic) {
      const ac = e.ac;
      if (!ac || ac.crashed) continue;
      planes.push({ x: ac.pos.x, z: ac.pos.z, agl: ac.agl, gs: ac.gs ?? 0, onGround: !!ac.onGround, id: ac.id, player: !!e.player });
    }
    if (flock.update(dt, planes, listener)) write();
  };
  Object.defineProperty(H, 'state', { get: () => ({ ...flock.state, mudge: H.mudge, mudgeIntent: H.mudgeIntent, sent: H.sent, recent: H.bleats.slice(-6) }) });
  return H;
}
