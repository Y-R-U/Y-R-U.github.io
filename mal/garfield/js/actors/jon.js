// Jon Arbuckle — the shared human actor (human.js) with Jon's look. See docs/TEAM_BRIEF.md and docs/notes/jon.md.
import { createHumanActor } from './human.js';
import { JON_LOOK } from './jon_body.js';
export { CHAIR_FALL, SEAT } from './jon_clips.js';

export function createJon({ quality = 'high' } = {}) {
  return createHumanActor({ quality, look: JON_LOOK, name: 'jon' });
}
