import {
  SPECIES,
  ABILITIES,
  MODES,
  RELICS,
  CHAPTERS,
  compatibility,
} from "./data.js";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const finite = (n, fallback = 0) =>
  Number.isFinite(Number(n)) ? Number(n) : fallback;
const copy = (value) => JSON.parse(JSON.stringify(value));
const known = (catalog, id) =>
  typeof id === "string" && Object.hasOwn(catalog, id);
const has = (state, id) => state.abilities.includes(id);
const count = (tank, id) => tank.fish.filter((f) => f.species === id).length;
const avg = (items, read, otherwise = 0) =>
  items.length
    ? items.reduce((sum, x) => sum + read(x), 0) / items.length
    : otherwise;
const STEP = 0.25;
const MAX_OFFLINE = 8 * 60 * 60;
const SAVE_VERSION = 2;

function newStats() {
  return {
    feeds: 0,
    purchases: 0,
    earned: 0,
    careTime: 0,
    visitors: 0,
    plants: 0,
    cleans: 0,
    upgrades: 0,
    released: 0,
    losses: 0,
    modeWins: 0,
    completedModes: {},
    bought: {},
    fed: {},
    bestDaily: {},
    challenges: 0,
  };
}
function makeTank(id, theme = "river", name) {
  const salt = ["reef", "moon"].includes(theme);
  return {
    id,
    name:
      name ||
      {
        river: "The first ripple",
        forest: "A ribbon of blue",
        reef: "The coral garden",
        moon: "The moon garden",
      }[theme],
    theme,
    water: salt ? "salt" : "fresh",
    gallons: theme === "river" ? 20 : theme === "forest" ? 36 : 55,
    fish: [],
    food: 0,
    health: 100,
    appeal: 0,
    income: 0,
    oxygen: 8,
    ammonia: 0,
    nitrite: 0,
    nitrate: 2,
    temp: 25,
    ph: salt ? 8.1 : 7,
    plants: salt ? 0 : 1,
    filter: 1,
    bacteria: 0.8,
    autofeeder: false,
    anemone: false,
    skimmer: false,
    uv: false,
    chiller: false,
    lighting: false,
    algae: 0,
    disease: 0,
    decor: 1,
    feedAt: -100,
    cleanAt: -100,
    breedTime: 0,
    young: 0,
    warningAt: -100,
    age: 0,
    happyTime: 0,
  };
}
function initial() {
  return {
    version: SAVE_VERSION,
    coins: 28,
    pearls: 0,
    reputation: 0,
    chapter: 0,
    activeTank: 0,
    tanks: [makeTank("tank-1")],
    unlockedSpecies: ["betta"],
    abilities: [],
    modes: [],
    relics: [],
    choices: [],
    pendingTraits: 0,
    stats: newStats(),
    chapterStart: {
      time: 0,
      careTime: 0,
      earned: 0,
      plants: 0,
      modeWins: 0,
      released: 0,
    },
    mission: {},
    speed: 1,
    time: 0,
    mode: null,
    modeHistory: [],
    offline: null,
    discoveries: [],
    nextFish: 1,
    nextTank: 2,
    seed: 926131,
    accumulator: 0,
    galleryStar: false,
    milestone: 1,
    lastSavedAt: 0,
  };
}
function random(state) {
  state.seed = (Math.imul(1664525, state.seed) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function hash(text) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

// Saves are plain JSON; malformed or old saves fall back to a playable beginning.
function restore(saved) {
  const fresh = initial();
  if (
    !saved ||
    saved.version !== SAVE_VERSION ||
    !Array.isArray(saved.tanks) ||
    saved.tanks.length === 0
  )
    return fresh;
  let serialized;
  try {
    serialized = copy(saved);
  } catch {
    return fresh;
  }
  const state = { ...fresh, ...serialized };
  state.chapter = clamp(Math.floor(finite(state.chapter)), 0, CHAPTERS.length);
  state.coins = clamp(finite(state.coins, 28), 0, 1e12);
  state.pearls = clamp(Math.floor(finite(state.pearls)), 0, 1e9);
  state.pendingTraits = clamp(
    Math.floor(finite(state.pendingTraits)),
    0,
    Object.keys(RELICS).length,
  );
  state.milestone = clamp(Math.floor(finite(state.milestone, 1)), 1, 1e6);
  state.reputation = clamp(finite(state.reputation), 0, 1e9);
  state.time = clamp(finite(state.time), 0, 1e12);
  state.speed = [0, 1, 3].includes(state.speed) ? state.speed : 1;
  state.unlockedSpecies = Array.isArray(state.unlockedSpecies)
    ? [
        ...new Set([
          "betta",
          ...state.unlockedSpecies.filter((id) => known(SPECIES, id)),
        ]),
      ]
    : ["betta"];
  state.abilities = Array.isArray(state.abilities)
    ? [...new Set(state.abilities.filter((id) => known(ABILITIES, id)))]
    : [];
  state.modes = Array.isArray(state.modes)
    ? [...new Set(state.modes.filter((id) => known(MODES, id)))]
    : [];
  state.relics = Array.isArray(state.relics)
    ? [...new Set(state.relics.filter((id) => known(RELICS, id)))]
    : [];
  state.choices = Array.isArray(state.choices)
    ? state.choices
        .filter((id) => known(RELICS, id) && !state.relics.includes(id))
        .slice(0, 3)
    : [];
  state.stats = { ...newStats(), ...state.stats };
  for (const key of ["completedModes", "bought", "fed", "bestDaily"])
    state.stats[key] = { ...state.stats[key] };
  for (const key of ["completedModes", "bought", "fed", "bestDaily"])
    for (const id of Object.keys(state.stats[key]))
      state.stats[key][id] = Math.max(0, finite(state.stats[key][id]));
  for (const key of Object.keys(newStats()))
    if (typeof newStats()[key] === "number")
      state.stats[key] = Math.max(0, finite(state.stats[key]));
  state.chapterStart = {
    ...fresh.chapterStart,
    happyTime: 0,
    reefHappyTime: 0,
    ...state.chapterStart,
  };
  state.discoveries = Array.isArray(state.discoveries)
    ? state.discoveries
        .filter((d) => d && typeof d === "object" && typeof d.text === "string")
        .map((d) => ({
          id: typeof d.id === "string" ? d.id : "note",
          text: d.text.slice(0, 500),
          time: finite(d.time),
        }))
    : [];
  state.modeHistory = Array.isArray(state.modeHistory)
    ? state.modeHistory.slice(-20)
    : [];
  const fishIds = new Set(),
    tankIds = new Set();
  let restoredFish = 0;
  state.tanks = state.tanks.slice(0, 7).map((value, index) => {
    const raw = value && typeof value === "object" ? value : {};
    const theme = ["river", "forest", "reef", "moon"].includes(raw.theme)
      ? raw.theme
      : "forest";
    let id =
      typeof raw.id === "string" && /^[a-z0-9_-]{1,60}$/i.test(raw.id)
        ? raw.id
        : `tank-${index + 1}`;
    if (tankIds.has(id)) id = `restored-tank-${index + 1}`;
    tankIds.add(id);
    const defaults = makeTank(id, theme),
      tank = { ...defaults, ...raw, id, theme };
    tank.name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.slice(0, 64)
        : defaults.name;
    tank.water = ["fresh", "salt"].includes(tank.water) ? tank.water : "fresh";
    tank.fish = (Array.isArray(raw.fish) ? raw.fish : [])
      .filter((f) => f && known(SPECIES, f.species))
      .slice(0, 40)
      .map((f) => {
        let uid =
          typeof f.uid === "string" && /^[a-z0-9_-]{1,60}$/i.test(f.uid)
            ? f.uid
            : `restored-fish-${++restoredFish}`;
        while (fishIds.has(uid)) uid = `restored-fish-${++restoredFish}`;
        fishIds.add(uid);
        return {
          ...f,
          uid,
          health: clamp(finite(f.health, 100), 1, 100),
          hunger: clamp(finite(f.hunger, 25), 0, 100),
          age: Math.max(0, finite(f.age)),
          stress: clamp(finite(f.stress), 0, 100),
          fin: clamp(finite(f.fin, 100), 1, 100),
          size: clamp(
            finite(f.size, SPECIES[f.species].size * 0.7),
            SPECIES[f.species].size * 0.4,
            SPECIES[f.species].size * 1.2,
          ),
          fed: Math.max(0, finite(f.fed)),
          huntTime: Math.max(0, finite(f.huntTime)),
        };
      });
    for (const key of [
      "food",
      "ammonia",
      "nitrite",
      "nitrate",
      "plants",
      "filter",
      "age",
      "happyTime",
      "breedTime",
      "young",
    ])
      tank[key] = clamp(
        finite(tank[key], makeTank("x", theme)[key]),
        0,
        key === "filter" ? 5 : key === "plants" ? 12 : 100000,
      );
    tank.filter = Math.max(1, tank.filter);
    tank.health = clamp(finite(tank.health, 100), 1, 100);
    tank.oxygen = clamp(finite(tank.oxygen, 8), 0, 10);
    tank.gallons = clamp(finite(tank.gallons, 36), 20, 100);
    tank.temp = clamp(finite(tank.temp, 25), 15, 35);
    tank.ph = clamp(finite(tank.ph, tank.water === "salt" ? 8.1 : 7), 5, 9);
    tank.disease = clamp(finite(tank.disease), 0, 100);
    tank.algae = clamp(finite(tank.algae), 0, 1);
    tank.bacteria = clamp(finite(tank.bacteria, 0.8), 0.2, 1);
    tank.feedAt = finite(tank.feedAt, state.time - 100);
    tank.cleanAt = finite(tank.cleanAt, state.time - 100);
    tank.warningAt = finite(tank.warningAt, state.time - 100);
    return tank;
  });
  state.activeTank = clamp(
    Math.floor(finite(state.activeTank)),
    0,
    state.tanks.length - 1,
  );
  state.nextTank = Math.max(state.tanks.length + 1, finite(state.nextTank, 2));
  state.nextFish = Math.max(
    1,
    ...state.tanks.flatMap((t) =>
      t.fish.map((f) => Number(String(f.uid).split("-").at(-1)) + 1 || 1),
    ),
    finite(state.nextFish, 1),
  );
  state.accumulator = 0;
  if (
    !state.mode ||
    !known(MODES, state.mode.id) ||
    !Array.isArray(state.mode.choices) ||
    !Array.isArray(state.mode.pool) ||
    !state.tanks.some((t) => t.temporary && t.id === state.mode.tankId)
  ) {
    state.mode = null;
    state.tanks = state.tanks.filter((t) => !t.temporary);
    if (!state.tanks.length) state.tanks = [makeTank("tank-1")];
    state.activeTank = clamp(state.activeTank, 0, state.tanks.length - 1);
  } else {
    const mode = state.mode,
      config = MODES[mode.id];
    mode.title = config.name;
    mode.duration = config.duration;
    mode.target = config.target;
    mode.reward = config.reward;
    for (const key of [
      "time",
      "progress",
      "round",
      "coins",
      "previousTank",
      "healthSum",
      "samples",
      "visitors",
      "losses",
      "nextRound",
    ])
      mode[key] = Math.max(0, finite(mode[key]));
    mode.seed = finite(mode.seed, 926131) >>> 0;
    mode.date =
      typeof mode.date === "string" ? mode.date.slice(0, 10) : "unknown";
    mode.pool = mode.pool.filter((id) => known(SPECIES, id));
    mode.choices = mode.choices
      .filter((id) => known(SPECIES, id) && mode.pool.includes(id))
      .slice(0, 3);
    if (mode.score && typeof mode.score === "object")
      for (const key of ["health", "visitors", "diversity", "care", "total"])
        mode.score[key] = Math.max(0, finite(mode.score[key]));
    else mode.score = null;
  }
  return state;
}

export function createGame(saved = null, now = Date.now()) {
  const state = restore(saved);
  const events = [];
  const bootWall = Date.now();
  const emit = (type, text, extra = {}) => {
    events.push({ type, text, ...extra });
    if (events.length > 80) events.shift();
  };
  const tank = () => state.tanks[state.activeTank];
  const gallery = () => state.tanks.filter((t) => !t.temporary);
  const isZen = () => state.mode?.id === "zen" && tank()?.temporary;
  const owns = (id) =>
    state.relics.includes(id) && !(state.mode && tank()?.temporary);
  const wallet = () => (state.mode && tank()?.temporary ? state.mode : state);
  const charge = (amount) => {
    const purse = wallet();
    if (isZen()) return true;
    if (purse.coins + 1e-7 < amount) return false;
    purse.coins = Math.max(0, purse.coins - amount);
    return true;
  };
  const quote = (type, payload = {}) => {
    if (isZen()) return 0;
    if (type === "buy")
      return SPECIES[payload.species]
        ? Math.ceil(
            SPECIES[payload.species].cost * (owns("welcome") ? 0.85 : 1),
          )
        : 0;
    if (type === "plant")
      return Math.ceil(ABILITIES.plant.cost * (owns("green") ? 0.75 : 1));
    if (type === "clean") return owns("tide") ? 0 : 8;
    if (type === "newTank") return ABILITIES.newTank.cost;
    if (type === "keepsake") return 20;
    if (type === "upgrade")
      return (
        (ABILITIES[payload.id]?.cost || 0) *
        (payload.id === "filter" ? tank().filter : 1)
      );
    return 0;
  };
  const fail = (reason) => ({ ok: false, reason });
  const ok = () => ({ ok: true });
  const unlock = (key, ids) => {
    for (const id of ids)
      if (!state[key].includes(id)) {
        state[key].push(id);
        emit(
          "unlock",
          (SPECIES[id] || ABILITIES[id] || MODES[id])?.name || id,
          { id, kind: key },
        );
      }
  };
  const addFish = (target, speciesId, quantity = SPECIES[speciesId].count) => {
    const item = SPECIES[speciesId];
    for (let i = 0; i < quantity; i++)
      target.fish.push({
        uid: `fish-${state.nextFish++}`,
        species: speciesId,
        health: 100,
        hunger: 45,
        age: 0,
        stress: owns("welcome") ? 0 : 8,
        fin: 100,
        size: item.size * 0.65,
        seed: random(state),
        fed: 0,
        resting: false,
      });
    recalculate(target);
  };
  const discover = (id, text) => {
    if (state.discoveries.some((d) => d.id === id)) return;
    state.discoveries.push({ id, text, time: state.time });
    emit("warning", text, { discovery: true, id });
  };

  function recalculate(target) {
    const inhabitants = target.fish;
    const waterHealth = clamp(
      100 -
        target.ammonia * 30 -
        target.nitrite * 22 -
        Math.max(0, target.nitrate - 25) * 0.3 -
        Math.max(0, 6 - target.oxygen) * 15 -
        target.disease * 0.3,
      1,
      100,
    );
    target.health = inhabitants.length
      ? clamp(
          waterHealth * 0.58 +
            avg(
              inhabitants,
              (f) =>
                f.health - Math.max(0, f.hunger - 55) * 0.25 - f.stress * 0.18,
            ) *
              0.42,
          1,
          100,
        )
      : waterHealth;
    let appeal = inhabitants.reduce(
      (sum, f) =>
        sum +
        SPECIES[f.species].appeal *
          (0.65 + (0.35 * f.health) / 100) *
          (1 - f.stress * 0.003) *
          (f.resting ? 0.25 : 1),
      0,
    );
    appeal *=
      1 +
      Math.min(target.plants, 8) * 0.035 +
      (target.lighting ? 0.13 : 0) +
      (target.anemone && count(target, "clownfish") ? 0.18 : 0);
    if (state.relics.includes("wonder") && !target.temporary)
      appeal *= 1 + new Set(inhabitants.map((f) => f.species)).size * 0.05;
    target.appeal = Math.max(0, appeal * (1 - target.algae * 0.32));
    target.income = inhabitants.length
      ? (0.12 + target.appeal * 0.029) *
        (0.25 + (0.75 * target.health) / 100) *
        (state.relics.includes("lantern") && !target.temporary ? 1.15 : 1)
      : 0;
  }

  function mission() {
    const index = state.chapter,
      chapter = CHAPTERS[index];
    if (!chapter) {
      const target = 500 * state.milestone;
      const progress = state.reputation;
      state.mission = {
        title: "A gallery, alive",
        text: "There is always another little world to discover. Healthy aquariums quietly earn reputation.",
        action: progress >= target ? "claim" : "wait",
        label:
          progress >= target
            ? "Celebrate your gallery"
            : "The gallery keeps growing",
        progress: Math.min(progress, target),
        target,
        complete: progress >= target,
        reward: "50 pearls · a keeper trait",
        stage: progress >= target ? "claim" : "wait",
      };
      return;
    }
    let action = "wait",
      label = "Let your aquarium settle",
      progress = 0,
      target = 1,
      complete = false,
      speciesId,
      upgradeId,
      modeId,
      theme,
      text = chapter.text;
    const first = state.tanks.find((t) => t.id === "tank-1") || gallery()[0];
    const second =
      state.tanks.find((t) => t.story === "school") ||
      gallery()[1] ||
      gallery()[0];
    const reef =
      state.tanks.find((t) => t.story === "reef") ||
      gallery().find((t) => t.water === "salt");
    const nursery =
      gallery().find((t) => count(t, "cardinal") >= 2) ||
      gallery().find(
        (t) =>
          t.water === "salt" &&
          compatibility(state, "cardinal", t).level !== "red",
      );
    const elapsed = state.stats.careTime - state.chapterStart.careTime;
    switch (index) {
      case 0:
        if (!first.fish.length) {
          action = "buy";
          label = "Bring your betta home · 28";
          speciesId = "betta";
        } else if (!first.fish.some((f) => f.fed > 0)) {
          action = "feed";
          label = "Give your fish its first meal";
          text =
            "One small pinch. Watch your new companion hurry to the surface.";
        } else complete = true;
        break;
      case 1:
        if (!count(second, "neon")) {
          action = "buy";
          label = "Welcome six neon tetras · 36";
          speciesId = "neon";
        } else if (
          !second.fish.some((f) => f.species === "neon" && f.fed > 0)
        ) {
          action = "feed";
          label = "Feed your little school";
          text =
            "Six bright sparks, one small meal. Your first aquarium is still earning in the background.";
        } else complete = true;
        break;
      case 2:
        target = 30;
        progress = second.happyTime - state.chapterStart.happyTime;
        if (second.plants < 2) {
          action = "plant";
          label = "Plant a little garden · 24";
          progress = 0;
        } else {
          complete = progress >= target;
          label = "Watch the roots work";
        }
        break;
      case 3:
        target = 40;
        progress = Math.min(elapsed, 40);
        if (new Set(second.fish.map((f) => f.species)).size < 2) {
          action = "buy";
          label = "Meet the panda corys · 42";
          speciesId = "cory";
          progress = 0;
        } else complete = elapsed >= 40 && second.health >= 80;
        break;
      case 4:
        target = 90;
        progress = Math.min(elapsed, 90);
        if (!gallery().some((t) => t.autofeeder)) {
          action = "upgrade";
          upgradeId = "autofeeder";
          label = "Fit a gentle autofeeder · 90";
          progress = 0;
        } else {
          complete = elapsed >= 90;
          label = "Your little worlds keep earning";
        }
        break;
      case 5:
        modeId = "draft";
        complete =
          (state.stats.completedModes.draft || 0) >
          (state.chapterStart.draft || 0);
        action = state.mode ? "wait" : "startMode";
        label = "Take a pocket expedition";
        break;
      case 6:
        if (!reef || !count(reef, "clownfish")) {
          action = "buy";
          label = "Welcome a clownfish pair · 75";
          speciesId = "clownfish";
        } else if (!reef.anemone) {
          action = "upgrade";
          upgradeId = "anemone";
          label = "Give them an anemone · 55";
          text =
            "They have found one another. Now give this pair a soft place to call home.";
        } else complete = true;
        break;
      case 7:
        target = 45;
        progress =
          (reef?.happyTime || 0) - (state.chapterStart.reefHappyTime || 0);
        complete = progress >= target && (reef?.health || 0) >= 80;
        label = "A reef, finding its balance";
        if (reef && reef.health < 80) {
          action = "clean";
          label = "Refresh the reef water · 8";
        }
        break;
      case 8:
        modeId = "rescue";
        complete =
          (state.stats.completedModes.rescue || 0) >
          (state.chapterStart.rescue || 0);
        action = state.mode ? "wait" : "startMode";
        label = "Enter the rescue room";
        break;
      case 9:
        modeId = "festival";
        complete =
          (state.stats.completedModes.festival || 0) >
          (state.chapterStart.festival || 0);
        action = state.mode ? "wait" : "startMode";
        label = "Light the festival lanterns";
        break;
      case 10:
        target = 5;
        progress = state.stats.released - state.chapterStart.released;
        if (!nursery && gallery().length < 6) {
          action = "newTank";
          theme = "reef";
          label = "Make a quiet nursery · 180";
          text =
            "Your reefs are busy. Give a cardinalfish pair a small saltwater world of their own.";
        } else if (!nursery) {
          label = "Make room for a quiet nursery";
          text =
            "Your six aquariums are full. Rehome a few reef residents from the journal, making room for a cardinalfish pair away from predators.";
        } else if (count(nursery, "cardinal") < 2) {
          action = "buy";
          speciesId = "cardinal";
          label = "Welcome a cardinalfish pair · 95";
        } else if (gallery().some((t) => t.young > 0)) {
          action = "release";
          label = "Release the nursery’s young";
        } else if (
          avg(
            nursery.fish.filter((f) => f.species === "cardinal"),
            (f) => f.hunger,
          ) >= 55
        ) {
          action = "feed";
          label = "A little meal for the new parents";
          text =
            "The nursery grows when its parents are well fed. Give this little family a meal.";
        } else if (
          nursery.health < 85 ||
          nursery.ammonia >= 0.4 ||
          nursery.nitrite >= 0.3
        ) {
          action = "clean";
          label = "Fresh water for the nursery · 8";
          text =
            "The parents need clean, healthy water before their nursery can grow.";
        } else {
          label = "A small nursery is growing";
          text =
            "A well-fed cardinalfish pair needs 85% health and clean water. Five young are ready after 100 peaceful seconds.";
        }
        complete = progress >= target;
        if (!complete && nursery)
          progress = Math.min(4.99, progress + nursery.breedTime * 0.05);
        break;
      case 11:
        modeId = "daily";
        complete =
          (state.stats.completedModes.daily || 0) >
          (state.chapterStart.daily || 0);
        action = state.mode ? "wait" : "startMode";
        label = "Meet today’s current";
        break;
      case 12:
        target = 900;
        progress = Math.min(state.stats.careTime, 900);
        complete =
          progress >= target &&
          gallery().filter((t) => t.fish.length && t.health >= 80).length >= 3;
        label = "Your gallery is coming of age";
        break;
    }
    if (complete) {
      action = "claim";
      label = index === 0 ? "Open your next tank" : "Open the next chapter";
      progress = target;
    }
    const missionTank =
      index === 0
        ? first
        : index <= 4
          ? second
          : [6, 7].includes(index)
            ? reef
            : index === 10
              ? nursery || reef
              : null;
    state.mission = {
      ...chapter,
      text,
      action,
      label,
      progress: clamp(progress, 0, target),
      target,
      complete,
      species: speciesId,
      upgrade: upgradeId,
      mode: modeId,
      theme,
      stage: action,
      chapter: index,
      tankIndex: missionTank
        ? state.tanks.indexOf(missionTank)
        : state.activeTank,
    };
  }

  function offerTraits() {
    if (state.choices.length) {
      state.pendingTraits = (state.pendingTraits || 0) + 1;
      return;
    }
    const available = Object.keys(RELICS).filter(
      (id) => !state.relics.includes(id),
    );
    state.choices = [];
    while (available.length && state.choices.length < 3)
      state.choices.push(
        available.splice(Math.floor(random(state) * available.length), 1)[0],
      );
  }

  function claim() {
    mission();
    if (!state.mission.complete)
      return fail("This little chapter is still unfolding.");
    if (state.mode)
      return fail("Return from your adventure before opening a chapter.");
    let reward = 0;
    switch (state.chapter) {
      case 0: {
        reward = 60;
        unlock("unlockedSpecies", ["neon"]);
        gallery()[0].caretaker = true;
        const next = makeTank(`tank-${state.nextTank++}`, "forest");
        next.story = "school";
        state.tanks.push(next);
        state.activeTank = state.tanks.length - 1;
        break;
      }
      case 1:
        reward = 45;
        unlock("abilities", ["care", "plant", "photo"]);
        break;
      case 2:
        reward = 60;
        unlock("unlockedSpecies", ["cory", "snail", "rasbora"]);
        unlock("abilities", ["collection", "clean", "filter", "speed"]);
        break;
      case 3:
        reward = 100;
        unlock("abilities", ["autofeeder"]);
        offerTraits();
        break;
      case 4:
        reward = 100;
        unlock("abilities", ["newTank", "adventures"]);
        unlock("modes", ["draft"]);
        unlock("unlockedSpecies", ["guppy", "angelfish"]);
        break;
      case 5: {
        reward = 180;
        unlock("unlockedSpecies", ["clownfish", "chromis"]);
        unlock("abilities", ["anemone"]);
        const reef = makeTank(`tank-${state.nextTank++}`, "reef");
        reef.story = "reef";
        state.tanks.push(reef);
        state.activeTank = state.tanks.length - 1;
        offerTraits();
        break;
      }
      case 6:
        reward = 80;
        unlock("unlockedSpecies", ["shrimp", "puffer"]);
        unlock("abilities", ["skimmer"]);
        break;
      case 7:
        reward = 100;
        unlock("unlockedSpecies", ["goldfish", "discus"]);
        unlock("modes", ["rescue"]);
        break;
      case 8:
        reward = 150;
        unlock("unlockedSpecies", ["seahorse", "cardinal"]);
        unlock("abilities", ["targetFeed"]);
        unlock("modes", ["festival"]);
        offerTraits();
        break;
      case 9:
        reward = 180;
        unlock("unlockedSpecies", ["lionfish"]);
        unlock("abilities", ["release", "uv", "chiller"]);
        break;
      case 10:
        reward = 120;
        unlock("modes", ["daily"]);
        unlock("abilities", ["lighting"]);
        break;
      case 11:
        reward = 120;
        unlock("modes", ["zen"]);
        offerTraits();
        break;
      case 12:
        reward = 250;
        state.galleryStar = true;
        state.pearls += 25;
        emit(
          "reward",
          "A keeper’s star. You have built a gallery that is alive.",
        );
        break;
      default:
        state.pearls += 50;
        state.milestone++;
        offerTraits();
        reward = 100;
    }
    state.coins += reward;
    state.reputation += 15;
    if (state.chapter < CHAPTERS.length) state.chapter++;
    state.chapterStart = {
      time: state.time,
      careTime: state.stats.careTime,
      earned: state.stats.earned,
      plants: state.stats.plants,
      released: state.stats.released,
      modeWins: state.stats.modeWins,
      happyTime: state.tanks.find((t) => t.story === "school")?.happyTime || 0,
      reefHappyTime:
        state.tanks.find((t) => t.story === "reef")?.happyTime || 0,
      ...state.stats.completedModes,
    };
    emit("reward", `A new chapter · ${reward} coins`, { coins: reward });
    mission();
    return ok();
  }

  function feed(target, automatic = false, patient = false) {
    if (!target.fish.length) return fail("There is nobody to feed here yet.");
    if (!automatic && state.time - target.feedAt < 3)
      return fail("Let them finish this small meal.");
    if (!automatic && avg(target.fish, (f) => f.hunger) < 12)
      return fail("Everyone is full for now. A little food goes a long way.");
    const competition = target.fish.some(
      (f) => !["seahorse", "shrimp", "cardinal"].includes(f.species),
    );
    for (const f of target.fish) {
      const stolen = f.species === "seahorse" && competition && !patient;
      f.hunger = Math.max(0, f.hunger - (stolen ? 10 : 68));
      f.fed++;
      f.health = Math.min(100, f.health + 2);
      f.resting = false;
      if (stolen)
        discover(
          "seahorse-food",
          "The seahorses are missing the rush for food. Patient feeding brings a meal straight to them.",
        );
      if (!automatic)
        state.stats.fed[f.species] = (state.stats.fed[f.species] || 0) + 1;
    }
    target.food += target.fish.length * (automatic ? 0.035 : 0.12);
    target.feedAt = state.time;
    if (!automatic) {
      state.stats.feeds++;
      emit("feed", "A little meal. A small, happy commotion.", {
        tankId: target.id,
      });
    }
    recalculate(target);
    return ok();
  }

  function modeChoices() {
    const mode = state.mode;
    if (!mode) return;
    const pool = mode.pool.filter((id) => {
      const target = state.tanks.find((t) => t.id === mode.tankId);
      return (
        target &&
        target.fish.length + SPECIES[id].count <= 40 &&
        !(id === "betta" && count(target, "betta"))
      );
    });
    mode.choices = [];
    while (pool.length && mode.choices.length < 3) {
      mode.seed = (Math.imul(1664525, mode.seed) + 1013904223) >>> 0;
      mode.choices.push(
        pool.splice(Math.floor((mode.seed / 4294967296) * pool.length), 1)[0],
      );
    }
  }

  function startMode(id) {
    if (!known(MODES, id) || !state.modes.includes(id))
      return fail("This adventure is introduced by a later chapter.");
    if (state.mode)
      return fail("Finish or leave your current adventure first.");
    const config = MODES[id];
    const date = new Date(now + Math.max(0, Date.now() - bootWall))
      .toISOString()
      .slice(0, 10);
    const seed =
      id === "daily"
        ? hash(`tanking2:${date}`)
        : Math.floor(random(state) * 4294967296);
    const target = makeTank(
      `adventure-${state.nextTank++}`,
      config.theme,
      config.name,
    );
    target.temporary = true;
    target.gallons = 65;
    target.plants = id === "rescue" ? 0 : 3;
    target.filter = id === "rescue" ? 1 : 2;
    state.mode = {
      id,
      title: config.name,
      time: 0,
      duration: config.duration,
      progress: 0,
      target: config.target,
      complete: false,
      failed: false,
      reward: config.reward,
      choices: [],
      round: 0,
      coins:
        id === "rescue"
          ? 150
          : id === "festival"
            ? 190
            : id === "daily"
              ? 210
              : 120,
      previousTank: state.activeTank,
      tankId: target.id,
      seed,
      date,
      pool: ["neon", "rasbora", "cory", "snail", "guppy"],
      healthSum: 0,
      samples: 0,
      visitors: 0,
      losses: 0,
      score: null,
      firstAttempt: !state.stats.completedModes[id],
      nextRound: 0,
    };
    state.tanks.push(target);
    state.activeTank = state.tanks.length - 1;
    if (id === "draft") {
      modeChoices();
      target.autofeeder = true;
    }
    if (id === "rescue") {
      addFish(target, "goldfish", 2);
      target.ammonia = 2.8;
      target.nitrite = 1.2;
      target.nitrate = 48;
      target.oxygen = 5.1;
      target.food = 9;
      target.fish.forEach((f) => {
        f.health = 65;
        f.hunger = 48;
      });
    }
    if (id === "festival") {
      addFish(target, "clownfish", 2);
      addFish(target, "chromis", 6);
      target.anemone = true;
      target.autofeeder = true;
    }
    if (id === "daily") {
      target.water = "fresh";
      target.autofeeder = true;
      modeChoices();
    }
    if (id === "zen") {
      target.gallons = 100;
      target.autofeeder = true;
      target.filter = 5;
      state.mode.coins = 999999;
    }
    state.stats.challenges++;
    recalculate(target);
    emit(
      "unlock",
      `${config.name}. Your gallery is still earning in the background.`,
      { mode: id },
    );
    mission();
    return ok();
  }

  function finishMode(success, reason) {
    const mode = state.mode;
    if (!mode || mode.complete || mode.failed) return;
    mode.complete = success;
    mode.failed = !success;
    mode.reason = reason;
    const target = state.tanks.find((t) => t.id === mode.tankId);
    const averageHealth = mode.samples
      ? mode.healthSum / mode.samples
      : target.health;
    const diversity = new Set(target.fish.map((f) => f.species)).size;
    mode.score = {
      health: Math.round(averageHealth * 10),
      visitors: Math.round(mode.visitors * 3),
      diversity: diversity * 100,
      care: Math.max(0, 300 - mode.losses * 150),
      total: Math.round(
        averageHealth * 10 +
          mode.visitors * 3 +
          diversity * 100 +
          Math.max(0, 300 - mode.losses * 150),
      ),
      seed: mode.id === "daily" ? mode.date : mode.seed,
    };
    emit("modeEnd", reason, { id: mode.id, success, score: mode.score });
  }

  function endMode() {
    const mode = state.mode;
    if (!mode) return fail("You are already home in your gallery.");
    const success = mode.complete && !mode.failed;
    if (success) {
      const repeat = state.stats.completedModes[mode.id] || 0;
      let coins = Math.round(mode.reward * (repeat ? 0.6 : 1));
      let pearls = repeat ? 3 : 8;
      if (mode.id === "daily" && state.stats.bestDaily[mode.date]) {
        coins = 0;
        pearls = 0;
      }
      state.coins += coins;
      state.pearls += pearls;
      state.reputation += repeat ? 12 : 30;
      state.stats.modeWins++;
      state.stats.completedModes[mode.id] = repeat + 1;
      if (mode.id === "daily")
        state.stats.bestDaily[mode.date] = Math.max(
          state.stats.bestDaily[mode.date] || 0,
          mode.score.total,
        );
      emit("reward", `Back home with ${coins} coins and ${pearls} pearls.`, {
        coins,
        pearls,
      });
    }
    state.modeHistory.push({
      id: mode.id,
      date: mode.date,
      success,
      score: mode.score,
      time: mode.time,
    });
    state.modeHistory = state.modeHistory.slice(-20);
    state.tanks = state.tanks.filter((t) => t.id !== mode.tankId);
    state.activeTank = clamp(mode.previousTank, 0, state.tanks.length - 1);
    state.mode = null;
    mission();
    return ok();
  }

  function act(type, payload = {}) {
    if (
      state.mode &&
      (state.mode.complete || state.mode.failed) &&
      ![
        "endMode",
        "setSpeed",
        "reset",
        "acknowledgeOffline",
        "choose",
      ].includes(type)
    )
      return fail("This adventure has ended. Bring its story home.");
    if (
      payload.mission &&
      !state.mode &&
      Number.isInteger(state.mission.tankIndex)
    )
      state.activeTank = state.mission.tankIndex;
    const target = tank();
    let result;
    switch (type) {
      case "buy": {
        const item = SPECIES[payload.species];
        if (!known(SPECIES, payload.species))
          return fail("Choose a species from your journal.");
        if (!state.unlockedSpecies.includes(item.id) && !isZen())
          return fail("A later chapter will introduce this species.");
        if (state.mode?.id === "draft")
          return fail("Choose one of the three expedition cards.");
        if (state.mode && (state.mode.complete || state.mode.failed))
          return fail("This adventure has ended. Bring its story home.");
        if (state.mode?.id === "daily" && !state.mode.pool.includes(item.id))
          return fail("Today’s challenge uses its own shared species pool.");
        const preview = compatibility(state, item, target);
        if (preview.level === "red") return fail(preview.reason);
        const price = Math.ceil(item.cost * (owns("welcome") ? 0.85 : 1));
        if (!charge(price))
          return fail(
            `This group costs ${price} coins. Your inhabited tanks keep earning.`,
          );
        if (isZen() && target.fish.length === 0) target.water = item.water;
        addFish(target, item.id);
        state.stats.purchases++;
        state.stats.bought[item.id] =
          (state.stats.bought[item.id] || 0) + item.count;
        unlock("abilities", ["feed"]);
        emit(
          "splash",
          `${item.count === 1 ? "One new life" : `${item.count} new lives`}. Welcome, ${item.name.toLowerCase()}.`,
          { species: item.id, tankId: target.id },
        );
        if (preview.level === "amber") emit("warning", preview.reason);
        result = ok();
        break;
      }
      case "feed":
        if (!has(state, "feed"))
          return fail("Welcome your first fish before its first meal.");
        result = feed(target, false, false);
        break;
      case "targetFeed":
        if (!has(state, "targetFeed"))
          return fail("Patient feeding is learned with seahorses.");
        result = feed(target, false, true);
        break;
      case "claim":
        return claim();
      case "selectTank": {
        const index = Number(payload.index);
        if (!Number.isInteger(index) || !state.tanks[index])
          return fail("That aquarium is not here.");
        if (state.mode && state.tanks[index].id !== state.mode.tankId)
          return fail(
            "Return from this adventure to visit your gallery. It is still earning.",
          );
        state.activeTank = index;
        result = ok();
        break;
      }
      case "newTank": {
        if (!has(state, "newTank"))
          return fail(
            "Another gallery room opens after you learn to automate care.",
          );
        if (state.mode)
          return fail(
            "Open new gallery tanks after returning from your adventure.",
          );
        if (gallery().length >= (state.chapter < 6 ? 5 : 6))
          return fail(
            state.chapter < 6
              ? "Leave one gallery room for the reef you are about to discover."
              : "Your gallery has room for six permanent aquariums.",
          );
        const theme = payload.theme || "forest";
        if (!["river", "forest", "reef", "moon"].includes(theme))
          return fail("Choose a river, forest or reef habitat.");
        if (
          ["reef", "moon"].includes(theme) &&
          !state.unlockedSpecies.includes("clownfish")
        )
          return fail("The first reef opens after your pocket expedition.");
        if (!charge(ABILITIES.newTank.cost))
          return fail("A new aquarium costs 180 coins.");
        state.tanks.push(makeTank(`tank-${state.nextTank++}`, theme));
        state.activeTank = state.tanks.length - 1;
        emit("unlock", "Another little world, waiting for its first life.");
        result = ok();
        break;
      }
      case "plant": {
        if (!has(state, "plant") && !isZen())
          return fail("Living plants arrive in your next chapter.");
        if (target.plants >= 12)
          return fail("The garden is full. Leave the fish some open water.");
        const price = Math.ceil(
          ABILITIES.plant.cost * (owns("green") ? 0.75 : 1),
        );
        if (!charge(price)) return fail(`A new plant costs ${price} coins.`);
        target.plants++;
        target.oxygen = Math.min(9, target.oxygen + 0.15);
        state.stats.plants++;
        emit(
          "splash",
          target.water === "salt"
            ? "A living garden takes root on the reef."
            : "A small green garden takes root.",
        );
        result = ok();
        break;
      }
      case "clean": {
        if (!has(state, "clean") && !["rescue", "zen"].includes(state.mode?.id))
          return fail("Water changes arrive with your first community tank.");
        if (state.time - target.cleanAt < 12)
          return fail("Let the fresh water circulate for a moment.");
        const price = owns("tide") ? 0 : 8;
        if (!charge(price))
          return fail(
            "A water change costs 8 coins. Let the gallery earn a little more.",
          );
        target.ammonia *= 0.22;
        target.nitrite *= 0.25;
        target.nitrate *= 0.35;
        target.food *= 0.3;
        target.algae *= 0.35;
        target.disease *= 0.65;
        target.oxygen = Math.max(7.6, target.oxygen);
        target.cleanAt = state.time;
        for (const f of target.fish) {
          f.health = Math.min(100, f.health + (owns("tide") ? 12 : 7));
          f.stress *= 0.65;
          f.resting = false;
        }
        state.stats.cleans++;
        emit("splash", "Fresh water, and a little room to breathe.");
        recalculate(target);
        result = ok();
        break;
      }
      case "upgrade": {
        const id = payload.id,
          item = ABILITIES[id];
        if (
          !item ||
          ![
            "filter",
            "autofeeder",
            "anemone",
            "skimmer",
            "uv",
            "chiller",
            "lighting",
          ].includes(id)
        )
          return fail("Choose an aquarium upgrade.");
        if (!has(state, id) && !isZen())
          return fail("That piece of care is introduced in a later chapter.");
        if (id === "filter" ? target.filter >= 5 : target[id])
          return fail("This aquarium already has that upgrade.");
        if (["anemone", "skimmer"].includes(id) && target.water !== "salt")
          return fail("This upgrade belongs in a saltwater aquarium.");
        const cost = id === "filter" ? item.cost * target.filter : item.cost;
        if (!charge(cost)) return fail(`This upgrade costs ${cost} coins.`);
        if (id === "filter") target.filter++;
        else target[id] = true;
        state.stats.upgrades++;
        emit("unlock", `${item.name}, quietly working for this aquarium.`);
        result = ok();
        break;
      }
      case "choose": {
        const id = payload.id;
        if (!state.choices.includes(id) || state.relics.includes(id))
          return fail("Choose one of the three keeper traits offered.");
        state.relics.push(id);
        state.choices = [];
        emit("reward", `${RELICS[id].name}. A small advantage, yours to keep.`);
        if (state.pendingTraits > 0) {
          state.pendingTraits--;
          offerTraits();
        }
        result = ok();
        break;
      }
      case "keepsake": {
        if (state.chapter < 6)
          return fail("Keeper keepsakes arrive with your first reef.");
        if (state.mode)
          return fail("Choose a keepsake after returning to your gallery.");
        if (state.choices.length)
          return fail("Choose your current keeper trait first.");
        if (state.relics.length >= Object.keys(RELICS).length)
          return fail("Every keeper trait is already part of your gallery.");
        if (state.pearls < 20)
          return fail(
            "A keeper keepsake costs 20 pearls. Adventures and conservation earn them.",
          );
        state.pearls -= 20;
        offerTraits();
        emit(
          "reward",
          "A keepsake from your travels. Choose the gift you would like to keep.",
        );
        result = ok();
        break;
      }
      case "startMode":
        return startMode(payload.id);
      case "endMode":
        return endMode();
      case "draft": {
        const mode = state.mode;
        if (
          !mode ||
          !["draft", "daily"].includes(mode.id) ||
          !mode.choices.includes(payload.species) ||
          mode.complete ||
          mode.failed
        )
          return fail("Choose one of the offered species.");
        const item = SPECIES[payload.species];
        if (target.fish.length + item.count > 40)
          return fail("There is no room for this group.");
        addFish(target, item.id);
        mode.choices = [];
        mode.round++;
        mode.nextRound = mode.time + 40;
        emit(
          "splash",
          `${item.name}: a new direction for this little expedition.`,
        );
        result = ok();
        break;
      }
      case "setSpeed": {
        const speed = Number(payload.speed);
        if (![0, 1, 3].includes(speed)) return fail("Choose pause, 1× or 3×.");
        if (speed === 3 && !has(state, "speed"))
          return fail("Faster time opens after your first garden.");
        state.speed = speed;
        result = ok();
        break;
      }
      case "release": {
        if (!has(state, "release"))
          return fail("The nursery opens after the festival.");
        if (state.mode)
          return fail(
            "Release young from your permanent conservation aquarium.",
          );
        const nursery = target.young
          ? target
          : gallery().find((t) => t.young > 0);
        if (!nursery)
          return fail("Your cardinalfish nursery is still growing.");
        const released = Math.floor(nursery.young);
        nursery.young = 0;
        state.stats.released += released;
        state.reputation += released * 4;
        state.pearls += released;
        emit(
          "reward",
          `${released} young cardinalfish released into a protected habitat.`,
          { released },
        );
        result = ok();
        break;
      }
      case "rehome": {
        if (!has(state, "collection") && !isZen())
          return fail("Rehoming opens with your fish journal.");
        const fish = target.fish.find((f) => f.uid === payload.uid);
        if (!fish) return fail("Select the fish you want to rehome.");
        if (!target.temporary && state.chapter < 3)
          return fail(
            "Let this first little community settle before rehoming.",
          );
        target.fish = target.fish.filter((f) => f.uid !== payload.uid);
        emit(
          "warning",
          "A careful move to a trusted keeper. No coins change hands.",
        );
        result = ok();
        break;
      }
      case "acknowledgeOffline":
        state.offline = null;
        result = ok();
        break;
      case "reset": {
        const next = initial();
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, next);
        events.length = 0;
        mission();
        return ok();
      }
      case "wait":
        return fail("Give this small world a little time.");
      default:
        return fail("That action is not available.");
    }
    if (result.ok) {
      for (const t of state.tanks) recalculate(t);
      mission();
    }
    return result;
  }

  function simulateTank(target, dt) {
    target.age += dt;
    const temporary = target.temporary;
    const zen = temporary && state.mode?.id === "zen";
    const juvenileGuard = !temporary && state.chapter < 6;
    const rel = (id) => !temporary && state.relics.includes(id);
    const bioload = target.fish.reduce(
      (sum, f) => sum + SPECIES[f.species].bioload,
      0,
    );
    const scavengers = target.fish.filter(
      (f) => SPECIES[f.species].cleanup,
    ).length;
    if (
      (target.autofeeder || target.caretaker) &&
      avg(target.fish, (f) => f.hunger) > 32 &&
      state.time - target.feedAt > 30
    )
      feed(target, true, has(state, "targetFeed"));
    // There is no punishment for leaving your first fish while learning a new system.
    if (juvenileGuard && avg(target.fish, (f) => f.hunger) > 60)
      feed(target, true, true);
    const foodDecay = Math.min(
      target.food,
      dt * (0.009 * target.food + 0.006 * scavengers),
    );
    target.food -= foodDecay;
    target.ammonia +=
      (bioload * 0.00082 * dt + foodDecay * 0.055) *
      (target.skimmer ? 0.55 : 1);
    target.bacteria = clamp(target.bacteria + dt * 0.0008, 0.2, 1);
    const capacity =
      (0.0027 * target.filter + 0.00025 * target.plants) *
      target.bacteria *
      (rel("clear") ? 1.25 : 1);
    const converted = Math.min(target.ammonia, capacity * dt);
    target.ammonia -= converted;
    target.nitrite += converted * 0.84;
    const nitrified = Math.min(target.nitrite, capacity * 0.92 * dt);
    target.nitrite -= nitrified;
    target.nitrate += nitrified * 0.9;
    target.nitrate = Math.max(
      0,
      target.nitrate -
        dt *
          target.plants *
          0.0015 *
          (rel("green") ? 1.5 : 1) *
          (target.lighting ? 1.2 : 1),
    );
    target.oxygen +=
      (8.3 +
        target.plants * 0.07 -
        bioload * 0.055 -
        target.food * 0.07 -
        target.algae * 0.8 -
        target.oxygen) *
      dt *
      0.045;
    target.oxygen = clamp(target.oxygen, 0, 9.5);
    target.algae = clamp(
      target.algae +
        dt *
          (Math.max(0, target.nitrate - 18) * 0.00004 -
            0.0004 * scavengers -
            (target.uv ? 0.001 : 0)),
      0,
      1,
    );
    const desiredTemp =
      target.chiller && target.fish.length
        ? avg(target.fish, (f) => avg(SPECIES[f.species].temp, (x) => x))
        : 25;
    target.temp += (desiredTemp - target.temp) * dt * 0.012;
    const toxic =
      target.ammonia * 0.8 +
      target.nitrite * 0.65 +
      Math.max(0, 5.8 - target.oxygen) * 0.5;
    target.disease = clamp(
      target.disease +
        dt *
          (Math.max(0, toxic - 0.4) * 0.06 -
            (target.uv ? 0.05 : 0) -
            count(target, "shrimp") * 0.017 -
            0.004),
      0,
      100,
    );
    for (const f of target.fish) {
      const item = SPECIES[f.species];
      f.age += dt;
      f.size = item.size * (0.65 + 0.35 * Math.min(1, f.age / 300));
      f.hunger = clamp(
        f.hunger + dt * 0.13 * (rel("patient") ? 0.75 : 1),
        0,
        100,
      );
      let stress =
        toxic * 23 +
        Math.max(0, f.hunger - 55) * 0.45 +
        (item.temperament === "shy" && target.plants < 2 ? 12 : 0) +
        Math.max(0, item.temp[0] - target.temp, target.temp - item.temp[1]) * 5;
      if (item.school > 1 && count(target, item.id) < item.school) stress += 15;
      if (item.id === "clownfish" && target.anemone) stress *= 0.5;
      f.stress += (clamp(stress, 0, 100) - f.stress) * dt * 0.035;
      const harm =
        toxic * 0.1 +
        Math.max(0, f.hunger - 82) * 0.025 +
        target.disease * 0.009 +
        Math.max(0, f.stress - 55) * 0.006;
      f.health = clamp(
        f.health + dt * ((f.hunger < 60 && toxic < 0.5 ? 0.16 : 0.025) - harm),
        zen ? 100 : juvenileGuard ? 50 : 1,
        100,
      );
      f.fin = Math.min(100, f.fin + dt * 0.025);
      if (f.health <= 1 && !f.resting) {
        f.resting = true;
        emit(
          "warning",
          `${item.name} is resting in a care shelter. Fresh water and a meal will help.`,
          { tankId: target.id },
        );
      }
    }
    if (!zen && target.age > 30) {
      const betta = target.fish.find((f) => f.species === "betta");
      const longfin =
        betta &&
        target.fish.find(
          (f) => f.uid !== betta.uid && SPECIES[f.species].longFins,
        );
      if (longfin) {
        longfin.fin = Math.max(20, longfin.fin - dt * 0.2);
        longfin.stress = Math.min(90, longfin.stress + dt * 0.05);
        discover(
          "betta-fins",
          "The betta is nipping at those flowing fins. A separate aquarium would give everyone peace.",
        );
      }
      const predator = target.fish.find(
        (f) =>
          (f.species === "angelfish" && f.age >= 300) ||
          ["lionfish", "puffer"].includes(f.species),
      );
      const prey =
        predator &&
        target.fish.find((f) =>
          predator.species === "angelfish"
            ? f.species === "neon"
            : predator.species === "puffer"
              ? ["snail", "shrimp"].includes(f.species)
              : SPECIES[f.species].size < 10 && f.uid !== predator.uid,
        );
      if (prey) {
        discover(
          `${predator.species}-predation`,
          `${SPECIES[predator.species].name} is eyeing your ${SPECIES[prey.species].name.toLowerCase()}. Give the smaller resident a safer home.`,
        );
        predator.huntTime = (predator.huntTime || 0) + dt;
        if (predator.huntTime > 35 && state.chapter >= 6) {
          target.fish = target.fish.filter((f) => f.uid !== prey.uid);
          predator.hunger = Math.max(0, predator.hunger - 50);
          predator.huntTime = 0;
          state.stats.losses++;
          if (temporary && state.mode) state.mode.losses++;
          emit(
            "warning",
            `The ${SPECIES[predator.species].name.toLowerCase()} ate a smaller tankmate. This pairing needs separate aquariums.`,
          );
        }
      } else if (predator) predator.huntTime = 0;
    }
    if (count(target, "clownfish") && target.anemone)
      discover(
        "clown-home",
        "The clownfish have claimed their anemone. A little home makes a remarkable difference.",
      );
    if (count(target, "shrimp") && target.disease > 1)
      discover(
        "cleaner-care",
        "Cleaner shrimp are tending their neighbours. Disease pressure is falling.",
      );
    if (count(target, "goldfish") && target.ammonia > 0.3)
      discover(
        "goldfish-waste",
        "Goldfish leave a lot behind. Their spectacular fins come with serious filtration needs.",
      );
    recalculate(target);
    if (target.health >= 80 && target.fish.length) target.happyTime += dt;
    if (has(state, "release") && !temporary && count(target, "cardinal") >= 2) {
      const parents = target.fish.filter((f) => f.species === "cardinal");
      if (
        target.health >= 85 &&
        avg(parents, (f) => f.hunger) < 55 &&
        target.ammonia < 0.4 &&
        target.nitrite < 0.3
      )
        target.breedTime += dt * (rel("nursery") ? 1.35 : 1);
      if (target.breedTime >= 100 && target.young < 20) {
        target.breedTime -= 100;
        target.young += 5;
        emit("reward", "Five tiny cardinalfish are ready for release.", {
          tankId: target.id,
          young: 5,
        });
      }
    }
    if (!temporary) {
      const income = target.income * dt;
      state.coins += income;
      state.stats.earned += income;
      state.stats.visitors +=
        target.appeal * 0.012 * dt * (target.health / 100);
      state.reputation += target.fish.length
        ? (dt * 0.025 * target.health) / 100
        : 0;
    }
    if (target.health < 65 && state.time - target.warningAt > 45) {
      target.warningAt = state.time;
      emit(
        "warning",
        `${target.name} needs a little attention. ${target.ammonia > 0.5 ? "A water change will reduce ammonia." : avg(target.fish, (f) => f.hunger) > 65 ? "Its inhabitants would welcome a meal." : "Fresh water and more plants will help."}`,
        { tankId: target.id },
      );
    }
  }

  function simulateMode(dt) {
    const mode = state.mode;
    if (!mode || mode.complete || mode.failed || mode.id === "zen") return;
    const target = state.tanks.find((t) => t.id === mode.tankId);
    // The clock waits while a draft card is offered. No reading-time penalty.
    if (mode.choices.length) return;
    mode.time += dt;
    mode.healthSum += target.health * dt;
    mode.samples += dt;
    mode.visitors += target.appeal * 0.033 * (target.health / 100) * dt;
    mode.coins += target.income * 0.35 * dt;
    if (mode.id === "draft") {
      mode.progress = mode.round;
      if (mode.round < 3 && mode.time >= mode.nextRound) modeChoices();
      if (mode.time >= 120)
        finishMode(
          mode.round >= 3 && target.health >= 65 && mode.losses === 0,
          target.health >= 65
            ? "Three choices, one thriving little world."
            : "This expedition needs a little more balance. Try another set of choices.",
        );
    }
    if (mode.id === "rescue") {
      if (target.health >= 85 && target.ammonia < 0.35 && target.nitrite < 0.3)
        mode.progress += dt;
      else mode.progress = Math.max(0, mode.progress - dt * 0.5);
      if (mode.progress >= 25)
        finishMode(
          true,
          "Clear water. Curious fish. This aquarium has a second chance.",
        );
      else if (mode.time >= mode.duration)
        finishMode(
          false,
          "The rescue room will be ready for another attempt. Your gallery is safe.",
        );
    }
    if (mode.id === "festival") {
      mode.progress = mode.visitors;
      if (mode.time >= mode.duration)
        finishMode(
          mode.visitors >= 160 && target.health >= 65 && mode.losses === 0,
          mode.visitors >= 160 && target.health >= 65
            ? "The last lantern fades over a happy, healthy reef."
            : "A quieter festival this time. A little more appeal or care will help next weekend.",
        );
    }
    if (mode.id === "daily") {
      mode.progress = mode.time;
      if (mode.round < 3 && mode.time >= mode.nextRound) modeChoices();
      if (mode.time >= mode.duration)
        finishMode(
          target.health >= 65 && target.fish.length > 0,
          "Today’s current is complete. Your score records health, visitors, variety and care.",
        );
    }
  }

  function tick(dt) {
    dt = Number(dt);
    if (!Number.isFinite(dt) || dt <= 0 || state.speed === 0) return;
    state.accumulator += Math.min(dt, 3600) * state.speed;
    while (state.accumulator + 1e-9 >= STEP) {
      state.accumulator -= STEP;
      state.time += STEP;
      for (const target of state.tanks) {
        if (
          target.temporary &&
          state.mode &&
          (state.mode.choices.length ||
            state.mode.complete ||
            state.mode.failed)
        )
          continue;
        simulateTank(target, STEP);
      }
      if (gallery().some((t) => t.fish.length)) state.stats.careTime += STEP;
      simulateMode(STEP);
    }
    state.accumulator = Math.max(0, state.accumulator);
    mission();
  }

  function offline() {
    const savedAt = finite(saved?.savedAt, now);
    const elapsed = clamp((now - savedAt) / 1000, 0, MAX_OFFLINE);
    if (elapsed < 30) return;
    let earned = 0;
    for (const target of gallery()) {
      recalculate(target);
      const coins =
        target.income *
        elapsed *
        (state.relics.includes("keeper") ? 0.8 : 0.55);
      earned += coins;
      for (const f of target.fish) {
        f.hunger = Math.min(f.hunger, 30);
        f.health = Math.min(100, f.health + elapsed * 0.015);
        f.stress *= 0.6;
        f.age += elapsed;
        f.resting = false;
      }
      target.ammonia *= Math.exp(-elapsed * 0.005);
      target.nitrite *= Math.exp(-elapsed * 0.004);
      target.food = 0;
      target.oxygen = Math.max(7.8, target.oxygen);
      target.age += elapsed;
      recalculate(target);
    }
    state.coins += earned;
    state.stats.earned += earned;
    state.stats.visitors +=
      gallery().reduce((sum, t) => sum + t.appeal * 0.01, 0) * elapsed;
    state.reputation += elapsed * 0.008;
    state.time += elapsed;
    if (gallery().some((t) => t.fish.length))
      state.stats.careTime += Math.min(elapsed, 900);
    // Adventures pause while away; the gallery caretaker does not play them for you.
    state.offline = {
      seconds: elapsed,
      coins: Math.floor(earned),
      capped: (now - savedAt) / 1000 > MAX_OFFLINE,
      text: "The night keeper fed your fish and kept the water clear.",
    };
    emit(
      "offline",
      `While you were away, your gallery earned ${Math.floor(earned)} coins. The night keeper took care of everyone.`,
      state.offline,
    );
  }

  for (const target of state.tanks) recalculate(target);
  offline();
  mission();
  return {
    state,
    act,
    tick,
    quote,
    save() {
      return copy({
        ...state,
        savedAt: now + Math.max(0, Date.now() - bootWall),
        accumulator: 0,
      });
    },
    drainEvents() {
      return events.splice(0);
    },
  };
}
