// Construction (W13, proposal §3). Paying for a business starts a build; it earns nothing until the sign is up.
// 'built' businesses run 5 equal stages over the row's T; acquisitions ('poker' | 'takeover' | 'bought') are one
// fixed-T cutscene; in gen 2+ a business you have built before comes back as a 3 s 'rebrand'.
export const STAGES = ['survey', 'frame', 'walls', 'front', 'sign'];
export const CONSTRUCTION = {
  hurrySec: 0.5,
  rebrandSec: 3,
  // Hero cut-ins (W9): only frame-up and sign-raise cut the hero to the lot.
  cutStages: { 1: 'frame', 4: 'sign' },
  cutSec: 2.5,
};
