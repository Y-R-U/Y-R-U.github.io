// Course list. A course is an ordered set of hole definitions (theme-independent, D6).
// Sky Isles has 18 holes; `nines` splits it into the front and back nine for menus and rounds
// (a round plays one nine; holes unlock in order across all 18).
import sky1 from './sky1.js';
import sky2 from './sky2.js';
import sky3 from './sky3.js';
import sky4 from './sky4.js';
import sky5 from './sky5.js';
import sky6 from './sky6.js';
import sky7 from './sky7.js';
import sky8 from './sky8.js';
import sky9 from './sky9.js';
import sky10 from './sky10.js';
import sky11 from './sky11.js';
import sky12 from './sky12.js';
import sky13 from './sky13.js';
import sky14 from './sky14.js';
import sky15 from './sky15.js';
import sky16 from './sky16.js';
import sky17 from './sky17.js';
import sky18 from './sky18.js';
import fest1 from './fest1.js';
import fest2 from './fest2.js';
import fest3 from './fest3.js';
import fest4 from './fest4.js';
import fest5 from './fest5.js';
import fest6 from './fest6.js';
import fest7 from './fest7.js';
import fest8 from './fest8.js';
import fest9 from './fest9.js';
import wood1 from './wood1.js';
import wood2 from './wood2.js';
import wood3 from './wood3.js';
import wood4 from './wood4.js';
import wood5 from './wood5.js';
import wood6 from './wood6.js';
import wood7 from './wood7.js';
import wood8 from './wood8.js';
import wood9 from './wood9.js';
import sugar1 from './sugar1.js';
import sugar2 from './sugar2.js';
import sugar3 from './sugar3.js';
import sugar4 from './sugar4.js';
import sugar5 from './sugar5.js';
import sugar6 from './sugar6.js';
import sugar7 from './sugar7.js';
import sugar8 from './sugar8.js';
import sugar9 from './sugar9.js';

export const COURSES = {
  sky: {
    id: 'sky', name: 'Sky Isles', theme: 'sky',
    holes: [sky1, sky2, sky3, sky4, sky5, sky6, sky7, sky8, sky9, sky10, sky11, sky12, sky13, sky14, sky15, sky16, sky17, sky18],
    nines: [{ id: 'front', name: 'Front nine', from: 0, to: 9 }, { id: 'back', name: 'Back nine', from: 9, to: 18 }],
  },
  // events2: Festival Isles, a 9-hole course built for special events (any theme skins it, D6).
  // Not on the title / course map; events (js/events/data/) and online rooms pick holes from it.
  festival: {
    id: 'festival', name: 'Festival Isles', theme: 'sky',
    holes: [fest1, fest2, fest3, fest4, fest5, fest6, fest7, fest8, fest9],
  },
  // courses2: Hollow Woods, a 9-hole course built to look best in Spooky Hollow (any theme skins it, D6).
  // A map tab; locked until the Sky Isles front nine is finished (`lockedBy`, js/app/menus.js showMap).
  woods: {
    id: 'woods', name: 'Hollow Woods', theme: 'spooky',
    holes: [wood1, wood2, wood3, wood4, wood5, wood6, wood7, wood8, wood9],
    lockedBy: { hole: 'sky9', course: 'sky', note: 'Finish the Sky Isles front nine to open Hollow Woods.' },
  },
  // courses3: Sugar Summit, a 9-hole climb up a candy mountain, built to look best in Candy Land (any theme skins it, D6).
  // A map tab after Hollow Woods; locked until Festival Isles is finished (fest9, `lockedBy`).
  sugar: {
    id: 'sugar', name: 'Sugar Summit', theme: 'candy',
    holes: [sugar1, sugar2, sugar3, sugar4, sugar5, sugar6, sugar7, sugar8, sugar9],
    lockedBy: { hole: 'fest9', course: 'festival', note: 'Finish Festival Isles to open Sugar Summit.' },
  },
};

// The nine a hole index belongs to (courses without `nines` are one block).
export function nineOf(course, i) {
  return course.nines?.find(n => i >= n.from && i < n.to) || { id: 'all', name: course.name, from: 0, to: course.holes.length };
}
