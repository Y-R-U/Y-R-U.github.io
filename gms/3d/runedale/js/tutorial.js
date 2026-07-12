// The guided tutorial (a Tutorial-Island homage run by Elder Wick in
// Bramblewick) + post-tutorial achievements. Sequential steps advance off
// game events; each step hands out the items it needs, updates the HUD
// tracker, and aims the world beacon at its target. Fully skippable.

export function createTutorial(player, bus, getPoi) {
  const give = (items) => { for (const [id, n] of items) player.addItem(id, n); };

  const STEPS = [
    {
      id: 'talk', text: 'Speak to Elder Wick',
      say: ['Ah, a new face in Bramblewick! Welcome, traveller.',
        'Runedale rewards those who master its crafts. Let me show you the basics — do as I say and you\'ll go far.'],
      target: () => 'elder', event: 'talk',
    },
    {
      id: 'chop', text: 'Chop a tree for logs',
      say: ['First: wood. Take this axe and tinderbox.', 'Tap a tree to walk over and chop it.'],
      gives: [['bronze_axe', 1], ['tinderbox', 1]],
      target: () => getPoi().tree, event: 'chop',
    },
    {
      id: 'fire', text: 'Light a fire with your logs',
      say: ['Well swung! Now make a fire — stand clear of buildings and use the prompt at the bottom of the screen, or tap the tinderbox in your pack.'],
      target: () => null, event: 'fire',
    },
    {
      id: 'fish', text: 'Catch a shrimp at the fishing spot',
      say: ['A fine blaze! Food next. Take this net — see the splashing spot down by the river? Tap it.'],
      gives: [['small_net', 1]],
      target: () => getPoi().fish, event: 'fish', tag: 'raw_shrimp',
    },
    {
      id: 'cook', text: 'Cook the shrimp on a fire',
      say: ['Raw shrimp won\'t do you much good. Cook it on your fire — or on the hamlet campfire. Careful not to burn it!'],
      target: () => getPoi().fire, event: 'cook', tag: 'shrimp',
    },
    {
      id: 'eat', text: 'Eat the shrimp',
      say: ['Smells good! Open your pack 🎒 and tap the shrimp to eat it. Food heals your wounds.'],
      target: () => null, event: 'eat', tag: 'shrimp',
    },
    {
      id: 'mine', text: 'Mine copper AND tin ore', n: 2,
      say: ['Now for the smith\'s arts. Take this pickaxe and hammer.', 'Mine one COPPER and one TIN from the rocks east of the green.'],
      gives: [['bronze_pickaxe', 1], ['hammer', 1]],
      target: () => (player.hasItem('copper_ore') ? getPoi().tin : getPoi().copper), event: 'mine',
      check: () => player.hasItem('copper_ore') && player.hasItem('tin_ore'),
    },
    {
      id: 'smelt', text: 'Smelt a bronze bar at the furnace',
      say: ['Copper and tin make bronze. Use the furnace by the smithy.'],
      target: () => getPoi().furnace, event: 'smelt', tag: 'bronze_bar',
    },
    {
      id: 'smith', text: 'Smith a bronze sword at the anvil',
      say: ['Glowing nicely! Now hammer that bar into a sword at the anvil.'],
      target: () => getPoi().anvil, event: 'smith', tag: 'bronze_sword',
    },
    {
      id: 'equip', text: 'Wield your new sword',
      say: ['A blade of your own making! Open your pack 🎒 and tap the sword to wield it.'],
      target: () => null, event: 'equip', tag: 'bronze_sword',
    },
    {
      id: 'kill', text: 'Slay a rat in the pen',
      say: ['Time to test your steel. The rats in the pen have been at our grain — tap one to attack!'],
      target: () => 'rat', event: 'kill', tag: 'rat',
    },
    {
      id: 'bank', text: 'Deposit something in the bank chest',
      say: ['Victory! One last lesson: never carry all you own. Tap the bank chest and deposit something — every bank in Runedale shares one vault.'],
      target: () => getPoi().bank, event: 'bank',
    },
  ];

  const DONE_SAY = ['You\'ve learned all Bramblewick can teach.',
    'Take these coins and follow the road north across the ford to ASHFORD — and look for Milbrook\'s trout, Stonefell\'s iron and… mind the goblins. Farewell!'];
  const REWARD = { gold: 25, items: [['bread', 2]] };

  const ACHIEVEMENTS = [
    { id: 'ashford',  name: 'New in Town',    desc: 'Visit Ashford',                 gold: 30,  event: 'visit', tag: 'ashford' },
    { id: 'milbrook', name: 'Salt in the Air', desc: 'Visit Milbrook',               gold: 30,  event: 'visit', tag: 'milbrook' },
    { id: 'goblins',  name: 'Goblin Trouble', desc: 'Slay 5 goblins', n: 5,          gold: 100, event: 'kill',  tag: 'goblin' },
    { id: 'trout',    name: 'Master Angler',  desc: 'Catch a trout',                 gold: 50,  event: 'fish',  tag: 'raw_trout' },
    { id: 'iron',     name: 'Iron Age',       desc: 'Smith any iron item',           gold: 150, event: 'smith', tag: 'iron' },
    { id: 'total50',  name: 'Dale Renowned',  desc: 'Reach total level 50',          gold: 250, event: 'levelup' },
  ];

  const st = { step: 0, counts: {}, done: false, ach: {} };   // ach: id -> {n, done}
  for (const a of ACHIEVEMENTS) st.ach[a.id] = { n: 0, done: false };

  function cur() { return st.done ? null : STEPS[st.step]; }

  function startStep(announce = true) {
    const s = cur();
    if (!s) return;
    if (announce && s.say) bus.dialogue?.('Elder Wick', s.say);
    if (s.gives && !s._gave) { s._gave = true; give(s.gives); for (const [id, n] of s.gives) bus.toast?.(`🎁 Received ${n > 1 ? n + '× ' : ''}${id.replace(/_/g, ' ')}`); }
    updateTracker();
    bus.beacon?.(s.target ? s.target() : null);
  }

  function advance() {
    st.step++;
    if (st.step >= STEPS.length) return finish();
    startStep(true);
    bus.questsChanged?.();
  }

  function finish() {
    st.done = true;
    bus.dialogue?.('Elder Wick', DONE_SAY);
    player.gainGold(REWARD.gold);
    give(REWARD.items);
    bus.toast?.(`✅ Tutorial complete! +${REWARD.gold} coins`);
    bus.celebrate?.();
    bus.beacon?.(null);
    updateTracker();
    bus.questsChanged?.();
  }

  function updateTracker() {
    const s = cur();
    if (s) {
      const prog = s.n ? ` (${Math.min(st.counts[s.id] || 0, s.n)}/${s.n})` : '';
      bus.tracker?.(`Tutorial: ${s.text}${prog}`, false);
    } else {
      const next = ACHIEVEMENTS.find(a => !st.ach[a.id].done);
      bus.tracker?.(next ? `${next.name}: ${next.desc}${next.n ? ` (${st.ach[next.id].n}/${next.n})` : ''}` : null);
    }
  }

  function event(type, payload = {}) {
    // tutorial step
    const s = cur();
    if (s && s.event === type && (!s.tag || payload.tag === s.tag)) {
      st.counts[s.id] = (st.counts[s.id] || 0) + 1;
      const complete = s.check ? s.check() : (!s.n || st.counts[s.id] >= s.n);
      if (complete) advance();
      else { updateTracker(); bus.beacon?.(s.target ? s.target() : null); }
    } else if (s) {
      // re-aim the beacon (targets can move/change as inventory changes)
      bus.beacon?.(s.target ? s.target() : null);
    }

    // achievements (always live so early feats still count)
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      const rec = st.ach[a.id];
      if (rec.done || a.event !== type) continue;
      if (a.tag && !(payload.tag || '').includes(a.tag)) continue;
      if (a.id === 'total50' && player.totalLevel() < 50) continue;
      rec.n++;
      if (!a.n || rec.n >= a.n) {
        rec.done = true;
        player.gainGold(a.gold);
        bus.toast?.(`🏆 ${a.name} complete! +${a.gold} coins`);
        bus.celebrate?.();
      }
      changed = true;
    }
    if (changed || st.done) updateTracker();
    if (changed) bus.questsChanged?.();
  }

  function skip() {
    if (st.done) return;
    // hand out everything the remaining steps would have given
    for (let i = st.step; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (s.gives && !s._gave) { s._gave = true; give(s.gives); }
    }
    st.step = STEPS.length;
    finish();
  }

  return {
    event, skip, startStep, updateTracker,
    get active() { return !st.done; },
    get stepIndex() { return st.done ? STEPS.length : st.step; },
    get stepId() { return cur()?.id || 'done'; },
    beaconTarget: () => { const s = cur(); return s && s.target ? s.target() : null; },
    all: () => ({
      steps: STEPS.map((s, i) => ({ text: s.text, done: st.done || i < st.step, current: !st.done && i === st.step })),
      done: st.done,
      achievements: ACHIEVEMENTS.map(a => ({ name: a.name, desc: a.desc, done: st.ach[a.id].done, n: a.n, count: st.ach[a.id].n })),
    }),
    serialize: () => ({ step: st.step, done: st.done, counts: st.counts, gave: STEPS.map(s => !!s._gave), ach: st.ach }),
    load: (d) => {
      if (!d) { startStep(true); return; }
      st.step = d.step || 0; st.done = !!d.done; st.counts = d.counts || {};
      (d.gave || []).forEach((g, i) => { if (STEPS[i]) STEPS[i]._gave = g; });
      if (d.ach) for (const k in d.ach) if (st.ach[k]) st.ach[k] = d.ach[k];
      if (!st.done) startStep(false);
      updateTracker();
    },
  };
}
