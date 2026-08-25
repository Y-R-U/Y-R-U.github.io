import { readFileSync } from 'node:fs';
import { createStoryRun } from '/Users/aaronair/cc/yru/site/gms/2d/kitehawk/js/modes/story.js';
import { createRNG } from '/Users/aaronair/cc/yru/site/gms/2d/kitehawk/js/core/rng.js';
const load = id => JSON.parse(readFileSync(`/Users/aaronair/cc/yru/site/gms/2d/kitehawk/data/levels/${id}.json`,'utf8'));
const rows = [];
for (const id of ['a1-01','a1-04','a1-12','a2-05']) {
  const t=[], stars=[]; let won=0, died=0, n=12;
  for (let s=0;s<n;s++){
    const r = createStoryRun({rng:createRNG(500+s)}, load(id), {pilot:'ai'}).run(1/60);
    if (r.won) won++; if (r.deaths) died++; t.push(r.time); stars.push(r.starCount);
  }
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  rows.push({ id, won:`${won}/${n}`, died:`${died}/${n}`, meanT:+mean(t).toFixed(1),
              minT:Math.min(...t), maxT:Math.max(...t), meanStars:+mean(stars).toFixed(2) });
}
console.table(rows);
