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

export const COURSES = {
  sky: {
    id: 'sky', name: 'Sky Isles', theme: 'sky',
    holes: [sky1, sky2, sky3, sky4, sky5, sky6, sky7, sky8, sky9, sky10, sky11, sky12, sky13, sky14, sky15, sky16, sky17, sky18],
    nines: [{ id: 'front', name: 'Front nine', from: 0, to: 9 }, { id: 'back', name: 'Back nine', from: 9, to: 18 }],
  },
};

// The nine a hole index belongs to (courses without `nines` are one block).
export function nineOf(course, i) {
  return course.nines?.find(n => i >= n.from && i < n.to) || { id: 'all', name: course.name, from: 0, to: course.holes.length };
}
