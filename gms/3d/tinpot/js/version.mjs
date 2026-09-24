// The single source of truth for the build number. Bump this and nothing else.
// It is shown on the title screen (screens.mjs, the footer furniture) and exposed on
// `window.tinpot.version` so a harness can tell a fresh deploy from a cached one without
// taking a screenshot. We are at very early concept stage: 0.01 was the shipped slice,
// 0.02 the playtest pass, 0.03 the first human playtest pass, 0.04 the second.
export const VERSION='0.05';
