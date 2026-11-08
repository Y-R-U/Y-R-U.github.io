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
import reef1 from './reef1.js';
import reef2 from './reef2.js';
import reef3 from './reef3.js';
import reef4 from './reef4.js';
import reef5 from './reef5.js';
import reef6 from './reef6.js';
import reef7 from './reef7.js';
import reef8 from './reef8.js';
import reef9 from './reef9.js';
import star1 from './star1.js';
import star2 from './star2.js';
import star3 from './star3.js';
import star4 from './star4.js';
import star5 from './star5.js';
import star6 from './star6.js';
import star7 from './star7.js';
import star8 from './star8.js';
import star9 from './star9.js';

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
  // reef: Sunken Reef, a 9-hole underwater course built to look best in Sunken Reef (any theme skins it, D6).
  // A map tab after Sugar Summit; locked until Sugar Summit is finished (sugar9, `lockedBy`).
  reef: {
    id: 'reef', name: 'Sunken Reef', theme: 'reef',
    holes: [reef1, reef2, reef3, reef4, reef5, reef6, reef7, reef8, reef9],
    lockedBy: { hole: 'sugar9', course: 'sugar', note: 'Finish Sugar Summit to open Sunken Reef.' },
    dailyFrom: '2026-11-16',   // joins the daily pool from this date, so days already played keep their hole (js/daily/daily.js)
  },
  // star: Star Station, a 9-hole orbital course built to look best in Star Station (any theme skins it, D6).
  // A map tab after Sunken Reef; locked until Sunken Reef is finished (reef9, `lockedBy`).
  star: {
    id: 'star', name: 'Star Station', theme: 'star',
    holes: [star1, star2, star3, star4, star5, star6, star7, star8, star9],
    lockedBy: { hole: 'reef9', course: 'reef', note: 'Finish Sunken Reef to open Star Station.' },
    dailyFrom: '2026-11-23',   // joins the daily pool from this date (js/daily/daily.js)
  },
};

// The nine a hole index belongs to (courses without `nines` are one block).
export function nineOf(course, i) {
  return course.nines?.find(n => i >= n.from && i < n.to) || { id: 'all', name: course.name, from: 0, to: course.holes.length };
}
