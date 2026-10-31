// Story missions by number. Unlock: completing mission n unlocks n + 1 (js/story/index.js missionList()).
// 1–4 at C-Tower 1 (STORY2); 5–10 across the Kingdom Map, each in its own plane, ending at the coronation (STORY3).
import { MISSION_1 } from './mission1.js';
import { MISSION_2 } from './mission2.js';
import { MISSION_3 } from './mission3.js';
import { MISSION_4 } from './mission4.js';
import { MISSION_5 } from './mission5.js';
import { MISSION_6 } from './mission6.js';
import { MISSION_7 } from './mission7.js';
import { MISSION_8 } from './mission8.js';
import { MISSION_9 } from './mission9.js';
import { MISSION_10 } from './mission10.js';

export const MISSIONS = { 1: MISSION_1, 2: MISSION_2, 3: MISSION_3, 4: MISSION_4, 5: MISSION_5, 6: MISSION_6, 7: MISSION_7, 8: MISSION_8, 9: MISSION_9, 10: MISSION_10 };
export const MISSION_IDS = Object.keys(MISSIONS).map(Number).sort((a, b) => a - b);
