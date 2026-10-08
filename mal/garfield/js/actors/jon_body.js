// Jon's look on the shared human body (human_body.js).
import { buildHuman, FACE as BASE_FACE, boneDefs } from './human_body.js';
import { HEAD } from './jon_head.js';
export { COLORS, MOUTH_TARGETS, BONE_INDEX } from './human_body.js';

export const surfZ = HEAD.surfZ;
export const FACE = { ...BASE_FACE, eye: HEAD.EYE.slice(), brow: [0.054, 1.738, surfZ(0.054, 1.738) + 0.003] };
export const BONE_DEFS = boneDefs(FACE.eye, FACE.brow);
export const JON_LOOK = { name: 'jon', head: HEAD };
export function buildJon(quality = 'high') { return buildHuman(quality, JON_LOOK); }
