// Story missions by number. Unlock: completing mission n unlocks n + 1 (js/story/index.js missionList()).
import { MISSION_1 } from './mission1.js';
import { MISSION_2 } from './mission2.js';
import { MISSION_3 } from './mission3.js';
import { MISSION_4 } from './mission4.js';

export const MISSIONS = { 1: MISSION_1, 2: MISSION_2, 3: MISSION_3, 4: MISSION_4 };
export const MISSION_IDS = Object.keys(MISSIONS).map(Number).sort((a, b) => a - b);
