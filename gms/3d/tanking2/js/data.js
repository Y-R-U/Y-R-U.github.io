// Game values are deliberately gentle abstractions, not husbandry advice.
const species = (
  id,
  name,
  latin,
  color,
  cost,
  count,
  water,
  zone,
  temperament,
  size,
  bioload,
  school,
  diet,
  appeal,
  description,
  shape,
  unlock,
  extra = {},
) => ({
  id,
  name,
  latin,
  color,
  cost,
  count,
  water,
  zone,
  temperament,
  size,
  bioload,
  school,
  diet,
  appeal,
  description,
  shape,
  unlock,
  ...extra,
});

export const SPECIES = {
  betta: species(
    "betta",
    "Siamese fighting fish",
    "Betta splendens",
    "#dc795c",
    28,
    1,
    "fresh",
    "surface",
    "territorial",
    6,
    1,
    1,
    "Insects",
    12,
    "A tiny, inquisitive jewel. Happiest as the only long-finned fish in its tank.",
    "betta",
    0,
    { temp: [24, 29], ph: [6.2, 7.8], longFins: true },
  ),
  neon: species(
    "neon",
    "Neon tetra",
    "Paracheirodon innesi",
    "#51dbde",
    36,
    6,
    "fresh",
    "middle",
    "schooling",
    3,
    0.3,
    6,
    "Small omnivore",
    4,
    "Six electric blue sparks, moving as one. A whole school comes together.",
    "tetra",
    1,
    { temp: [23, 27], ph: [6, 7.5] },
  ),
  rasbora: species(
    "rasbora",
    "Harlequin rasbora",
    "Trigonostigma heteromorpha",
    "#da9361",
    48,
    6,
    "fresh",
    "middle",
    "schooling",
    4,
    0.4,
    6,
    "Small omnivore",
    5,
    "Copper bodies and ink-black triangles catch the light beneath the leaves.",
    "rasbora",
    3,
    { temp: [23, 28], ph: [6, 7.5] },
  ),
  cory: species(
    "cory",
    "Panda cory",
    "Corydoras panda",
    "#dec8a7",
    42,
    4,
    "fresh",
    "bottom",
    "peaceful",
    5,
    0.55,
    4,
    "Sinking food",
    5,
    "A little band of sand-sifting scavengers. They help remove leftover food.",
    "cory",
    3,
    { temp: [22, 27], ph: [6, 7.8], cleanup: true },
  ),
  snail: species(
    "snail",
    "Zebra nerite",
    "Vittina natalensis",
    "#b99856",
    18,
    1,
    "fresh",
    "bottom",
    "peaceful",
    2,
    0.15,
    1,
    "Algae",
    3,
    "A patient striped gardener, tracing clean paths over leaves and glass.",
    "snail",
    3,
    { temp: [22, 28], ph: [6.8, 8.4], cleanup: true },
  ),
  guppy: species(
    "guppy",
    "Mosaic guppy",
    "Poecilia reticulata",
    "#e9b45e",
    55,
    3,
    "fresh",
    "surface",
    "peaceful",
    5,
    0.5,
    3,
    "Omnivore",
    7,
    "Silken, spotted fans. Those extravagant tails attract attention from bettas.",
    "guppy",
    5,
    { temp: [23, 28], ph: [6.8, 8.2], longFins: true },
  ),
  angelfish: species(
    "angelfish",
    "Marble angelfish",
    "Pterophyllum scalare",
    "#dccbb1",
    70,
    2,
    "fresh",
    "middle",
    "territorial",
    15,
    2.2,
    2,
    "Small fish and insects",
    16,
    "Tall, slow sails from the flooded forest. Adults may swallow small tetras.",
    "angel",
    5,
    { temp: [24, 29], ph: [6, 7.7], longFins: true, predator: true },
  ),
  goldfish: species(
    "goldfish",
    "Oranda goldfish",
    "Carassius auratus",
    "#eea33f",
    85,
    2,
    "fresh",
    "middle",
    "peaceful",
    18,
    5,
    2,
    "Omnivore",
    20,
    "Liquid gold and extravagant fins, with an equally extravagant bioload.",
    "goldfish",
    8,
    { temp: [18, 25], ph: [6.5, 8], longFins: true },
  ),
  discus: species(
    "discus",
    "Red turquoise discus",
    "Symphysodon aequifasciatus",
    "#bd685d",
    130,
    3,
    "fresh",
    "middle",
    "shy",
    16,
    2.4,
    3,
    "Protein-rich food",
    21,
    "Living brushstrokes. Quiet company and exceptionally clean water suit them.",
    "discus",
    8,
    { temp: [26, 30], ph: [6, 7.2] },
  ),
  clownfish: species(
    "clownfish",
    "Ocellaris clownfish",
    "Amphiprion ocellaris",
    "#ef883c",
    75,
    2,
    "salt",
    "middle",
    "territorial",
    8,
    1.1,
    2,
    "Omnivore",
    15,
    "A devoted pair. Add an anemone to give their little neighbourhood a heart.",
    "clown",
    6,
    { temp: [24, 28], ph: [7.8, 8.5] },
  ),
  chromis: species(
    "chromis",
    "Blue-green chromis",
    "Chromis viridis",
    "#73d9c7",
    65,
    6,
    "salt",
    "surface",
    "schooling",
    5,
    0.6,
    6,
    "Plankton",
    7,
    "A shifting cloud of green-blue light above the reef.",
    "chromis",
    6,
    { temp: [24, 28], ph: [7.8, 8.5] },
  ),
  shrimp: species(
    "shrimp",
    "Scarlet cleaner shrimp",
    "Lysmata amboinensis",
    "#e6856c",
    45,
    2,
    "salt",
    "bottom",
    "peaceful",
    5,
    0.3,
    2,
    "Parasites and leftovers",
    8,
    "White antennae advertise a cleaning station. Their care reduces disease.",
    "shrimp",
    7,
    { temp: [24, 28], ph: [7.8, 8.5], cleanup: true },
  ),
  puffer: species(
    "puffer",
    "Valentini puffer",
    "Canthigaster valentini",
    "#d7c396",
    100,
    1,
    "salt",
    "middle",
    "territorial",
    10,
    2.4,
    1,
    "Shellfish",
    20,
    "A curious little hovercraft. Its beak is very bad news for small invertebrates.",
    "puffer",
    7,
    { temp: [24, 28], ph: [7.8, 8.5], predator: true },
  ),
  seahorse: species(
    "seahorse",
    "Lined seahorse",
    "Hippocampus erectus",
    "#dcc278",
    120,
    2,
    "salt",
    "bottom",
    "shy",
    13,
    1.1,
    2,
    "Target-fed crustaceans",
    23,
    "A patient, graceful pair. Busy neighbours can reach the food before they do.",
    "seahorse",
    9,
    { temp: [22, 26], ph: [7.8, 8.5], targetFeed: true },
  ),
  cardinal: species(
    "cardinal",
    "Banggai cardinalfish",
    "Pterapogon kauderni",
    "#d8d3bc",
    95,
    2,
    "salt",
    "middle",
    "peaceful",
    8,
    1,
    2,
    "Small crustaceans",
    18,
    "Silver, ink and starlight. A well-cared-for pair can raise young for release.",
    "cardinal",
    9,
    { temp: [24, 28], ph: [7.8, 8.5], longFins: true, conservation: true },
  ),
  lionfish: species(
    "lionfish",
    "Zebra lionfish",
    "Dendrochirus zebra",
    "#bd826c",
    145,
    1,
    "salt",
    "middle",
    "predatory",
    18,
    3.5,
    1,
    "Smaller fish",
    30,
    "A magnificent fan of striped spines. Best given a dedicated predator tank.",
    "lionfish",
    10,
    { temp: [24, 28], ph: [7.8, 8.5], predator: true },
  ),
};

export const ABILITIES = {
  feed: {
    id: "feed",
    name: "A little food",
    description:
      "Feed this tank. Hungry fish turn a small meal into happiness.",
    cost: 0,
  },
  care: {
    id: "care",
    name: "Water journal",
    description: "See how your water, plants and inhabitants work together.",
  },
  plant: {
    id: "plant",
    name: "Living plants",
    description:
      "Add fine-leaved plants. They absorb nitrate and shelter shy fish.",
    cost: 24,
  },
  collection: {
    id: "collection",
    name: "The fish journal",
    description:
      "Meet the species you have discovered, with live compatibility advice.",
  },
  clean: {
    id: "clean",
    name: "Water change",
    description: "Fresh water removes toxins and helps the filter recover.",
    cost: 8,
  },
  filter: {
    id: "filter",
    name: "Biological filter",
    description:
      "A colony of helpful bacteria turns ammonia into less harmful nitrate.",
    cost: 65,
  },
  autofeeder: {
    id: "autofeeder",
    name: "Gentle autofeeder",
    description: "Feed little and often, so this tank can look after itself.",
    cost: 90,
  },
  newTank: {
    id: "newTank",
    name: "Another little world",
    description: "Make room for a new habitat. Existing tanks keep earning.",
    cost: 180,
  },
  adventures: {
    id: "adventures",
    name: "Beyond the gallery",
    description: "Take on short adventures and bring permanent rewards home.",
  },
  photo: {
    id: "photo",
    name: "A quiet photograph",
    description: "Hide the interface and frame your aquarium.",
  },
  anemone: {
    id: "anemone",
    name: "Anemone garden",
    description: "A soft, waving home that makes clownfish feel safe.",
    cost: 55,
  },
  skimmer: {
    id: "skimmer",
    name: "Protein skimmer",
    description:
      "Lift organic waste out of saltwater before it becomes ammonia.",
    cost: 110,
  },
  uv: {
    id: "uv",
    name: "UV sterilizer",
    description: "Reduce disease pressure and keep algae blooms in check.",
    cost: 110,
  },
  chiller: {
    id: "chiller",
    name: "Precision thermostat",
    description: "Hold temperature near the needs of this tank’s inhabitants.",
    cost: 100,
  },
  release: {
    id: "release",
    name: "Conservation nursery",
    description:
      "A healthy cardinalfish pair breeds young. Release five for reputation.",
  },
  speed: {
    id: "speed",
    name: "Time at your pace",
    description: "Pause, watch in real time, or let the gallery run at 3×.",
  },
  lighting: {
    id: "lighting",
    name: "Gallery lighting",
    description: "Healthy plants and colours that make visitors linger.",
    cost: 125,
  },
  targetFeed: {
    id: "targetFeed",
    name: "Patient feeding",
    description: "A careful meal for seahorses, even with quicker neighbours.",
  },
};

export const MODES = {
  draft: {
    id: "draft",
    name: "Pocket expedition",
    description:
      "Choose one of three species every 40 seconds. Build a thriving temporary tank over three rounds.",
    duration: 120,
    target: 3,
    reward: 90,
    unlock: 5,
    theme: "forest",
  },
  rescue: {
    id: "rescue",
    name: "The rescue room",
    description:
      "A donated tank needs fresh water, plants and time. Reach 85% health and sustain it for 25 seconds.",
    duration: 150,
    target: 25,
    reward: 120,
    unlock: 8,
    theme: "river",
  },
  festival: {
    id: "festival",
    name: "Lantern weekend",
    description:
      "Keep health above 65% and attract 160 visitors to a temporary reef before the last lantern fades.",
    duration: 150,
    target: 160,
    reward: 140,
    unlock: 9,
    theme: "reef",
  },
  daily: {
    id: "daily",
    name: "Daily current",
    description:
      "The same UTC-date seed for everyone. Build a fresh tank, keep it healthy and earn a detailed 120-second score.",
    duration: 120,
    target: 120,
    reward: 110,
    unlock: 11,
    theme: "forest",
  },
  zen: {
    id: "zen",
    name: "Still water",
    description:
      "An unlimited aquarium, with every discovered species and no failure. Your gallery carries on while you drift.",
    duration: 0,
    target: 0,
    reward: 0,
    unlock: 12,
    theme: "moon",
  },
};

export const RELICS = {
  patient: {
    id: "patient",
    name: "The patient keeper",
    description: "All fish become hungry 25% more slowly.",
    icon: "leaf",
  },
  green: {
    id: "green",
    name: "A greener world",
    description: "Plants absorb 50% more nitrate and cost 25% less.",
    icon: "sprout",
  },
  lantern: {
    id: "lantern",
    name: "Lantern light",
    description: "Your gallery earns 15% more from every visitor.",
    icon: "spark",
  },
  clear: {
    id: "clear",
    name: "Clear water",
    description: "Helpful filter bacteria work 25% faster.",
    icon: "drop",
  },
  welcome: {
    id: "welcome",
    name: "A warm welcome",
    description: "New fish settle immediately and cost 15% less.",
    icon: "heart",
  },
  keeper: {
    id: "keeper",
    name: "The night keeper",
    description: "Offline gallery income rises from 55% to 80%.",
    icon: "moon",
  },
  tide: {
    id: "tide",
    name: "A kinder tide",
    description: "Water changes cost nothing and restore extra health.",
    icon: "wave",
  },
  nursery: {
    id: "nursery",
    name: "Small beginnings",
    description: "Cardinalfish nurseries grow 35% faster.",
    icon: "pearl",
  },
  wonder: {
    id: "wonder",
    name: "A sense of wonder",
    description: "Each different species adds 5% to its tank’s appeal.",
    icon: "star",
  },
};

export const CHAPTERS = [
  {
    title: "One small life",
    text: "Meet a copper betta. One curious little fish, with a planted world all to itself.",
    reward: "A second tank · neon tetras · 60 coins",
  },
  {
    title: "A ribbon of blue",
    text: "Your first tank keeps earning. Bring a little school to this new world, then give them their first meal.",
    reward: "Living plants · water journal · photo mode · 45 coins",
  },
  {
    title: "Room to breathe",
    text: "Give your school a soft green place to explore. Let the roots begin their quiet work.",
    reward: "Panda corys · nerites · rasboras · fish journal · 60 coins",
  },
  {
    title: "Different lives, together",
    text: "Add a second species to your planted tank, then watch this little community settle.",
    reward: "Autofeeder · your first keeper trait · 100 coins",
  },
  {
    title: "A world that keeps going",
    text: "Fit an autofeeder. Your healthy aquariums earn even while you explore somewhere new.",
    reward: "Pocket expedition · more tanks · guppies · angelfish · 100 coins",
  },
  {
    title: "Something to bring home",
    text: "Choose your way through a pocket expedition. Its inhabitants stay there; its rewards come home with you.",
    reward: "A reef tank · clownfish · chromis · anemone garden · 180 coins",
  },
  {
    title: "A place to belong",
    text: "A pair of clownfish and a waving anemone turn your first reef into a home.",
    reward: "Cleaner shrimp · Valentini puffer · protein skimmer · 80 coins",
  },
  {
    title: "The quiet work",
    text: "Help your reef hold at least 80% health for 45 seconds. Clean water is the foundation of every wonderful tank.",
    reward: "Rescue room · goldfish · discus · 100 coins",
  },
  {
    title: "A second chance",
    text: "Someone else’s troubled tank needs a patient keeper. Complete a rescue and bring that experience home.",
    reward:
      "Lantern weekend · seahorses · cardinalfish · patient feeding · 150 coins",
  },
  {
    title: "Under the lanterns",
    text: "Take a temporary reef to the festival. Welcome the crowds without sacrificing its health.",
    reward: "Conservation nursery · lionfish · UV · thermostat · 180 coins",
  },
  {
    title: "Small beginnings",
    text: "Keep a cardinalfish pair in clean, well-fed water. Raise and release five young into a protected habitat.",
    reward: "Daily current · gallery lighting · 120 coins",
  },
  {
    title: "A shared current",
    text: "Complete today’s seeded aquarium challenge. Every keeper begins with the same choices.",
    reward: "Still water sandbox · keeper trait · 120 coins",
  },
  {
    title: "A gallery, alive",
    text: "Care for your gallery for 15 minutes in total, with at least three inhabited tanks above 80% health.",
    reward: "The keeper’s star · endless gallery milestones",
  },
];

export function compatibility(state, speciesId, suppliedTank) {
  const item = typeof speciesId === "string" ? SPECIES[speciesId] : speciesId;
  const tank = suppliedTank || state.tanks[state.activeTank];
  if (!item || !tank)
    return { level: "red", reason: "This habitat is not available." };
  if (!state.unlockedSpecies.includes(item.id) && state.mode?.id !== "zen")
    return {
      level: "red",
      reason: "A future chapter will introduce this species.",
    };
  if (
    tank.water !== item.water &&
    !(state.mode?.id === "zen" && tank.fish.length === 0)
  )
    return {
      level: "red",
      reason: `This species needs ${item.water === "salt" ? "saltwater" : "freshwater"}. Choose a matching tank.`,
    };
  if (tank.fish.length + item.count > 40)
    return {
      level: "red",
      reason: "This tank has room for at most 40 inhabitants.",
    };
  if (item.id === "betta" && tank.fish.some((f) => f.species === "betta"))
    return { level: "red", reason: "Give each betta a territory of its own." };
  const current = tank.fish.map((f) => SPECIES[f.species]).filter(Boolean);
  if (
    (current.some((s) => s.id === "lionfish") && item.size < 10) ||
    (item.id === "lionfish" && current.some((s) => s.size < 10))
  )
    return {
      level: "red",
      reason: "A lionfish can swallow these smaller tankmates.",
    };
  if (
    (current.some((s) => s.id === "angelfish") && item.id === "neon") ||
    (item.id === "angelfish" && current.some((s) => s.id === "neon"))
  )
    return {
      level: "amber",
      reason: "Growing angelfish may eventually eat neon tetras.",
    };
  if (
    (item.id === "betta" && current.some((s) => s.longFins)) ||
    (item.longFins && current.some((s) => s.id === "betta"))
  )
    return {
      level: "amber",
      reason: "Bettas may nip these long, flowing fins.",
    };
  if (
    (item.id === "puffer" &&
      current.some((s) => ["snail", "shrimp"].includes(s.id))) ||
    (["snail", "shrimp"].includes(item.id) &&
      current.some((s) => s.id === "puffer"))
  )
    return { level: "red", reason: "Puffers eat small snails and shrimp." };
  const load =
    tank.fish.reduce((sum, f) => sum + (SPECIES[f.species]?.bioload || 0), 0) +
    item.bioload * item.count;
  if (load > tank.gallons * 0.75)
    return {
      level: "red",
      reason: "This much bioload needs a larger, better-established aquarium.",
    };
  if (load > tank.gallons * 0.36 + tank.filter * 3)
    return {
      level: "amber",
      reason:
        "A busy tank: add plants and improve filtration before stocking more.",
    };
  if (tank.temp < item.temp[0] - 1 || tank.temp > item.temp[1] + 1)
    return {
      level: "amber",
      reason: `This species prefers ${item.temp[0]}–${item.temp[1]}°C. A thermostat will help.`,
    };
  if (
    item.id === "seahorse" &&
    current.some((s) => !["seahorse", "cardinal", "shrimp"].includes(s.id))
  )
    return {
      level: "amber",
      reason: "Quick neighbours can steal their food. Use patient feeding.",
    };
  if (item.id === "clownfish" && !tank.anemone)
    return {
      level: "amber",
      reason: "They can settle here; an anemone will help them thrive.",
    };
  if (item.id === "goldfish")
    return {
      level: "amber",
      reason:
        "Beautiful, but very messy. Give them generous space and filtration.",
    };
  if (item.temperament === "shy" && tank.plants < 2)
    return {
      level: "amber",
      reason:
        "A few more plants would give these shy fish somewhere to retreat.",
    };
  return {
    level: "green",
    reason:
      item.school > 1
        ? `A complete group of ${item.count}, with room to settle together.`
        : "The water and company suit this little resident.",
  };
}
