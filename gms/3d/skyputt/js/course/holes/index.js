// Course list. A course is an ordered set of hole definitions (theme-independent, D6).
import sky1 from './sky1.js';
import sky2 from './sky2.js';
import sky3 from './sky3.js';
import sky4 from './sky4.js';
import sky5 from './sky5.js';
import sky6 from './sky6.js';
import sky7 from './sky7.js';
import sky8 from './sky8.js';
import sky9 from './sky9.js';

export const COURSES = {
  sky: { id: 'sky', name: 'Sky Isles', theme: 'sky', holes: [sky1, sky2, sky3, sky4, sky5, sky6, sky7, sky8, sky9] },
};
