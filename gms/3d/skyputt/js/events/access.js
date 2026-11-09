// events4: may an event round keep progress on this hole? (Taster rule, docs/notes/events4.md.)
// Events and weekends may put any course's holes on their card, including courses the player hasn't
// opened yet (Sunken Reef in Deep Dive, Hollow Woods in the Battle Royale Cup, weekend picks from every
// course). Rule: an event never opens a locked COURSE. A hole is a TASTER — playable and scored for the
// event, but the round records no best or stars for it and marks nothing finished — when
//   * its course is still gated (`lockedBy` not finished), or
//   * it is the gate of another course (sky9 → Hollow Woods, fest9 → Sugar Summit, …) and the player
//     hasn't reached it on the map yet: finishing it would unlock that course.
// Other holes on courses the player has keep the events2 behaviour (a hole played in an event is open on
// the map, the next hole unlocks). A hole that already has a record (e.g. from an event before events4)
// keeps progress, matching the map (`!rec` in js/app/menus.js showMap). Remixes (`mir-…`) unlock nothing.
import { COURSES } from '../course/holes/index.js';
import { remixOf } from './remix.js';

const courseOf = id => Object.values(COURSES).find(c => c.holes.some(h => h.id === id)) || null;
const gateOf = id => Object.values(COURSES).find(c => c.lockedBy?.hole === id) || null;   // the course this hole opens
const closed = (store, c) => !!c?.lockedBy && !store.data.unlocked?.[c.lockedBy.hole];

// The course this event play must not open (the hole's own, or the one it is the gate of), or null.
export function tasterCourse(store, id) {
  if (remixOf(id) || store.hole(id)) return null;
  const c = courseOf(id);
  if (!c) return null;   // not on any course (test holes)
  if (closed(store, c)) return c;
  const g = gateOf(id);
  if (g && closed(store, g) && c.holes.findIndex(h => h.id === id) >= store.unlockedCount(c)) return g;
  return null;
}
export const keepsProgress = (store, id) => !tasterCourse(store, id);
