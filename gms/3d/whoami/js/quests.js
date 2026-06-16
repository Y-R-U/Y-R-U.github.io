// Quests: an intro guide that walks you through the core loop, then a handful
// of missions including the dungeon delve. Objectives advance off game events
// (kill / fish / cook / eat / chop / enter dungeon / loot). The HUD tracker
// shows the next objective; finishing a quest grants gold + items and may
// unlock the next.

export function createQuests(player, bus) {
  const defs = [
    {
      id: 'intro', name: 'Finding Your Feet',
      desc: 'A stranger wakes with no memory. Learn to survive.',
      objectives: [
        { id: 'kill', text: 'Defeat 3 critters (rats or hens)', type: 'kill', tags: ['rat', 'hen'], target: 3, count: 0 },
        { id: 'fish', text: 'Catch a fish', type: 'fish', target: 1, count: 0 },
        { id: 'cook', text: 'Cook food at a fire', type: 'cook', target: 1, count: 0 },
        { id: 'eat', text: 'Eat something', type: 'eat', target: 1, count: 0 },
      ],
      reward: { gold: 30, items: [['bread', 2]] }, unlocks: ['pest', 'woods'],
    },
    {
      id: 'pest', name: 'Pest Control',
      desc: 'The farmer wants the vermin and stray hens thinned out.',
      objectives: [{ id: 'k', text: 'Defeat 6 rats or hens', type: 'kill', tags: ['rat', 'hen'], target: 6, count: 0 }],
      reward: { gold: 45, items: [['hpotion', 1]] },
    },
    {
      id: 'woods', name: "A Woodsman's Lot",
      desc: 'Gather firewood — you\'ll want an axe and a tinderbox.',
      objectives: [
        { id: 'chop', text: 'Chop 3 logs (need an axe)', type: 'chop', target: 3, count: 0 },
        { id: 'cook', text: 'Cook 2 fish or meat', type: 'cook', target: 2, count: 0 },
      ],
      reward: { gold: 40, items: [['tinderbox', 1]] }, unlocks: ['dungeon'],
    },
    {
      id: 'dungeon', name: 'Into the Dark',
      desc: 'Something stirs beneath the hills. Clear out the crypt.',
      objectives: [
        { id: 'enter', text: 'Enter the dungeon', type: 'enter_dungeon', target: 1, count: 0 },
        { id: 'slay', text: 'Slay 5 dungeon monsters', type: 'kill', tags: ['skeleton', 'skeleton_soldier', 'spider', 'snake', 'zombie'], target: 5, count: 0 },
        { id: 'loot', text: 'Open the treasure chest', type: 'loot_chest', target: 1, count: 0 },
      ],
      reward: { gold: 120, items: [['gem', 1], ['hpotion', 2]] },
    },
  ];

  const state = new Map();   // id -> {def, started, complete, objectives(copy)}
  function start(id) {
    if (state.has(id)) return;
    const def = defs.find(d => d.id === id); if (!def) return;
    state.set(id, { def, started: true, complete: false, objectives: def.objectives.map(o => ({ ...o })) });
    bus.toast?.(`📜 New quest: ${def.name}`);
    updateTracker();
    bus.questsChanged?.();
  }

  function event(type, payload = {}) {
    let changed = false;
    for (const q of state.values()) {
      if (q.complete) continue;
      for (const o of q.objectives) {
        if (o.done || o.type !== type) continue;
        if (o.tags && payload.tag && !o.tags.includes(payload.tag)) continue;
        if (type === 'kill' && payload.dungeon === false && o.id === 'slay') continue;
        o.count += payload.n || 1;
        if (o.count >= o.target) o.done = true;
        changed = true;
      }
      if (!q.complete && q.objectives.every(o => o.done)) finish(q);
    }
    if (changed) { updateTracker(); bus.questsChanged?.(); }
  }

  function finish(q) {
    q.complete = true;
    const r = q.def.reward;
    if (r.gold) player.gainGold(r.gold);
    for (const [id, n] of (r.items || [])) player.addItem(id, n);
    bus.toast?.(`✅ Quest complete: ${q.def.name}  (+${r.gold || 0}🪙)`);
    bus.celebrate?.();
    for (const u of (q.def.unlocks || [])) start(u);
    updateTracker();
  }

  function updateTracker() {
    for (const q of state.values()) {
      if (q.complete) continue;
      const o = q.objectives.find(x => !x.done);
      if (o) { bus.tracker?.(`${q.def.name}: ${o.text}${o.target > 1 ? ` (${Math.min(o.count, o.target)}/${o.target})` : ''}`, false); return; }
    }
    bus.tracker?.(null);
  }

  return {
    start, event, updateTracker,
    all: () => [...state.values()].map(q => ({ name: q.def.name, desc: q.def.desc, complete: q.complete, objectives: q.objectives })),
    serialize: () => [...state.entries()].map(([id, q]) => ({ id, complete: q.complete, obj: q.objectives.map(o => o.count) })),
    load: (data, started) => {
      for (const id of (started || ['intro'])) start(id);
      for (const s of (data || [])) {
        const q = state.get(s.id); if (!q) { start(s.id); }
        const qq = state.get(s.id); if (!qq) continue;
        qq.complete = s.complete;
        s.obj.forEach((c, i) => { if (qq.objectives[i]) { qq.objectives[i].count = c; qq.objectives[i].done = c >= qq.objectives[i].target; } });
      }
      updateTracker();
    },
  };
}
