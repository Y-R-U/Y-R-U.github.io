import * as THREE from 'three';

const canvas = document.getElementById('space-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const cockpitCtx = cockpitCanvas.getContext('2d');
const laserCanvas = document.getElementById('laser-canvas');
const laserCtx = laserCanvas.getContext('2d');
const stationWindowCanvas = document.getElementById('station-window-canvas');
const stationWindowCtx = stationWindowCanvas?.getContext('2d');
const gameEl = document.getElementById('game');
const hudEl = document.getElementById('hud');
const menuEl = document.getElementById('menu');
const resultEl = document.getElementById('result');
const stationEl = document.getElementById('station');
const dockTransitionEl = document.getElementById('dock-transition');
const menuAchievements = document.getElementById('menu-achievements');
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const resetModal = document.getElementById('reset-modal');
const debugModal = document.getElementById('debug-modal');
const soundToggle = document.getElementById('sound-toggle');
const musicToggle = document.getElementById('music-toggle');
const hapticsToggle = document.getElementById('haptics-toggle');
const soundState = document.getElementById('sound-state');
const musicState = document.getElementById('music-state');
const hapticsState = document.getElementById('haptics-state');
const debugOpenButton = document.getElementById('debug-open-button');
const resetOpenButton = document.getElementById('reset-open-button');
const resetCancelButton = document.getElementById('reset-cancel-button');
const resetConfirmButton = document.getElementById('reset-confirm-button');
const debugSkipDepotButton = document.getElementById('debug-skip-depot-button');
const debugRefreshMediaButton = document.getElementById('debug-refresh-media-button');
const debugMediaList = document.getElementById('debug-media-list');
const debugMediaCount = document.getElementById('debug-media-count');
const stationTerminalHotspot = document.getElementById('station-terminal-hotspot');
const stationTerminalPanel = document.getElementById('station-terminal-panel');
const stationCloseTerminal = document.getElementById('station-close-terminal');
const reticleEl = document.getElementById('reticle');
const fireButton = document.getElementById('fire-button');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const launchNextButton = document.getElementById('launch-next-button');
const damageFlash = document.getElementById('damage-flash');

const scoreValue = document.getElementById('score-value');
const shieldValue = document.getElementById('shield-value');
const heatValue = document.getElementById('heat-value');
const shieldMeter = document.getElementById('shield-meter');
const heatMeter = document.getElementById('heat-meter');
const sectorValue = document.getElementById('sector-value');
const threatValue = document.getElementById('threat-value');
const routeMeter = document.getElementById('route-meter');
const resultScore = document.getElementById('result-score');
const resultBest = document.getElementById('result-best');
const resultWave = document.getElementById('result-wave');
const resultDebt = document.getElementById('result-debt');
const resultTitle = document.getElementById('result-title');
const resultKicker = document.getElementById('result-kicker');
const resultMessage = document.getElementById('result-message');
const resultLock = document.getElementById('result-lock');
const resultLockText = resultLock?.querySelector('span');
const resultLockBar = resultLock?.querySelector('i');
const stationKicker = document.getElementById('station-kicker');
const stationTitle = document.getElementById('station-title');
const stationMessage = document.getElementById('station-message');
const stationCredits = document.getElementById('station-credits');
const stationPayout = document.getElementById('station-payout');
const stationCargo = document.getElementById('station-cargo');
const stationDebt = document.getElementById('station-debt');
const stationRoute = document.getElementById('station-route');
const stationTabs = document.getElementById('station-tabs');
const stationPanelTitle = document.getElementById('station-panel-title');
const stationPanelCopy = document.getElementById('station-panel-copy');
const upgradeCategoryTabs = document.getElementById('upgrade-category-tabs');
const upgradeList = document.getElementById('upgrade-list');

const BEST_KEY = 'outpace-best';
const LEGACY_BEST_KEY = 'void-cockpit-best';
const SAVE_KEY = 'outpace-save-v2';
const SETTINGS_KEY = 'outpace-settings-v1';
const RESULT_LOCK_MS = 3200;
const DOCK_FADE_IN_MS = 760;
const DOCK_HOLD_MS = 360;
const DOCK_FADE_OUT_MS = 760;
const STARTING_DEBT = 2000;
const DEBT_LIMIT = 10000;
const DEBT_INTEREST_RATE = 0.02;
let resultUnlockTimeout = 0;
let resultCountdownTimer = 0;
let dockTransitionTimers = [];

const clock = new THREE.Clock();
const params = new URLSearchParams(window.location.search);
const DEMO_SETTINGS = params.has('demoSettings');
const DEMO_DEBUG = params.has('demoDebug');
const DEMO_STORY_STATE = params.get('demoStory') || '';
const DEMO_QUEST = params.get('demoQuest') || '';
const DEMO_MODE = params.has('demo') || params.has('demoDock') || params.has('demoResult') || params.has('demoTerminal') || params.has('demoStory') || params.has('demoQuest') || DEMO_SETTINGS || DEMO_DEBUG;
const DEMO_STATION_TAB = params.get('demoTab') || '';
const pointer = new THREE.Vector2();
const tmpVector = new THREE.Vector3();
const tmpVectorB = new THREE.Vector3();
const tmpColor = new THREE.Color();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const UPGRADE_CATEGORIES = [
  {
    id: 'flight',
    label: 'Flight',
    title: 'Flight Systems',
    copy: 'Survive longer runs with stronger shields, colder systems, and faster station hops.',
  },
  {
    id: 'weapons',
    label: 'Weapons',
    title: 'Weapon Bay',
    copy: 'Improve the twin lances, target choice, and heat ceiling before the next route.',
  },
  {
    id: 'trade',
    label: 'Trade',
    title: 'Freight Office',
    copy: 'Make each station run pay harder without manually trading cargo.',
  },
];

const STATION_BASE_NAMES = [
  'Aster',
  'Kepler',
  'Morrow',
  'Vega',
  'Nysa',
  'Talon',
  'Helio',
  'Cinder',
  'Maru',
  'Orion',
  'Eidolon',
  'Sable',
];

const CARGO_CAPACITY_BY_LEVEL = [
  8, 12, 17, 23, 30, 38, 48, 60, 74, 90, 108, 128,
  151, 177, 206, 238, 273, 312, 355, 402, 454, 512,
];

const OWNER_LAST_NAMES = ['Vale', 'Morrow', 'Sable', 'Kestrel', 'Rourke', 'Orion'];

const STORY_ARCS = [
  {
    id: 'identity',
    label: 'Identity Cache',
    targets: OWNER_LAST_NAMES,
    title: (target) => `Who is ${target}?`,
    endingTitle: 'Registry Matched',
    summary: 'Recover the owner record and the lost shipping-family trail.',
    unavailable: 'Required first mission.',
    ending: (target) => `The ${target} freight line was pushed out by a syndicate. Most of the family is missing, and the quest board is now open.`,
  },
  {
    id: 'kin',
    label: 'Family Search',
    targets: ['mother', 'father', 'sister', 'brother', 'cousin'],
    title: (target) => `Find: ${target}`,
    endingTitle: 'Signal Found',
    summary: 'Use port caches to find one missing family member.',
    unavailable: 'Unlocks after the identity cache.',
    ending: (target) => `The final berth log resolves to a live room code. Your ${target} is alive beyond the inner dock.`,
  },
  {
    id: 'revenge',
    label: 'Syndicate Trace',
    targets: ['syndicate broker', 'dock lieutenant', 'former family agent'],
    title: (target) => `Trace: ${target}`,
    endingTitle: 'Account Open',
    summary: 'Trace the criminal organisation that took the family routes.',
    unavailable: 'Unlocks after the identity cache.',
    ending: (target) => `The terminal confirms the ${target} docked under a false name. Their bay is one door away.`,
  },
  {
    id: 'blackbox',
    label: 'Black Box Trail',
    targets: ['escape recorder'],
    title: () => 'Black Box Trail',
    endingTitle: 'Beacon Decoded',
    summary: 'Recover the small cargo ship launch recorder and the missing minutes.',
    unavailable: 'Unlocks after the identity cache.',
    ending: () => 'The recorder fragments align into one final coordinate. A live rescue beacon answers from the static.',
  },
];

const ACHIEVEMENT_DEFS = [
  {
    id: 'first-dock',
    title: 'First Berth',
    text: 'Dock at any station.',
    goal: 1,
    progress: (save) => save.stats.dockings,
  },
  {
    id: 'linked-ports',
    title: 'Linked Ports',
    text: 'Complete five station runs.',
    goal: 5,
    progress: (save) => save.stats.dockings,
  },
  {
    id: 'lance-work',
    title: 'Lance Work',
    text: 'Destroy twenty hazards.',
    goal: 20,
    progress: (save) => save.stats.kills,
  },
  {
    id: 'heavy-hold',
    title: 'Heavy Hold',
    text: 'Reach 108t cargo capacity.',
    goal: 108,
    progress: (save) => Math.max(save.stats.bestCargo, getCargoCapacity(save.upgrades.cargo || 0)),
  },
  {
    id: 'deep-pockets',
    title: 'Deep Pockets',
    text: 'Earn 25000 total credits.',
    goal: 25000,
    progress: (save) => save.stats.totalCredits,
  },
  {
    id: 'shipwright',
    title: 'Shipwright',
    text: 'Install twelve upgrades.',
    goal: 12,
    progress: (save) => save.stats.upgradesBought,
  },
  {
    id: 'warm-trail',
    title: 'Warm Trail',
    text: 'Run four port searches.',
    goal: 4,
    progress: (save) => save.stats.storySearches,
  },
  {
    id: 'closure',
    title: 'Closure',
    text: 'Finish a search thread.',
    goal: 1,
    progress: (save) => save.stats.storyCompleted,
  },
];

const STORY_MEDIA = [
  {
    id: 'IMG-01',
    type: 'image',
    title: 'Cold Port Record',
    storyKinds: ['kin'],
    phase: 'cold',
    src: 'assets/story/img-01-cold-port-record.png',
    plannedPath: 'assets/story/img-01-cold-port-record.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'close-up sci-fi dock terminal evidence still, cold missing-person port record, dim cyan interface reflections, no readable text, no logos',
  },
  {
    id: 'IMG-02',
    type: 'image',
    title: 'Warm Alias Hit',
    storyKinds: ['kin', 'revenge'],
    phase: 'warm',
    src: 'assets/story/img-02-warm-alias-hit.png',
    plannedPath: 'assets/story/img-02-warm-alias-hit.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'cinematic sci-fi case file still, partially corrupted face silhouette and dock receipt fragments, amber warning light, no readable text, no logos',
  },
  {
    id: 'IMG-03',
    type: 'image',
    title: 'Black Box Fragment',
    storyKinds: ['blackbox'],
    phase: 'cold',
    src: 'assets/story/img-03-black-box-fragment.png',
    plannedPath: 'assets/story/img-03-black-box-fragment.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'macro sci-fi black box data core fragment floating in a repair tray, cyan scan lines, damaged metal, no readable text, no logos',
  },
  {
    id: 'IMG-04',
    type: 'image',
    title: 'Final Berth',
    storyKinds: ['revenge', 'blackbox'],
    phase: 'final',
    src: 'assets/story/img-04-final-berth.png',
    plannedPath: 'assets/story/img-04-final-berth.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'cinematic sci-fi docking lounge evidence still, final berth door with bright rim light and emotional mystery, no readable text, no logos',
  },
  {
    id: 'IMG-05',
    type: 'image',
    title: 'Owner Registry',
    storyKinds: ['identity'],
    phase: 'cold',
    src: 'assets/story/img-05-owner-registry.png',
    plannedPath: 'assets/story/img-05-owner-registry.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'cinematic sci-fi ship registry evidence still, scrubbed owner record on a dark cockpit console, no readable text, no logos',
  },
  {
    id: 'IMG-06',
    type: 'image',
    title: 'Autopilot Escape',
    storyKinds: ['identity'],
    phase: 'warm',
    src: 'assets/story/img-06-autopilot-escape.png',
    plannedPath: 'assets/story/img-06-autopilot-escape.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'small fast cargo starship escaping an orbital freight hangar under emergency autopilot, no readable text, no logos',
  },
  {
    id: 'IMG-07',
    type: 'image',
    title: 'Family Ledger',
    storyKinds: ['identity'],
    phase: 'final',
    src: 'assets/story/img-07-family-ledger.png',
    plannedPath: 'assets/story/img-07-family-ledger.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'family shipping archive with holographic freight routes and syndicate overlays, no readable text, no logos',
  },
  {
    id: 'IMG-08',
    type: 'image',
    title: 'Syndicate Trace',
    storyKinds: ['revenge'],
    phase: 'cold',
    src: 'assets/story/img-08-syndicate-trace.png',
    plannedPath: 'assets/story/img-08-syndicate-trace.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'black market orbital route board with red threat lines over blue station schematics, no readable text, no logos',
  },
  {
    id: 'IMG-09',
    type: 'image',
    title: 'Family Signal',
    storyKinds: ['kin'],
    phase: 'final',
    src: 'assets/story/img-09-family-signal.png',
    plannedPath: 'assets/story/img-09-family-signal.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'missing family signal from a warm inner berth door in station mist, no readable text, no logos',
  },
  {
    id: 'VID-03',
    type: 'video',
    title: 'Owner Registry Loop',
    storyKinds: ['identity'],
    phase: 'cold',
    src: 'assets/story/vid-03-owner-registry-loop.mp4',
    plannedPath: 'assets/story/vid-03-owner-registry-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'ship registry terminal loop, scrubbed owner record panels flicker softly, no readable text, no logos',
    notes: 'Generated from IMG-05, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-04',
    type: 'video',
    title: 'Autopilot Escape Loop',
    storyKinds: ['identity'],
    phase: 'warm',
    src: 'assets/story/vid-04-autopilot-escape-loop.mp4',
    plannedPath: 'assets/story/vid-04-autopilot-escape-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'emergency cargo starship launch loop, blue engine flare and orange dock alarms pulse, no readable text, no logos',
    notes: 'Generated from IMG-06, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-05',
    type: 'video',
    title: 'Family Ledger Loop',
    storyKinds: ['identity'],
    phase: 'final',
    src: 'assets/story/vid-05-family-ledger-loop.mp4',
    plannedPath: 'assets/story/vid-05-family-ledger-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'family freight route archive loop, holographic route lines crawl across a lounge table, no readable text, no logos',
    notes: 'Generated from IMG-07, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-08',
    type: 'video',
    title: 'Family Signal Loop',
    storyKinds: ['kin'],
    phase: 'final',
    src: 'assets/story/vid-08-family-signal-loop.mp4',
    plannedPath: 'assets/story/vid-08-family-signal-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'missing family signal loop, warm beacon from an inner berth door pulses softly, no readable text, no logos',
    notes: 'Generated from IMG-09, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-07',
    type: 'video',
    title: 'Syndicate Trace Loop',
    storyKinds: ['revenge'],
    phase: 'warm',
    src: 'assets/story/vid-07-syndicate-trace-loop.mp4',
    plannedPath: 'assets/story/vid-07-syndicate-trace-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'syndicate route trace loop, red threat lines pulse over blue station map panels, no readable text, no logos',
    notes: 'Generated from IMG-08, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-06',
    type: 'video',
    title: 'Final Berth Loop',
    storyKinds: ['revenge', 'blackbox'],
    phase: 'final',
    src: 'assets/story/vid-06-final-berth-loop.mp4',
    plannedPath: 'assets/story/vid-06-final-berth-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'final berth evidence loop, rim light breathes behind a distant station door, no readable text, no logos',
    notes: 'Generated from IMG-04, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-01',
    type: 'video',
    title: 'Signal Sweep Loop',
    storyKinds: ['kin', 'revenge'],
    phase: 'warm',
    src: 'assets/story/vid-01-signal-sweep-loop.mp4',
    plannedPath: 'assets/story/vid-01-signal-sweep-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'small dock terminal signal sweep, radar pulse crosses a corrupted case file, extremely slow zoom in, no readable text, no logos',
    notes: 'Generate part A from IMG-02. Generate part B from part A last frame back to IMG-02, then crop any final glitch frames.',
  },
  {
    id: 'VID-02',
    type: 'video',
    title: 'Black Box Decode Loop',
    storyKinds: ['blackbox'],
    phase: 'warm',
    src: 'assets/story/vid-02-black-box-decode-loop.mp4',
    plannedPath: 'assets/story/vid-02-black-box-decode-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'black box fragment decoding in a station terminal tray, tiny light pulses and scan haze, extremely slow push in, no readable text, no logos',
    notes: 'Generate part A from IMG-03. Generate part B from part A last frame back to IMG-03, crop the last half-second if it rushes the end frame.',
  },
];

const DEBUG_MEDIA = [
  {
    id: 'BASE-01',
    type: 'image',
    title: 'Cockpit Window Mask',
    src: 'assets/cockpit-chroma.png',
    generator: 'generated cockpit asset',
    prompt: 'Runtime cockpit image. Green-screen window is keyed out so the Three.js space scene renders underneath.',
  },
  {
    id: 'BASE-02',
    type: 'image',
    title: 'Station Lounge Alpha',
    src: 'assets/station-lounge-alpha.png',
    generator: 'generated lounge asset',
    prompt: 'Station lounge image with transparent window openings over the live sideways starfield.',
  },
  ...STORY_MEDIA,
];

const UPGRADE_DEFS = [
  {
    id: 'shield',
    category: 'flight',
    name: 'Hull Plating',
    blurb: 'More shield capacity for longer asteroid lanes.',
    max: 8,
    base: 225,
    scale: 1.62,
    stat: (level) => `+${level * 22} shield`,
  },
  {
    id: 'cooling',
    category: 'flight',
    name: 'Cryo Heat Sinks',
    blurb: 'Faster heat bleed and a lower pulse heat spike.',
    max: 8,
    base: 205,
    scale: 1.6,
    stat: (level) => `+${level * 5}/s cooling`,
  },
  {
    id: 'engine',
    category: 'flight',
    name: 'Vector Drive',
    blurb: 'Shorter runs and a higher cruise speed between stations.',
    max: 6,
    base: 260,
    scale: 1.68,
    stat: (level) => `+${level * 5}% drive`,
  },
  {
    id: 'laser',
    category: 'weapons',
    name: 'Twin Lance Array',
    blurb: 'Harder-hitting double shots from the cockpit turrets.',
    max: 9,
    base: 285,
    scale: 1.72,
    stat: (level) => `${(0.62 + level * 0.78).toFixed(1)} beam power`,
  },
  {
    id: 'targeting',
    category: 'weapons',
    name: 'Threat Predictor',
    blurb: 'Better auto-lock priority for objects actually on your path.',
    max: 6,
    base: 240,
    scale: 1.66,
    stat: (level) => `+${level} lock AI`,
  },
  {
    id: 'capacitor',
    category: 'weapons',
    name: 'Heat Capacitor',
    blurb: 'Raises the overheat ceiling so burst fire lasts longer.',
    max: 6,
    base: 230,
    scale: 1.64,
    stat: (level) => `${100 + level * 12}% heat cap`,
  },
  {
    id: 'cargo',
    category: 'trade',
    name: 'Cargo Spine',
    blurb: 'Stations load more freight, so each delivery pays more.',
    max: CARGO_CAPACITY_BY_LEVEL.length - 1,
    base: 185,
    scale: 1.5,
    stat: (level) => `${getCargoCapacity(level)}t bay`,
  },
  {
    id: 'broker',
    category: 'trade',
    name: 'Station License',
    blurb: 'Better berth priority and delivery fees from every depot.',
    max: 6,
    base: 260,
    scale: 1.7,
    stat: (level) => `+${level * 7}% fees`,
  },
];

function makeDefaultStats() {
  return {
    dockings: 0,
    kills: 0,
    droneKills: 0,
    asteroidKills: 0,
    collectors: 0,
    shotsFired: 0,
    totalCredits: 0,
    upgradesBought: 0,
    storySearches: 0,
    storyCompleted: 0,
    bestCargo: 8,
    escapePods: 0,
    confiscations: 0,
  };
}

function createQuest(kind = 'identity', targetOverride = '') {
  const arc = STORY_ARCS.find((item) => item.id === kind) || STORY_ARCS[0];
  const target = targetOverride || (kind === 'identity' ? pick(OWNER_LAST_NAMES) : arc.targets[0]);
  return {
    id: `${arc.id}-${Date.now().toString(36)}-${Math.floor(rand(100, 999))}`,
    kind: arc.id,
    target,
    goal: arc.id === 'identity' ? 4 : arc.id === 'blackbox' ? 8 : 9,
    progress: 0,
    lastRoute: 0,
    complete: false,
    endingSeen: false,
    lastMessage: '',
  };
}

function normalizeQuest(rawQuest, kind = 'identity', lastName = '') {
  const fallback = createQuest(kind, kind === 'identity' ? lastName : '');
  const arc = STORY_ARCS.find((item) => item.id === (rawQuest?.kind || kind)) || STORY_ARCS[0];
  const target = arc.targets.includes(rawQuest?.target) ? rawQuest.target : fallback.target;
  const goal = clamp(Math.round(Number(rawQuest?.goal) || fallback.goal), arc.id === 'identity' ? 3 : 5, 16);
  const progress = clamp(Math.round(Number(rawQuest?.progress) || 0), 0, goal);
  return {
    id: typeof rawQuest?.id === 'string' ? rawQuest.id : fallback.id,
    kind: arc.id,
    target,
    goal,
    progress,
    lastRoute: Math.max(0, Math.round(Number(rawQuest?.lastRoute) || 0)),
    complete: Boolean(rawQuest?.complete) || progress >= goal,
    endingSeen: Boolean(rawQuest?.endingSeen),
    lastMessage: typeof rawQuest?.lastMessage === 'string' ? rawQuest.lastMessage.slice(0, 240) : '',
  };
}

function createStoryBoard(lastName = pick(OWNER_LAST_NAMES)) {
  return {
    schema: 2,
    lastName,
    activeId: 'identity',
    completed: [],
    quests: {
      identity: createQuest('identity', lastName),
      kin: createQuest('kin'),
      revenge: createQuest('revenge'),
      blackbox: createQuest('blackbox'),
    },
  };
}

function normalizeStory(rawStory) {
  if (!rawStory || typeof rawStory !== 'object') return createStoryBoard();
  if (rawStory.schema !== 2) {
    const board = createStoryBoard();
    if (rawStory.kind && rawStory.kind !== 'identity' && board.quests[rawStory.kind]) {
      board.quests[rawStory.kind] = normalizeQuest(rawStory, rawStory.kind, board.lastName);
    }
    return board;
  }

  const lastName = OWNER_LAST_NAMES.includes(rawStory.lastName) ? rawStory.lastName : pick(OWNER_LAST_NAMES);
  const board = createStoryBoard(lastName);
  const completed = Array.isArray(rawStory.completed) ? rawStory.completed.filter((id) => board.quests[id]) : [];
  board.completed = [...new Set(completed)];
  for (const kind of Object.keys(board.quests)) {
    board.quests[kind] = normalizeQuest(rawStory.quests?.[kind], kind, lastName);
    if (board.quests[kind].complete && !board.completed.includes(kind)) board.completed.push(kind);
  }
  board.activeId = rawStory.activeId;
  if (!board.quests[board.activeId]) board.activeId = board.completed.includes('identity') ? null : 'identity';
  if (!board.completed.includes('identity')) board.activeId = 'identity';
  return board;
}

function makeDefaultSave() {
  return {
    credits: 0,
    debt: STARTING_DEBT,
    route: 1,
    upgrades: Object.fromEntries(UPGRADE_DEFS.map((def) => [def.id, 0])),
    stats: makeDefaultStats(),
    story: createStoryBoard(),
  };
}

function loadSave() {
  const save = makeDefaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return save;
    const parsed = JSON.parse(raw);
    save.credits = Math.max(0, Number(parsed.credits) || 0);
    save.debt = Number.isFinite(Number(parsed.debt)) ? Math.max(0, Math.round(Number(parsed.debt))) : STARTING_DEBT;
    save.route = Math.max(1, Number(parsed.route) || 1);
    for (const def of UPGRADE_DEFS) {
      save.upgrades[def.id] = clamp(Number(parsed.upgrades?.[def.id]) || 0, 0, def.max);
    }
    save.stats = { ...makeDefaultStats(), ...(parsed.stats || {}) };
    for (const key of Object.keys(save.stats)) {
      save.stats[key] = Math.max(0, Number(save.stats[key]) || 0);
    }
    save.stats.bestCargo = Math.max(save.stats.bestCargo, getCargoCapacity(save.upgrades.cargo || 0));
    save.story = normalizeStory(parsed.story);
  } catch {
    return save;
  }
  return save;
}

function makeDefaultSettings() {
  return {
    sound: true,
    music: false,
    haptics: true,
  };
}

function loadSettings() {
  const settings = makeDefaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return settings;
    const parsed = JSON.parse(raw);
    settings.sound = parsed.sound !== false;
    settings.music = Boolean(parsed.music);
    settings.haptics = parsed.haptics !== false;
  } catch {
    return settings;
  }
  return settings;
}

function saveProgress() {
  if (DEMO_MODE) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function getUpgradeLevel(id) {
  return state.save.upgrades[id] || 0;
}

function getUpgradeCost(def) {
  const level = getUpgradeLevel(def.id);
  if (level >= def.max) return 0;
  return Math.round(def.base * Math.pow(def.scale, level) / 5) * 5;
}

function getCargoCapacity(level = getUpgradeLevel('cargo')) {
  const safeLevel = clamp(Math.floor(level), 0, CARGO_CAPACITY_BY_LEVEL.length - 1);
  return CARGO_CAPACITY_BY_LEVEL[safeLevel];
}

function getShipStats() {
  const shield = getUpgradeLevel('shield');
  const cooling = getUpgradeLevel('cooling');
  const laser = getUpgradeLevel('laser');
  const targeting = getUpgradeLevel('targeting');
  const capacitor = getUpgradeLevel('capacitor');
  const cargo = getUpgradeLevel('cargo');
  const engine = getUpgradeLevel('engine');
  const broker = getUpgradeLevel('broker');
  return {
    maxShield: 100 + shield * 22,
    maxHeat: 100 + capacitor * 12,
    coolRate: 17 + cooling * 5.2,
    shotHeat: clamp(18 - cooling * 1.15 - laser * 0.35, 7.5, 18),
    shotCooldown: clamp(0.15 - laser * 0.012, 0.07, 0.15),
    beamPower: 0.62 + laser * 0.78,
    lockAssist: targeting,
    cargo: getCargoCapacity(cargo),
    speedBonus: 1 + engine * 0.05,
    routeReduction: engine * 34,
    deliveryBonus: 1 + broker * 0.07,
  };
}

function getStationType(route = state.save.route) {
  if (route % 10 === 0) return 'mega';
  if (route % 5 === 0) return 'large';
  return 'small';
}

function getStationLabel(type = getStationType()) {
  if (type === 'mega') return 'orbital exchange';
  if (type === 'large') return 'regional hub';
  return 'mining dock';
}

function getStationName(route = state.save.route, type = getStationType(route)) {
  const base = STATION_BASE_NAMES[(route * 7 + route * route * 3) % STATION_BASE_NAMES.length];
  const suffix = type === 'mega' ? 'Exchange' : type === 'large' ? 'Station' : 'Depot';
  return `${base} ${suffix}`;
}

function getRouteLength(route = state.save.route) {
  const stats = getShipStats();
  return Math.max(1180, 1680 + route * 135 - stats.routeReduction);
}

function getDeliveryPayout(route = state.save.route, type = getStationType(route)) {
  const stats = getShipStats();
  const multiplier = type === 'mega' ? 2.25 : type === 'large' ? 1.58 : 1;
  const cargoRate = 18 + Math.min(18, stats.cargo / 28);
  return Math.round((95 + route * 26 + stats.cargo * cargoRate) * multiplier * stats.deliveryBonus);
}

function formatCredits(value) {
  return String(Math.round(value || 0));
}

function calculateRepairBill() {
  const routePressure = Math.max(1, state.save.route);
  const installedLevels = Object.values(state.save.upgrades || {}).reduce((sum, level) => sum + (Number(level) || 0), 0);
  return Math.round((340 + routePressure * 74 + installedLevels * 28) / 5) * 5;
}

function applyDebtInterest() {
  if (state.save.debt <= 0) {
    state.lastDebtInterest = 0;
    return 0;
  }
  const interest = Math.max(1, Math.ceil(state.save.debt * DEBT_INTEREST_RATE));
  state.save.debt += interest;
  state.lastDebtInterest = interest;
  saveProgress();
  return interest;
}

function applyEscapePodRepair() {
  const bill = calculateRepairBill();
  const paid = Math.min(state.save.credits, bill);
  const addedDebt = bill - paid;
  state.save.credits -= paid;
  state.save.debt += addedDebt;
  state.save.stats.escapePods += 1;
  state.lastRepairBill = bill;
  state.lastRepairPaid = paid;
  state.lastDebtAdded = addedDebt;
  state.confiscated = state.save.debt > DEBT_LIMIT;
  if (state.confiscated) state.save.stats.confiscations += 1;
  saveProgress();
  return { bill, paid, addedDebt };
}

function payDebt() {
  if (!state.save.debt || !state.save.credits) {
    playSfx('error');
    updateStationUi(state.currentPayout, state.lastStationType, state.save.debt > 0
      ? 'No spare credits available for debt service.'
      : 'Debt ledger is clear. No payment needed.');
    return;
  }
  const payment = Math.min(state.save.credits, state.save.debt);
  state.save.credits -= payment;
  state.save.debt -= payment;
  saveProgress();
  playSfx('buy');
  haptic([18, 24, 18]);
  updateStationUi(state.currentPayout, state.lastStationType, `${payment} credits transferred to the debt ledger.`);
}

function showShipPurchaseNotice() {
  playSfx('error');
  haptic(14);
  updateStationUi(state.currentPayout, state.lastStationType, 'Ship purchase licenses are locked behind a paid upgrade feature.');
}

function completeDemoQuest(quest) {
  if (!quest) return;
  quest.progress = quest.goal;
  quest.complete = true;
  quest.lastMessage = getStoryArc(quest).ending(quest.target);
}

function applyDemoStoryState() {
  if (!DEMO_STORY_STATE && !DEMO_QUEST) return;
  const board = getStoryBoard();
  const identity = board.quests.identity;
  if (DEMO_STORY_STATE === 'identity-complete' || DEMO_STORY_STATE === 'board' || DEMO_QUEST) {
    completeDemoQuest(identity);
    if (!board.completed.includes('identity')) board.completed.push('identity');
    board.activeId = DEMO_STORY_STATE === 'board' ? null : 'identity';
  }
  if (DEMO_QUEST && board.quests[DEMO_QUEST] && isQuestAvailable(DEMO_QUEST)) {
    board.activeId = DEMO_QUEST;
    board.quests[DEMO_QUEST].lastMessage ||= getStoryMessage(board.quests[DEMO_QUEST]);
  }
}

const state = {
  running: false,
  demo: params.has('demo'),
  demoResult: params.has('demoResult'),
  demoDock: params.has('demoDock'),
  demoTerminal: params.has('demoTerminal'),
  save: loadSave(),
  settings: loadSettings(),
  modal: null,
  audio: {
    context: null,
    musicGain: null,
    musicNodes: [],
    musicRunning: false,
  },
  time: 0,
  score: 0,
  best: Number(localStorage.getItem(BEST_KEY) || localStorage.getItem(LEGACY_BEST_KEY) || 0),
  routeDistance: 0,
  routeLength: 1600,
  currentPayout: 0,
  lastRepairBill: 0,
  lastRepairPaid: 0,
  lastDebtAdded: 0,
  lastDebtInterest: 0,
  confiscated: false,
  lastStationType: 'small',
  lastStationRoute: 1,
  lastStationName: '',
  stationTab: 'upgrades',
  stationTerminalOpen: false,
  upgradeCategory: 'flight',
  stationWindowTime: 0,
  stationTraffic: [],
  docking: false,
  dockTransitioning: false,
  docked: false,
  dockObject: null,
  shield: 100,
  heat: 0,
  wave: 1,
  speed: 48,
  spawnTimer: 0,
  stationTimer: 3,
  collectTimer: 5,
  shotTimer: 0,
  threat: 0,
  shake: 0,
  flashTimer: 0,
  player: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  pointerDown: false,
  movementPointerId: null,
  moveOrigin: { x: 0, y: 0 },
  moveCurrent: { x: 0, y: 0 },
  firePointerId: null,
  firing: false,
  lockedTarget: null,
  lockedScreen: null,
  laserBursts: [],
  resultLocked: false,
  cockpitReady: false,
  objects: [],
  beams: [],
  particles: [],
  sparks: [],
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x020205, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050608, 0.0066);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
camera.position.set(0, 0, 4);

const ambient = new THREE.HemisphereLight(0x9ee8ff, 0x27170f, 1.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffd3a1, 3.6);
sun.position.set(-18, 26, 20);
scene.add(sun);

const cockpitLight = new THREE.PointLight(0x54dfff, 2.2, 60, 1.6);
cockpitLight.position.set(0, -4, 5);
scene.add(cockpitLight);

const warmLight = new THREE.PointLight(0xff743a, 1.4, 42, 1.7);
warmLight.position.set(7, -8, 3);
scene.add(warmLight);

const materials = {
  asteroid: [
    new THREE.MeshStandardMaterial({ color: 0x6d5b4d, roughness: 0.92, metalness: 0.08, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x50423a, roughness: 0.96, metalness: 0.04, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7c7468, roughness: 0.9, metalness: 0.1, flatShading: true }),
  ],
  drone: new THREE.MeshStandardMaterial({ color: 0x243642, roughness: 0.42, metalness: 0.72, flatShading: true }),
  droneWing: new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.48, metalness: 0.78, flatShading: true }),
  droneGlow: new THREE.MeshStandardMaterial({ color: 0xff7b39, emissive: 0xff3d1c, emissiveIntensity: 2.8, roughness: 0.22, metalness: 0.2 }),
  station: new THREE.MeshStandardMaterial({ color: 0x1b2730, roughness: 0.36, metalness: 0.86, flatShading: true }),
  stationDark: new THREE.MeshStandardMaterial({ color: 0x080c11, roughness: 0.5, metalness: 0.7, flatShading: true }),
  stationGlow: new THREE.MeshStandardMaterial({ color: 0x56e4ff, emissive: 0x19cfff, emissiveIntensity: 2.1, roughness: 0.25, metalness: 0.25 }),
  amberGlow: new THREE.MeshStandardMaterial({ color: 0xffb455, emissive: 0xff7e2f, emissiveIntensity: 2.1, roughness: 0.28, metalness: 0.25 }),
  dockHull: new THREE.MeshStandardMaterial({ color: 0x202d33, roughness: 0.44, metalness: 0.8, flatShading: true }),
  dockDark: new THREE.MeshStandardMaterial({ color: 0x080c10, roughness: 0.52, metalness: 0.75, flatShading: true }),
  dockRunway: new THREE.MeshStandardMaterial({ color: 0x74f2ff, emissive: 0x20d7ff, emissiveIntensity: 2.4, roughness: 0.18, metalness: 0.35 }),
  dockWarning: new THREE.MeshStandardMaterial({ color: 0xffb04b, emissive: 0xff6e2f, emissiveIntensity: 2.3, roughness: 0.22, metalness: 0.3 }),
  collect: new THREE.MeshStandardMaterial({ color: 0x89ffb0, emissive: 0x39ff74, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.45 }),
};

const beamMaterial = new THREE.LineBasicMaterial({
  color: 0x88f3ff,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
});

const enemyBeamMaterial = new THREE.LineBasicMaterial({
  color: 0xff7746,
  transparent: true,
  opacity: 0.66,
  blending: THREE.AdditiveBlending,
});

const particleMaterial = new THREE.PointsMaterial({
  size: 1.1,
  color: 0xffb15c,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const starGeometry = new THREE.BufferGeometry();
const starCount = 980;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSideSpeeds = new Float32Array(starCount);

function resetStar(index, deep = true) {
  const i = index * 3;
  const radius = rand(8, 180);
  const angle = rand(0, Math.PI * 2);
  starPositions[i] = Math.cos(angle) * radius + rand(-16, 16);
  starPositions[i + 1] = Math.sin(angle) * radius * 0.72 + rand(-22, 22);
  starPositions[i + 2] = deep ? rand(-780, -40) : rand(-780, -620);
  tmpColor.setHSL(pick([0.08, 0.52, 0.58, 0.02]), rand(0.18, 0.72), rand(0.62, 1));
  starColors[i] = tmpColor.r;
  starColors[i + 1] = tmpColor.g;
  starColors[i + 2] = tmpColor.b;
}

for (let i = 0; i < starCount; i += 1) {
  resetStar(i);
  starSideSpeeds[i] = rand(3.5, 9.5) * (i % 9 === 0 ? -0.45 : 1);
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    size: 0.95,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
scene.add(stars);

function createNebulaTexture(stops) {
  const texCanvas = document.createElement('canvas');
  texCanvas.width = 256;
  texCanvas.height = 256;
  const ctx = texCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(texCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const nebulaTextures = [
  createNebulaTexture([[0, 'rgba(255,154,66,0.95)'], [0.28, 'rgba(173,68,51,0.34)'], [1, 'rgba(0,0,0,0)']]),
  createNebulaTexture([[0, 'rgba(90,231,255,0.72)'], [0.34, 'rgba(39,124,142,0.22)'], [1, 'rgba(0,0,0,0)']]),
  createNebulaTexture([[0, 'rgba(210,113,255,0.48)'], [0.28, 'rgba(84,44,116,0.20)'], [1, 'rgba(0,0,0,0)']]),
];

const nebulae = [];
for (let i = 0; i < 9; i += 1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: pick(nebulaTextures),
    transparent: true,
    opacity: rand(0.14, 0.32),
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.position.set(rand(-150, 150), rand(-105, 110), rand(-720, -160));
  const scale = rand(72, 160);
  sprite.scale.set(scale, scale * rand(0.58, 1.18), 1);
  sprite.userData.spin = rand(-0.04, 0.04);
  scene.add(sprite);
  nebulae.push(sprite);
}

function makeAsteroidGeometry(radius) {
  const geometry = new THREE.IcosahedronGeometry(radius, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    tmpVector.fromBufferAttribute(position, i).normalize();
    const crag = 0.72 + Math.random() * 0.48;
    const ridge = Math.sin(tmpVector.x * 7.1 + tmpVector.y * 4.3) * 0.12;
    position.setXYZ(i, tmpVector.x * radius * (crag + ridge), tmpVector.y * radius * (crag - ridge * 0.4), tmpVector.z * radius * (crag + ridge * 0.7));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addGlowPanel(parent, x, y, z, sx, sy, sz, material = materials.stationGlow) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  panel.position.set(x, y, z);
  parent.add(panel);
  return panel;
}

function addDockBlock(parent, x, y, z, sx, sy, sz, material = materials.dockHull) {
  const block = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  block.position.set(x, y, z);
  parent.add(block);
  return block;
}

function createStationSignTexture(name, type) {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 768;
  signCanvas.height = 192;
  const ctx = signCanvas.getContext('2d');
  ctx.clearRect(0, 0, signCanvas.width, signCanvas.height);

  const accent = type === 'mega' ? '#ffc56f' : type === 'large' ? '#8ffcff' : '#67f0ff';
  const label = name.toUpperCase();
  let fontSize = 58;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
    fontSize -= 2;
  } while (ctx.measureText(label).width > 650 && fontSize > 34);

  const glow = ctx.createLinearGradient(54, 0, 714, 0);
  glow.addColorStop(0, 'rgba(104, 238, 255, 0)');
  glow.addColorStop(0.5, 'rgba(104, 238, 255, 0.28)');
  glow.addColorStop(1, 'rgba(104, 238, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(30, 24, 708, 144);

  ctx.strokeStyle = 'rgba(104, 238, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 34, 672, 124);
  ctx.strokeStyle = 'rgba(255, 181, 86, 0.34)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(66, 50, 636, 92);

  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  ctx.fillStyle = accent;
  ctx.fillText(label, 384, 88);
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 384, 88);

  ctx.shadowColor = '#55e6ff';
  ctx.shadowBlur = 16;
  ctx.font = '700 22px Inter, Arial, sans-serif';
  ctx.fillStyle = 'rgba(214, 251, 255, 0.88)';
  ctx.fillText('APPROACH BAY OPEN', 384, 132);

  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addStationSign(parent, name, width, height, depth, type) {
  addDockBlock(parent, 0, height * 0.66, depth * 0.58, width * 0.78, 0.85, 0.28, materials.dockDark);
  const texture = createStationSignTexture(name, type);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  material.userData.temporary = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.72, 2.05), material);
  sign.position.set(0, height * 0.66, depth * 0.75);
  parent.add(sign);
  return sign;
}

function createAsteroid() {
  const roll = Math.random();
  const sizeClass = roll < 0.32 ? 'small' : roll < 0.76 ? 'medium' : 'large';
  const baseSize = sizeClass === 'small' ? rand(0.9, 1.55) : sizeClass === 'medium' ? rand(1.75, 2.85) : rand(3.15, 4.65);
  const size = baseSize + state.wave * (sizeClass === 'large' ? 0.08 : 0.04);
  const hp = sizeClass === 'small'
    ? 1.15 + state.wave * 0.08
    : sizeClass === 'medium'
      ? 3.25 + state.wave * 0.22
      : 7.8 + state.wave * 0.48;
  const impactDamage = sizeClass === 'small'
    ? 14 + state.wave * 0.4
    : sizeClass === 'medium'
      ? 27 + state.wave * 0.8
      : 48 + state.wave * 1.25;
  const mesh = new THREE.Mesh(makeAsteroidGeometry(size), pick(materials.asteroid));
  mesh.position.set(rand(-18, 18), rand(-10, 11), rand(-185, -120));
  mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  mesh.userData = {
    kind: 'asteroid',
    sizeClass,
    radius: size * 0.9,
    spin: new THREE.Vector3(rand(-1.2, 1.2), rand(-1.2, 1.2), rand(-1.2, 1.2)),
    hp,
    impactDamage,
    value: Math.round(size * (sizeClass === 'large' ? 72 : sizeClass === 'medium' ? 52 : 38)),
    speedScale: rand(0.82, 1.16),
    passed: false,
  };
  scene.add(mesh);
  state.objects.push(mesh);
  return mesh;
}

function createDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.05, 3.1, 4), materials.drone);
  body.rotation.x = -Math.PI / 2;
  group.add(body);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.44, 3.2), materials.droneWing);
  group.add(spine);

  const wingGeometry = new THREE.BoxGeometry(3.6, 0.22, 0.8);
  const wingA = new THREE.Mesh(wingGeometry, materials.droneWing);
  wingA.position.set(0, -0.15, -0.25);
  wingA.rotation.z = 0.16;
  group.add(wingA);

  const wingB = wingA.clone();
  wingB.rotation.z = -0.16;
  group.add(wingB);

  const engine = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), materials.droneGlow);
  engine.position.set(0, -0.02, 1.42);
  group.add(engine);

  group.position.set(rand(-16, 16), rand(-8.5, 10), rand(-170, -115));
  group.rotation.set(rand(-0.24, 0.24), rand(-0.4, 0.4), rand(-0.18, 0.18));
  group.userData = {
    kind: 'drone',
    radius: 1.65,
    hp: state.wave > 4 ? 2 : 1,
    value: 180 + state.wave * 18,
    speedScale: rand(0.98, 1.28),
    strafe: rand(0.7, 1.6),
    phase: rand(0, Math.PI * 2),
    shot: rand(0.8, 1.7),
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
  return group;
}

function createCollector() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 10, 42), materials.collect);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.54, 0), materials.collect);
  group.add(ring, core);
  group.position.set(rand(-13, 13), rand(-8, 8), rand(-145, -110));
  group.userData = {
    kind: 'collector',
    radius: 1.7,
    hp: 1,
    value: 90,
    speedScale: 1,
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
}

function createStation() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(10, 3.8, 7), materials.station);
  group.add(core);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.55, 14, 58), materials.stationDark);
  ring.position.z = -0.9;
  group.add(ring);

  const armGeometry = new THREE.BoxGeometry(18, 0.7, 1.1);
  const armA = new THREE.Mesh(armGeometry, materials.station);
  const armB = armA.clone();
  armB.rotation.z = Math.PI / 2;
  group.add(armA, armB);

  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    addGlowPanel(group, Math.cos(angle) * 8.4, Math.sin(angle) * 8.4, 0.2, 0.36, 0.72, 0.14, i % 3 ? materials.stationGlow : materials.amberGlow);
  }

  addGlowPanel(group, -2.8, 2.2, 3.75, 1.7, 0.26, 0.18, materials.stationGlow);
  addGlowPanel(group, 2.7, -2.1, 3.75, 1.5, 0.26, 0.18, materials.amberGlow);

  const side = Math.random() > 0.5 ? 1 : -1;
  group.position.set(side * rand(18, 34), rand(-7, 11), rand(-335, -245));
  group.rotation.set(rand(-0.2, 0.2), side * rand(0.28, 0.62), rand(-0.3, 0.3));
  const scale = rand(0.9, 1.45);
  group.scale.setScalar(scale);
  group.userData = {
    kind: 'station',
    radius: 10 * scale,
    hp: 999,
    value: 0,
    speedScale: 0.5,
    drift: side * rand(0.8, 1.8),
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
}

function createDockStation(type = getStationType()) {
  const group = new THREE.Group();
  const scale = type === 'mega' ? 1.75 : type === 'large' ? 1.32 : 1;
  const width = type === 'mega' ? 28 : type === 'large' ? 22 : 17;
  const height = type === 'mega' ? 15 : type === 'large' ? 12 : 9;
  const depth = type === 'mega' ? 12 : type === 'large' ? 10 : 8;
  const stationName = getStationName(state.save.route, type);

  addDockBlock(group, 0, height * 0.42, 0, width, 2.2, depth, materials.dockHull);
  addDockBlock(group, 0, -height * 0.42, 0, width, 2.2, depth, materials.dockHull);
  addDockBlock(group, -width * 0.47, 0, 0, 2.4, height, depth, materials.dockHull);
  addDockBlock(group, width * 0.47, 0, 0, 2.4, height, depth, materials.dockHull);
  addStationSign(group, stationName, width, height, depth, type);

  const railX = width * 0.33;
  const railY = height * 0.24;
  const tunnelLength = depth * 2.35;
  const tunnelFront = depth * 0.96;
  for (const x of [-railX, railX]) {
    for (const y of [-railY, railY]) {
      addDockBlock(group, x, y, tunnelFront, 0.34, 0.34, tunnelLength, materials.dockDark);
    }
  }

  for (let i = 0; i < 6; i += 1) {
    const z = -depth * 0.28 + i * (tunnelLength / 5);
    const material = i % 2 ? materials.dockHull : materials.dockDark;
    addDockBlock(group, 0, railY, z, railX * 2.08, 0.22, 0.42, material);
    addDockBlock(group, 0, -railY, z, railX * 2.08, 0.22, 0.42, material);
    addDockBlock(group, -railX, 0, z, 0.22, railY * 2.08, 0.42, material);
    addDockBlock(group, railX, 0, z, 0.22, railY * 2.08, 0.42, material);
  }

  addDockBlock(group, 0, height * 0.22, -depth * 0.62, width * 0.55, 0.26, 0.34, materials.dockDark);
  addDockBlock(group, 0, -height * 0.22, -depth * 0.62, width * 0.55, 0.26, 0.34, materials.dockDark);
  addDockBlock(group, -width * 0.28, 0, -depth * 0.62, 0.26, height * 0.44, 0.34, materials.dockDark);
  addDockBlock(group, width * 0.28, 0, -depth * 0.62, 0.26, height * 0.44, 0.34, materials.dockDark);

  addDockBlock(group, 0, 0, -1.2, width * 0.62, 0.62, depth * 1.2, materials.dockRunway);
  addDockBlock(group, 0, 1.32, -1.1, width * 0.42, 0.22, depth * 1.24, materials.dockWarning);
  addDockBlock(group, 0, -1.32, -1.1, width * 0.42, 0.22, depth * 1.24, materials.dockWarning);

  for (let i = 0; i < 10 + (type === 'mega' ? 10 : type === 'large' ? 5 : 0); i += 1) {
    const side = i % 2 ? -1 : 1;
    const x = side * rand(width * 0.58, width * 0.86);
    const y = rand(-height * 0.46, height * 0.46);
    const z = rand(-depth * 0.85, depth * 0.45);
    addDockBlock(group, x, y, z, rand(1.1, 3.8), rand(0.8, 2.4), rand(1.5, 4.5), i % 4 === 0 ? materials.dockDark : materials.dockHull);
  }

  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 ? -1 : 1;
    const y = -height * 0.42 + (i % 9) * (height * 0.84 / 8);
    const material = i % 3 === 0 ? materials.dockWarning : materials.dockRunway;
    addGlowPanel(group, side * width * 0.36, y, depth * 0.52, 0.32, 0.22, 0.18, material);
  }

  if (type !== 'small') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(width * 0.42, 0.36, 12, 52), materials.dockDark);
    ring.position.z = -depth * 0.48;
    ring.rotation.z = Math.PI / 2;
    group.add(ring);
  }

  if (type === 'mega') {
    for (let i = 0; i < 4; i += 1) {
      const arm = addDockBlock(group, 0, 0, -depth * 0.72, width * 1.15, 0.58, 1.2, materials.dockDark);
      arm.rotation.z = i * Math.PI / 4;
    }
  }

  group.position.set(0, 0, -205);
  group.scale.setScalar(scale);
  group.userData = {
    kind: 'dock',
    stationType: type,
    stationName,
    radius: width * scale * 0.55,
    hp: 999,
    speedScale: 0.82,
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
  state.dockObject = group;
  state.docking = true;
  return group;
}

function createBeam(start, end, material = beamMaterial, ttl = 0.12) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, material.clone());
  line.userData.ttl = ttl;
  line.userData.life = ttl;
  scene.add(line);
  state.beams.push(line);
  return line;
}

function worldToScreen(position) {
  tmpVector.copy(position).project(camera);
  if (tmpVector.z < -1 || tmpVector.z > 1) return null;
  return {
    x: (tmpVector.x * 0.5 + 0.5) * window.innerWidth,
    y: (-tmpVector.y * 0.5 + 0.5) * window.innerHeight,
    ndcX: tmpVector.x,
    ndcY: tmpVector.y,
  };
}

function getTurretAnchors() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return [
    { x: w * 0.355, y: h * 0.59 },
    { x: w * 0.645, y: h * 0.59 },
  ];
}

function getThreatScore(object, playerX, playerY) {
  const data = object.userData;
  if (!['asteroid', 'drone'].includes(data.kind)) return -Infinity;
  if (object.position.z > 4 || object.position.z < -155) return -Infinity;
  const stats = getShipStats();
  const speed = Math.max(10, state.speed * data.speedScale);
  const timeToImpact = Math.max(0.1, (-1.5 - object.position.z) / speed);
  const lateral = Math.hypot(object.position.x - playerX, object.position.y - playerY);
  const threatRadius = data.radius + 3.4 + stats.lockAssist * 0.55;
  const pathThreat = clamp(1 - lateral / threatRadius, 0, 1);
  if (pathThreat <= 0.02 && object.position.z > -65) return -Infinity;
  const urgency = clamp(1 - timeToImpact / 3.6, 0, 1);
  const centerBias = clamp(1 - Math.hypot(object.position.x, object.position.y) / 25, 0, 1);
  const droneBonus = data.kind === 'drone' ? 0.22 : 0;
  return pathThreat * 110 + urgency * 70 + centerBias * 22 + droneBonus * 40 - timeToImpact * 4;
}

function acquireTarget() {
  const playerX = state.player.x * 11;
  const playerY = state.player.y * 7.5;
  let best = null;
  let bestScore = -Infinity;
  for (const object of state.objects) {
    const score = getThreatScore(object, playerX, playerY);
    if (score > bestScore) {
      bestScore = score;
      best = object;
    }
  }

  if (!best) {
    const aimNdc = getAimNdc();
    let bestDistance = Infinity;
    for (const object of state.objects) {
      if (!['asteroid', 'drone'].includes(object.userData.kind) || object.position.z > -4) continue;
      object.getWorldPosition(tmpVectorB);
      const screen = worldToScreen(tmpVectorB);
      if (!screen) continue;
      const dx = screen.ndcX - aimNdc.x;
      const dy = screen.ndcY - aimNdc.y;
      const distance = Math.hypot(dx, dy);
      const threshold = 0.24 + getShipStats().lockAssist * 0.018;
      if (distance < threshold && distance < bestDistance) {
        bestDistance = distance;
        best = object;
      }
    }
  }

  state.lockedTarget = best;
  if (best) {
    best.getWorldPosition(tmpVectorB);
    state.lockedScreen = worldToScreen(tmpVectorB);
  } else {
    state.lockedScreen = null;
  }
  return best;
}

function addLaserBurst(targetScreen) {
  const anchors = getTurretAnchors();
  state.laserBursts.push({
    anchors,
    target: targetScreen,
    ttl: 0.18,
    life: 0.18,
  });
}

function drawLaserOverlay(delta) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = laserCanvas.width / dpr;
  const height = laserCanvas.height / dpr;
  laserCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  laserCtx.clearRect(0, 0, width, height);

  const anchors = getTurretAnchors();
  const target = state.lockedScreen || {
    x: window.innerWidth * 0.5 + state.target.x * window.innerWidth * 0.23,
    y: window.innerHeight * 0.46 - state.target.y * window.innerHeight * 0.18,
  };
  const lockStrength = state.lockedTarget ? 1 : 0.32;

  for (const anchor of anchors) {
    const angle = Math.atan2(target.y - anchor.y, target.x - anchor.x);
    laserCtx.save();
    laserCtx.translate(anchor.x, anchor.y);
    laserCtx.rotate(angle);
    laserCtx.fillStyle = `rgba(14, 28, 34, ${0.64 + lockStrength * 0.18})`;
    laserCtx.strokeStyle = `rgba(124, 232, 255, ${0.18 + lockStrength * 0.34})`;
    laserCtx.lineWidth = 1.2;
    laserCtx.shadowColor = state.lockedTarget ? 'rgba(85, 230, 255, 0.86)' : 'rgba(85, 230, 255, 0.32)';
    laserCtx.shadowBlur = state.lockedTarget ? 18 : 8;
    laserCtx.beginPath();
    if (laserCtx.roundRect) laserCtx.roundRect(-9, -6, 27, 12, 5);
    else laserCtx.rect(-9, -6, 27, 12);
    laserCtx.fill();
    laserCtx.stroke();
    laserCtx.fillStyle = state.lockedTarget ? 'rgba(255, 210, 130, 0.96)' : 'rgba(130, 246, 255, 0.56)';
    laserCtx.beginPath();
    laserCtx.arc(18, 0, 4 + lockStrength * 2, 0, Math.PI * 2);
    laserCtx.fill();
    laserCtx.restore();
  }

  if (state.lockedScreen && state.running) {
    laserCtx.save();
    laserCtx.strokeStyle = `rgba(85, 230, 255, ${0.13 + lockStrength * 0.12})`;
    laserCtx.lineWidth = 1;
    laserCtx.setLineDash([4, 7]);
    for (const anchor of anchors) {
      laserCtx.beginPath();
      laserCtx.moveTo(anchor.x, anchor.y);
      laserCtx.lineTo(state.lockedScreen.x, state.lockedScreen.y);
      laserCtx.stroke();
    }
    laserCtx.setLineDash([]);
    laserCtx.strokeStyle = 'rgba(255, 190, 96, 0.66)';
    laserCtx.lineWidth = 1.3;
    laserCtx.beginPath();
    laserCtx.arc(state.lockedScreen.x, state.lockedScreen.y, 18, 0, Math.PI * 2);
    laserCtx.stroke();
    laserCtx.restore();
  }

  for (let i = state.laserBursts.length - 1; i >= 0; i -= 1) {
    const burst = state.laserBursts[i];
    burst.life -= delta;
    const alpha = clamp(burst.life / burst.ttl, 0, 1);
    for (const anchor of burst.anchors) {
      const gradient = laserCtx.createLinearGradient(anchor.x, anchor.y, burst.target.x, burst.target.y);
      gradient.addColorStop(0, `rgba(255, 244, 208, ${alpha})`);
      gradient.addColorStop(0.35, `rgba(82, 235, 255, ${alpha * 0.95})`);
      gradient.addColorStop(1, `rgba(255, 121, 68, ${alpha * 0.9})`);
      laserCtx.save();
      laserCtx.globalCompositeOperation = 'lighter';
      laserCtx.strokeStyle = `rgba(122, 236, 255, ${alpha * 0.24})`;
      laserCtx.lineWidth = 13;
      laserCtx.lineCap = 'round';
      laserCtx.beginPath();
      laserCtx.moveTo(anchor.x, anchor.y);
      laserCtx.lineTo(burst.target.x, burst.target.y);
      laserCtx.stroke();
      laserCtx.strokeStyle = gradient;
      laserCtx.lineWidth = 4.2;
      laserCtx.beginPath();
      laserCtx.moveTo(anchor.x, anchor.y);
      laserCtx.lineTo(burst.target.x, burst.target.y);
      laserCtx.stroke();
      laserCtx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      laserCtx.lineWidth = 1.2;
      laserCtx.beginPath();
      laserCtx.moveTo(anchor.x, anchor.y);
      laserCtx.lineTo(burst.target.x, burst.target.y);
      laserCtx.stroke();
      laserCtx.restore();
    }
    if (burst.life <= 0) state.laserBursts.splice(i, 1);
  }
}

function resetStationTraffic() {
  state.stationTraffic = Array.from({ length: 8 }, (_, index) => ({
    x: rand(0.05, 0.95),
    y: rand(0.16, 0.72),
    speed: rand(0.018, 0.055) * (index % 2 ? 1 : -1),
    size: rand(0.65, 1.35),
    color: pick(['#55e6ff', '#ffb352', '#7dff9d', '#ffffff']),
  }));
}

function drawStationWindow(delta = 0) {
  if (!stationWindowCanvas || !stationWindowCtx) return;
  const rect = stationWindowCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || stationWindowCanvas.clientWidth || 320));
  const cssHeight = Math.max(1, Math.round(rect.height || stationWindowCanvas.clientHeight || 180));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (stationWindowCanvas.width !== pixelWidth || stationWindowCanvas.height !== pixelHeight) {
    stationWindowCanvas.width = pixelWidth;
    stationWindowCanvas.height = pixelHeight;
  }

  if (!state.stationTraffic.length) resetStationTraffic();
  state.stationWindowTime += delta;
  const t = state.stationWindowTime;
  const ctx = stationWindowCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const sky = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  sky.addColorStop(0, '#020713');
  sky.addColorStop(0.55, '#07121b');
  sky.addColorStop(1, '#140a10');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const nebula = ctx.createRadialGradient(cssWidth * 0.62, cssHeight * 0.18, 4, cssWidth * 0.62, cssHeight * 0.18, cssWidth * 0.52);
  nebula.addColorStop(0, 'rgba(90, 231, 255, 0.22)');
  nebula.addColorStop(0.45, 'rgba(173, 70, 59, 0.12)');
  nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  for (let i = 0; i < 76; i += 1) {
    const x = (i * 83 + t * (10 + (i % 5) * 2)) % (cssWidth + 24) - 12;
    const y = (i * 47 + Math.sin(t * 0.18 + i) * 9) % cssHeight;
    const alpha = 0.26 + (i % 4) * 0.12;
    ctx.fillStyle = `rgba(220, 248, 255, ${alpha})`;
    ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(85, 230, 255, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = cssHeight * (0.42 + i * 0.12) + Math.sin(t * 0.25 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(cssWidth * 0.12, y);
    ctx.bezierCurveTo(cssWidth * 0.35, y - 22, cssWidth * 0.62, y + 24, cssWidth * 0.9, y - 8);
    ctx.stroke();
  }
  ctx.restore();

  for (const ship of state.stationTraffic) {
    ship.x += ship.speed * delta;
    if (ship.x < -0.12) ship.x = 1.14;
    if (ship.x > 1.14) ship.x = -0.12;
    const x = ship.x * cssWidth;
    const y = ship.y * cssHeight + Math.sin(t * 0.9 + ship.size * 3) * 3;
    const size = ship.size * Math.min(cssWidth, cssHeight) * 0.055;
    const dir = ship.speed >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.globalCompositeOperation = 'lighter';
    const trail = ctx.createLinearGradient(-size * 2.2, 0, -size * 0.1, 0);
    trail.addColorStop(0, 'rgba(85, 230, 255, 0)');
    trail.addColorStop(1, 'rgba(85, 230, 255, 0.5)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = Math.max(1, size * 0.18);
    ctx.beginPath();
    ctx.moveTo(-size * 2.1, 0);
    ctx.lineTo(-size * 0.25, 0);
    ctx.stroke();

    ctx.fillStyle = 'rgba(229, 248, 255, 0.92)';
    ctx.strokeStyle = ship.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.82, 0);
    ctx.lineTo(-size * 0.55, -size * 0.36);
    ctx.lineTo(-size * 0.28, 0);
    ctx.lineTo(-size * 0.55, size * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(3, 8, 12, 0.34)';
  ctx.fillRect(0, cssHeight * 0.78, cssWidth, cssHeight * 0.22);
  ctx.strokeStyle = 'rgba(124, 232, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cssWidth * 0.5, 0);
  ctx.lineTo(cssWidth * 0.5, cssHeight);
  ctx.moveTo(0, cssHeight * 0.78);
  ctx.lineTo(cssWidth, cssHeight * 0.78);
  ctx.stroke();
}

function createExplosion(position, color = 0xffa356, count = 26) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push(new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)).normalize().multiplyScalar(rand(5, 18)));
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = particleMaterial.clone();
  material.color.set(color);
  const points = new THREE.Points(geometry, material);
  points.userData = { ttl: 0.68, life: 0.68, velocities };
  scene.add(points);
  state.particles.push(points);
}

function removeObject(object) {
  scene.remove(object);
  const disposeTemporaryMaterial = (material) => {
    if (!material?.userData?.temporary) return;
    material.map?.dispose?.();
    material.dispose?.();
  };
  object.traverse?.((child) => {
    if (child.geometry && child !== object) child.geometry.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(disposeTemporaryMaterial);
    else disposeTemporaryMaterial(child.material);
  });
  if (object.geometry) object.geometry.dispose();
}

function clearDynamicScene() {
  for (const object of state.objects) removeObject(object);
  for (const beam of state.beams) {
    scene.remove(beam);
    beam.geometry.dispose();
    beam.material.dispose();
  }
  for (const particle of state.particles) {
    scene.remove(particle);
    particle.geometry.dispose();
    particle.material.dispose();
  }
  state.objects.length = 0;
  state.beams.length = 0;
  state.particles.length = 0;
  state.laserBursts.length = 0;
  state.lockedTarget = null;
  state.lockedScreen = null;
}

function setGameState(nextState) {
  gameEl.dataset.state = nextState;
  document.documentElement.dataset.gameState = nextState;
}

function clearDockTransition() {
  for (const timer of dockTransitionTimers) window.clearTimeout(timer);
  dockTransitionTimers = [];
  state.dockTransitioning = false;
  dockTransitionEl?.classList.remove('active');
  dockTransitionEl?.classList.add('hidden');
  dockTransitionEl?.setAttribute('aria-hidden', 'true');
}

function queueDockTransition(callback, delay) {
  const timer = window.setTimeout(() => {
    dockTransitionTimers = dockTransitionTimers.filter((item) => item !== timer);
    callback();
  }, delay);
  dockTransitionTimers.push(timer);
}

function beginDockingTransition(type = getStationType()) {
  if (state.dockTransitioning || state.docked) return;
  state.dockTransitioning = true;
  state.running = false;
  state.docking = true;
  state.firing = false;
  state.firePointerId = null;
  state.movementPointerId = null;
  state.pointerDown = false;
  hudEl.classList.add('hidden');
  fireButton.classList.add('hidden');
  reticleEl.classList.add('hidden');
  dockTransitionEl?.classList.remove('hidden');
  dockTransitionEl?.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => dockTransitionEl?.classList.add('active'));

  queueDockTransition(() => {
    openStation(type);
    queueDockTransition(() => dockTransitionEl?.classList.remove('active'), DOCK_HOLD_MS);
    queueDockTransition(() => {
      dockTransitionEl?.classList.add('hidden');
      dockTransitionEl?.setAttribute('aria-hidden', 'true');
      state.dockTransitioning = false;
    }, DOCK_HOLD_MS + DOCK_FADE_OUT_MS);
  }, DOCK_FADE_IN_MS);
}

function clearResultLock() {
  window.clearTimeout(resultUnlockTimeout);
  window.clearInterval(resultCountdownTimer);
  resultUnlockTimeout = 0;
  resultCountdownTimer = 0;
  if (state.confiscated) {
    state.resultLocked = true;
    restartButton.disabled = true;
    restartButton.textContent = 'Ship Confiscated';
    if (resultLockText) resultLockText.textContent = 'Debt limit exceeded';
    if (resultLockBar) resultLockBar.style.transform = 'scaleX(1)';
    return;
  }
  state.resultLocked = false;
  restartButton.disabled = false;
  restartButton.textContent = 'Relaunch';
  if (resultLockText) resultLockText.textContent = 'Telemetry saved';
  if (resultLockBar) resultLockBar.style.transform = 'scaleX(1)';
}

function lockResultScreen(duration = RESULT_LOCK_MS) {
  window.clearTimeout(resultUnlockTimeout);
  window.clearInterval(resultCountdownTimer);
  const unlockAt = performance.now() + duration;
  state.resultLocked = true;
  restartButton.disabled = true;

  const update = () => {
    const remainingMs = Math.max(0, unlockAt - performance.now());
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const progress = clamp(1 - remainingMs / duration, 0, 1);
    restartButton.textContent = `Telemetry ${seconds}`;
    if (resultLockText) resultLockText.textContent = 'Saving telemetry';
    if (resultLockBar) resultLockBar.style.transform = `scaleX(${progress})`;
  };

  update();
  resultCountdownTimer = window.setInterval(update, 100);
  resultUnlockTimeout = window.setTimeout(clearResultLock, duration);
}

function setStationTerminalOpen(open) {
  state.stationTerminalOpen = open;
  stationEl.classList.toggle('terminal-open', open);
  stationTerminalPanel?.classList.toggle('hidden', !open);
  stationTerminalHotspot?.setAttribute('aria-expanded', String(open));
  if (open) renderStationPanel();
}

function onStationPointerDown(event) {
  if (stationEl.classList.contains('hidden')) return;
  const inTerminal = stationTerminalPanel?.contains(event.target);
  if (state.stationTerminalOpen && !inTerminal) setStationTerminalOpen(false);
  event.stopPropagation();
}

function renderSettingsState() {
  if (soundState) soundState.textContent = state.settings.sound ? 'On' : 'Off';
  if (musicState) musicState.textContent = state.settings.music ? 'On' : 'Off';
  if (hapticsState) hapticsState.textContent = state.settings.haptics ? 'On' : 'Off';
}

function showModal(modal) {
  if (!modal) return;
  closeAllModals();
  state.modal = modal.id;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  renderSettingsState();
  if (modal === debugModal) renderDebugMediaList();
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (state.modal === modal.id) state.modal = null;
}

function closeAllModals() {
  for (const modal of [settingsModal, resetModal, debugModal]) closeModal(modal);
}

function ensureAudioContext() {
  if (!state.audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.audio.context = new AudioContextClass();
  }
  if (state.audio.context.state === 'suspended') state.audio.context.resume().catch(() => {});
  return state.audio.context;
}

function playSfx(kind = 'click') {
  if (!state.settings.sound) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  const config = {
    click: [420, 0.035, 0.018, 'triangle'],
    buy: [720, 0.09, 0.035, 'sine'],
    laser: [980, 0.08, 0.028, 'sawtooth'],
    dock: [180, 0.26, 0.045, 'sine'],
    error: [120, 0.14, 0.040, 'square'],
  }[kind] || [420, 0.035, 0.018, 'triangle'];
  osc.type = config[3];
  osc.frequency.setValueAtTime(config[0], now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, config[0] * 0.62), now + config[1]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(config[2], now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config[1]);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + config[1] + 0.02);
}

function haptic(pattern) {
  if (!state.settings.haptics || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

function hapticImpact(amount, severity = 0.5) {
  if (amount >= 42 || severity > 0.78) {
    haptic([45, 35, 70]);
  } else if (amount >= 22 || severity > 0.42) {
    haptic([24, 24, 34]);
  } else {
    haptic(18);
  }
}

function stopMusic() {
  for (const node of state.audio.musicNodes) {
    try {
      node.stop?.();
      node.disconnect?.();
    } catch {}
  }
  state.audio.musicNodes.length = 0;
  state.audio.musicGain?.disconnect?.();
  state.audio.musicGain = null;
  state.audio.musicRunning = false;
}

function startMusic() {
  if (!state.settings.music || state.audio.musicRunning) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.024, now + 1.2);
  gain.connect(ctx.destination);

  const notes = [82.41, 123.47, 164.81, 246.94];
  const nodes = [];
  for (const [index, freq] of notes.entries()) {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = index % 2 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.035 + index * 0.012, now);
    lfoGain.gain.setValueAtTime(freq * 0.012, now);
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(gain);
    osc.start(now);
    lfo.start(now);
    nodes.push(osc, lfo, lfoGain);
  }

  state.audio.musicGain = gain;
  state.audio.musicNodes = nodes;
  state.audio.musicRunning = true;
}

function syncMusic() {
  if (state.settings.music) startMusic();
  else stopMusic();
}

function toggleSound() {
  state.settings.sound = !state.settings.sound;
  saveSettings();
  renderSettingsState();
  playSfx(state.settings.sound ? 'buy' : 'click');
}

function toggleMusic() {
  state.settings.music = !state.settings.music;
  saveSettings();
  renderSettingsState();
  if (state.settings.music) {
    playSfx('buy');
    startMusic();
  } else {
    playSfx('click');
    stopMusic();
  }
}

function toggleHaptics() {
  state.settings.haptics = !state.settings.haptics;
  saveSettings();
  renderSettingsState();
  if (state.settings.haptics) haptic([12, 30, 12]);
  playSfx('click');
}

function resetProgress() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(BEST_KEY);
  localStorage.removeItem(LEGACY_BEST_KEY);
  clearResultLock();
  clearDockTransition();
  clearDynamicScene();
  state.save = makeDefaultSave();
  state.best = 0;
  state.score = 0;
  state.lastRepairBill = 0;
  state.lastRepairPaid = 0;
  state.lastDebtAdded = 0;
  state.confiscated = false;
  state.currentPayout = 0;
  state.routeDistance = 0;
  state.routeLength = getRouteLength();
  state.running = false;
  state.docking = false;
  state.docked = false;
  state.firing = false;
  state.pointerDown = false;
  state.firePointerId = null;
  state.movementPointerId = null;
  state.shield = getShipStats().maxShield;
  state.heat = 0;
  state.wave = 1;
  menuEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
  stationEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  fireButton.classList.add('hidden');
  reticleEl.classList.add('hidden');
  closeAllModals();
  setGameState('menu');
  updateHud();
  renderMenuAchievements();
  playSfx('dock');
}

function debugSkipToDepot() {
  closeAllModals();
  clearResultLock();
  clearDockTransition();
  clearDynamicScene();
  const stats = getShipStats();
  state.running = true;
  state.docked = false;
  state.docking = false;
  state.firing = false;
  state.pointerDown = false;
  state.routeLength = Math.max(60, getRouteLength());
  state.routeDistance = state.routeLength;
  state.currentPayout = getDeliveryPayout();
  state.shield = Math.max(1, state.shield || stats.maxShield);
  state.heat = 0;
  menuEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  stationEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  reticleEl.classList.remove('hidden');
  fireButton.classList.remove('hidden');
  setGameState('playing');
  updateHud();
  playSfx('dock');
  beginDockingTransition(getStationType(state.save.route));
}

function getStoryBoard() {
  if (!state.save.story || state.save.story.schema !== 2) state.save.story = normalizeStory(state.save.story);
  return state.save.story;
}

function getActiveStory() {
  const board = getStoryBoard();
  return board.quests?.[board.activeId] || null;
}

function getStoryArc(story = getActiveStory()) {
  return STORY_ARCS.find((arc) => arc.id === story?.kind) || STORY_ARCS[0];
}

function getStoryTitle(story = getActiveStory()) {
  if (!story) return 'Quest Board';
  return getStoryArc(story).title(story.target);
}

function isQuestAvailable(kind) {
  const board = getStoryBoard();
  if (kind === 'identity') return true;
  return board.completed.includes('identity');
}

function getQuestStatus(kind) {
  const board = getStoryBoard();
  const quest = board.quests?.[kind];
  if (!quest) return 'locked';
  if (quest.complete || board.completed.includes(kind)) return 'completed';
  if (board.activeId === kind) return 'active';
  return isQuestAvailable(kind) ? 'available' : 'locked';
}

function setActiveQuest(kind) {
  const board = getStoryBoard();
  if (!board.quests?.[kind] || !isQuestAvailable(kind) || board.quests[kind].complete) return false;
  board.activeId = kind;
  board.quests[kind].lastMessage ||= getStoryMessage(board.quests[kind]);
  saveProgress();
  renderMenuAchievements();
  updateStationUi(state.currentPayout, state.lastStationType, `${getStoryTitle(board.quests[kind])} selected.`);
  return true;
}

function getStoryPhase(story = getActiveStory()) {
  if (!story) return 'cold';
  if (story.complete || story.progress >= story.goal - 1) return 'final';
  const ratio = story.progress / Math.max(1, story.goal);
  return ratio >= 0.36 ? 'warm' : 'cold';
}

function getStoryMedia(story = getActiveStory()) {
  if (!story) return STORY_MEDIA[0];
  const phase = getStoryPhase(story);
  const video = STORY_MEDIA.find((item) => item.type === 'video' && item.src && item.storyKinds.includes(story.kind) && item.phase === phase);
  if (video) return video;
  return STORY_MEDIA.find((item) => item.storyKinds.includes(story.kind) && item.phase === phase)
    || STORY_MEDIA.find((item) => item.storyKinds.includes(story.kind))
    || STORY_MEDIA[0];
}

function createMediaFrame(item, className = 'story-media-frame') {
  const frame = document.createElement('div');
  frame.className = className;
  frame.dataset.mediaId = item.id;

  if (item.src) {
    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.autoplay = true;
      video.preload = 'metadata';
      frame.append(video);
    } else {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      img.loading = 'lazy';
      frame.append(img);
    }
  }

  const label = document.createElement('span');
  label.className = className === 'story-media-frame' ? 'story-media-id' : '';
  label.textContent = item.id;
  frame.append(label);
  return frame;
}

function renderDebugMediaList() {
  if (!debugMediaList) return;
  debugMediaList.innerHTML = '';
  if (debugMediaCount) debugMediaCount.textContent = String(DEBUG_MEDIA.length);

  for (const item of DEBUG_MEDIA) {
    const card = document.createElement('article');
    card.className = 'media-debug-card';
    const thumb = createMediaFrame(item, 'media-debug-thumb');
    const meta = document.createElement('div');
    meta.className = 'media-debug-meta';

    const title = document.createElement('h3');
    title.textContent = `${item.id} ${item.title}`;
    const type = document.createElement('p');
    type.textContent = `${item.type.toUpperCase()} | ${item.generator}`;
    const path = document.createElement('code');
    path.textContent = item.src || item.plannedPath || 'pending asset path';
    const prompt = document.createElement('p');
    prompt.textContent = item.notes ? `${item.prompt} ${item.notes}` : item.prompt;

    meta.append(title, type, path, prompt);
    card.append(thumb, meta);
    debugMediaList.append(card);
  }
}

function getStoryMessage(story = getActiveStory()) {
  if (!story) return 'Choose an available quest from the board.';
  const arc = getStoryArc(story);
  if (story.complete) return arc.ending(story.target);
  const progress = clamp(story.progress, 0, story.goal);
  const remaining = Math.max(1, story.goal - progress);
  const ratio = progress / Math.max(1, story.goal);

  if (story.kind === 'identity') {
    if (progress <= 0) return `The ship registry only knows one thing: owner surname ${story.target}. First name scrubbed.`;
    if (progress === 1) return `Autopilot launched this fast cargo ship under emergency seal while you were unconscious.`;
    if (progress === 2) return `Port ledgers say the ${story.target} family ran a shipping line before a syndicate moved in.`;
    if (progress === 3) return `Most ${story.target} family records are missing or sealed. One more cache should unlock the quest board.`;
    return arc.ending(story.target);
  }

  if (progress <= 0) {
    return story.kind === 'blackbox'
      ? 'The escape recorder is fragmented. Run a port search from each dock.'
      : `No live trail for the ${story.target}. Run a port search from each dock.`;
  }

  if (story.kind === 'blackbox') {
    if (ratio < 0.34) return `A weak wreck ping repeats every ${remaining + 4} cycles.`;
    if (ratio < 0.72) return `Escape recorder fragments now point within ${remaining * 9} hours.`;
    return `The next station should expose the final beacon lock.`;
  }

  if (story.kind === 'revenge') {
    if (ratio < 0.34) return `No direct hit, but syndicate aliases repeat within ${remaining + 5} port logs.`;
    if (ratio < 0.72) return `A stale entry for the ${story.target} appears within ${remaining * 8} hours.`;
    return `Fresh dock records put the ${story.target} very close.`;
  }

  if (ratio < 0.34) return `No direct hit, but a family alias repeats within ${remaining + 5} port logs.`;
  if (ratio < 0.72) return `A stale entry for your ${story.target} appears within ${remaining * 8} hours.`;
  return `Fresh dock records put your ${story.target} very close.`;
}

function getAchievementRows(save = state.save) {
  return ACHIEVEMENT_DEFS.map((def) => {
    const progress = Math.max(0, Math.round(def.progress(save) || 0));
    const capped = clamp(progress, 0, def.goal);
    return {
      ...def,
      progress,
      capped,
      unlocked: progress >= def.goal,
      ratio: clamp(progress / Math.max(1, def.goal), 0, 1),
    };
  });
}

function formatProgress(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderMenuAchievements() {
  if (!menuAchievements) return;
  menuAchievements.innerHTML = '';
  const rows = getAchievementRows();
  const unlocked = rows.filter((row) => row.unlocked).length;
  const nextRows = rows
    .filter((row) => !row.unlocked)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  const board = getStoryBoard();
  const story = getActiveStory();

  const head = document.createElement('div');
  head.className = 'menu-achievements-head';
  const title = document.createElement('span');
  title.textContent = 'Achievements';
  const count = document.createElement('strong');
  count.textContent = `${unlocked}/${rows.length}`;
  head.append(title, count);
  menuAchievements.append(head);

  const storyLine = document.createElement('p');
  storyLine.className = 'menu-story-line';
  const completedCount = board.completed.length;
  storyLine.textContent = story
    ? `${getStoryTitle(story)} ${story.progress}/${story.goal}`
    : `Quest Board ${completedCount}/${Object.keys(board.quests).length} complete`;
  menuAchievements.append(storyLine);

  const featured = nextRows.length ? nextRows : rows.filter((row) => row.unlocked).slice(-3);
  for (const row of featured) {
    const item = document.createElement('div');
    item.className = 'menu-achievement-row';
    const label = document.createElement('span');
    label.textContent = row.title;
    const progress = document.createElement('strong');
    progress.textContent = row.unlocked ? 'Done' : `${formatProgress(row.capped)}/${formatProgress(row.goal)}`;
    item.append(label, progress);
    menuAchievements.append(item);
  }
}

function renderAchievements() {
  upgradeList.className = 'upgrade-list achievement-list';
  upgradeList.innerHTML = '';
  const rows = getAchievementRows()
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.ratio - a.ratio)
    .slice(0, 6);

  for (const row of rows) {
    const card = document.createElement('article');
    card.className = `achievement-card${row.unlocked ? ' unlocked' : ''}`;

    const stateLabel = document.createElement('span');
    stateLabel.textContent = row.unlocked ? 'Unlocked' : `${formatProgress(row.capped)}/${formatProgress(row.goal)}`;
    const title = document.createElement('h3');
    title.textContent = row.title;
    const text = document.createElement('p');
    text.textContent = row.text;
    const meter = document.createElement('div');
    meter.className = 'achievement-meter';
    const bar = document.createElement('i');
    bar.style.width = `${row.ratio * 100}%`;
    meter.append(bar);

    card.append(stateLabel, title, text, meter);
    upgradeList.append(card);
  }
}

function runStorySearch() {
  const story = getActiveStory();
  if (!story) return;
  if (story.complete) return;
  const route = state.lastStationRoute || Math.max(1, state.save.route - 1);
  if (story.lastRoute === route) {
    stationMessage.textContent = 'This station cache has already been searched.';
    renderStationPanel();
    return;
  }

  story.progress = clamp(story.progress + 1, 0, story.goal);
  story.lastRoute = route;
  story.complete = story.progress >= story.goal;
  story.lastMessage = getStoryMessage(story);
  state.save.stats.storySearches += 1;
  if (story.complete) {
    const board = getStoryBoard();
    if (!board.completed.includes(story.kind)) {
      board.completed.push(story.kind);
      state.save.stats.storyCompleted += 1;
    }
  }
  saveProgress();
  renderMenuAchievements();
  updateStationUi(state.currentPayout, state.lastStationType, story.lastMessage);
}

function continueStoryRuns() {
  const story = getActiveStory();
  if (story) story.endingSeen = true;
  saveProgress();
  renderStationPanel();
}

function showQuestBoard() {
  const board = getStoryBoard();
  const story = getActiveStory();
  if (story?.complete) {
    story.endingSeen = true;
    board.activeId = null;
  }
  saveProgress();
  renderMenuAchievements();
  renderStationPanel();
}

function renderQuestBoard() {
  const board = getStoryBoard();
  const quests = Object.values(board.quests)
    .sort((a, b) => (a.kind === 'identity' ? -1 : b.kind === 'identity' ? 1 : STORY_ARCS.findIndex((arc) => arc.id === a.kind) - STORY_ARCS.findIndex((arc) => arc.id === b.kind)));
  for (const quest of quests) {
    const arc = getStoryArc(quest);
    const status = getQuestStatus(quest.kind);
    const card = document.createElement('article');
    card.className = `terminal-card quest-card ${status}`;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = status === 'available' ? 'terminal-action primary' : 'terminal-action';
    action.disabled = status !== 'available';
    action.textContent = status === 'active' ? 'Active' : status === 'completed' ? 'Complete' : status === 'locked' ? 'Locked' : 'Start';
    if (status === 'available') action.dataset.questStart = quest.kind;

    const progress = document.createElement('div');
    progress.className = 'story-progress mini';
    const bar = document.createElement('i');
    bar.style.width = `${clamp(quest.progress / Math.max(1, quest.goal) * 100, 0, 100)}%`;
    progress.append(bar);

    const stateLabel = status === 'locked'
      ? arc.unavailable
      : status === 'completed'
        ? quest.lastMessage || arc.ending(quest.target)
        : arc.summary;

    card.innerHTML = `
      <span>${status === 'completed' ? 'Completed' : status === 'active' ? 'Active' : status === 'available' ? 'Available' : 'Locked'}</span>
      <h3>${arc.title(quest.target)}</h3>
      <p>${stateLabel}</p>
    `;
    card.append(progress, action);
    upgradeList.append(card);
  }
}

function renderStorySearch() {
  upgradeList.className = 'upgrade-list story-list';
  upgradeList.innerHTML = '';
  const story = getActiveStory();
  if (!story) {
    renderQuestBoard();
    return;
  }
  const route = state.lastStationRoute || Math.max(1, state.save.route - 1);
  const searchedHere = story.lastRoute === route && story.progress > 0;

  const card = document.createElement('article');
  card.className = 'terminal-card story-card';

  const kicker = document.createElement('span');
  kicker.textContent = getStoryArc(story).label;
  const title = document.createElement('h3');
  title.textContent = getStoryTitle(story);
  const media = createMediaFrame(getStoryMedia(story));
  const text = document.createElement('p');
  text.textContent = story.lastMessage || getStoryMessage(story);
  const progress = document.createElement('div');
  progress.className = 'story-progress';
  const bar = document.createElement('i');
  bar.style.width = `${clamp(story.progress / Math.max(1, story.goal) * 100, 0, 100)}%`;
  progress.append(bar);
  const actions = document.createElement('div');
  actions.className = 'story-actions';

  if (story.complete) {
    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'terminal-action primary';
    complete.dataset.storyBoard = 'true';
    complete.textContent = 'Quest Board';
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.className = 'terminal-action';
    cont.dataset.storyContinue = 'true';
    cont.textContent = 'Review';
    actions.append(complete, cont);
  } else {
    const search = document.createElement('button');
    search.type = 'button';
    search.className = 'terminal-action primary';
    search.dataset.storySearch = 'true';
    search.disabled = searchedHere;
    search.textContent = searchedHere ? 'Searched' : 'Run Search';
    const routeLabel = document.createElement('button');
    routeLabel.type = 'button';
    routeLabel.className = 'terminal-action';
    routeLabel.disabled = true;
    routeLabel.textContent = `${story.progress}/${story.goal}`;
    actions.append(search, routeLabel);
  }

  card.append(kicker, title, media, text, progress, actions);
  upgradeList.append(card);
  if (story.complete || getStoryBoard().completed.includes('identity')) renderQuestBoard();
}

function renderUpgradeCategoryTabs() {
  if (!upgradeCategoryTabs) return;
  upgradeCategoryTabs.classList.remove('hidden');
  upgradeCategoryTabs.innerHTML = '';
  for (const category of UPGRADE_CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.upgradeCategory = category.id;
    button.setAttribute('aria-selected', String(state.upgradeCategory === category.id));
    button.textContent = category.label;
    upgradeCategoryTabs.append(button);
  }
}

function renderUpgrades() {
  const credits = state.save.credits;
  const category = UPGRADE_CATEGORIES.find((item) => item.id === state.upgradeCategory) || UPGRADE_CATEGORIES[0];
  state.upgradeCategory = category.id;
  upgradeList.className = 'upgrade-list';
  upgradeList.innerHTML = '';
  for (const def of UPGRADE_DEFS.filter((item) => item.category === category.id)) {
    const level = getUpgradeLevel(def.id);
    const cost = getUpgradeCost(def);
    const maxed = level >= def.max;
    const card = document.createElement('article');
    card.className = 'upgrade-card';
    card.innerHTML = `
      <div>
        <h3>${def.name}</h3>
        <p>${def.blurb}</p>
        <div class="upgrade-meta">
          <span>${def.stat(level)}</span>
          <span class="upgrade-level">LV ${level}/${def.max}</span>
        </div>
      </div>
      <button class="upgrade-buy" type="button" data-upgrade="${def.id}" ${maxed || credits < cost ? 'disabled' : ''}>
        ${maxed ? 'Max' : `${cost} cr`}
      </button>
    `;
    upgradeList.append(card);
  }
}

function renderTerminalCards(cards) {
  upgradeList.className = 'upgrade-list terminal-grid';
  upgradeList.innerHTML = '';
  for (const cardData of cards) {
    const card = document.createElement('article');
    card.className = 'terminal-card';
    card.innerHTML = `
      <span>${cardData.kicker}</span>
      <h3>${cardData.title}</h3>
      <p>${cardData.text}</p>
    `;
    upgradeList.append(card);
  }
}

function renderCargoOffice() {
  const stats = getShipStats();
  const nextRoute = state.save.route;
  const nextType = getStationType(nextRoute);
  const nextName = getStationName(nextRoute, nextType);
  const nextPayout = getDeliveryPayout(nextRoute, nextType);
  upgradeList.className = 'upgrade-list terminal-grid';
  upgradeList.innerHTML = '';

  const cards = [
    {
      kicker: 'Freight bay',
      title: `${stats.cargo}t capacity`,
      text: 'More cargo space means larger sealed station loads and better delivery pay.',
    },
    {
      kicker: 'Next manifest',
      title: `${nextPayout} cr estimate`,
      text: `${nextName} has a reserved berth and auto-load contract waiting.`,
    },
    {
      kicker: 'Debt ledger',
      title: `${formatCredits(state.save.debt)} cr owed`,
      text: state.save.debt > 0
        ? `Debt rises ${Math.round(DEBT_INTEREST_RATE * 100)}% each trip. Crossing ${DEBT_LIMIT} means confiscation.`
        : 'Ledger clear. Future repair claims can still create new debt.',
      action: 'Pay Debt',
      actionAttr: 'data-pay-debt',
      disabled: state.save.debt <= 0 || state.save.credits <= 0,
    },
    {
      kicker: 'Shipyard',
      title: 'Purchase ship',
      text: 'Browse larger hulls, specialist cockpits, and premium contracts.',
      action: 'Purchase',
      actionAttr: 'data-ship-purchase',
    },
  ];

  for (const cardData of cards) {
    const card = document.createElement('article');
    card.className = 'terminal-card action-card';
    const button = cardData.action
      ? `<button class="terminal-action ${cardData.actionAttr === 'data-pay-debt' ? 'primary' : ''}" type="button" ${cardData.actionAttr} ${cardData.disabled ? 'disabled' : ''}>${cardData.action}</button>`
      : '';
    card.innerHTML = `
      <span>${cardData.kicker}</span>
      <h3>${cardData.title}</h3>
      <p>${cardData.text}</p>
      ${button}
    `;
    upgradeList.append(card);
  }
}

function setStationTab(tab) {
  state.stationTab = tab;
  renderStationPanel();
}

function setUpgradeCategory(category) {
  state.upgradeCategory = category;
  state.stationTab = 'upgrades';
  renderStationPanel();
}

function renderStationPanel() {
  const tab = state.stationTab || 'upgrades';
  stationTabs?.querySelectorAll('[data-station-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.stationTab === tab));
  });

  if (tab === 'upgrades') {
    const category = UPGRADE_CATEGORIES.find((item) => item.id === state.upgradeCategory) || UPGRADE_CATEGORIES[0];
    state.upgradeCategory = category.id;
    if (stationPanelTitle) stationPanelTitle.textContent = category.title;
    if (stationPanelCopy) stationPanelCopy.textContent = category.copy;
    renderUpgradeCategoryTabs();
    renderUpgrades();
    return;
  }

  upgradeCategoryTabs?.classList.add('hidden');
  const stats = getShipStats();
  const nextRoute = state.save.route;
  const nextType = getStationType(nextRoute);
  const nextName = getStationName(nextRoute, nextType);
  const nextPayout = getDeliveryPayout(nextRoute, nextType);

  if (tab === 'cargo') {
    if (stationPanelTitle) stationPanelTitle.textContent = 'Cargo Office';
    if (stationPanelCopy) stationPanelCopy.textContent = 'Freight contracts, debt service, and shipyard access are handled here.';
    renderCargoOffice();
    return;
  }

  if (tab === 'briefing') {
    if (stationPanelTitle) stationPanelTitle.textContent = 'Route Briefing';
    if (stationPanelCopy) stationPanelCopy.textContent = 'Hazards rise with distance, but every fifth station gives a stronger service dock.';
    renderTerminalCards([
      { kicker: 'Destination', title: nextName, text: `${getStationLabel(nextType)} route ${String(nextRoute).padStart(2, '0')} is plotted through active debris lanes.` },
      { kicker: 'Run length', title: `${Math.round(getRouteLength(nextRoute))} km`, text: 'Vector Drive upgrades shorten the sprint and raise your cruise speed.' },
      { kicker: 'Hazard pay', title: `${nextPayout} cr`, text: 'Larger stations pay more, but their approach lanes are busier and longer.' },
    ]);
    return;
  }

  if (tab === 'search') {
    if (stationPanelTitle) stationPanelTitle.textContent = 'Port Search';
    if (stationPanelCopy) stationPanelCopy.textContent = 'Optional trace work. One station cache can be searched per dock.';
    renderStorySearch();
    return;
  }

  if (tab === 'achievements') {
    if (stationPanelTitle) stationPanelTitle.textContent = 'Achievements';
    if (stationPanelCopy) stationPanelCopy.textContent = 'Persistent milestones from flights, cargo, upgrades, and the search thread.';
    renderAchievements();
    return;
  }

  if (stationPanelTitle) stationPanelTitle.textContent = 'Ship Status';
  if (stationPanelCopy) stationPanelCopy.textContent = 'Current installed systems calculated from your upgrade levels.';
  renderTerminalCards([
    { kicker: 'Shield', title: `${stats.maxShield} hull shield`, text: 'Hull Plating increases total impact tolerance.' },
    { kicker: 'Heat', title: `${stats.maxHeat}% heat cap`, text: 'Cooling bleeds heat faster while capacitors delay lockout.' },
    { kicker: 'Weapons', title: `${stats.beamPower} beam power`, text: `Threat Predictor lock assist level ${stats.lockAssist} prioritizes path-crossing targets.` },
    { kicker: 'Drive', title: `${Math.round((stats.speedBonus - 1) * 100)}% cruise gain`, text: 'Vector Drive improves speed and reduces contract distance.' },
  ]);
}

function updateStationUi(payout = state.currentPayout, type = getStationType(), notice = '') {
  const dockedRoute = state.lastStationRoute || Math.max(1, state.save.route - 1);
  const stationName = state.lastStationName || getStationName(dockedRoute, type);
  stationKicker.textContent = getStationLabel(type);
  stationTitle.textContent = stationName;
  stationMessage.textContent = notice || (payout > 0
    ? `Cargo transferred at ${stationName}. ${payout} credits paid and the next hold is being sealed.`
    : `${stationName} has the berth locked. Spend credits before launching the next delivery.`);
  stationCredits.textContent = String(state.save.credits);
  stationPayout.textContent = String(payout || state.currentPayout || getDeliveryPayout(dockedRoute, type));
  stationCargo.textContent = `${getShipStats().cargo}t`;
  if (stationDebt) stationDebt.textContent = formatCredits(state.save.debt);
  stationRoute.textContent = String(state.save.route).padStart(2, '0');
  renderStationPanel();
}

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find((item) => item.id === id);
  if (!def) return;
  const level = getUpgradeLevel(id);
  const cost = getUpgradeCost(def);
  if (level >= def.max || state.save.credits < cost) return;
  state.save.credits -= cost;
  state.save.upgrades[id] = level + 1;
  state.save.stats.upgradesBought += 1;
  state.save.stats.bestCargo = Math.max(state.save.stats.bestCargo, getCargoCapacity(state.save.upgrades.cargo || 0));
  saveProgress();
  renderMenuAchievements();
  playSfx('buy');
  updateStationUi(state.currentPayout, state.lastStationType, `${def.name} installed. Credits updated and the next manifest is still reserved.`);
}

function openStation(type = getStationType()) {
  state.running = false;
  state.docked = true;
  state.docking = false;
  state.firing = false;
  state.firePointerId = null;
  state.movementPointerId = null;
  state.pointerDown = false;
  state.lastStationType = type;
  const completedRoute = state.save.route;
  state.lastStationRoute = completedRoute;
  state.lastStationName = getStationName(completedRoute, type);
  clearDynamicScene();
  state.dockObject = null;
  state.stationTab = ['upgrades', 'cargo', 'briefing', 'search', 'achievements'].includes(DEMO_STATION_TAB) ? DEMO_STATION_TAB : 'upgrades';
  state.stationTerminalOpen = state.demoTerminal;
  state.upgradeCategory = 'flight';
  const payout = getDeliveryPayout(completedRoute, type);
  state.currentPayout = payout;
  state.save.credits += payout;
  state.save.route = completedRoute + 1;
  state.save.stats.dockings += 1;
  state.save.stats.totalCredits += payout;
  state.save.stats.bestCargo = Math.max(state.save.stats.bestCargo, getShipStats().cargo);
  state.score += payout;
  saveProgress();
  renderMenuAchievements();
  playSfx('dock');
  updateHud();
  resetStationTraffic();
  updateStationUi(payout, type);
  stationEl.classList.remove('hidden');
  setStationTerminalOpen(state.demoTerminal);
  drawStationWindow(0);
  hudEl.classList.add('hidden');
  fireButton.classList.add('hidden');
  reticleEl.classList.add('hidden');
  setGameState('station');
}

function launchNextRun() {
  saveProgress();
  resetGame();
}

function showConfiscationResult(message = 'Debt exceeded the 10000 credit limit. The lender seized your ship at berth.') {
  state.running = false;
  state.firing = false;
  state.pointerDown = false;
  state.confiscated = true;
  resultScore.textContent = String(Math.round(state.score));
  resultBest.textContent = String(state.best);
  resultWave.textContent = String(state.wave);
  if (resultDebt) resultDebt.textContent = formatCredits(state.save.debt);
  resultTitle.textContent = 'Ship Confiscated';
  resultKicker.textContent = 'lender seizure';
  if (resultMessage) resultMessage.textContent = message;
  menuEl.classList.add('hidden');
  stationEl.classList.add('hidden');
  resultEl.classList.remove('hidden');
  fireButton.classList.add('hidden');
  reticleEl.classList.add('hidden');
  setGameState('result');
  haptic([90, 80, 120]);
  lockResultScreen();
}

function resetGame() {
  if (state.resultLocked || state.confiscated) return;
  if (!DEMO_MODE) {
    const interest = applyDebtInterest();
    if (state.save.debt > DEBT_LIMIT) {
      showConfiscationResult(`Debt interest added ${interest} credits and pushed the ledger over ${DEBT_LIMIT}. The lender seized your ship.`);
      return;
    }
  }
  clearResultLock();
  clearDockTransition();
  clearDynamicScene();
  const stats = getShipStats();
  state.running = true;
  state.docked = false;
  state.docking = false;
  state.dockObject = null;
  state.time = 0;
  state.score = 0;
  state.routeDistance = 0;
  state.routeLength = getRouteLength();
  if (state.demoDock) state.routeLength = 260;
  state.currentPayout = getDeliveryPayout();
  state.shield = stats.maxShield;
  state.heat = 0;
  state.wave = state.save.route;
  state.speed = 48 * stats.speedBonus;
  state.spawnTimer = 0.2;
  state.stationTimer = 1.2;
  state.collectTimer = 3.2;
  state.threat = 0;
  state.shake = 0;
  state.player.x = 0;
  state.player.y = 0;
  state.target.x = 0;
  state.target.y = 0;

  menuEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  stationEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  reticleEl.classList.remove('hidden');
  fireButton.classList.remove('hidden');
  setGameState('playing');

  for (let i = 0; i < 8; i += 1) {
    if (i % 3 === 0) createDrone();
    else createAsteroid();
  }
  if (state.demoResult) {
    window.setTimeout(() => {
      state.score = Math.max(state.score, 860);
      state.wave = Math.max(state.wave, 4);
      finishGame();
    }, 900);
  }
  if (state.demoDock) {
    window.setTimeout(() => {
      if (state.running) beginDockingTransition(getStationType(state.save.route));
    }, 1400);
  }
  updateHud();
}

function finishGame() {
  if (!state.running && gameEl.dataset.state === 'result') return;
  state.running = false;
  state.firing = false;
  state.pointerDown = false;
  const repair = DEMO_MODE ? { bill: 0, paid: 0, addedDebt: 0 } : applyEscapePodRepair();
  const finalScore = Math.round(state.score);
  const previousBest = state.best;
  state.best = Math.max(state.best, finalScore);
  if (!DEMO_MODE) localStorage.setItem(BEST_KEY, String(state.best));
  resultScore.textContent = String(finalScore);
  resultBest.textContent = String(state.best);
  resultWave.textContent = String(state.wave);
  if (resultDebt) resultDebt.textContent = formatCredits(state.save.debt);
  resultTitle.textContent = state.confiscated ? 'Ship Confiscated' : state.demo ? 'Flight Logged' : finalScore > previousBest ? 'Escape Pod Record' : 'Escape Pod Recovery';
  resultKicker.textContent = state.confiscated ? 'lender seizure' : state.demo ? 'flight recorder' : 'salvage claim';
  if (resultMessage) {
    if (state.demo) {
      resultMessage.textContent = `Demo run sealed at ${finalScore} points through wave ${state.wave}.`;
    } else if (state.confiscated) {
      resultMessage.textContent = `Escape pod recovered. Repair claim was ${repair.bill} credits, but debt reached ${formatCredits(state.save.debt)}. Your ship was confiscated to settle the account.`;
    } else {
      const paidText = repair.addedDebt > 0
        ? `${repair.paid} paid, ${repair.addedDebt} added to debt`
        : `${repair.paid} paid in full`;
      resultMessage.textContent = `Escape pod recovered. Salvage repair cost ${repair.bill} credits: ${paidText}. Debt now ${formatCredits(state.save.debt)}.`;
    }
  }
  resultEl.classList.remove('hidden');
  fireButton.classList.add('hidden');
  setGameState('result');
  haptic(state.confiscated ? [90, 80, 120] : [70, 50, 90, 60, 120]);
  lockResultScreen();
}

function firePulse() {
  const stats = getShipStats();
  if (!state.running || state.docking || state.shotTimer > 0 || state.heat > stats.maxHeat - 4) return;
  state.shotTimer = stats.shotCooldown;
  state.heat = clamp(state.heat + stats.shotHeat, 0, stats.maxHeat);
  state.save.stats.shotsFired += 1;
  haptic(8);

  const bestTarget = acquireTarget();
  const aimNdc = getAimNdc();
  const ray = new THREE.Vector3(aimNdc.x, aimNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
  const endpoint = camera.position.clone().add(ray.multiplyScalar(140));
  let targetScreen = {
    x: window.innerWidth * 0.5 + aimNdc.x * window.innerWidth * 0.42,
    y: window.innerHeight * 0.5 - aimNdc.y * window.innerHeight * 0.42,
  };
  if (bestTarget) {
    bestTarget.getWorldPosition(endpoint);
    targetScreen = worldToScreen(endpoint) || targetScreen;
  }
  addLaserBurst(targetScreen);
  createBeam(camera.position.clone().add(new THREE.Vector3(-0.32, -0.22, 0)), endpoint, beamMaterial, 0.16);
  createBeam(camera.position.clone().add(new THREE.Vector3(0.32, -0.22, 0)), endpoint, beamMaterial, 0.16);
  playSfx('laser');

  if (bestTarget) {
    bestTarget.userData.hp -= stats.beamPower;
    state.score += bestTarget.userData.kind === 'drone' ? 45 + stats.beamPower * 3 : 20 + stats.beamPower * 2;
    cockpitLight.intensity = 4.5;
    if (bestTarget.userData.hp <= 0) {
      state.save.stats.kills += 1;
      if (bestTarget.userData.kind === 'drone') state.save.stats.droneKills += 1;
      if (bestTarget.userData.kind === 'asteroid') state.save.stats.asteroidKills += 1;
      saveProgress();
      renderMenuAchievements();
      bestTarget.getWorldPosition(tmpVectorB);
      createExplosion(tmpVectorB, bestTarget.userData.kind === 'drone' ? 0xff7e40 : 0xffc175, bestTarget.userData.kind === 'drone' ? 34 : 24);
      state.score += bestTarget.userData.value;
      state.objects.splice(state.objects.indexOf(bestTarget), 1);
      removeObject(bestTarget);
    }
  }

  updateHud();
}

function getAimNdc() {
  return {
    x: clamp(state.target.x * 0.72, -0.84, 0.84),
    y: clamp(state.target.y * 0.62, -0.66, 0.78),
  };
}

function damage(amount, severity = 0.5) {
  state.shield = clamp(state.shield - amount, 0, getShipStats().maxShield);
  state.shake = Math.max(state.shake, amount * 0.013);
  state.flashTimer = 0.15;
  damageFlash.classList.add('active');
  hapticImpact(amount, severity);
  updateHud();
  if (state.shield <= 0) finishGame();
}

function updateHud() {
  const stats = getShipStats();
  const heatPercent = clamp(state.heat / Math.max(1, stats.maxHeat) * 100, 0, 100);
  scoreValue.textContent = String(Math.round(state.score));
  shieldValue.textContent = String(Math.round(state.shield));
  heatValue.textContent = String(Math.round(heatPercent));
  shieldMeter.style.width = `${clamp(state.shield / stats.maxShield * 100, 0, 100)}%`;
  heatMeter.style.width = `${heatPercent}%`;
  if (routeMeter) routeMeter.style.width = `${clamp(state.routeDistance / Math.max(1, state.routeLength) * 100, 0, 100)}%`;
  sectorValue.textContent = `ROUTE ${String(state.save.route).padStart(2, '0')} / ${getStationLabel(getStationType(state.save.route)).toUpperCase()}`;
  threatValue.textContent = state.docking ? 'DOCKING' : state.threat > 4 ? 'CONTACT' : state.threat > 1 ? 'TRACE' : `${state.currentPayout} CR`;
}

function updateReticle() {
  const x = window.innerWidth * 0.5 + state.target.x * window.innerWidth * 0.23;
  const y = window.innerHeight * 0.46 - state.target.y * window.innerHeight * 0.18;
  reticleEl.style.left = `${x}px`;
  reticleEl.style.top = `${y}px`;
}

function updateInputFromMovement(event) {
  state.moveCurrent.x = event.clientX;
  state.moveCurrent.y = event.clientY;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dx = event.clientX - state.moveOrigin.x;
  const dy = event.clientY - state.moveOrigin.y;
  state.target.x = clamp(dx / (width * 0.24), -1, 1);
  state.target.y = clamp(-dy / (height * 0.22), -1, 1);
  updateReticle();
}

function onPointerDown(event) {
  if (event.target.closest('button')) return;
  if (event.clientX > window.innerWidth * 0.78) return;
  if (state.movementPointerId !== null) return;
  event.preventDefault();
  state.movementPointerId = event.pointerId;
  state.pointerDown = true;
  state.moveOrigin.x = event.clientX;
  state.moveOrigin.y = event.clientY;
  updateInputFromMovement(event);
  gameEl.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.pointerDown || event.pointerId !== state.movementPointerId) return;
  event.preventDefault();
  updateInputFromMovement(event);
}

function onPointerUp(event) {
  if (event.pointerId === state.firePointerId) {
    state.firePointerId = null;
    if (!state.demo) state.firing = false;
    fireButton.releasePointerCapture?.(event.pointerId);
  }
  if (event.pointerId !== state.movementPointerId) return;
  state.pointerDown = false;
  state.movementPointerId = null;
  gameEl.releasePointerCapture?.(event.pointerId);
}

function updateStars(delta) {
  const position = starGeometry.attributes.position;
  const stationView = state.docked || gameEl.dataset.state === 'station';
  const boost = state.running ? state.speed : 28;
  for (let i = 0; i < starCount; i += 1) {
    const p = i * 3;
    if (stationView) {
      starPositions[p] += starSideSpeeds[i] * delta;
      starPositions[p + 1] += Math.sin(state.time * 0.18 + i) * delta * 0.28;
      starPositions[p + 2] += delta * 0.45;
      if (starPositions[p] > 190 || starPositions[p] < -190) {
        starPositions[p] = starPositions[p] > 190 ? -188 : 188;
        starPositions[p + 1] = rand(-92, 92);
        starPositions[p + 2] = rand(-760, -55);
        starSideSpeeds[i] = rand(3.5, 9.5) * (i % 9 === 0 ? -0.45 : 1);
      }
      continue;
    }
    starPositions[p] += state.player.x * delta * 0.9;
    starPositions[p + 1] += state.player.y * delta * 0.55;
    starPositions[p + 2] += boost * delta * rand(0.64, 1.58);
    if (starPositions[p + 2] > 14) resetStar(i, false);
  }
  position.needsUpdate = true;
}

function updateNebulae(delta) {
  const stationView = state.docked || gameEl.dataset.state === 'station';
  for (const sprite of nebulae) {
    if (stationView) {
      sprite.position.x += delta * 2.1;
      sprite.position.y += Math.sin(state.time * 0.12 + sprite.position.z) * delta * 0.08;
      sprite.material.rotation += sprite.userData.spin * delta * 0.28;
      if (sprite.position.x > 180) {
        sprite.position.set(rand(-180, -150), rand(-120, 120), rand(-740, -150));
      }
      continue;
    }
    sprite.position.z += delta * (state.running ? state.speed * 0.17 : 5);
    sprite.material.rotation += sprite.userData.spin * delta;
    if (sprite.position.z > 24) {
      sprite.position.set(rand(-160, 160), rand(-120, 120), rand(-760, -560));
    }
  }
}

function spawnObjects(delta) {
  if (!state.running || state.docking) return;
  if (state.routeDistance >= state.routeLength) {
    for (let i = state.objects.length - 1; i >= 0; i -= 1) {
      removeObject(state.objects[i]);
      state.objects.splice(i, 1);
    }
    createDockStation(getStationType(state.save.route));
    state.spawnTimer = 99;
    state.stationTimer = 99;
    state.collectTimer = 99;
    return;
  }
  state.spawnTimer -= delta;
  state.stationTimer -= delta;
  state.collectTimer -= delta;

  if (state.spawnTimer <= 0) {
    const roll = Math.random();
    if (roll < 0.26 + state.wave * 0.012) createDrone();
    else createAsteroid();
    state.spawnTimer = clamp(0.84 - state.wave * 0.045, 0.36, 0.84) * rand(0.78, 1.18);
  }

  if (state.stationTimer <= 0) {
    createStation();
    state.stationTimer = rand(9, 15);
  }

  if (state.collectTimer <= 0) {
    createCollector();
    state.collectTimer = rand(7.5, 12);
  }
}

function updateObjects(delta) {
  const playerX = state.player.x * 11;
  const playerY = state.player.y * 7.5;
  let threat = 0;

  for (let i = state.objects.length - 1; i >= 0; i -= 1) {
    const object = state.objects[i];
    const data = object.userData;
    const speed = state.speed * data.speedScale;
    object.position.z += speed * delta;

    if (data.kind === 'asteroid') {
      object.rotation.x += data.spin.x * delta;
      object.rotation.y += data.spin.y * delta;
      object.rotation.z += data.spin.z * delta;
    } else if (data.kind === 'drone') {
      data.phase += delta * data.strafe;
      object.position.x += Math.sin(data.phase) * delta * 1.9;
      object.rotation.z = Math.sin(data.phase) * 0.28;
      object.rotation.y = Math.sin(data.phase * 0.7) * 0.34;
      data.shot -= delta;
      if (data.shot <= 0 && object.position.z > -80 && object.position.z < -12) {
        object.getWorldPosition(tmpVector);
        createBeam(tmpVector.clone(), new THREE.Vector3(playerX * 0.22, playerY * 0.1, 4), enemyBeamMaterial, 0.24);
        if (Math.hypot(object.position.x - playerX, object.position.y - playerY) < 9.5) damage(4 + state.wave * 0.2);
        data.shot = rand(1.1, 2.4);
      }
    } else if (data.kind === 'station') {
      object.rotation.z += delta * 0.04;
      object.position.x -= data.drift * delta;
    } else if (data.kind === 'dock') {
      object.rotation.z = Math.sin(state.time * 0.45) * 0.025;
      object.rotation.y = Math.sin(state.time * 0.26) * 0.035;
      object.position.x = lerp(object.position.x, 0, delta * 1.4);
      object.position.y = lerp(object.position.y, 0, delta * 1.4);
      if (object.position.z > -18 && state.running) {
        beginDockingTransition(data.stationType);
      }
    } else if (data.kind === 'collector') {
      object.rotation.x += delta * 2.2;
      object.rotation.z += delta * 1.7;
    }

    if (object.position.z > -70 && object.position.z < 10 && !['station', 'dock'].includes(data.kind)) threat += 1;

    const collisionDepth = data.kind === 'asteroid' ? Math.max(5.5, data.radius * 1.35) : 5;
    const collisionWindow = object.position.z > -collisionDepth && object.position.z < 8.5;
    const distance = Math.hypot(object.position.x - playerX, object.position.y - playerY);
    if (collisionWindow && !data.passed && !['station', 'dock'].includes(data.kind)) {
      if (data.kind === 'collector' && distance < data.radius + 1.8) {
        const stats = getShipStats();
        state.shield = clamp(state.shield + 18, 0, stats.maxShield);
        state.heat = clamp(state.heat - 32, 0, stats.maxHeat);
        state.score += data.value;
        state.save.stats.collectors += 1;
        saveProgress();
        renderMenuAchievements();
        haptic([12, 28, 12]);
        createExplosion(object.position.clone(), 0x82ff9e, 18);
        state.objects.splice(i, 1);
        removeObject(object);
        updateHud();
        continue;
      }
      if (data.kind === 'asteroid') {
        const lateralBuffer = data.sizeClass === 'large' ? 4.6 : data.sizeClass === 'medium' ? 3.2 : 2.1;
        const hitRadius = data.radius + lateralBuffer;
        if (distance >= hitRadius) continue;
        data.passed = true;
        const lateralSeverity = clamp((hitRadius - distance) / Math.max(1, data.radius * 0.95), 0.16, 1);
        const depthSeverity = clamp(1 - Math.abs(object.position.z) / Math.max(1, collisionDepth), 0.24, 1);
        const severity = clamp(lateralSeverity * 0.78 + depthSeverity * 0.22, 0.16, 1);
        const impact = Math.round(data.impactDamage * (0.34 + severity * 0.66));
        createExplosion(object.position.clone(), severity > 0.55 ? 0xff5d3b : 0xffb563, Math.round(12 + severity * 18));
        damage(impact, severity);
      } else if (data.kind === 'drone' && distance < data.radius + 1.25) {
        data.passed = true;
        createExplosion(object.position.clone(), 0xff5d3b, 18);
        damage(16, 0.48);
      }
    }

    if (object.position.z > 22 && data.kind !== 'dock') {
      state.objects.splice(i, 1);
      removeObject(object);
    }
  }
  state.threat = threat;
}

function updateBeams(delta) {
  for (let i = state.beams.length - 1; i >= 0; i -= 1) {
    const beam = state.beams[i];
    beam.userData.life -= delta;
    beam.material.opacity = Math.max(0, beam.userData.life / beam.userData.ttl) * 0.9;
    if (beam.userData.life <= 0) {
      state.beams.splice(i, 1);
      scene.remove(beam);
      beam.geometry.dispose();
      beam.material.dispose();
    }
  }
}

function updateParticles(delta) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    const position = particle.geometry.attributes.position;
    const velocities = particle.userData.velocities;
    for (let p = 0; p < position.count; p += 1) {
      position.array[p * 3] += velocities[p].x * delta;
      position.array[p * 3 + 1] += velocities[p].y * delta;
      position.array[p * 3 + 2] += velocities[p].z * delta + state.speed * delta * 0.6;
    }
    position.needsUpdate = true;
    particle.userData.life -= delta;
    particle.material.opacity = Math.max(0, particle.userData.life / particle.userData.ttl);
    if (particle.userData.life <= 0) {
      state.particles.splice(i, 1);
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
    }
  }
}

function updateFlight(delta) {
  const stats = getShipStats();
  const inputLerp = 1 - Math.exp(-delta * 4.8);
  state.player.x = lerp(state.player.x, state.target.x, inputLerp);
  state.player.y = lerp(state.player.y, state.target.y, inputLerp);

  if (!state.pointerDown && !state.demo && state.running) {
    state.target.x = lerp(state.target.x, 0, delta * 0.42);
    state.target.y = lerp(state.target.y, 0, delta * 0.42);
  }

  if (state.demo && state.running) {
    state.target.x = Math.sin(state.time * 0.8) * 0.72;
    state.target.y = Math.sin(state.time * 0.56 + 0.8) * 0.44;
    state.firing = true;
  }

  const shakeX = state.shake ? rand(-state.shake, state.shake) : 0;
  const shakeY = state.shake ? rand(-state.shake, state.shake) : 0;
  camera.position.x = state.player.x * 0.42 + shakeX;
  camera.position.y = state.player.y * 0.26 + shakeY;
  camera.position.z = 4 + Math.sin(state.time * 0.7) * 0.06;
  camera.rotation.x = state.player.y * 0.035 + shakeY * 0.04;
  camera.rotation.y = -state.player.x * 0.048 + shakeX * 0.05;
  camera.rotation.z = -state.player.x * 0.02;

  cockpitLight.intensity = lerp(cockpitLight.intensity, 2.2, delta * 4);
  warmLight.intensity = 1.2 + Math.sin(state.time * 2.1) * 0.22;
  state.shake = Math.max(0, state.shake - delta * 0.9);
  state.heat = Math.max(0, state.heat - delta * stats.coolRate);
  state.shotTimer = Math.max(0, state.shotTimer - delta);
  const routePressure = Math.floor(state.routeDistance / 520);
  const dockingFactor = state.docking ? 0.48 : 1;
  state.speed = clamp((48 + routePressure * 2.2 + state.save.route * 0.9) * stats.speedBonus * dockingFactor, 42, 106);
  state.wave = Math.max(1, state.save.route + routePressure);
  if (state.running && !state.docked) {
    state.routeDistance = Math.min(state.routeLength + 140, state.routeDistance + state.speed * delta);
  }
  acquireTarget();

  if (state.flashTimer > 0) {
    state.flashTimer -= delta;
    if (state.flashTimer <= 0) damageFlash.classList.remove('active');
  }

  if (state.firing || (state.demo && state.running)) firePulse();
  if (state.running) state.score += delta * (8 + state.wave * 1.6);
  updateReticle();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  state.time += delta;

  updateFlight(delta);
  updateStars(delta);
  updateNebulae(delta);
  spawnObjects(delta);
  updateObjects(delta);
  updateBeams(delta);
  updateParticles(delta);
  drawLaserOverlay(delta);
  if (state.docked || gameEl.dataset.state === 'station') drawStationWindow(delta);

  if (state.running && Math.floor(state.time * 8) % 4 === 0) updateHud();
  if (state.demo && state.running && state.time > 18) finishGame();

  renderer.render(scene, camera);
}

function processCockpitImage(img) {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.naturalWidth;
  offscreen.height = img.naturalHeight;
  const ctx = offscreen.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
  const pixels = frame.data;
  const matte = new Uint8ClampedArray(offscreen.width * offscreen.height);

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const greenDominance = g - Math.max(r, b);
    const greenRatio = g / Math.max(1, Math.max(r, b));
    let alpha = 255;
    if (g > 142 && greenDominance > 52 && greenRatio > 1.42) {
      alpha = Math.round(255 * (1 - clamp((greenDominance - 52) / 68, 0, 1)));
    } else if (g > 78 && greenDominance > 22 && greenRatio > 1.15) {
      alpha = Math.round(255 * (1 - clamp((greenDominance - 22) / 72, 0, 1) * 0.86));
    }
    pixels[i + 3] = alpha;
    matte[p] = alpha;

    if (greenDominance > 20 && g > 70 && greenRatio > 1.12) {
      pixels[i + 1] = Math.min(g, Math.round((r + b) * 0.55 + 36));
    }
  }

  const width = offscreen.width;
  const height = offscreen.height;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      if (matte[p] < 12) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const edgeGreen = g - Math.max(r, b);
      if (edgeGreen < 10) continue;
      const nearTransparent =
        matte[p - 1] < 48 || matte[p + 1] < 48 ||
        matte[p - width] < 48 || matte[p + width] < 48;
      if (nearTransparent) {
        pixels[i + 3] = Math.round(matte[p] * 0.38);
        pixels[i + 1] = Math.min(g, Math.round((r + b) * 0.5 + 20));
      }
    }
  }

  ctx.putImageData(frame, 0, 0);
  state.cockpitPlate = offscreen;
  state.cockpitReady = true;
  drawCockpit();
}

function drawCockpit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));
  cockpitCanvas.width = width;
  cockpitCanvas.height = height;
  cockpitCanvas.style.width = `${window.innerWidth}px`;
  cockpitCanvas.style.height = `${window.innerHeight}px`;
  cockpitCtx.setTransform(1, 0, 0, 1, 0, 0);
  cockpitCtx.clearRect(0, 0, width, height);
  if (!state.cockpitPlate) return;

  const img = state.cockpitPlate;
  const scale = Math.max(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const x = (width - drawWidth) * 0.5;
  const y = (height - drawHeight) * 0.5;
  cockpitCtx.drawImage(img, x, y, drawWidth, drawHeight);
}

function resizeLaserCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));
  laserCanvas.width = width;
  laserCanvas.height = height;
  laserCanvas.style.width = `${window.innerWidth}px`;
  laserCanvas.style.height = `${window.innerHeight}px`;
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.fov = height >= width ? 63 : 54;
  camera.updateProjectionMatrix();
  drawCockpit();
  resizeLaserCanvas();
  drawStationWindow(0);
  updateReticle();
}

function restoreCanvasesSoon() {
  window.setTimeout(() => {
    resize();
    if (state.cockpitPlate) {
      drawCockpit();
    } else {
      loadCockpit().catch(() => {});
    }
  }, 80);
}

function setupEvents() {
  settingsButton?.addEventListener('click', () => {
    playSfx('click');
    showModal(settingsModal);
  });
  for (const modal of [settingsModal, resetModal, debugModal]) {
    modal?.addEventListener('pointerdown', (event) => event.stopPropagation());
    modal?.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-modal]')) {
        playSfx('click');
        closeModal(modal);
      }
    });
  }
  soundToggle?.addEventListener('click', toggleSound);
  musicToggle?.addEventListener('click', toggleMusic);
  hapticsToggle?.addEventListener('click', toggleHaptics);
  debugOpenButton?.addEventListener('click', () => {
    playSfx('click');
    showModal(debugModal);
  });
  resetOpenButton?.addEventListener('click', () => {
    playSfx('error');
    showModal(resetModal);
  });
  resetCancelButton?.addEventListener('click', () => {
    playSfx('click');
    closeModal(resetModal);
  });
  resetConfirmButton?.addEventListener('click', resetProgress);
  debugSkipDepotButton?.addEventListener('click', debugSkipToDepot);
  debugRefreshMediaButton?.addEventListener('click', () => {
    playSfx('click');
    renderDebugMediaList();
  });

  startButton.addEventListener('click', () => {
    playSfx('buy');
    syncMusic();
    resetGame();
  });
  restartButton.addEventListener('click', () => {
    playSfx('buy');
    syncMusic();
    resetGame();
  });
  launchNextButton.addEventListener('click', () => {
    playSfx('buy');
    syncMusic();
    launchNextRun();
  });
  stationEl.addEventListener('pointerdown', onStationPointerDown);
  stationTerminalHotspot?.addEventListener('click', () => {
    playSfx('click');
    setStationTerminalOpen(true);
  });
  stationCloseTerminal?.addEventListener('click', () => {
    playSfx('click');
    setStationTerminalOpen(false);
  });
  stationTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-station-tab]');
    if (button) {
      playSfx('click');
      setStationTab(button.dataset.stationTab);
    }
  });
  upgradeCategoryTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade-category]');
    if (button) {
      playSfx('click');
      setUpgradeCategory(button.dataset.upgradeCategory);
    }
  });
  upgradeList.addEventListener('click', (event) => {
    const payDebtButton = event.target.closest('[data-pay-debt]');
    if (payDebtButton) {
      payDebt();
      return;
    }
    const shipPurchaseButton = event.target.closest('[data-ship-purchase]');
    if (shipPurchaseButton) {
      showShipPurchaseNotice();
      return;
    }
    const button = event.target.closest('[data-upgrade]');
    if (button) buyUpgrade(button.dataset.upgrade);
    const storySearch = event.target.closest('[data-story-search]');
    if (storySearch) {
      playSfx('buy');
      runStorySearch();
    }
    const questStart = event.target.closest('[data-quest-start]');
    if (questStart) {
      playSfx('buy');
      setActiveQuest(questStart.dataset.questStart);
    }
    const storyContinue = event.target.closest('[data-story-continue]');
    if (storyContinue) {
      playSfx('click');
      continueStoryRuns();
    }
    const storyBoard = event.target.closest('[data-story-board]');
    if (storyBoard) {
      playSfx('dock');
      showQuestBoard();
    }
  });
  gameEl.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', restoreCanvasesSoon);
  window.addEventListener('focus', restoreCanvasesSoon);
  window.addEventListener('pageshow', restoreCanvasesSoon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restoreCanvasesSoon();
  });

  fireButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    state.firePointerId = event.pointerId;
    state.firing = true;
    fireButton.setPointerCapture?.(event.pointerId);
    firePulse();
  }, { passive: false });
  fireButton.addEventListener('pointerup', onPointerUp, { passive: true });
  fireButton.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && state.modal) {
      closeAllModals();
      return;
    }
    if (event.code === 'Space') {
      state.firing = true;
      firePulse();
    }
    if (event.code === 'Enter' && !state.running && !state.resultLocked) resetGame();
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.target.x = clamp(state.target.x - 0.14, -1, 1);
    if (event.code === 'ArrowRight' || event.code === 'KeyD') state.target.x = clamp(state.target.x + 0.14, -1, 1);
    if (event.code === 'ArrowUp' || event.code === 'KeyW') state.target.y = clamp(state.target.y + 0.14, -1, 1);
    if (event.code === 'ArrowDown' || event.code === 'KeyS') state.target.y = clamp(state.target.y - 0.14, -1, 1);
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') state.firing = false;
  });
}

function loadCockpit() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      processCockpitImage(img);
      resolve();
    };
    img.onerror = reject;
    img.src = 'assets/cockpit-chroma.png';
  });
}

async function boot() {
  setupEvents();
  resize();
  await loadCockpit();
  applyDemoStoryState();
  updateHud();
  renderSettingsState();
  renderMenuAchievements();
  document.documentElement.dataset.gameReady = '1';
  animate();

  if (state.demo) {
    setTimeout(resetGame, 350);
  }
  if (DEMO_SETTINGS) {
    setTimeout(() => showModal(settingsModal), 450);
  }
  if (DEMO_DEBUG) {
    setTimeout(() => showModal(debugModal), 450);
  }
}

boot();
