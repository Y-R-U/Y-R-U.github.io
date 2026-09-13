/** HELLWAKE campaign and build data. All chapter indices are zero based. */
export const CHAPTERS = [
  {
    id: 0,
    title: "Dead Air",
    subtitle: "A voice beneath the static",
    location: "Mercy District",
    color: "#76f9cf",
    duration: 100,
    objective: { type: "seal", label: "Break the street seals", count: 2 },
    boss: { name: "The Bellkeeper", type: "warden" },
    intro: [
      {
        speaker: "MARA",
        text: "Three nights since the dead stood up. They move together now. Like something is wearing them.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "Mara? If that is you, follow the green lights. The red circles are keeping them here.",
      },
      {
        speaker: "MARA",
        text: "June died in the first wave. I buried her myself. I am following the lights anyway.",
      },
    ],
    outro: [
      {
        speaker: "JUNE · RADIO",
        text: "That thing was a receiver. Break the seals and the signal loses its grip.",
      },
      { speaker: "MARA", text: "Tell me something only my sister would know." },
      {
        speaker: "JUNE · RADIO",
        text: "You kept the blue bike. Even after I said it was too small. Come to the hospital.",
      },
    ],
    unlock: "Ash Lancer unlocked · Mercy Hospital located",
  },
  {
    id: 1,
    title: "Mercy Burns",
    subtitle: "The dead are not the enemy",
    location: "Mercy Hospital",
    color: "#ffbc80",
    duration: 140,
    objective: { type: "rescue", label: "Evacuate the survivors", count: 3 },
    boss: { name: "Sister Cinder", type: "cinder" },
    intro: [
      {
        speaker: "ELIAS · RADIO",
        text: "This is Doctor Vale. There are people in the courtyard. Alive. The doors will not hold.",
      },
      {
        speaker: "MARA",
        text: "Your hospital is broadcasting on a dead frequency.",
      },
      {
        speaker: "ELIAS · RADIO",
        text: "The first patient was humming it before she died. Now the entire city is humming.",
      },
    ],
    outro: [
      {
        speaker: "ELIAS",
        text: "You saved everyone we could reach. I owe you more than medicine.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "We are still inside, Mara. All of us. The things in our bodies make us watch.",
      },
      {
        speaker: "MARA",
        text: "Then we are going to take the city apart until you can leave.",
      },
    ],
    unlock: "Gravebreaker unlocked · Elias joins the refuge",
  },
  {
    id: 2,
    title: "The Hollow Choir",
    subtitle: "Steal their voice",
    location: "Saint Orra Cathedral",
    color: "#b9a0ff",
    duration: 160,
    objective: { type: "seal", label: "Silence the choir seals", count: 3 },
    boss: { name: "The Cantor", type: "cantor" },
    intro: [
      {
        speaker: "ELIAS · RADIO",
        text: "The signal converges beneath Saint Orra. I can keep your heart beating. You keep moving.",
      },
      {
        speaker: "THE CANTOR",
        text: "Little sister calls. Big sister comes. A beautiful arrangement.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "It can hear me now. Do not listen when it sounds like me.",
      },
    ],
    outro: [
      {
        speaker: "THE CANTOR",
        text: "You think you have silenced us? The tower has a thousand mouths.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "I stole its frequency. There is a way to reverse the broadcast. But we need the old relay.",
      },
      {
        speaker: "MARA",
        text: "You were always the one who knew how to make things scream.",
      },
    ],
    unlock: "Winterglass unlocked · Relay coordinates recovered",
  },
  {
    id: 3,
    title: "Last Light",
    subtitle: "Give the city a heartbeat",
    location: "Floodline Relay",
    color: "#7fd9ff",
    duration: 180,
    objective: { type: "beacon", label: "Power the relay beacons", count: 3 },
    boss: { name: "The Drowned King", type: "drowned" },
    intro: [
      {
        speaker: "VESPER · RADIO",
        text: "You are walking into a power station full of water and corpses. I like your style.",
      },
      { speaker: "MARA", text: "Who is this?" },
      {
        speaker: "VESPER · RADIO",
        text: "The engineer who built their tower. I thought I was building an emergency network. Let me fix it.",
      },
    ],
    outro: [
      {
        speaker: "VESPER",
        text: "Relay is live. We can turn their command into an evacuation signal. A door for the trapped dead.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "I can hold it open from this side. You know what that means.",
      },
      {
        speaker: "MARA",
        text: "Yes. I just need a little longer before you say it.",
      },
    ],
    unlock: "Wisp Array unlocked · Vesper joins the refuge",
  },
  {
    id: 4,
    title: "Names in the Dark",
    subtitle: "Nobody leaves forgotten",
    location: "Memorial Avenue",
    color: "#f5a8d4",
    duration: 195,
    objective: {
      type: "rescue",
      label: "Recover the memory anchors",
      count: 3,
    },
    boss: { name: "The Unnamed", type: "unnamed" },
    intro: [
      {
        speaker: "JUNE · RADIO",
        text: "They erase our names first. Without a name, you forget there was anything before them.",
      },
      {
        speaker: "ELIAS · RADIO",
        text: "The memorial terminals still hold the missing-person register. Bring those names to the tower.",
      },
      { speaker: "MARA", text: "Every single one." },
    ],
    outro: [
      {
        speaker: "VESPER · RADIO",
        text: "Forty thousand names. Loaded and ready. I left one space at the beginning.",
      },
      {
        speaker: "MARA",
        text: "June Vale. She hated the dark. She sang badly. She always came back for me.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "And I still would. Come on, big sister. One last climb.",
      },
    ],
    unlock: "Reaper Thread unlocked · The Black Spire is open",
  },
  {
    id: 5,
    title: "Break the Dawn",
    subtitle: "One last song for the living",
    location: "The Black Spire",
    color: "#ff6f83",
    duration: 210,
    objective: { type: "beacon", label: "Reverse the broadcast", count: 4 },
    boss: { name: "AZRAEL · Lord of the Signal", type: "azrael" },
    intro: [
      {
        speaker: "AZRAEL",
        text: "I gave the dead a voice. I can give your sister a body. Lower your weapon.",
      },
      {
        speaker: "JUNE · RADIO",
        text: "I do not want a body it owns. I want the sunrise. Please, Mara.",
      },
      { speaker: "MARA", text: "Then let us make some light." },
    ],
    outro: [
      {
        speaker: "MARA · BROADCAST",
        text: "This is Mercy emergency radio. Your name is yours. Your life was yours. You can go home now.",
      },
      { speaker: "JUNE", text: "I can see it. The sunrise. It is warm, Mara." },
      {
        speaker: "MARA",
        text: "I kept the blue bike because I thought you might need it. I think I can let it go now.",
      },
      { speaker: "JUNE", text: "Keep riding." },
      {
        speaker: "DAWN · 06:14",
        text: "The bodies fall quiet. Windows open. For the first time in three nights, the city hears birds. The living begin again.",
      },
    ],
    unlock: "Story complete · Endless Afterlight unlocked",
  },
];

export const WEAPONS = [
  {
    id: "pistol",
    name: "Mercy .45",
    icon: "⌁",
    color: "#8effdb",
    description: "Accurate rounds target the nearest possessed.",
    evolution: {
      name: "Absolution",
      requires: "might",
      description: "Explosive, piercing multishot tears through the horde.",
    },
    unlockChapter: 0,
  },
  {
    id: "orbit",
    name: "Halo Knives",
    icon: "✧",
    color: "#a6c5ff",
    description: "Orbiting blades punish anything that gets close.",
    evolution: {
      name: "Seraphim",
      requires: "reach",
      description: "More, larger blades become a wall of sacred steel.",
    },
    unlockChapter: 0,
  },
  {
    id: "lightning",
    name: "Storm Rosary",
    icon: "ϟ",
    color: "#b9a0ff",
    description: "Lightning strikes nearby enemies in a chain.",
    evolution: {
      name: "Heavenfall",
      requires: "haste",
      description: "A relentless thunderstorm tears through the possessed.",
    },
    unlockChapter: 0,
  },
  {
    id: "flame",
    name: "Ash Lancer",
    icon: "♨",
    color: "#ffae75",
    description: "Scorch the ground. Fire keeps dealing damage.",
    evolution: {
      name: "Phoenix Wake",
      requires: "vitality",
      description: "Long-burning sanctified fire consumes entire streets.",
    },
    unlockChapter: 1,
  },
  {
    id: "shotgun",
    name: "Gravebreaker",
    icon: "⋔",
    color: "#ffd187",
    description: "A broad blast of pellets clears a path ahead.",
    evolution: {
      name: "Judgment Day",
      requires: "might",
      description: "A crushing barrage punches through dense crowds.",
    },
    unlockChapter: 2,
  },
  {
    id: "frost",
    name: "Winterglass",
    icon: "❄",
    color: "#83e9ff",
    description: "A burst of ice slows enemies and buys breathing room.",
    evolution: {
      name: "Absolute Zero",
      requires: "reach",
      description: "Ice bursts leave a damaging field of deep frost.",
    },
    unlockChapter: 3,
  },
  {
    id: "drone",
    name: "Wisp Array",
    icon: "◈",
    color: "#b8ff82",
    description: "Two orbiting wisps fire bolts at nearby enemies.",
    evolution: {
      name: "Ghost Choir",
      requires: "magnet",
      description: "Four awakened wisps fire piercing bolts into the horde.",
    },
    unlockChapter: 4,
  },
  {
    id: "scythe",
    name: "Reaper Thread",
    icon: "☽",
    color: "#ff9cc8",
    description: "A spectral blade sweeps the area around you.",
    evolution: {
      name: "Final Requiem",
      requires: "fortune",
      description: "Execute weakened lesser foes. Every swing restores health.",
    },
    unlockChapter: 5,
  },
];

export const PASSIVES = [
  {
    id: "might",
    name: "Blood Oath",
    icon: "◆",
    description: "+18% weapon damage per rank.",
    color: "#ff9c98",
  },
  {
    id: "haste",
    name: "Quickening",
    icon: "»",
    description: "+12% attack speed per rank.",
    color: "#dcc0ff",
  },
  {
    id: "vitality",
    name: "Second Heart",
    icon: "♡",
    description: "+25 maximum health and recover 25 HP per rank.",
    color: "#ffb2c4",
  },
  {
    id: "magnet",
    name: "Soul Compass",
    icon: "◎",
    description: "+40% soul pickup radius per rank.",
    color: "#9ef8d8",
  },
  {
    id: "reach",
    name: "Long Shadow",
    icon: "↗",
    description: "+15% weapon area and range per rank.",
    color: "#a9dbff",
  },
  {
    id: "fortune",
    name: "Last Wish",
    icon: "✦",
    description: "+12% soul experience per rank.",
    color: "#ffe5a1",
  },
];

export const SURVIVORS = [
  {
    id: "mara",
    name: "Mara Vale",
    title: "The Last Runner",
    description:
      "A steady hand and one reason to keep going. Starts with Mercy .45.",
    weapon: "pistol",
    unlockChapter: 0,
    color: "#76f9cf",
  },
  {
    id: "elias",
    name: "Elias Vale",
    title: "The Field Medic",
    description: "+25 maximum health. Starts with Halo Knives.",
    weapon: "orbit",
    unlockChapter: 2,
    color: "#ffbc80",
    maxHpBonus: 25,
  },
  {
    id: "vesper",
    name: "Vesper",
    title: "The Signal Thief",
    description: "+12% move speed, +8% damage. Starts with Storm Rosary.",
    weapon: "lightning",
    unlockChapter: 4,
    color: "#b9a0ff",
    speedMultiplier: 1.12,
    damageMultiplier: 1.08,
  },
];

export const RELICS = [
  {
    id: "vitality",
    name: "Ember Heart",
    description: "+10 starting maximum health per rank.",
    max: 5,
    cost: 30,
    perLevel: 10,
  },
  {
    id: "might",
    name: "Sacred Powder",
    description: "+6% weapon damage per rank.",
    max: 5,
    cost: 40,
    perLevel: 0.06,
  },
  {
    id: "haste",
    name: "Silver Trigger",
    description: "+4% attack speed per rank.",
    max: 5,
    cost: 45,
    perLevel: 0.04,
  },
  {
    id: "magnet",
    name: "Memory Locket",
    description: "+15% soul pickup radius per rank.",
    max: 5,
    cost: 25,
    perLevel: 0.15,
  },
];

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;
export const relicCost = (relic, level = 0) => relic.cost * (level + 1);

function weightedTake(pool, rng) {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let threshold =
    Math.max(0, Math.min(0.999999999, Number(rng()) || 0)) * total;
  let index = pool.findIndex((item) => (threshold -= item.weight) < 0);
  if (index < 0) index = pool.length - 1;
  return pool.splice(index, 1)[0].upgrade;
}

/** Three unique, legal upgrade choices. Early drafts foreground the starter weapon. */
export function getDraft(run, rng = Math.random) {
  const weapons = run.weapons || {};
  const passives = run.passives || {};
  const evolved = run.evolved || {};
  const chapter = Math.max(0, Number(run.chapter) || 0);
  const arsenalChapter = Math.max(
    chapter,
    Number(run.arsenalChapter ?? run.chapter) || 0,
  );
  const pool = [];
  const ready = [];
  const ownedWeapons = WEAPONS.filter((weapon) => weapons[weapon.id] > 0);
  const ownedPassives = PASSIVES.filter((passive) => passives[passive.id] > 0);
  for (const weapon of WEAPONS) {
    const rank = weapons[weapon.id] || 0;
    if (
      rank >= 5 &&
      passives[weapon.evolution.requires] >= 3 &&
      !evolved[weapon.id]
    ) {
      ready.push({
        id: weapon.id,
        kind: "evolution",
        name: weapon.evolution.name,
        icon: weapon.icon,
        color: weapon.color,
        description: weapon.evolution.description,
      });
    } else if (
      rank < 5 &&
      !evolved[weapon.id] &&
      (rank > 0 ||
        (weapon.unlockChapter <= arsenalChapter &&
          ownedWeapons.length < MAX_WEAPONS))
    ) {
      pool.push({
        weight: rank ? 3 : 1.8,
        upgrade: {
          id: weapon.id,
          kind: "weapon",
          name: weapon.name,
          icon: weapon.icon,
          color: weapon.color,
          description: rank
            ? `Rank ${rank + 1}/5 · More damage and stronger attacks.`
            : weapon.description,
        },
      });
    }
  }
  for (const passive of PASSIVES) {
    const rank = passives[passive.id] || 0;
    if (rank >= 3 || (!rank && ownedPassives.length >= MAX_PASSIVES)) continue;
    // The first two chapter-one drafts teach weapons, damage, health and pickup.
    const supportsBuild = ownedWeapons.some(
      (weapon) => weapon.evolution.requires === passive.id,
    );
    if (
      chapter === 0 &&
      (run.level || 1) < 4 &&
      !rank &&
      !supportsBuild &&
      ["haste", "reach", "fortune"].includes(passive.id)
    )
      continue;
    pool.push({
      weight: supportsBuild ? 2.8 : rank ? 2 : 1,
      upgrade: {
        id: passive.id,
        kind: "passive",
        name: passive.name,
        icon: passive.icon,
        color: passive.color,
        description: `Rank ${rank + 1}/3 · ${passive.description}`,
      },
    });
  }
  const draft = [];
  // Evolutions never get lost in random choice once the player earns one.
  if (ready.length)
    draft.push(
      ready.splice(
        Math.floor(
          Math.max(0, Math.min(0.999999999, Number(rng()) || 0)) * ready.length,
        ),
        1,
      )[0],
    );
  for (const upgrade of ready) pool.push({ weight: 5, upgrade });
  // A clear, dependable first choice rewards collecting souls immediately.
  if (!draft.length && chapter === 0 && (run.level || 1) <= 2) {
    const starter = pool.findIndex(
      (item) => item.upgrade.kind === "weapon" && weapons[item.upgrade.id] > 0,
    );
    if (starter >= 0) draft.push(pool.splice(starter, 1)[0].upgrade);
  }
  while (pool.length && draft.length < 3) draft.push(weightedTake(pool, rng));
  if (draft.length < 3)
    draft.push({
      id: "heal",
      kind: "heal",
      name: "Catch Your Breath",
      icon: "✚",
      color: "#9ef8d8",
      description: "Recover 35% of maximum health.",
    });
  // At a completely mastered build, a single recovery choice is intentional.
  return draft;
}
