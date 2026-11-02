// Helper definitions (PLAN 2.4): id, name, tray icon, tooltip and how each is used. Pure data.
//   kind 'stack': before a shot, stacks (Long Sight) · 'pre': before a shot, one shot only, tap again to
//   take it back (refunded) · 'post': after a shot (Mulligan)
// The effect code lives in js/game/play.js (applyMods) and js/engine/physics.js (ball.mods).
const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const HELPER_ICONS = {
  longSight: `<svg ${S}><path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/></svg>`,
  mulligan: `<svg ${S}><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  magnet: `<svg ${S}><path d="M6 4v7a6 6 0 0 0 12 0V4"/><path d="M6 4h3v7a3 3 0 0 0 6 0V4h3"/><path d="M6 8h3M15 8h3" stroke="#ff7a6b"/></svg>`,
  steady: `<svg ${S}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>`,
  sticky: `<svg ${S}><circle cx="11" cy="12" r="6"/><path d="M17 9c2 0 3 1.4 3 3s-1 3-3 3"/><path d="M8 18v3M12 18.5V22M15 17v2.5"/></svg>`,
  power: `<svg ${S}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
  guard: `<svg ${S}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8 12h8"/></svg>`,
  ghost: `<svg ${S}><path d="M5 21V10a7 7 0 0 1 14 0v11l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z"/><circle cx="9.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="14.5" cy="10.5" r=".6" fill="currentColor"/></svg>`,
};

export const HELPERS = [
  { id: 'longSight', name: 'Long Sight', kind: 'stack', short: '⤴', desc: 'Longer guide line plus one more bounce. Stacks up to 3.' },
  { id: 'mulligan', name: 'Mulligan', kind: 'post', short: '↶', desc: 'Undo your last shot. No stroke.' },
  { id: 'magnet', name: 'Magnet Cup', kind: 'pre', short: '🧲', desc: 'The cup pulls the ball in from much further away. One shot.' },
  { id: 'steady', name: 'Steady Hands', kind: 'pre', short: '⏱', desc: 'Windmills and moving blocks slow right down. One shot.' },
  { id: 'sticky', name: 'Sticky Ball', kind: 'pre', short: '◉', desc: 'Walls barely bounce the ball back. One shot.' },
  { id: 'power', name: 'Power Tee', kind: 'pre', short: '⚡', desc: '+25% max power for long carries. One shot.' },
  { id: 'guard', name: 'Bumper Guard', kind: 'pre', short: '⛨', desc: 'Rails on open edges and wall tops, so the ball stays on. One shot.' },
  { id: 'ghost', name: 'Ghost Ball', kind: 'pre', short: '👻', desc: 'Pass straight through the first obstacle you hit. One shot.' },
];
export const HELPER_BY_ID = Object.fromEntries(HELPERS.map(h => [h.id, h]));
export const helperName = id => HELPER_BY_ID[id]?.name || id;

// Tuning for the pre-shot helpers (physics constants are in physics.js: MAGNET_R, STICKY_E)
export const STEADY_CLOCK = 0.3;    // obstacle clock rate while Steady Hands is on
export const POWER_TEE = 1.25;      // max-power multiplier
