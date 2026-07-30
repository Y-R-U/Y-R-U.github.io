import * as THREE from 'three';

const canvas = document.getElementById('space-canvas');
const cockpitCanvas = document.getElementById('cockpit-canvas');
const cockpitCtx = cockpitCanvas.getContext('2d');
const laserCanvas = document.getElementById('laser-canvas');
const laserCtx = laserCanvas.getContext('2d');
const stationWindowCanvas = document.getElementById('station-window-canvas');
// Claimed lazily, and only by the 2D fallback painter: a canvas can hold one
// context type, and the docked window normally wants WebGL on this element.
let stationWindowCtx = null;
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
const stationTerminalHint = document.getElementById('station-terminal-hint');
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
const tmpVectorC = new THREE.Vector3();
const tmpVectorD = new THREE.Vector3();
const tmpColor = new THREE.Color();
const leftBeamOffset = new THREE.Vector3(-0.32, -0.22, 0);
const rightBeamOffset = new THREE.Vector3(0.32, -0.22, 0);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const isCoarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 720;
let scenePixelRatio = 1;
let overlayPixelRatio = 1;

function refreshPixelRatios() {
  const coarse = isCoarsePointer();
  const dpr = window.devicePixelRatio || 1;
  scenePixelRatio = Math.min(dpr, coarse ? 1.35 : 1.75);
  overlayPixelRatio = Math.min(dpr, coarse ? 1.5 : 2);
}

const getScenePixelRatio = () => scenePixelRatio;
const getOverlayPixelRatio = () => overlayPixelRatio;

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
    id: 'IMG-10',
    type: 'image',
    title: 'Family Locker',
    storyKinds: ['kin'],
    phase: 'cold',
    src: 'assets/story/img-10-family-locker.png',
    plannedPath: 'assets/story/img-10-family-locker.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'old family freight locker opened inside a space station berth, worn metal case and cargo chips, no readable text, no logos',
  },
  {
    id: 'IMG-11',
    type: 'image',
    title: 'Private Signal Cache',
    storyKinds: ['kin'],
    phase: 'warm',
    src: 'assets/story/img-11-private-signal-cache.png',
    plannedPath: 'assets/story/img-11-private-signal-cache.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'station communicator projecting a faint human-shaped waveform and family route fragments, no readable text, no logos',
  },
  {
    id: 'IMG-12',
    type: 'image',
    title: 'Wreck Ping',
    storyKinds: ['blackbox'],
    phase: 'cold',
    src: 'assets/story/img-12-wreck-ping.png',
    plannedPath: 'assets/story/img-12-wreck-ping.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'damaged escape recorder beacon near a broken cargo ship fragment in deep space, cyan scan rings, no readable text, no logos',
  },
  {
    id: 'IMG-13',
    type: 'image',
    title: 'Rescue Beacon',
    storyKinds: ['blackbox'],
    phase: 'final',
    src: 'assets/story/img-13-rescue-beacon.png',
    plannedPath: 'assets/story/img-13-rescue-beacon.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'final coordinate hologram in an orbital station observation room with a live beacon beyond the window, no readable text, no logos',
  },
  {
    id: 'IMG-14',
    type: 'image',
    title: 'Dock Camera Trace',
    storyKinds: ['revenge'],
    phase: 'cold',
    src: 'assets/story/img-14-dock-camera-trace.png',
    plannedPath: 'assets/story/img-14-dock-camera-trace.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'grainy orbital loading bay security feed on a dark station monitor, red route warning marks, no readable text, no logos',
  },
  {
    id: 'IMG-15',
    type: 'image',
    title: 'Syndicate Door',
    storyKinds: ['revenge'],
    phase: 'final',
    src: 'assets/story/img-15-syndicate-door.png',
    plannedPath: 'assets/story/img-15-syndicate-door.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'sealed armored station door in a dark service corridor with red security glow, no readable text, no logos',
  },
  {
    id: 'IMG-16',
    type: 'image',
    title: 'Recorder Decode',
    storyKinds: ['blackbox'],
    phase: 'warm',
    src: 'assets/story/img-16-recorder-decode.png',
    plannedPath: 'assets/story/img-16-recorder-decode.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'damaged escape recorder opened in a station forensic tray with holographic timeline fragments, no readable text, no logos',
  },
  {
    id: 'IMG-17',
    type: 'image',
    title: 'Emergency Autopilot',
    storyKinds: ['identity'],
    phase: 'cold',
    src: 'assets/story/img-17-emergency-autopilot.png',
    plannedPath: 'assets/story/img-17-emergency-autopilot.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'small angular cargo starship blasting out through an open orbital station launch bay into a black starfield, no readable text, no logos',
  },
  {
    id: 'IMG-18',
    type: 'image',
    title: 'Family Route Ledger',
    storyKinds: ['identity'],
    phase: 'warm',
    src: 'assets/story/img-18-family-route-ledger.png',
    plannedPath: 'assets/story/img-18-family-route-ledger.png',
    generator: 'MFLUX flux2-klein-9b-mlx-4bit',
    prompt: 'family shipping company route ledger projected as abstract holographic freight lanes in an orbital station archive room, no readable text, no logos',
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
    id: 'VID-09',
    type: 'video',
    title: 'Family Locker Loop',
    storyKinds: ['kin'],
    phase: 'cold',
    src: 'assets/story/vid-09-family-locker-loop.mp4',
    plannedPath: 'assets/story/vid-09-family-locker-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'family freight locker evidence loop, cyan cargo chips glow and a warm scan passes over worn metal, no readable text, no logos',
    notes: 'Generated from IMG-10, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-10',
    type: 'video',
    title: 'Private Signal Loop',
    storyKinds: ['kin'],
    phase: 'warm',
    src: 'assets/story/vid-10-private-signal-loop.mp4',
    plannedPath: 'assets/story/vid-10-private-signal-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'private signal cache evidence loop, human-shaped waveform pulses above a station communicator, no readable text, no logos',
    notes: 'Generated from IMG-11, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-11',
    type: 'video',
    title: 'Wreck Ping Loop',
    storyKinds: ['blackbox'],
    phase: 'cold',
    src: 'assets/story/vid-11-wreck-ping-loop.mp4',
    plannedPath: 'assets/story/vid-11-wreck-ping-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'black box wreck ping evidence loop, cyan scan rings pulse around a damaged recorder beacon, no readable text, no logos',
    notes: 'Generated from IMG-12, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-12',
    type: 'video',
    title: 'Rescue Beacon Loop',
    storyKinds: ['blackbox'],
    phase: 'final',
    src: 'assets/story/vid-12-rescue-beacon-loop.mp4',
    plannedPath: 'assets/story/vid-12-rescue-beacon-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'rescue beacon evidence loop, final coordinate hologram aligns and a live beacon pulses beyond the window, no readable text, no logos',
    notes: 'Generated from IMG-13, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-13',
    type: 'video',
    title: 'Dock Camera Trace Loop',
    storyKinds: ['revenge'],
    phase: 'cold',
    src: 'assets/story/vid-13-dock-camera-trace-loop.mp4',
    plannedPath: 'assets/story/vid-13-dock-camera-trace-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'syndicate dock camera evidence loop, grainy orbital loading bay feed flickers and route warnings pulse, no readable text, no logos',
    notes: 'Generated from IMG-14, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-14',
    type: 'video',
    title: 'Recorder Decode Loop',
    storyKinds: ['blackbox'],
    phase: 'warm',
    src: 'assets/story/vid-14-recorder-decode-loop.mp4',
    plannedPath: 'assets/story/vid-14-recorder-decode-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'black box decoder evidence loop, cyan diagnostic arcs pulse above an opened escape recorder in a station forensic tray, no readable text, no logos',
    notes: 'Generated from IMG-16, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-15',
    type: 'video',
    title: 'Syndicate Door Loop',
    storyKinds: ['revenge'],
    phase: 'final',
    src: 'assets/story/vid-15-syndicate-door-loop.mp4',
    plannedPath: 'assets/story/vid-15-syndicate-door-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'syndicate inner bay final evidence loop, red security glow breathes around a sealed armored station door, no readable text, no logos',
    notes: 'Generated from IMG-15, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-16',
    type: 'video',
    title: 'Emergency Autopilot Loop',
    storyKinds: ['identity'],
    phase: 'cold',
    src: 'assets/story/vid-16-emergency-autopilot-loop.mp4',
    plannedPath: 'assets/story/vid-16-emergency-autopilot-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'emergency autopilot escape evidence loop, small cargo ship launches from an orbital freight hangar, no readable text, no logos',
    notes: 'Generated from IMG-17, then returned to the source frame for a compact loop.',
  },
  {
    id: 'VID-17',
    type: 'video',
    title: 'Family Route Ledger Loop',
    storyKinds: ['identity'],
    phase: 'warm',
    src: 'assets/story/vid-17-family-route-ledger-loop.mp4',
    plannedPath: 'assets/story/vid-17-family-route-ledger-loop.mp4',
    generator: 'LTX 2-part loop',
    prompt: 'family shipping route ledger evidence loop, holographic cargo lanes crawl across a station archive table, no readable text, no logos',
    notes: 'Generated from IMG-18, then returned to the source frame for a compact loop.',
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

const MEDIA_POSTER_BY_ID = {
  'VID-01': 'assets/story/img-02-warm-alias-hit.png',
  'VID-02': 'assets/story/img-03-black-box-fragment.png',
  'VID-03': 'assets/story/img-05-owner-registry.png',
  'VID-04': 'assets/story/img-06-autopilot-escape.png',
  'VID-05': 'assets/story/img-07-family-ledger.png',
  'VID-06': 'assets/story/img-04-final-berth.png',
  'VID-07': 'assets/story/img-08-syndicate-trace.png',
  'VID-08': 'assets/story/img-09-family-signal.png',
  'VID-09': 'assets/story/img-10-family-locker.png',
  'VID-10': 'assets/story/img-11-private-signal-cache.png',
  'VID-11': 'assets/story/img-12-wreck-ping.png',
  'VID-12': 'assets/story/img-13-rescue-beacon.png',
  'VID-13': 'assets/story/img-14-dock-camera-trace.png',
  'VID-14': 'assets/story/img-16-recorder-decode.png',
  'VID-15': 'assets/story/img-15-syndicate-door.png',
  'VID-16': 'assets/story/img-17-emergency-autopilot.png',
  'VID-17': 'assets/story/img-18-family-route-ledger.png',
};

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
    runs: 0,
    bestWave: 1,
    bestDistance: 0,
    totalDistance: 0,
    flightSeconds: 0,
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

// Load-with-defaults. Anything this build does not know about is carried
// forward untouched, so a save written by a newer version (or synced down from
// another device running one) is never quietly trimmed on the way through.
function loadSave() {
  const save = makeDefaultSave();
  let parsed = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return save;
    parsed = JSON.parse(raw);
  } catch {
    return save;
  }
  if (!parsed || typeof parsed !== 'object') return save;
  try {
    const known = new Set(Object.keys(save));
    for (const key of Object.keys(parsed)) {
      if (!known.has(key)) save[key] = parsed[key];
    }
    save.credits = Math.max(0, Number(parsed.credits) || 0);
    save.debt = Number.isFinite(Number(parsed.debt)) ? Math.max(0, Math.round(Number(parsed.debt))) : STARTING_DEBT;
    save.route = Math.max(1, Math.round(Number(parsed.route) || 1));
    for (const def of UPGRADE_DEFS) {
      save.upgrades[def.id] = clamp(Number(parsed.upgrades?.[def.id]) || 0, 0, def.max);
    }
    save.stats = { ...makeDefaultStats(), ...(parsed.stats || {}) };
    for (const key of Object.keys(makeDefaultStats())) {
      save.stats[key] = Math.max(0, Number(save.stats[key]) || 0);
    }
    save.stats.bestCargo = Math.max(save.stats.bestCargo, getCargoCapacity(save.upgrades.cargo || 0));
    save.stats.bestWave = Math.max(1, save.stats.bestWave);
    save.story = normalizeStory(parsed.story);
  } catch {
    return makeDefaultSave();
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
    if (!parsed || typeof parsed !== 'object') return settings;
    const known = new Set(Object.keys(settings));
    for (const key of Object.keys(parsed)) {
      if (!known.has(key)) settings[key] = parsed[key];
    }
    settings.sound = parsed.sound !== false;
    settings.music = Boolean(parsed.music);
    settings.haptics = parsed.haptics !== false;
  } catch {
    return makeDefaultSettings();
  }
  return settings;
}

// `outpace-best` replaced `void-cockpit-best` when the game was renamed. Fold
// the old value in once so the account only ever carries the current key, then
// drop the legacy one. Demo runs never touch stored progress.
function migrateLegacyBest() {
  if (DEMO_MODE) return;
  try {
    const legacy = localStorage.getItem(LEGACY_BEST_KEY);
    if (legacy === null) return;
    const merged = Math.max(Number(localStorage.getItem(BEST_KEY)) || 0, Number(legacy) || 0);
    localStorage.setItem(BEST_KEY, String(merged));
    localStorage.removeItem(LEGACY_BEST_KEY);
  } catch {
    /* private mode / quota — the in-memory best still works for this session */
  }
}

let deferredSaveTimer = 0;
let saveIsDirty = false;

function flushProgressSave() {
  if (DEMO_MODE || !saveIsDirty) return;
  window.clearTimeout(deferredSaveTimer);
  deferredSaveTimer = 0;
  saveIsDirty = false;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.save));
}

function saveProgress({ defer = false } = {}) {
  if (DEMO_MODE) return;
  saveIsDirty = true;
  if (!defer) {
    flushProgressSave();
    return;
  }
  if (!deferredSaveTimer) deferredSaveTimer = window.setTimeout(flushProgressSave, 450);
}

function saveSettings() {
  if (DEMO_MODE) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

/* ---------------------------------------------------------- br8t account ---
 * Optional. cloud.mjs mirrors the durable save keys to the player's br8t
 * account so progress follows them between devices. Nothing here is
 * load-bearing: if the account layer cannot load — offline, blocked, opened
 * from file:// — the import rejects, we swallow it, and the game plays on with
 * its ordinary local save. Demo and automated runs stay hermetic.
 */
let accountCloud = null;

function setupAccountCloud() {
  if (DEMO_MODE || params.has('test') || params.has('soak') || params.has('nocloud')) return;
  if (location.protocol === 'file:') return;
  import('./cloud.mjs')
    .then((mod) => { accountCloud = mod; })
    .catch(() => { /* play on locally */ });
}

function notifyRunCompleted() {
  try { accountCloud?.runFinished?.(); } catch { /* never block the results screen */ }
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

migrateLegacyBest();

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
  skyLook: null,
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
  hudTimer: 0,
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
  reticleX: null,
  reticleY: null,
  laserOverlayActive: false,
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
// Eased back a touch from 0.0066: the extra station and rock detail is only
// worth having if you can see it before it is on top of you. Things still fade
// out of the dark, just a little sooner.
scene.fog = new THREE.FogExp2(0x050608, 0.0058);

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

/* ---------------------------------------------------------- shared assets ---
 * Stations are built out of scaled instances of a handful of geometries rather
 * than a fresh BoxGeometry per block. A dock station used to allocate ~70
 * geometries (and 70 GPU buffer uploads) every time you docked; now it uploads
 * nothing. `userData.shared` is what stops removeObject() disposing them.
 */
const shareGeometry = (geometry) => { geometry.userData.shared = true; return geometry; };
const UNIT_BOX = shareGeometry(new THREE.BoxGeometry(1, 1, 1));
const UNIT_CYL = shareGeometry(new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1));
const UNIT_SPHERE = shareGeometry(new THREE.SphereGeometry(0.5, 14, 10));
const UNIT_DISH = shareGeometry(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.44));
const RING_THIN = shareGeometry(new THREE.TorusGeometry(1, 0.03, 6, 40));
const RING_THICK = shareGeometry(new THREE.TorusGeometry(1, 0.072, 8, 44));

const HIGH_DETAIL = !isCoarsePointer();

function makeCanvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function wrapTexture(canvasElement, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 2;
  return texture;
}

// Panel seams and tonal blotches. Kept deliberately soft and non-directional
// because it is stretched over boxes of wildly different proportions.
const hullPanelCanvas = (() => {
  const element = makeCanvas(256, 256);
  const ctx = element.getContext('2d');
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i += 1) {
    const w = rand(18, 92);
    const h = rand(18, 92);
    const shade = Math.round(rand(126, 196));
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 10}, ${rand(0.18, 0.5).toFixed(3)})`;
    ctx.fillRect(rand(0, 256), rand(0, 256), w, h);
  }
  ctx.strokeStyle = 'rgba(48, 56, 66, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i += 1) {
    const p = i * 64;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(36, 42, 50, 0.6)';
  for (let i = 0; i < 60; i += 1) ctx.fillRect(rand(0, 256), rand(0, 256), rand(2, 7), rand(2, 5));
  return element;
})();

// Rows of lit cabins. Used as an emissiveMap, so one canvas lights every
// habitat block and every ring on every station.
const windowRowCanvas = (() => {
  const element = makeCanvas(256, 64);
  const ctx = element.getContext('2d');
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, 256, 64);
  for (let row = 0; row < 4; row += 1) {
    for (let i = 0; i < 32; i += 1) {
      const roll = Math.random();
      if (roll < 0.24) continue;
      const level = rand(0.5, 1);
      const warm = roll > 0.8;
      const r = Math.round((warm ? 255 : 152) * level);
      const g = Math.round((warm ? 190 : 238) * level);
      const b = Math.round((warm ? 112 : 255) * level);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(i * 8 + 2, row * 16 + 5, 4, 6);
    }
  }
  return element;
})();

const solarCellCanvas = (() => {
  const element = makeCanvas(128, 128);
  const ctx = element.getContext('2d');
  const sheen = ctx.createLinearGradient(0, 0, 128, 128);
  sheen.addColorStop(0, '#1b2a5c');
  sheen.addColorStop(0.5, '#101a3a');
  sheen.addColorStop(1, '#243a72');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(120, 160, 220, 0.42)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i += 1) {
    const p = i * 16;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(128, p); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(190, 220, 255, 0.14)';
  for (let i = 0; i < 12; i += 1) ctx.fillRect(rand(0, 128), rand(0, 128), rand(6, 18), rand(4, 12));
  return element;
})();

const hullPanelTexture = wrapTexture(hullPanelCanvas, 1, 1);
const windowRowTexture = wrapTexture(windowRowCanvas, 1, 1);
const windowRingTexture = wrapTexture(windowRowCanvas, 22, 1);
const solarCellTexture = wrapTexture(solarCellCanvas, 2, 1);

const materials = {
  // Rock types. Plain rock keeps the original palette; ice is smooth and pale
  // so it catches the sun, metal is dark and specular with an ochre variant.
  rock: [
    new THREE.MeshStandardMaterial({ color: 0x6d5b4d, roughness: 0.92, metalness: 0.08, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x50423a, roughness: 0.96, metalness: 0.04, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7c7468, roughness: 0.9, metalness: 0.1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.88, metalness: 0.06, flatShading: true }),
  ],
  ice: [
    new THREE.MeshStandardMaterial({ color: 0xa9d8e8, roughness: 0.34, metalness: 0.06, emissive: 0x0d2b3a, emissiveIntensity: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0xc4e6f2, roughness: 0.26, metalness: 0.04, emissive: 0x102f3d, emissiveIntensity: 0.45 }),
  ],
  metalRock: [
    new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 0.34, metalness: 0.86, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7d6a4c, roughness: 0.42, metalness: 0.78, flatShading: true }),
  ],
  drone: new THREE.MeshStandardMaterial({ color: 0x243642, roughness: 0.42, metalness: 0.72, flatShading: true }),
  droneWing: new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.48, metalness: 0.78, flatShading: true }),
  droneGlow: new THREE.MeshStandardMaterial({ color: 0xff7b39, emissive: 0xff3d1c, emissiveIntensity: 2.8, roughness: 0.22, metalness: 0.2 }),
  station: new THREE.MeshStandardMaterial({ color: 0x2c3a44, map: hullPanelTexture, roughness: 0.36, metalness: 0.86 }),
  stationDark: new THREE.MeshStandardMaterial({ color: 0x0d1218, map: hullPanelTexture, roughness: 0.5, metalness: 0.7 }),
  stationGlow: new THREE.MeshStandardMaterial({ color: 0x56e4ff, emissive: 0x19cfff, emissiveIntensity: 2.1, roughness: 0.25, metalness: 0.25 }),
  amberGlow: new THREE.MeshStandardMaterial({ color: 0xffb455, emissive: 0xff7e2f, emissiveIntensity: 2.1, roughness: 0.28, metalness: 0.25 }),
  dockHull: new THREE.MeshStandardMaterial({ color: 0x33424a, map: hullPanelTexture, roughness: 0.44, metalness: 0.8 }),
  dockDark: new THREE.MeshStandardMaterial({ color: 0x0d1116, map: hullPanelTexture, roughness: 0.52, metalness: 0.75 }),
  // The material split: bare metal, painted hull, glass and lit cabins all
  // catch the sun differently, which is what stops a station reading as one
  // grey lump.
  hullMetal: new THREE.MeshStandardMaterial({ color: 0x9aa6b4, map: hullPanelTexture, roughness: 0.32, metalness: 0.9 }),
  hullPaint: new THREE.MeshStandardMaterial({ color: 0xa9b0b8, map: hullPanelTexture, roughness: 0.66, metalness: 0.12 }),
  hullAccent: new THREE.MeshStandardMaterial({ color: 0xa8672c, map: hullPanelTexture, roughness: 0.58, metalness: 0.18 }),
  hullGlass: new THREE.MeshStandardMaterial({ color: 0x0b1a24, roughness: 0.06, metalness: 0.24, emissive: 0x0a2836, emissiveIntensity: 0.6 }),
  hullWindows: new THREE.MeshStandardMaterial({ color: 0x05070b, emissive: 0xffffff, emissiveMap: windowRowTexture, emissiveIntensity: 1.55, roughness: 0.42, metalness: 0.3 }),
  ringWindows: new THREE.MeshStandardMaterial({ color: 0x05070b, emissive: 0xffffff, emissiveMap: windowRingTexture, emissiveIntensity: 1.7, roughness: 0.42, metalness: 0.3 }),
  solarPanel: new THREE.MeshStandardMaterial({ color: 0x3b539a, map: solarCellTexture, roughness: 0.34, metalness: 0.45, side: THREE.DoubleSide }),
  beaconRed: new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff2a12, emissiveIntensity: 3.2, roughness: 0.3 }),
  beaconWhite: new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: 0xbfeeff, emissiveIntensity: 3, roughness: 0.3 }),
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

const beamPools = {
  player: [],
  enemy: [],
};

const particleMaterial = new THREE.PointsMaterial({
  size: 1.1,
  color: 0xffb15c,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const EXPLOSION_PARTICLE_CAPACITY = 40;
const particlePool = [];

function createParticleObject() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EXPLOSION_PARTICLE_CAPACITY * 3), 3));
  geometry.setDrawRange(0, 0);
  const material = particleMaterial.clone();
  const points = new THREE.Points(geometry, material);
  points.userData = {
    ttl: 0,
    life: 0,
    count: 0,
    velocities: Array.from({ length: EXPLOSION_PARTICLE_CAPACITY }, () => new THREE.Vector3()),
  };
  return points;
}

const starGeometry = new THREE.BufferGeometry();
const starCount = 980;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSideSpeeds = new Float32Array(starCount);
const starDepthSpeeds = new Float32Array(starCount);

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
  starDepthSpeeds[index] = rand(0.64, 1.58);
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

/* ----------------------------------------------------------- asteroid rock ---
 * Displaced icosahedra rather than obvious low-poly spheres: three octaves of
 * cheap sine noise for the lumps, a random axis squash so silhouettes differ
 * even at equal scale, and a few cosine craters punched in. The displacement is
 * a pure function of the normalised vertex position, so the duplicated verts
 * along PolyhedronGeometry's seams move together and no cracks open up.
 */
function rockNoise(x, y, z, f) {
  return Math.sin(x * f * 1.7 + y * f * 0.9 + 1.3) * Math.cos(z * f * 1.31 - x * f * 0.62)
    + Math.sin(y * f * 2.13 - z * f * 1.07) * 0.62;
}

const ROCK_PROFILES = {
  rock: { lumpiness: 1, grain: 1, craters: 4, craterDepth: 1, materials: 'rock', flat: true },
  ice: { lumpiness: 0.62, grain: 0.5, craters: 2, craterDepth: 0.55, materials: 'ice', flat: false },
  metal: { lumpiness: 1.25, grain: 1.4, craters: 3, craterDepth: 0.8, materials: 'metalRock', flat: true },
};

function makeAsteroidGeometry(detail, profile) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const squash = { x: rand(0.72, 1.2), y: rand(0.6, 1.14), z: rand(0.74, 1.22) };
  const phase = rand(0, 30);
  const craters = Array.from({ length: profile.craters }, () => {
    const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    return {
      dir: dir.normalize(),
      radius: rand(0.24, 0.56),
      depth: rand(0.1, 0.27) * profile.craterDepth,
    };
  });

  for (let i = 0; i < position.count; i += 1) {
    tmpVector.fromBufferAttribute(position, i).normalize();
    const { x, y, z } = tmpVector;
    let r = 0.9;
    r += rockNoise(x + phase, y + phase, z + phase, 1.6) * 0.155 * profile.lumpiness;
    r += rockNoise(x + phase * 1.7, y + phase * 1.7, z + phase * 1.7, 3.7) * 0.07 * profile.lumpiness;
    r += rockNoise(x - phase, y - phase, z - phase, 8.3) * 0.024 * profile.grain;
    for (const crater of craters) {
      const rim = 1 - crater.radius;
      const t = (x * crater.dir.x + y * crater.dir.y + z * crater.dir.z - rim) / crater.radius;
      if (t > 0) r -= Math.sin(Math.min(1, t) * Math.PI * 0.5) * crater.depth;
    }
    r = clamp(r, 0.42, 1.5);
    position.setXYZ(i, x * r * squash.x, y * r * squash.y, z * r * squash.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return shareGeometry(geometry);
}

// Built on demand and cached: small rocks get a coarse mesh, big ones a finer
// one, and coarse-pointer devices never build the highest tier at all.
const asteroidGeometryCache = new Map();

function getAsteroidGeometries(type, detail) {
  const key = `${type}:${detail}`;
  let pool = asteroidGeometryCache.get(key);
  if (!pool) {
    pool = Array.from({ length: 4 }, () => makeAsteroidGeometry(detail, ROCK_PROFILES[type]));
    asteroidGeometryCache.set(key, pool);
  }
  return pool;
}

function addGlowPanel(parent, x, y, z, sx, sy, sz, material = materials.stationGlow) {
  const panel = new THREE.Mesh(UNIT_BOX, material);
  panel.position.set(x, y, z);
  panel.scale.set(sx, sy, sz);
  parent.add(panel);
  return panel;
}

function addDockBlock(parent, x, y, z, sx, sy, sz, material = materials.dockHull) {
  const block = new THREE.Mesh(UNIT_BOX, material);
  block.position.set(x, y, z);
  block.scale.set(sx, sy, sz);
  parent.add(block);
  return block;
}

function addShape(parent, geometry, material, x, y, z, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else if (scale) mesh.scale.set(scale.x ?? 1, scale.y ?? 1, scale.z ?? 1);
  parent.add(mesh);
  return mesh;
}

// A habitat ring plus the band of lit cabins around its inner face. Two draw
// calls for the single most recognisable piece of station silhouette.
function addHabitatRing(parent, radius, z, hullMaterial = materials.hullPaint) {
  const ring = addShape(parent, RING_THICK, hullMaterial, 0, 0, z, radius);
  const cabins = addShape(parent, RING_THIN, materials.ringWindows, 0, 0, z, radius * 0.985);
  return { ring, cabins };
}

// A trussed solar wing. `dir` is -1 or 1 for which side it hangs off.
function addSolarWing(parent, dir, x, y, z, span, chord) {
  addDockBlock(parent, x + dir * span * 0.28, y, z, span * 0.56, 0.16, 0.16, materials.hullMetal);
  addShape(parent, UNIT_BOX, materials.solarPanel, x + dir * span * 0.62, y, z + chord * 0.02, { x: span * 0.62, y: 0.04, z: chord });
  addDockBlock(parent, x + dir * span * 0.62, y, z, 0.1, 0.1, chord * 1.02, materials.hullMetal);
}

// Static children never move again, so stop three.js recomputing their local
// matrices every frame. The parent group still animates normally.
function freezeStatic(group) {
  group.traverse((child) => {
    if (child === group) return;
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  return group;
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
  // Rock type is cosmetic only — it never changes hp, damage or value.
  const typeRoll = Math.random();
  const rockType = typeRoll < 0.68 ? 'rock' : typeRoll < 0.86 ? 'ice' : 'metal';
  const detail = sizeClass === 'large' && HIGH_DETAIL ? 3 : 2;
  const mesh = new THREE.Mesh(pick(getAsteroidGeometries(rockType, detail)), pick(materials[ROCK_PROFILES[rockType].materials]));
  mesh.scale.setScalar(size);
  mesh.position.set(rand(-18, 18), rand(-10, 11), rand(-185, -120));
  mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  // One random axis, and the bigger the rock the slower it turns — reads as mass.
  const spinAxis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  if (spinAxis.lengthSq() < 1e-4) spinAxis.set(0, 1, 0);
  spinAxis.normalize().multiplyScalar(rand(0.16, 0.62) / (0.55 + size * 0.2));
  mesh.userData = {
    kind: 'asteroid',
    sizeClass,
    rockType,
    radius: size * 0.9,
    spin: spinAxis,
    baseScale: size,
    hitFlash: 0,
    hp,
    impactDamage,
    value: Math.round(size * (sizeClass === 'large' ? 72 : sizeClass === 'medium' ? 52 : 38)),
    speedScale: rand(0.82, 1.16),
    nearMissAwarded: false,
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
    baseScale: 1,
    hitFlash: 0,
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

/* -------------------------------------------------------- passing stations ---
 * Built once into a couple of prototypes at first use, then cloned per spawn.
 * clone() shares geometry and materials, so a spawn costs no GPU upload and no
 * geometry allocation at all — it is just a tree of Object3Ds.
 */
function buildStationPrototype(variant) {
  const group = new THREE.Group();

  // Core spine: metal hull, painted collar, a band of lit cabins, glass nose.
  addShape(group, UNIT_CYL, materials.hullMetal, 0, 0, 0, { x: 4.6, y: 12.4, z: 4.6 }).rotation.x = Math.PI / 2;
  addDockBlock(group, 0, 0, 0, 6.6, 4.2, 5.2, materials.hullPaint);
  addDockBlock(group, 0, 0, 0.1, 6.9, 1.7, 5.4, materials.hullWindows);
  addShape(group, UNIT_CYL, materials.hullAccent, 0, 0, 4.2, { x: 3.6, y: 1.5, z: 3.6 }).rotation.x = Math.PI / 2;
  addShape(group, UNIT_SPHERE, materials.hullGlass, 0, 0, 5.4, 2.6);

  // Habitat ring and its spokes.
  addHabitatRing(group, 8.2, -0.9);
  const spokes = variant === 0 ? 4 : 3;
  for (let i = 0; i < spokes; i += 1) {
    const angle = (i / spokes) * Math.PI * 2 + 0.3;
    const spoke = addDockBlock(group, Math.cos(angle) * 4.4, Math.sin(angle) * 4.4, -0.9, 8.4, 0.5, 0.5, materials.hullMetal);
    spoke.rotation.z = angle;
  }

  // Docking arms with clamp heads.
  for (const rot of [0, Math.PI / 2]) {
    const arm = addDockBlock(group, 0, 0, 0, 18, 0.7, 1.1, materials.hullMetal);
    arm.rotation.z = rot;
    for (const side of [-1, 1]) {
      const clamp3d = addDockBlock(group, Math.cos(rot) * side * 8.4, Math.sin(rot) * side * 8.4, 0, 1.5, 1.5, 2.1, materials.hullPaint);
      clamp3d.rotation.z = rot;
    }
  }

  // Solar wings, angled off the spine.
  addSolarWing(group, -1, -3.4, 0, -3.6, 9.5, 5.2);
  addSolarWing(group, 1, 3.4, 0, -3.6, 9.5, 5.2);

  // Comms mast and dish.
  addDockBlock(group, 0, 3.1, -2.2, 0.18, 4.4, 0.18, materials.hullMetal);
  const dish = addShape(group, UNIT_DISH, materials.hullPaint, 0, 5.2, -2.2, 3.1);
  dish.rotation.x = -0.6;

  // Greebles: tanks, crates and pipe runs. The detail you only see up close,
  // so coarse-pointer devices skip it.
  if (HIGH_DETAIL) {
    for (let i = 0; i < 7; i += 1) {
      const side = i % 2 ? -1 : 1;
      addDockBlock(
        group,
        side * rand(1.4, 3.2), rand(-2.4, 2.4), rand(-2.6, 3.4),
        rand(0.5, 1.5), rand(0.5, 1.3), rand(0.6, 1.9),
        i % 3 === 0 ? materials.hullAccent : materials.stationDark,
      );
    }
    for (const side of [-1, 1]) {
      addShape(group, UNIT_CYL, materials.hullMetal, side * 2.9, -1.9, 1.2, { x: 0.8, y: 3.4, z: 0.8 }).rotation.x = Math.PI / 2;
    }
  }

  // Running lights around the ring, plus a red/white beacon pair.
  const beacons = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    addGlowPanel(group, Math.cos(angle) * 8.4, Math.sin(angle) * 8.4, 0.2, 0.34, 0.68, 0.14, i % 3 ? materials.stationGlow : materials.amberGlow);
  }
  addGlowPanel(group, -2.8, 2.2, 3.75, 1.7, 0.26, 0.18, materials.stationGlow);
  addGlowPanel(group, 2.7, -2.1, 3.75, 1.5, 0.26, 0.18, materials.amberGlow);
  beacons.push(addShape(group, UNIT_SPHERE, materials.beaconRed, 0, 6.9, -2.2, 0.5));
  beacons.push(addShape(group, UNIT_SPHERE, materials.beaconWhite, -9.1, 0, 0, 0.44));
  beacons.push(addShape(group, UNIT_SPHERE, materials.beaconRed, 9.1, 0, 0, 0.44));

  freezeStatic(group);
  // Deliberately NOT stored in userData: Object3D.copy() round-trips userData
  // through JSON, and a mesh reference in there makes clone() throw on the
  // circular parent/children link. The clone re-finds its beacons by material.
  return group;
}

let stationPrototypes = null;

function createStation() {
  if (!stationPrototypes) stationPrototypes = [buildStationPrototype(0), buildStationPrototype(1)];
  const group = pick(stationPrototypes).clone(true);
  // clone() copies the array by reference; re-resolve against the clone's tree.
  const beacons = [];
  group.traverse((child) => {
    if (child.material === materials.beaconRed || child.material === materials.beaconWhite) beacons.push(child);
  });

  // Scenery, not an obstacle — nothing in the collision pass looks at a
  // station. So it must never be anywhere the ship can reach, or you fly clean
  // through a structure the size of a town and the game says nothing. It used
  // to spawn at x 16..30 and drift INWARD at up to 1.8/s for ten seconds, which
  // walked it straight down the corridor and through the cockpit.
  const side = Math.random() > 0.5 ? 1 : -1;
  const scale = rand(1, 1.6);
  group.position.set(side * rand(38, 74), rand(-16, 20), rand(-340, -260));
  group.rotation.set(rand(-0.2, 0.2), side * rand(0.28, 0.62), rand(-0.3, 0.3));
  group.scale.setScalar(scale);
  group.userData = {
    kind: 'station',
    radius: 10 * scale,
    hp: 999,
    value: 0,
    speedScale: 0.5,
    // Outward, so it opens away from the flight path as it comes past.
    drift: -side * rand(0.3, 1.0),
    // Belt and braces: whatever the drift does, it stays this far off the
    // corridor. The player can reach roughly x ±11, y ±7.5.
    minClearX: 10 * scale + 22,
    beacons,
    beaconPhase: rand(0, Math.PI * 2),
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

  // Outer frame: painted hull outside, bare metal inner face, and a row of lit
  // cabins along each beam so the thing reads as inhabited at any distance.
  addDockBlock(group, 0, height * 0.42, 0, width, 2.2, depth, materials.hullPaint);
  addDockBlock(group, 0, -height * 0.42, 0, width, 2.2, depth, materials.hullPaint);
  addDockBlock(group, -width * 0.47, 0, 0, 2.4, height, depth, materials.hullMetal);
  addDockBlock(group, width * 0.47, 0, 0, 2.4, height, depth, materials.hullMetal);
  addDockBlock(group, 0, height * 0.42, depth * 0.51, width * 0.9, 0.9, 0.1, materials.hullWindows);
  addDockBlock(group, 0, -height * 0.42, depth * 0.51, width * 0.9, 0.9, 0.1, materials.hullWindows);
  addDockBlock(group, -width * 0.47, 0, depth * 0.51, 0.9, height * 0.82, 0.1, materials.hullWindows);
  addDockBlock(group, width * 0.47, 0, depth * 0.51, 0.9, height * 0.82, 0.1, materials.hullWindows);
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

  const rungSteps = HIGH_DETAIL ? 6 : 4;
  for (let i = 0; i < rungSteps; i += 1) {
    const z = -depth * 0.28 + i * (tunnelLength / (rungSteps - 1));
    const material = i % 2 ? materials.hullMetal : materials.dockDark;
    addDockBlock(group, 0, railY, z, railX * 2.08, 0.22, 0.42, material);
    addDockBlock(group, 0, -railY, z, railX * 2.08, 0.22, 0.42, material);
    addDockBlock(group, -railX, 0, z, 0.22, railY * 2.08, 0.42, material);
    addDockBlock(group, railX, 0, z, 0.22, railY * 2.08, 0.42, material);
  }

  addDockBlock(group, 0, height * 0.22, -depth * 0.62, width * 0.55, 0.26, 0.34, materials.dockDark);
  addDockBlock(group, 0, -height * 0.22, -depth * 0.62, width * 0.55, 0.26, 0.34, materials.dockDark);
  addDockBlock(group, -width * 0.28, 0, -depth * 0.62, 0.26, height * 0.44, 0.34, materials.dockDark);
  addDockBlock(group, width * 0.28, 0, -depth * 0.62, 0.26, height * 0.44, 0.34, materials.dockDark);

  // The landing strip belongs on the deck. It used to run down the middle of
  // the aperture at y=0, which from the cockpit read as a shelf across the hole
  // you were being told to fly through.
  const deckY = -height * 0.3;
  addDockBlock(group, 0, deckY, -1.2, width * 0.62, 0.34, depth * 1.2, materials.dockRunway);
  addDockBlock(group, 0, deckY + 0.5, -1.1, width * 0.42, 0.16, depth * 1.24, materials.dockWarning);
  addDockBlock(group, 0, deckY - 0.5, -1.1, width * 0.42, 0.16, depth * 1.24, materials.dockWarning);

  const greebleCount = (HIGH_DETAIL ? 10 : 6) + (type === 'mega' ? 10 : type === 'large' ? 5 : 0);
  for (let i = 0; i < greebleCount; i += 1) {
    const side = i % 2 ? -1 : 1;
    const x = side * rand(width * 0.58, width * 0.86);
    const y = rand(-height * 0.46, height * 0.46);
    const z = rand(-depth * 0.85, depth * 0.45);
    const material = i % 5 === 0 ? materials.hullAccent : i % 4 === 0 ? materials.dockDark : materials.hullPaint;
    addDockBlock(group, x, y, z, rand(1.1, 3.8), rand(0.8, 2.4), rand(1.5, 4.5), material);
  }

  // Approach lights down each side of the aperture. Kept in userData so the
  // chase can be run from updateObjects without re-querying the tree.
  const chaseLights = [];
  for (let i = 0; i < 18; i += 1) {
    const side = i % 2 ? -1 : 1;
    const y = -height * 0.42 + (i % 9) * (height * 0.84 / 8);
    const material = i % 3 === 0 ? materials.dockWarning : materials.dockRunway;
    chaseLights.push(addGlowPanel(group, side * width * 0.36, y, depth * 0.52, 0.32, 0.22, 0.18, material));
  }

  // The habitat ring behind the aperture, and its lit cabins.
  if (type !== 'small') addHabitatRing(group, width * 0.42, -depth * 0.48, materials.hullMetal);

  // Solar wings and a comms mast — the modules that tell you how big this is.
  const wingSpan = width * (type === 'mega' ? 0.52 : 0.44);
  addSolarWing(group, -1, -width * 0.5, height * 0.2, -depth * 0.3, wingSpan, height * 0.5);
  addSolarWing(group, 1, width * 0.5, -height * 0.2, -depth * 0.3, wingSpan, height * 0.5);
  addDockBlock(group, width * 0.2, height * 0.5, -depth * 0.2, 0.2, height * 0.42, 0.2, materials.hullMetal);
  const dockDish = addShape(group, UNIT_DISH, materials.hullPaint, width * 0.2, height * 0.74, -depth * 0.2, height * 0.3);
  dockDish.rotation.x = -0.7;

  // Freighters parked along the outer hull. Nothing sells scale like something
  // ship-sized looking small against the structure.
  const parkedCount = type === 'mega' ? 3 : type === 'large' ? 2 : 1;
  for (let i = 0; i < parkedCount; i += 1) {
    const side = i % 2 ? -1 : 1;
    const px = side * width * rand(0.52, 0.62);
    const py = rand(-height * 0.3, height * 0.3);
    const pz = -depth * rand(0.1, 0.5);
    addDockBlock(group, px, py, pz, 1.1, 0.8, 3.4, materials.hullPaint);
    addDockBlock(group, px, py, pz - 1.9, 0.7, 0.55, 0.9, materials.hullMetal);
    addGlowPanel(group, px, py, pz + 1.9, 0.34, 0.28, 0.2, materials.amberGlow);
  }

  /* ------------------------------------------- the berth you fly into ---
   * The dock used to be four painted beams around a hole: less structure than
   * the stations you merely pass, and no cue at all that you were flying INTO
   * anything. Three things fix that, and they scale with `type` so a small
   * depot stays a small depot.
   *   1. hull mass behind the opening, so it is a building with a bay in it
   *      rather than a picture frame floating in space;
   *   2. a funnel of guide pylons reaching back toward the ship, which is what
   *      actually reads as "aim here";
   *   3. a lit bay behind the throat, so the hole goes somewhere.
   */

  // 1. Mass. A deeper outer shell set back from the aperture, with lit cabins
  // along it and solid corner blocks tying the beams together.
  const shellDepth = depth * 1.55;
  const shellZ = -depth * 0.34;
  addDockBlock(group, 0, height * 0.5, shellZ, width * 1.06, 3.1, shellDepth, materials.dockHull);
  addDockBlock(group, 0, -height * 0.5, shellZ, width * 1.06, 3.1, shellDepth, materials.dockHull);
  addDockBlock(group, -width * 0.53, 0, shellZ, 3.1, height * 1.1, shellDepth, materials.dockHull);
  addDockBlock(group, width * 0.53, 0, shellZ, 3.1, height * 1.1, shellDepth, materials.dockHull);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      addDockBlock(group, sx * width * 0.53, sy * height * 0.5, shellZ, 3.4, 3.4, shellDepth * 0.94, materials.hullPaint);
    }
    addDockBlock(group, sx * width * 0.545, 0, shellZ, 0.12, height * 0.86, shellDepth * 0.5, materials.hullWindows);
  }
  addDockBlock(group, 0, height * 0.515, shellZ, width * 0.92, 0.12, shellDepth * 0.5, materials.hullWindows);
  addDockBlock(group, 0, -height * 0.515, shellZ, width * 0.92, 0.12, shellDepth * 0.5, materials.hullWindows);

  // 2. The gate. A lit rectangular mouth around the aperture, with short
  // buttresses angled forward at the corners.
  //
  // This started as a long flaring funnel of guide pylons, which is the obvious
  // idea and was wrong: a funnel is widest at the end nearest you, and the game
  // is played in portrait, where the horizontal field of view is narrow. The
  // arms measured out at x ±34 while the frame reached ±31, so the whole thing
  // sat off screen and the approach looked exactly as bare as before. What
  // reads in a tall thin frame is a bright mouth you aim at and a lit tube
  // behind it, so that is what this is now.
  const gateZ = depth * 0.58;
  const gateX = width * 0.47;
  const gateY = height * 0.42;
  addGlowPanel(group, 0, gateY, gateZ, gateX * 2.05, 0.42, 0.42, materials.dockRunway);
  addGlowPanel(group, 0, -gateY, gateZ, gateX * 2.05, 0.42, 0.42, materials.dockRunway);
  addGlowPanel(group, -gateX, 0, gateZ, 0.42, gateY * 2.05, 0.42, materials.dockRunway);
  addGlowPanel(group, gateX, 0, gateZ, 0.42, gateY * 2.05, 0.42, materials.dockRunway);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const strut = addDockBlock(group, sx * gateX * 1.02, sy * gateY * 1.04, gateZ + depth * 0.22, 0.9, 0.9, depth * 0.62, materials.hullMetal);
      strut.rotation.set(-sy * 0.16, sx * 0.16, 0);
      chaseLights.push(addGlowPanel(group, sx * gateX * 1.06, sy * gateY * 1.08, gateZ + depth * 0.5, 0.7, 0.7, 0.7, materials.dockWarning));
    }
  }

  // 3. The bay behind the throat. Without this the aperture is a window onto
  // empty space, which is exactly why it never felt like arriving anywhere.
  const bayZ = -depth * 1.05;
  addDockBlock(group, 0, 0, bayZ, width * 0.74, height * 0.72, 0.6, materials.dockDark);
  addDockBlock(group, 0, -height * 0.2, bayZ + 0.5, width * 0.62, 0.34, 0.3, materials.dockRunway);
  addDockBlock(group, 0, height * 0.16, bayZ + 0.5, width * 0.56, 0.5, 0.3, materials.hullWindows);
  for (const sx of [-1, 1]) {
    addDockBlock(group, sx * width * 0.26, -height * 0.04, bayZ + 1.4, 1.5, 1.1, 2.6, materials.hullPaint);
    addGlowPanel(group, sx * width * 0.26, -height * 0.04, bayZ + 2.9, 0.3, 0.24, 0.18, materials.amberGlow);
  }
  // Rib lights down the throat, so the tube itself is lit rather than implied.
  const ribs = HIGH_DETAIL ? 4 : 2;
  for (let i = 0; i < ribs; i += 1) {
    const z = depth * 0.4 - i * (depth * 1.2 / ribs);
    for (const sy of [-1, 1]) {
      chaseLights.push(addGlowPanel(group, 0, sy * height * 0.3, z, width * 0.5, 0.16, 0.16, materials.dockRunway));
    }
  }

  // Beacons at the aperture corners, re-lit every frame during the approach.
  const beacons = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      beacons.push(addShape(
        group,
        UNIT_SPHERE,
        sx * sy > 0 ? materials.beaconRed : materials.beaconWhite,
        sx * width * 0.47, sy * height * 0.42, depth * 0.56,
        0.62,
      ));
    }
  }

  if (type === 'mega') {
    for (let i = 0; i < 4; i += 1) {
      const arm = addDockBlock(group, 0, 0, -depth * 0.72, width * 1.15, 0.58, 1.2, materials.hullMetal);
      arm.rotation.z = i * Math.PI / 4;
    }
  }

  group.position.set(0, 0, -205);
  group.scale.setScalar(scale);
  freezeStatic(group);
  group.userData = {
    kind: 'dock',
    stationType: type,
    stationName,
    radius: width * scale * 0.55,
    hp: 999,
    speedScale: 0.82,
    chaseLights,
    beacons,
    passed: false,
  };
  scene.add(group);
  state.objects.push(group);
  state.dockObject = group;
  state.docking = true;
  return group;
}

function createBeam(start, end, material = beamMaterial, ttl = 0.12) {
  const poolKey = material === enemyBeamMaterial ? 'enemy' : 'player';
  const line = beamPools[poolKey].pop() || (() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const pooled = new THREE.Line(geometry, material.clone());
    pooled.userData.poolKey = poolKey;
    pooled.userData.baseOpacity = material.opacity ?? 0.9;
    return pooled;
  })();
  const position = line.geometry.attributes.position;
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  line.userData.ttl = ttl;
  line.userData.life = ttl;
  line.material.opacity = line.userData.baseOpacity;
  scene.add(line);
  state.beams.push(line);
  return line;
}

function releaseBeam(beam) {
  scene.remove(beam);
  beam.userData.life = 0;
  beam.material.opacity = beam.userData.baseOpacity ?? 0.9;
  beamPools[beam.userData.poolKey || 'player'].push(beam);
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

function getThreatScore(object, playerX, playerY, stats) {
  const data = object.userData;
  if (!['asteroid', 'drone'].includes(data.kind)) return -Infinity;
  if (object.position.z > 4 || object.position.z < -155) return -Infinity;
  const speed = Math.max(10, state.speed * data.speedScale);
  const timeToImpact = Math.max(0.1, (-1.5 - object.position.z) / speed);
  const lateral = Math.hypot(object.position.x - playerX, object.position.y - playerY);
  const threatRadius = data.radius + 3.4 + stats.lockAssist * 0.55;
  const pathThreat = clamp(1 - lateral / threatRadius, 0, 1);
  if (pathThreat <= 0.02) return -Infinity;
  const urgency = clamp(1 - timeToImpact / 3.6, 0, 1);
  const centerBias = clamp(1 - Math.hypot(object.position.x, object.position.y) / 25, 0, 1);
  const droneBonus = data.kind === 'drone' ? 42 : 0;
  const sizeBias = data.kind === 'asteroid'
    ? data.sizeClass === 'small' ? 18 : data.sizeClass === 'medium' ? 8 : -8
    : 0;
  const shotsNeeded = Math.ceil(data.hp / Math.max(0.1, stats.beamPower));
  const shotsPossible = timeToImpact / Math.max(0.08, stats.shotCooldown);
  const killWindow = clamp(shotsPossible / Math.max(1, shotsNeeded), 0, 1);
  const killability = killWindow * 26 - (killWindow < 0.45 ? 14 : 0);
  return pathThreat * 132 + urgency * 82 + centerBias * 16 + droneBonus + sizeBias + killability - timeToImpact * 5;
}

function acquireTarget() {
  const playerX = state.player.x * 11;
  const playerY = state.player.y * 7.5;
  const stats = getShipStats();
  let best = null;
  let bestScore = -Infinity;
  for (const object of state.objects) {
    const score = getThreatScore(object, playerX, playerY, stats);
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
      const threshold = 0.24 + stats.lockAssist * 0.018;
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
  const shouldDraw = state.running || state.laserBursts.length > 0;
  if (!shouldDraw) {
    if (state.laserOverlayActive) {
      const dpr = getOverlayPixelRatio();
      laserCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      laserCtx.clearRect(0, 0, laserCanvas.width / dpr, laserCanvas.height / dpr);
      state.laserOverlayActive = false;
    }
    return;
  }

  state.laserOverlayActive = true;
  const dpr = getOverlayPixelRatio();
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

/* ------------------------------------------------------- the docked window ---
 * What you see out of the lounge window while docked: a real 3D exterior with a
 * local sun, a planet and moon, and freighters drifting past. It used to be a
 * flat 2D painting of triangles on a gradient, which read as stickers on glass.
 *
 * The budget rules it plays by:
 *   - its own low-power WebGL context on the window canvas, created on the first
 *     dock and never rebuilt;
 *   - a reduced pixel ratio, because most of the canvas is behind the lounge
 *     plate anyway;
 *   - capped at 24 fps, and only stepped while the station overlay is actually
 *     on screen — motion still uses real delta, so it never runs fast or slow;
 *   - the main flight scene stops rendering entirely while docked, so this
 *     costs less than what it replaced.
 * If the second context cannot be created it falls back to the old 2D painter.
 */
const STATION_VIEW_STEP = 1 / 24;
const stationView = {
  ready: false,
  failed: false,
  renderer: null,
  scene: null,
  camera: null,
  accum: 0,
  width: 0,
  height: 0,
  planet: null,
  moon: null,
  sun: null,
  freighters: [],
  anchors: [],
};

/* ------------------------------------------------ lounge plate placement ---
 * The lounge is one portrait photograph (941x1672) drawn with object-fit:
 * cover, and the dock terminal happens to sit in its bottom-right corner. On
 * any viewport that is not the plate's own shape, cover crops it — so a hotspot
 * pinned with percentages of the SCREEN slides off the terminal, which is
 * exactly what it did: on a 1440x900 desktop the terminal was ~280px right of
 * where the button was.
 *
 * So nothing here is expressed in screen percentages. Everything is measured in
 * plate-image coordinates and mapped through the same cover transform the
 * browser uses — and the crop is deliberately biased to keep the terminal on
 * screen instead of centring the picture. The window panes are in the same
 * coordinates, which is also what lets the exterior scene stage itself inside
 * whichever pane is actually visible.
 */
const PLATE = {
  width: 941,
  height: 1672,
  // Panes measured by flood-filling the asset's alpha channel; the terminal
  // face measured from its cyan bezel. Biggest first — the stage picker walks
  // this list and takes whichever has the most visible area.
  panes: [
    { x0: 0.268, y0: 0.117, x1: 0.729, y1: 0.429 },
    { x0: 0.272, y0: 0.458, x1: 0.725, y1: 0.584 },
    { x0: 0.786, y0: 0.128, x1: 1.000, y1: 0.429 },
    { x0: 0.000, y0: 0.129, x1: 0.214, y1: 0.429 },
  ],
  face: { x0: 0.615, y0: 0.560, x1: 0.949, y1: 0.694 },
};

const plateFit = { width: 0, height: 0, scale: 1, offX: 0, offY: 0, posX: 0.5, posY: 0.5 };

// Resolve the cover transform for a container, biased so the terminal face
// lands low and right — where it would be if you were standing in the room —
// and clamped so it can never be cropped off an edge.
function fitPlate(containerWidth, containerHeight) {
  if (containerWidth === plateFit.width && containerHeight === plateFit.height) return plateFit;
  const scale = Math.max(containerWidth / PLATE.width, containerHeight / PLATE.height);
  const scaledWidth = PLATE.width * scale;
  const scaledHeight = PLATE.height * scale;
  const overflowX = Math.max(0, scaledWidth - containerWidth);
  const overflowY = Math.max(0, scaledHeight - containerHeight);
  // Preferred: face's far edge just inside the container's far edge. Then the
  // near-edge guard, in case the container is so small the face would run off
  // the other side. Clamp last, because only the clamp is a hard limit.
  let offX = Math.min(PLATE.face.x1 * scaledWidth - containerWidth * 0.985, PLATE.face.x0 * scaledWidth - containerWidth * 0.02);
  let offY = Math.min(PLATE.face.y1 * scaledHeight - containerHeight * 0.94, PLATE.face.y0 * scaledHeight - containerHeight * 0.06);
  offX = clamp(offX, 0, overflowX);
  offY = clamp(offY, 0, overflowY);
  plateFit.width = containerWidth;
  plateFit.height = containerHeight;
  plateFit.scale = scale;
  plateFit.scaledWidth = scaledWidth;
  plateFit.scaledHeight = scaledHeight;
  plateFit.offX = offX;
  plateFit.offY = offY;
  // What object-position needs to be for the browser to crop it the same way.
  plateFit.posX = overflowX > 0 ? offX / overflowX : 0.5;
  plateFit.posY = overflowY > 0 ? offY / overflowY : 0.5;
  return plateFit;
}

// A plate-space rect in container pixels.
function plateRect(rect, fit) {
  return {
    left: rect.x0 * fit.scaledWidth - fit.offX,
    top: rect.y0 * fit.scaledHeight - fit.offY,
    width: (rect.x1 - rect.x0) * fit.scaledWidth,
    height: (rect.y1 - rect.y0) * fit.scaledHeight,
  };
}

function layoutStationPlate() {
  if (!stationEl) return null;
  const width = stationEl.clientWidth || window.innerWidth;
  const height = stationEl.clientHeight || window.innerHeight;
  const fit = fitPlate(width, height);
  const plate = stationEl.querySelector('.station-plate');
  if (plate) plate.style.objectPosition = `${(fit.posX * 100).toFixed(3)}% ${(fit.posY * 100).toFixed(3)}%`;
  if (stationTerminalHotspot) {
    const box = plateRect(PLATE.face, fit);
    const style = stationTerminalHotspot.style;
    style.left = `${box.left.toFixed(1)}px`;
    style.top = `${box.top.toFixed(1)}px`;
    style.width = `${box.width.toFixed(1)}px`;
    style.height = `${box.height.toFixed(1)}px`;
    // Everything inside the button sizes off this, so the shine and the hint
    // text scale with the terminal rather than with the viewport.
    style.setProperty('--face-h', `${box.height.toFixed(1)}px`);
  }
  return fit;
}

function makeRadialTexture(stops) {
  const element = makeCanvas(128, 128);
  const ctx = element.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* Every dock used to look out on the same blue-green world in the same corner
 * of the same window, which made forty berths across the galaxy read as one
 * berth you kept coming back to. A world is rolled per dock instead: palette,
 * surface style, apparent size, where it sits in the pane — including half out
 * of frame — and whether it has rings. */
const PLANET_PALETTES = [
  { id: 'ocean',  halo: 0x74c8ff, sky: ['#d8e6ee', '#2f6c8e', '#1b4a68', '#2c6076', '#cfe2ea'], band: [60, 150, 110, 190, 120, 200], cloud: '224, 240, 246' },
  { id: 'ember',  halo: 0xff8a4a, sky: ['#ffd9ab', '#c9603a', '#6f2a1e', '#a8482c', '#ffcf9a'], band: [150, 220, 70, 130, 44, 90],    cloud: '255, 226, 190' },
  { id: 'jade',   halo: 0x7dffc4, sky: ['#dff6e6', '#3f8f63', '#1c4c37', '#2f7350', '#cdeeda'], band: [70, 140, 140, 210, 100, 160],  cloud: '226, 250, 236' },
  { id: 'violet', halo: 0xbf9dff, sky: ['#e6dcf6', '#6c4a9c', '#33215c', '#553b86', '#d8c9ee'], band: [110, 170, 80, 140, 170, 230],  cloud: '236, 226, 252' },
  { id: 'rust',   halo: 0xffb27a, sky: ['#f4dcc4', '#a86a3e', '#5f3421', '#8d5730', '#e8cba8'], band: [160, 210, 100, 150, 60, 100],  cloud: '250, 232, 210' },
  { id: 'ice',    halo: 0xbfe9ff, sky: ['#f2fbff', '#9ec8dc', '#6c9cb4', '#8bb8cc', '#e6f6ff'], band: [150, 200, 190, 230, 210, 245], cloud: '255, 255, 255' },
  { id: 'gold',   halo: 0xffd98a, sky: ['#fff0c8', '#c8a044', '#7a5e1e', '#a88434', '#f6e2ac'], band: [190, 240, 160, 210, 70, 120],  cloud: '255, 245, 214' },
  { id: 'ash',    halo: 0x9fb4c4, sky: ['#d4dce2', '#6a7784', '#3a444e', '#525d68', '#c2ccd4'], band: [110, 160, 120, 170, 130, 180], cloud: '224, 234, 242' },
  { id: 'crimson',halo: 0xff7d86, sky: ['#ffd6d6', '#a83c48', '#5c1c26', '#842c3a', '#f0bcbe'], band: [180, 230, 60, 110, 70, 120],   cloud: '255, 220, 220' },
  { id: 'teal',   halo: 0x5fe0d4, sky: ['#d6f6f2', '#2f8880', '#12474a', '#256a68', '#c2eeea'], band: [60, 120, 150, 210, 150, 205],  cloud: '214, 246, 242' },
];

function makePlanetTexture(palette, style) {
  const element = makeCanvas(256, 128);
  const ctx = element.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, 128);
  const stops = palette.sky;
  base.addColorStop(0, stops[0]);
  base.addColorStop(0.18, stops[1]);
  base.addColorStop(0.52, stops[2]);
  base.addColorStop(0.84, stops[3]);
  base.addColorStop(1, stops[4]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 128);
  const [r0, r1, g0, g1, b0, b1] = palette.band;

  if (style === 'banded') {
    // A gas giant: hard horizontal bands and one big storm.
    for (let i = 0; i < 30; i += 1) {
      const y = rand(4, 124);
      ctx.fillStyle = `rgba(${Math.round(rand(r0, r1))}, ${Math.round(rand(g0, g1))}, ${Math.round(rand(b0, b1))}, ${rand(0.12, 0.36).toFixed(3)})`;
      ctx.fillRect(0, y, 256, rand(2, 11));
    }
    ctx.fillStyle = `rgba(${Math.round(rand(r0, r1))}, ${Math.round(rand(g0, g1))}, ${Math.round(rand(b0, b1))}, 0.5)`;
    ctx.beginPath();
    ctx.ellipse(rand(40, 216), rand(40, 92), rand(20, 40), rand(8, 16), 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A rocky or ocean world: landmasses rather than bands.
    for (let i = 0; i < 22; i += 1) {
      ctx.fillStyle = `rgba(${Math.round(rand(r0, r1))}, ${Math.round(rand(g0, g1))}, ${Math.round(rand(b0, b1))}, ${rand(0.2, 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(rand(0, 256), rand(10, 118), rand(10, 40), rand(6, 22), rand(-0.6, 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Weather, and the polar caps that sell it as a sphere rather than a disc.
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = `rgba(${palette.cloud}, ${rand(0.1, 0.32).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(rand(0, 256), rand(14, 114), rand(14, 46), rand(3, 9), rand(-0.3, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  const cap = ctx.createLinearGradient(0, 0, 0, 128);
  cap.addColorStop(0, `rgba(${palette.cloud}, 0.55)`);
  cap.addColorStop(0.16, 'rgba(255, 255, 255, 0)');
  cap.addColorStop(0.84, 'rgba(255, 255, 255, 0)');
  cap.addColorStop(1, `rgba(${palette.cloud}, 0.5)`);
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, 256, 128);

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Ring band: one row of pixels read along the radius, so the ring gets Cassini
// gaps instead of being a flat washer.
function makeRingTexture(tint) {
  const element = makeCanvas(128, 1);
  const ctx = element.getContext('2d');
  ctx.clearRect(0, 0, 128, 1);
  for (let x = 0; x < 128; x += 1) {
    const t = x / 127;
    // Two dark gaps at fixed-ish radii, plus fine noise for the banding.
    const gap = Math.min(Math.abs(t - 0.34), Math.abs(t - 0.63));
    const shadow = gap < 0.035 ? 0.12 : 1;
    const noise = 0.55 + 0.45 * Math.sin(t * 47) * Math.sin(t * 13.7);
    const edge = Math.min(1, Math.min(t, 1 - t) * 9);
    ctx.fillStyle = `rgba(${tint}, ${(0.72 * shadow * noise * edge).toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 1);
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// RingGeometry's own UVs map onto a square, which smears a radial band texture
// into a plaid. Re-map u to normalised radius so it reads along the ring.
function makeRingGeometry(inner, outer) {
  const geometry = new THREE.RingGeometry(inner, outer, 96, 1);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i += 1) {
    const radius = Math.hypot(position.getX(i), position.getY(i));
    uv.setXY(i, clamp((radius - inner) / (outer - inner), 0, 1), 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

// One roll = one berth's view. Positions are normalised inside whichever window
// pane is on screen, so "u: 1.06" genuinely means half out of frame at every
// viewport rather than only on the shape the numbers were tuned on.
function rollSkyLook() {
  const palette = pick(PLANET_PALETTES);
  const banded = Math.random() < 0.55;
  return {
    palette,
    style: banded ? 'banded' : 'mottled',
    size: rand(0.18, banded ? 0.78 : 0.62),
    u: rand(-0.1, 1.1),
    v: rand(0.02, 0.86),
    tilt: rand(-0.5, 0.5),
    spin: rand(0.004, 0.022),
    rings: Math.random() < 0.34,
    ringTilt: rand(0.9, 1.5) * (Math.random() < 0.5 ? 1 : -1),
    ringSpread: rand(1.5, 2.5),
    moons: Math.random() < 0.22 ? 0 : (Math.random() < 0.78 ? 1 : 2),
    moonU: [rand(0.05, 0.95), rand(0.05, 0.95)],
    moonV: [rand(0.04, 0.7), rand(0.04, 0.7)],
    moonSize: [rand(0.03, 0.1), rand(0.025, 0.07)],
    sunU: rand(0.04, 0.96),
    sunV: rand(0.02, 0.4),
    sunSize: rand(0.018, 0.05),
    sunTint: pick([0xfff6e2, 0xffe0b0, 0xdfe9ff, 0xffd0a0, 0xf2f6ff]),
  };
}

function makeMoonTexture() {
  const element = makeCanvas(128, 64);
  const ctx = element.getContext('2d');
  ctx.fillStyle = '#8d8a84';
  ctx.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 60; i += 1) {
    const r = rand(1.5, 7);
    ctx.fillStyle = `rgba(${Math.round(rand(84, 140))}, ${Math.round(rand(82, 136))}, ${Math.round(rand(80, 130))}, 0.75)`;
    ctx.beginPath();
    ctx.arc(rand(0, 128), rand(0, 64), r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Depth + on-screen anchor in NDC, resolved to world space whenever the canvas
// changes shape. Doing it this way keeps the sun, planet and traffic inside the
// visible pane in portrait AND landscape without hard-coded coordinates.
function ndcToViewWorld(camera3d, nx, ny, distance) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera3d.fov * 0.5)) * distance;
  const halfW = halfH * camera3d.aspect;
  return { x: nx * halfW, y: ny * halfH, z: -distance, halfH, halfW };
}

function buildStationView() {
  const scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x03060d);
  const camera3d = new THREE.PerspectiveCamera(52, 1, 1, 9000);

  const starPositions = new Float32Array(760 * 3);
  const starTints = new Float32Array(760 * 3);
  for (let i = 0; i < 760; i += 1) {
    const theta = rand(0, Math.PI * 2);
    const phi = Math.acos(rand(-0.45, 1));
    const radius = 5200;
    starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
    starPositions[i * 3 + 1] = Math.cos(phi) * radius * 0.8;
    starPositions[i * 3 + 2] = -Math.abs(Math.sin(phi) * Math.sin(theta)) * radius - 600;
    tmpColor.setHSL(pick([0.08, 0.55, 0.6, 0.02]), rand(0.1, 0.6), rand(0.6, 1));
    starTints[i * 3] = tmpColor.r;
    starTints[i * 3 + 1] = tmpColor.g;
    starTints[i * 3 + 2] = tmpColor.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starTints, 3));
  scene3d.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 13, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  scene3d.add(new THREE.HemisphereLight(0x6f9ec4, 0x140b06, 0.55));
  // Aimed from over the camera's left shoulder rather than from the visible sun
  // disc. Lighting straight from an in-frame sun turns every body into a thin
  // crescent; this keeps the terminator on the planet where you can read it, and
  // still falls from the same side as the sun so it does not look wrong.
  const sunLight = new THREE.DirectionalLight(0xffe9c6, 2.3);
  sunLight.position.set(-900, 1150, 1500);
  scene3d.add(sunLight);

  // Sun: a hot disc with two additive sprites for the bloom.
  const sunGroup = new THREE.Group();
  const glowTexture = makeRadialTexture([[0, 'rgba(255,246,222,0.95)'], [0.24, 'rgba(255,186,104,0.44)'], [1, 'rgba(0,0,0,0)']]);
  sunGroup.add(new THREE.Mesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({ color: 0xfff6e2 })));
  for (const [scale, opacity] of [[3.4, 0.85], [9, 0.3]]) {
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    flare.scale.setScalar(scale);
    sunGroup.add(flare);
  }
  scene3d.add(sunGroup);

  // Planet with an additive back-side shell for the atmosphere rim, and a ring
  // that is hidden on most berths. The whole group scales as one, so the ring
  // keeps its proportion whatever size the world is rolled at.
  const planetGroup = new THREE.Group();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, HIGH_DETAIL ? 40 : 24, HIGH_DETAIL ? 28 : 18),
    new THREE.MeshStandardMaterial({ map: null, roughness: 0.92, metalness: 0.02 }),
  );
  planetGroup.add(planet);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, 26, 18),
    new THREE.MeshBasicMaterial({ color: 0x74c8ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false }),
  );
  planetGroup.add(halo);
  const ring = new THREE.Mesh(
    makeRingGeometry(1.32, 2.4),
    new THREE.MeshBasicMaterial({ map: null, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 }),
  );
  ring.visible = false;
  planetGroup.add(ring);
  scene3d.add(planetGroup);

  const moonMaterial = new THREE.MeshStandardMaterial({ map: makeMoonTexture(), roughness: 0.96, metalness: 0.02 });
  const moons = [];
  for (let i = 0; i < 2; i += 1) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), moonMaterial);
    scene3d.add(body);
    moons.push(body);
  }

  // A limb of the station you are standing on, off to one side: a hull drum,
  // a ring and a few running lights. Parallax plus a reminder of where you are.
  const limbHull = new THREE.MeshStandardMaterial({ color: 0x39424c, map: wrapTexture(hullPanelCanvas, 2, 3), roughness: 0.5, metalness: 0.78 });
  const stationLimb = new THREE.Group();
  const drum = new THREE.Mesh(UNIT_CYL, limbHull);
  drum.scale.set(0.5, 1.7, 0.5);
  stationLimb.add(drum);
  const limbWindows = new THREE.Mesh(UNIT_CYL, new THREE.MeshStandardMaterial({
    color: 0x05070b, emissive: 0xffffff, emissiveMap: wrapTexture(windowRowCanvas, 4, 2), emissiveIntensity: 1.25, roughness: 0.5,
  }));
  limbWindows.scale.set(0.505, 0.34, 0.505);
  limbWindows.position.y = -0.2;
  stationLimb.add(limbWindows);
  for (let i = 0; i < 3; i += 1) {
    const lamp = new THREE.Mesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb455 : 0x7fe9ff }));
    lamp.position.set(0.27, 0.62 - i * 0.62, 0.25);
    lamp.scale.setScalar(0.014);
    stationLimb.add(lamp);
  }
  freezeStatic(stationLimb);
  scene3d.add(stationLimb);

  // Freighters. Slow, calm, and looped by wrapping x — never respawned.
  const freighterCount = HIGH_DETAIL ? 4 : 2;
  const freighters = [];
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6874, map: wrapTexture(hullPanelCanvas, 3, 1), roughness: 0.46, metalness: 0.72 });
  const cargoMaterial = new THREE.MeshStandardMaterial({ color: 0x54402a, map: wrapTexture(hullPanelCanvas, 2, 1), roughness: 0.74, metalness: 0.18 });
  const engineMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  const navMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a44 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070b, emissive: 0xffffff, emissiveMap: wrapTexture(windowRowCanvas, 5, 1), emissiveIntensity: 1.4, roughness: 0.5,
  });
  for (let i = 0; i < freighterCount; i += 1) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(UNIT_BOX, hullMaterial);
    hull.scale.set(6.4, 0.9, 1.2);
    group.add(hull);
    // A box with a bridge on top is a slab at this distance. A tapered nose, a
    // pair of outrigger pods and a lit window strip give it a silhouette that
    // still reads as a ship when it is forty pixels long.
    const nose = new THREE.Mesh(UNIT_CYL, hullMaterial);
    nose.position.set(3.7, 0, 0);
    nose.scale.set(0.95, 1.6, 0.95);
    nose.rotation.z = -Math.PI / 2;
    group.add(nose);
    const bridge = new THREE.Mesh(UNIT_BOX, hullMaterial);
    bridge.position.set(2.4, 0.8, 0);
    bridge.scale.set(1.3, 0.8, 1);
    group.add(bridge);
    const strip = new THREE.Mesh(UNIT_BOX, windowMaterial);
    strip.position.set(0.6, 0.18, 0.63);
    strip.scale.set(4.6, 0.26, 0.06);
    group.add(strip);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(UNIT_CYL, hullMaterial);
      pod.position.set(-1.2, side * 0.95, 0);
      pod.scale.set(0.52, 3.6, 0.52);
      pod.rotation.z = -Math.PI / 2;
      group.add(pod);
      const pylon = new THREE.Mesh(UNIT_BOX, hullMaterial);
      pylon.position.set(-1.2, side * 0.5, 0);
      pylon.scale.set(0.5, 0.9, 0.22);
      group.add(pylon);
    }
    for (const cx of [-1.4, 0.3]) {
      const crate = new THREE.Mesh(UNIT_BOX, cargoMaterial);
      crate.position.set(cx, 0.85, 0);
      crate.scale.set(2.1, 0.9, 1.1);
      group.add(crate);
    }
    const engine = new THREE.Mesh(UNIT_SPHERE, engineMaterial);
    engine.position.set(-3.3, 0, 0);
    engine.scale.setScalar(0.85);
    group.add(engine);
    const nav = new THREE.Mesh(UNIT_SPHERE, navMaterial);
    nav.position.set(3.3, 0.4, 0);
    nav.scale.setScalar(0.3);
    group.add(nav);
    // At this size a hull is a few pixels wide, so the engine bloom is what
    // actually reads as "a ship went past" rather than "a rectangle".
    const wash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: 0x8fdcff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    wash.position.set(-4.4, 0, 0);
    wash.scale.setScalar(5.4);
    group.add(wash);
    freezeStatic(group);
    group.userData = {
      dir: i % 2 ? -1 : 1,
      ny: rand(0.12, 0.82),
      distance: rand(900, 2600),
      // A fraction of the visible pane, not of the screen — a pane is roughly a
      // third of the canvas, so these are larger numbers for the same result.
      sizeRatio: rand(0.026, 0.058),
      speedRatio: rand(0.03, 0.07),
      progress: rand(-1, 1),
      bobPhase: rand(0, Math.PI * 2),
    };
    scene3d.add(group);
    freighters.push(group);
  }

  stationView.scene = scene3d;
  stationView.camera = camera3d;
  stationView.sun = sunGroup;
  stationView.sunLight = sunLight;
  stationView.planet = planet;
  stationView.planetGroup = planetGroup;
  stationView.halo = halo;
  stationView.ring = ring;
  stationView.moons = moons;
  stationView.stationLimb = stationLimb;
  stationView.freighters = freighters;
  applySkyLook();
}

// Repaint the world for the current roll. Called on build and on every dock.
// The old canvas textures are disposed because a forty-berth career would
// otherwise leak forty of them.
function applySkyLook() {
  const look = state.skyLook || (state.skyLook = rollSkyLook());
  const { planet, halo, ring, moons } = stationView;
  if (!planet) return;

  if (planet.material.map) planet.material.map.dispose();
  planet.material.map = makePlanetTexture(look.palette, look.style);
  planet.material.needsUpdate = true;
  halo.material.color.setHex(look.palette.halo);

  ring.visible = !!look.rings;
  if (look.rings) {
    if (ring.material.map) ring.material.map.dispose();
    tmpColor.setHex(look.palette.halo);
    ring.material.map = makeRingTexture(`${Math.round(tmpColor.r * 235)}, ${Math.round(tmpColor.g * 235)}, ${Math.round(tmpColor.b * 235)}`);
    ring.material.needsUpdate = true;
    ring.rotation.set(look.ringTilt, 0, rand(-0.4, 0.4));
    ring.scale.setScalar(look.ringSpread / 2);
  }
  for (let i = 0; i < moons.length; i += 1) moons[i].visible = i < look.moons;
  stationView.sun.children[0].material.color.setHex(look.sunTint);
}

/* The plate is opaque everywhere except its window panes, so anything staged
 * outside a pane is simply not there. Which pane is on screen depends entirely
 * on how the plate got cropped — the tall centre pane on a phone, the lower
 * band on a wide desktop — so the stage is chosen from the live crop rather
 * than assumed, and everything is placed in normalised stage coordinates. */
function stationStage() {
  const width = stationView.width || window.innerWidth;
  const height = stationView.height || window.innerHeight;
  const fit = fitPlate(width, height);
  let best = null;
  let bestArea = -1;
  for (const pane of PLATE.panes) {
    const box = plateRect(pane, fit);
    const left = Math.max(0, box.left);
    const top = Math.max(0, box.top);
    const right = Math.min(width, box.left + box.width);
    const bottom = Math.min(height, box.top + box.height);
    const area = Math.max(0, right - left) * Math.max(0, bottom - top);
    if (area > bestArea) { bestArea = area; best = { left, top, width: right - left, height: bottom - top }; }
  }
  // Every pane off screen (a viewport shape we never anticipated): fall back to
  // the whole canvas rather than staging the scene into a sliver of nothing.
  if (!best || best.width < 8 || best.height < 8) best = { left: 0, top: 0, width, height };
  best.viewWidth = width;
  best.viewHeight = height;
  return best;
}

// A point inside the stage, in stage-normalised coords, resolved to world space
// at `distance`. Values outside 0..1 land outside the pane on purpose.
function stagePoint(camera3d, stage, u, v, distance) {
  const px = stage.left + u * stage.width;
  const py = stage.top + v * stage.height;
  const at = ndcToViewWorld(camera3d, (px / stage.viewWidth) * 2 - 1, 1 - (py / stage.viewHeight) * 2, distance);
  // World height of one stage-height, so sizes can be expressed as a fraction
  // of the visible pane instead of a fraction of the screen.
  at.stageH = 2 * at.halfH * (stage.height / stage.viewHeight);
  return at;
}

function layoutStationView() {
  const { camera: camera3d, sun, sunLight, planetGroup, planet, ring, moons, stationLimb, freighters } = stationView;
  const look = state.skyLook || (state.skyLook = rollSkyLook());
  const stage = stationStage();

  const sunAt = stagePoint(camera3d, stage, look.sunU, look.sunV, 4200);
  sun.position.set(sunAt.x, sunAt.y, sunAt.z);
  sun.scale.setScalar(sunAt.stageH * look.sunSize);
  // Key light from the sun's side but well off its axis: lighting straight down
  // the sun's own vector turns every body in frame into a thin crescent.
  sunLight.position.set((look.sunU < 0.5 ? -1 : 1) * 900, 1150, 1500);

  const planetAt = stagePoint(camera3d, stage, look.u, look.v, 3600);
  planetGroup.position.set(planetAt.x, planetAt.y, planetAt.z);
  planetGroup.scale.setScalar(planetAt.stageH * look.size * 0.5);
  planet.rotation.z = look.tilt;
  if (ring.visible) ring.rotation.z = look.tilt;

  for (let i = 0; i < moons.length; i += 1) {
    if (!moons[i].visible) continue;
    const at = stagePoint(camera3d, stage, look.moonU[i], look.moonV[i], 2500);
    moons[i].position.set(at.x, at.y, at.z);
    moons[i].scale.setScalar(at.stageH * look.moonSize[i]);
  }

  // The limb of the station you are standing on, hard against the pane edge the
  // planet is furthest from, so it never sits on top of the view.
  const limbAt = stagePoint(camera3d, stage, look.u > 0.5 ? -0.34 : 1.34, 0.5, 1500);
  stationLimb.position.set(limbAt.x, limbAt.y, limbAt.z);
  stationLimb.scale.setScalar(limbAt.stageH * 0.55);
  stationLimb.rotation.set(0, look.u > 0.5 ? 0.5 : -0.5, 0.06);

  for (const ship of freighters) {
    const at = stagePoint(camera3d, stage, 0.5, ship.userData.ny, ship.userData.distance);
    ship.userData.spanX = at.halfW * 1.15;
    ship.userData.baseY = at.y;
    ship.userData.z = at.z;
    ship.userData.size = at.stageH * ship.userData.sizeRatio;
    ship.userData.speed = at.halfW * ship.userData.speedRatio;
    ship.scale.setScalar(ship.userData.size);
  }
}

function stepStationView(delta) {
  const { camera: camera3d, planet, moons, freighters } = stationView;
  const t = state.stationWindowTime;
  const look = state.skyLook;

  planet.rotation.y += delta * (look ? look.spin : 0.008);
  for (const body of moons) if (body.visible) body.rotation.y += delta * 0.012;

  for (const ship of freighters) {
    const data = ship.userData;
    data.progress += (data.speed * data.dir * delta) / Math.max(1, data.spanX);
    if (data.progress > 1.05) data.progress = -1.05;
    if (data.progress < -1.05) data.progress = 1.05;
    ship.position.set(
      data.progress * data.spanX,
      data.baseY + Math.sin(t * 0.16 + data.bobPhase) * data.size * 0.9,
      data.z,
    );
    ship.rotation.set(
      Math.sin(t * 0.08 + data.bobPhase) * 0.05,
      data.dir > 0 ? 0 : Math.PI,
      Math.sin(t * 0.11 + data.bobPhase) * 0.04,
    );
  }

  // A barely-there drift so the view is never a frozen postcard.
  camera3d.rotation.set(Math.sin(t * 0.07) * 0.006, Math.sin(t * 0.05) * 0.009, 0);
}

function resetStationTraffic() {
  state.stationTraffic = Array.from({ length: 8 }, (_, index) => ({
    x: rand(0.05, 0.95),
    y: rand(0.16, 0.72),
    speed: rand(0.018, 0.055) * (index % 2 ? 1 : -1),
    size: rand(0.65, 1.35),
    color: pick(['#55e6ff', '#ffb352', '#7dff9d', '#ffffff']),
  }));
  // A different world at every berth. Rolled here rather than in the renderer
  // so it changes once per dock and not once per frame.
  state.skyLook = rollSkyLook();
  if (stationView.freighters.length) {
    for (const ship of stationView.freighters) {
      ship.userData.progress = rand(-1.2, 1.2);
      ship.userData.ny = rand(0.12, 0.82);
    }
  }
  if (stationView.ready) {
    applySkyLook();
    layoutStationView();
  }
}

/* The terminal is a dark rectangle on a dark kiosk in a dark room, and nothing
 * about it says "press me". A slow shine crosses the glass (CSS), and a line of
 * text surfaces for about three seconds in every seven — long enough to be read
 * on the way past, short enough not to nag once you know. */
const TERMINAL_HINTS = ['Dock terminal', 'Tap to open', 'Upgrades · Cargo · Brief', 'Spend your credits'];
const TERMINAL_HINT_CYCLE = 7;
let terminalHintPhase = -1;

function stepTerminalHint() {
  if (!stationTerminalHint) return;
  const t = state.stationWindowTime % TERMINAL_HINT_CYCLE;
  const phase = Math.floor(state.stationWindowTime / TERMINAL_HINT_CYCLE);
  if (phase !== terminalHintPhase) {
    terminalHintPhase = phase;
    stationTerminalHint.textContent = TERMINAL_HINTS[((phase % TERMINAL_HINTS.length) + TERMINAL_HINTS.length) % TERMINAL_HINTS.length];
  }
  const alpha = t < 0.45 ? t / 0.45 : t < 3.2 ? 1 : t < 3.9 ? (3.9 - t) / 0.7 : 0;
  stationTerminalHint.style.opacity = alpha.toFixed(3);
}

function drawStationWindow(delta = 0) {
  if (!stationWindowCanvas) return;
  stepTerminalHint();
  if (stationView.failed) {
    drawStationWindowFallback(delta);
    return;
  }

  if (!stationView.ready) {
    try {
      stationView.renderer = new THREE.WebGLRenderer({
        canvas: stationWindowCanvas,
        // Worth it here: the buffer is small, it redraws at most 24 times a
        // second, and a planet limb without it reads as a staircase.
        antialias: true,
        alpha: false,
        powerPreference: 'low-power',
      });
      stationView.renderer.setClearColor(0x03060d, 1);
      stationView.renderer.outputColorSpace = THREE.SRGBColorSpace;
      stationView.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      stationView.renderer.toneMappingExposure = 1.05;
      buildStationView();
      stationView.ready = true;
    } catch (error) {
      stationView.failed = true;
      stationView.renderer = null;
      console.warn('[outpace] window view fell back to 2D', error);
      drawStationWindowFallback(delta);
      return;
    }
  }

  const rect = stationWindowCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || stationWindowCanvas.clientWidth || 320));
  const cssHeight = Math.max(1, Math.round(rect.height || stationWindowCanvas.clientHeight || 180));
  if (cssWidth !== stationView.width || cssHeight !== stationView.height) {
    stationView.width = cssWidth;
    stationView.height = cssHeight;
    // Most of this canvas is hidden behind the lounge plate, so it renders well
    // under device resolution — a soft window view is the right trade.
    stationView.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarsePointer() ? 1 : 1.4));
    stationView.renderer.setSize(cssWidth, cssHeight, false);
    stationView.camera.aspect = cssWidth / cssHeight;
    stationView.camera.updateProjectionMatrix();
    layoutStationView();
    stationView.accum = STATION_VIEW_STEP;
  }

  state.stationWindowTime += delta;
  stepStationView(delta);

  stationView.accum += delta;
  if (stationView.accum < STATION_VIEW_STEP) return;
  stationView.accum = 0;
  stationView.renderer.render(stationView.scene, stationView.camera);
}

function drawStationWindowFallback(delta = 0) {
  if (!stationWindowCanvas) return;
  if (!stationWindowCtx) stationWindowCtx = stationWindowCanvas.getContext('2d');
  if (!stationWindowCtx) return;
  const rect = stationWindowCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || stationWindowCanvas.clientWidth || 320));
  const cssHeight = Math.max(1, Math.round(rect.height || stationWindowCanvas.clientHeight || 180));
  const dpr = getOverlayPixelRatio();
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
  const points = particlePool.pop() || createParticleObject();
  const activeCount = clamp(Math.round(count), 1, EXPLOSION_PARTICLE_CAPACITY);
  const positions = points.geometry.attributes.position.array;
  const velocities = points.userData.velocities;
  for (let i = 0; i < activeCount; i += 1) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities[i].set(rand(-8, 8), rand(-8, 8), rand(-8, 8)).normalize().multiplyScalar(rand(5, 18));
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.setDrawRange(0, activeCount);
  points.material.color.set(color);
  points.material.opacity = 0.9;
  points.userData.ttl = 0.68;
  points.userData.life = 0.68;
  points.userData.count = activeCount;
  scene.add(points);
  state.particles.push(points);
}

function releaseParticle(particle) {
  scene.remove(particle);
  particle.userData.life = 0;
  particle.userData.count = 0;
  particle.geometry.setDrawRange(0, 0);
  particle.material.opacity = 0;
  particlePool.push(particle);
}

function removeObject(object) {
  scene.remove(object);
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposeTemporaryMaterial = (material) => {
    if (!material?.userData?.temporary || disposedMaterials.has(material)) return;
    disposedMaterials.add(material);
    material.map?.dispose?.();
    material.dispose?.();
  };
  const disposeGeometry = (geometry) => {
    if (!geometry || geometry.userData?.shared || disposedGeometries.has(geometry)) return;
    disposedGeometries.add(geometry);
    geometry.dispose?.();
  };
  object.traverse?.((child) => {
    if (child !== object) disposeGeometry(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach(disposeTemporaryMaterial);
    else disposeTemporaryMaterial(child.material);
  });
  disposeGeometry(object.geometry);
}

function clearDynamicScene() {
  for (const object of state.objects) removeObject(object);
  for (const beam of state.beams) {
    releaseBeam(beam);
  }
  for (const particle of state.particles) {
    releaseParticle(particle);
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
  state.stationTab = 'upgrades';
  state.stationTerminalOpen = false;
  state.upgradeCategory = 'flight';
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
  stationEl.classList.remove('terminal-open');
  stationTerminalPanel?.classList.add('hidden');
  stationTerminalHotspot?.setAttribute('aria-expanded', 'false');
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

function getStoryMediaSeed(story, phase) {
  const idHash = String(story?.id || story?.kind || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return idHash + (story?.progress || 0) * 7 + (story?.lastRoute || 0) * 3 + phase.length;
}

function pickStoryMedia(candidates, story, phase) {
  if (!candidates.length) return null;
  return candidates[getStoryMediaSeed(story, phase) % candidates.length];
}

function getStoryMedia(story = getActiveStory()) {
  if (!story) return STORY_MEDIA[0];
  const phase = getStoryPhase(story);
  const videos = STORY_MEDIA.filter((item) => item.type === 'video' && item.src && item.storyKinds.includes(story.kind) && item.phase === phase);
  const video = pickStoryMedia(videos, story, phase);
  if (video) return video;
  const phaseItems = STORY_MEDIA.filter((item) => item.storyKinds.includes(story.kind) && item.phase === phase);
  return pickStoryMedia(phaseItems, story, phase)
    || STORY_MEDIA.find((item) => item.storyKinds.includes(story.kind))
    || STORY_MEDIA[0];
}

function getMediaPoster(item) {
  return item?.poster || MEDIA_POSTER_BY_ID[item?.id] || '';
}

function createMediaFrame(item, className = 'story-media-frame') {
  const frame = document.createElement('div');
  frame.className = className;
  frame.dataset.mediaId = item.id;
  const isStoryFrame = className === 'story-media-frame';

  if (item.src) {
    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = isStoryFrame ? 'auto' : 'metadata';
      const poster = getMediaPoster(item);
      if (poster) video.poster = poster;
      if (isStoryFrame) {
        video.autoplay = true;
        video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true });
      }
      frame.append(video);
      if (isStoryFrame) requestAnimationFrame(() => video.play().catch(() => {}));
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

function getSearchPanelCopy() {
  const story = getActiveStory();
  if (!story) return 'Choose an available mission from the board.';
  return story.lastMessage || getStoryMessage(story);
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

  const title = document.createElement('h3');
  title.textContent = `Mission: ${getStoryTitle(story)}`;
  const media = createMediaFrame(getStoryMedia(story));
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

  card.append(title, media, progress, actions);
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
  if (stationTerminalPanel) stationTerminalPanel.dataset.tab = tab;
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
    if (stationPanelCopy) stationPanelCopy.textContent = getSearchPanelCopy();
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
  recordRunCompleted({ distance: Math.max(state.routeDistance, state.routeLength) });
  saveProgress();
  renderMenuAchievements();
  playSfx('dock');
  updateHud();
  resetStationTraffic();
  updateStationUi(payout, type);
  stationEl.classList.remove('hidden');
  // The plate has no measurable size while the overlay is hidden, so the
  // terminal hotspot can only be placed once it is on screen.
  layoutStationPlate();
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

// One call per finished run, whichever way it ended: reaching the berth or
// losing the ship. Feeds the lifetime totals that travel with the account.
function recordRunCompleted({ distance = state.routeDistance } = {}) {
  if (DEMO_MODE) return;
  const stats = state.save.stats;
  const travelled = Math.max(0, Math.round(Number(distance) || 0));
  stats.runs += 1;
  stats.bestWave = Math.max(stats.bestWave || 1, Math.round(state.wave) || 1);
  stats.bestDistance = Math.max(stats.bestDistance || 0, travelled);
  stats.totalDistance += travelled;
  stats.flightSeconds += Math.max(0, Math.round(state.time));
  notifyRunCompleted();
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
  state.hudTimer = 0;
  state.threat = 0;
  state.shake = 0;
  state.player.x = 0;
  state.player.y = 0;
  state.target.x = 0;
  state.target.y = 0;
  state.reticleX = null;
  state.reticleY = null;

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
  recordRunCompleted();
  saveProgress();
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
  const endpoint = tmpVectorC
    .set(aimNdc.x, aimNdc.y, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize()
    .multiplyScalar(140)
    .add(camera.position);
  let targetScreen = {
    x: window.innerWidth * 0.5 + aimNdc.x * window.innerWidth * 0.42,
    y: window.innerHeight * 0.5 - aimNdc.y * window.innerHeight * 0.42,
  };
  if (bestTarget) {
    bestTarget.getWorldPosition(endpoint);
    targetScreen = worldToScreen(endpoint) || targetScreen;
  }
  addLaserBurst(targetScreen);
  createBeam(tmpVectorD.copy(camera.position).add(leftBeamOffset), endpoint, beamMaterial, 0.16);
  createBeam(tmpVectorD.copy(camera.position).add(rightBeamOffset), endpoint, beamMaterial, 0.16);
  playSfx('laser');

  if (bestTarget) {
    bestTarget.userData.hp -= stats.beamPower;
    bestTarget.userData.hitFlash = 0.18;
    state.score += bestTarget.userData.kind === 'drone' ? 45 + stats.beamPower * 3 : 20 + stats.beamPower * 2;
    cockpitLight.intensity = 4.5;
    if (bestTarget.userData.hp <= 0) {
      state.save.stats.kills += 1;
      if (bestTarget.userData.kind === 'drone') state.save.stats.droneKills += 1;
      if (bestTarget.userData.kind === 'asteroid') state.save.stats.asteroidKills += 1;
      saveProgress({ defer: true });
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
  if (!state.running && !state.demo) return;
  const x = window.innerWidth * 0.5 + state.target.x * window.innerWidth * 0.23;
  const y = window.innerHeight * 0.46 - state.target.y * window.innerHeight * 0.18;
  const px = Math.round(x);
  const py = Math.round(y);
  if (state.reticleX === px && state.reticleY === py) return;
  state.reticleX = px;
  state.reticleY = py;
  reticleEl.style.left = `${px}px`;
  reticleEl.style.top = `${py}px`;
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
    starPositions[p + 2] += boost * delta * starDepthSpeeds[i];
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
    // Rarer than it was (9-15s): passing a settlement should be an event on the
    // route, not street furniture.
    state.stationTimer = rand(17, 27);
  }

  if (state.collectTimer <= 0) {
    createCollector();
    state.collectTimer = rand(7.5, 12);
  }
}

function updateObjects(delta) {
  if (!state.running) {
    state.threat = 0;
    return;
  }

  const playerX = state.player.x * 11;
  const playerY = state.player.y * 7.5;
  let threat = 0;

  for (let i = state.objects.length - 1; i >= 0; i -= 1) {
    const object = state.objects[i];
    const data = object.userData;
    const speed = state.speed * data.speedScale;
    object.position.z += speed * delta;
    if (data.hitFlash > 0) {
      data.hitFlash = Math.max(0, data.hitFlash - delta);
      object.scale.setScalar((data.baseScale || 1) * (1 + data.hitFlash * 0.36));
    } else if (data.baseScale && object.scale.x !== data.baseScale) {
      object.scale.setScalar(data.baseScale);
    }

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
        tmpVectorB.set(playerX * 0.22, playerY * 0.1, 4);
        createBeam(tmpVector, tmpVectorB, enemyBeamMaterial, 0.24);
        if (Math.hypot(object.position.x - playerX, object.position.y - playerY) < 9.5) damage(4 + state.wave * 0.2);
        data.shot = rand(1.1, 2.4);
      }
    } else if (data.kind === 'station') {
      object.rotation.z += delta * 0.04;
      object.position.x -= data.drift * delta;
      // A station is never a collider, so it is never allowed within reach.
      if (data.minClearX && Math.abs(object.position.x) < data.minClearX) {
        object.position.x = Math.sign(object.position.x || 1) * data.minClearX;
      }
      // Beacons blink by visibility rather than by touching the shared emissive
      // material, so every station can keep its own phase for free.
      if (data.beacons) {
        const beat = state.time * 1.6 + data.beaconPhase;
        for (let b = 0; b < data.beacons.length; b += 1) {
          data.beacons[b].visible = Math.sin(beat + b * 2.1) > -0.25;
        }
      }
    } else if (data.kind === 'dock') {
      object.rotation.z = Math.sin(state.time * 0.45) * 0.025;
      object.rotation.y = Math.sin(state.time * 0.26) * 0.035;
      if (data.chaseLights) {
        const step = Math.floor(state.time * 6) % 3;
        for (let c = 0; c < data.chaseLights.length; c += 1) data.chaseLights[c].visible = (c % 3) !== step;
      }
      if (data.beacons) {
        const beat = state.time * 2.2;
        for (let b = 0; b < data.beacons.length; b += 1) data.beacons[b].visible = Math.sin(beat + b * 1.6) > -0.2;
      }
      object.position.x = lerp(object.position.x, 0, delta * 1.4);
      object.position.y = lerp(object.position.y, 0, delta * 1.4);
      // Approach guidance. A small depot's aperture is narrower than the ship
      // can range, so you could be well outside the frame at the moment the
      // dock fires and it read as arriving beside the station rather than in
      // it. The pull starts gently at 90 units out and is firm by the time the
      // funnel is around you — steering still works, it just recentres.
      if (state.running && object.position.z > -90) {
        const pull = clamp((object.position.z + 90) / 74, 0, 1) * delta * 2.1;
        state.target.x = lerp(state.target.x, 0, pull);
        state.target.y = lerp(state.target.y, 0, pull);
      }
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
        saveProgress({ defer: true });
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
        if (distance >= hitRadius) {
          const nearMargin = data.sizeClass === 'large' ? 4.3 : data.sizeClass === 'medium' ? 3.2 : 2.4;
          if (!data.nearMissAwarded && object.position.z > 0 && distance < hitRadius + nearMargin) {
            const reward = data.sizeClass === 'large' ? 34 : data.sizeClass === 'medium' ? 22 : 14;
            data.nearMissAwarded = true;
            data.passed = true;
            state.score += reward + state.wave * 2;
            state.heat = Math.max(0, state.heat - (data.sizeClass === 'large' ? 12 : 7));
            state.shake = Math.max(state.shake, 0.08);
            haptic(10);
            updateHud();
          }
          continue;
        }
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
      releaseBeam(beam);
    }
  }
}

function updateParticles(delta) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    const position = particle.geometry.attributes.position;
    const velocities = particle.userData.velocities;
    const activeCount = particle.userData.count || position.count;
    for (let p = 0; p < activeCount; p += 1) {
      position.array[p * 3] += velocities[p].x * delta;
      position.array[p * 3 + 1] += velocities[p].y * delta;
      position.array[p * 3 + 2] += velocities[p].z * delta + state.speed * delta * 0.6;
    }
    position.needsUpdate = true;
    particle.userData.life -= delta;
    particle.material.opacity = Math.max(0, particle.userData.life / particle.userData.ttl);
    if (particle.userData.life <= 0) {
      state.particles.splice(i, 1);
      releaseParticle(particle);
    }
  }
}

function updateFlight(delta) {
  if (!state.running) {
    cockpitLight.intensity = lerp(cockpitLight.intensity, 2.2, delta * 4);
    warmLight.intensity = 1.2 + Math.sin(state.time * 2.1) * 0.22;
    state.shake = Math.max(0, state.shake - delta * 0.9);
    if (state.flashTimer > 0) {
      state.flashTimer -= delta;
      if (state.flashTimer <= 0) damageFlash.classList.remove('active');
    }
    return;
  }

  const stats = getShipStats();
  const inputLerp = 1 - Math.exp(-delta * 4.8);
  state.player.x = lerp(state.player.x, state.target.x, inputLerp);
  state.player.y = lerp(state.player.y, state.target.y, inputLerp);

  if (!state.pointerDown && !state.demo) {
    state.target.x = lerp(state.target.x, 0, delta * 0.42);
    state.target.y = lerp(state.target.y, 0, delta * 0.42);
  }

  if (state.demo) {
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

  if (state.firing || state.demo) firePulse();
  state.score += delta * (8 + state.wave * 1.6);
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
  // While docked, the lounge covers the flight canvas completely, so the window
  // view renders instead of the flight scene rather than on top of it. That is
  // what pays for a real 3D exterior on a phone.
  const stationOnScreen = gameEl.dataset.state === 'station' && !stationEl.classList.contains('hidden');
  if (state.docked || stationOnScreen) drawStationWindow(delta);

  if (state.running) {
    state.hudTimer -= delta;
    if (state.hudTimer <= 0) {
      updateHud();
      state.hudTimer = 0.14;
    }
  }
  if (state.demo && state.running && state.time > 18) finishGame();

  if (!stationOnScreen) renderer.render(scene, camera);
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
  const dpr = getOverlayPixelRatio();
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
  const dpr = getOverlayPixelRatio();
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
  refreshPixelRatios();
  const dpr = getScenePixelRatio();
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.fov = height >= width ? 63 : 54;
  camera.updateProjectionMatrix();
  drawCockpit();
  resizeLaserCanvas();
  layoutStationPlate();
  // Only refresh the window view if it has already been built — resizing must
  // not be what creates its WebGL context. That waits for the first dock.
  if (stationView.ready || stationView.failed) drawStationWindow(0);
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
  window.addEventListener('pagehide', flushProgressSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restoreCanvasesSoon();
    else flushProgressSave();
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
  // Render/perf probe for automated testing only — never present in normal play.
  if (params.has('probe')) {
    window.__outpace = {
      THREE, renderer, scene, camera, state, materials, stationView,
      spawn: { asteroid: createAsteroid, station: createStation, dock: createDockStation, drone: createDrone },
    };
  }
  animate();
  setupAccountCloud();

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
