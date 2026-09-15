// Runs the ?auto bot across missions and prints WON/LOST + score + shots.
// Known non-bugs: the 4-wave s10 protect and some weeklies beat the bot (it
// cannot lead panicked runners, whose direction changes mid-flight) — they fail
// identically on the shipped build, so A/B before believing a regression.
//
//   node tools/bot_sweep.mjs [missionIds] [seeds]
//   node tools/bot_sweep.mjs s01,s02,s03,s05,s08,s09,s12,s13,s17,s19,s21 4
import { connect, boot, sleep, BASE } from './cdp.mjs';
const IDS = (process.argv[2] || 's02,s03,s05,s07,s12,s13,s16,s17,s19,s21').split(',');
const SEEDS = (process.argv[3] || '4').split(',');
const p = await connect();
for (const seed of SEEDS) for (const id of IDS) {
  const t0 = Date.now();
  try {
    await boot(p, `m=${id}&seed=${seed}&auto&nosave`);
    let res = null;
    for (let i = 0; i < 260; i++) {
      const s = await p.ev('return window.__state;');
      if (s.lastResult) { res = s.lastResult; break; }
      await sleep(500);
    }
    const s = await p.ev('return window.__state;');
    console.log(`${id}@${seed}`, res ? `${res.won ? 'WON' : 'LOST'} score=${res.score ?? '?'} t=${Math.round((Date.now() - t0) / 1000)}s shots=${s.mission ? s.mission.shots : '?'}` : `TIMEOUT t=${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) { console.log(`${id}@${seed} ERR ${e.message}`); }
}
p.close();
