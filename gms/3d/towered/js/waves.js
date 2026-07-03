// Wave scheduler: countdown → spawn groups → wave cleared when every enemy it
// spawned is dead or leaked. Calling the next wave early pays a gold bonus per
// second left on the clock. Waves may overlap (early calls stack pressure).

import { ECON, ENEMIES } from './config.js';

export function createWaves(level, enemies, bus) {
  const mgr = {
    idx: -1,                       // last wave started
    phase: 'countdown',            // countdown | running | done
    countdown: 13,                 // grace before wave 1
    remaining: new Map(),          // waveIdx -> enemies still standing
    spawners: [],                  // active group spawners
    total: level.waves.length,
  };

  mgr.preview = (i) => {
    const w = level.waves[i];
    if (!w) return [];
    const agg = new Map();
    for (const g of w.groups) agg.set(g.type, (agg.get(g.type) || 0) + g.n);
    return [...agg].map(([type, n]) => ({ type, n, icon: ENEMIES[type].icon, name: ENEMIES[type].name }));
  };
  mgr.hasBoss = (i) => !!level.waves[i]?.groups.some(g => ENEMIES[g.type].boss);

  mgr.call = () => {
    if (mgr.idx + 1 >= mgr.total || mgr.phase === 'done') return 0;
    const bonus = mgr.phase === 'countdown' && mgr.idx >= 0
      ? Math.ceil(Math.max(0, mgr.countdown) * ECON.earlyBonusPerSec) : 0;
    startWave(mgr.idx + 1);
    return bonus;
  };

  function startWave(i) {
    mgr.idx = i;
    mgr.phase = 'running';
    const w = level.waves[i];
    let count = 0;
    for (const g of w.groups) count += g.n;
    mgr.remaining.set(i, count);
    for (const g of w.groups) {
      mgr.spawners.push({
        wave: i, type: g.type, left: g.n, gap: g.gap ?? 1,
        timer: g.delay ?? 0, path: g.path ?? 0,
      });
    }
    bus.onWaveStart?.(i, mgr.hasBoss(i));
  }

  // main calls this from its enemy-gone hook (kill or leak)
  mgr.notifyGone = (e) => {
    const i = e.waveIdx;
    if (!mgr.remaining.has(i)) return;
    const left = mgr.remaining.get(i) - 1;
    mgr.remaining.set(i, left);
    if (left <= 0) {
      mgr.remaining.delete(i);
      bus.onWaveCleared?.(i, ECON.waveBonus(i));
      if (mgr.remaining.size === 0 && !mgr.spawners.length) {
        if (mgr.idx === mgr.total - 1) {
          mgr.phase = 'done';
          bus.onAllCleared?.();
        } else if (mgr.phase === 'running') {
          mgr.phase = 'countdown';
          mgr.countdown = ECON.waveGap;
        }
      }
    }
  };

  mgr.update = (dt) => {
    if (mgr.phase === 'countdown') {
      mgr.countdown -= dt;
      if (mgr.countdown <= 0) startWave(mgr.idx + 1);
    }
    for (let i = mgr.spawners.length - 1; i >= 0; i--) {
      const s = mgr.spawners[i];
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = s.gap;
        s.left--;
        enemies.spawn(s.type, s.path).then(e => { e.waveIdx = s.wave; });
        if (s.left <= 0) mgr.spawners.splice(i, 1);
      }
    }
    // all spawned, previous waves cleared → back to countdown for the next
    if (mgr.phase === 'running' && !mgr.spawners.length && mgr.remaining.size === 0 && mgr.idx < mgr.total - 1) {
      mgr.phase = 'countdown';
      mgr.countdown = ECON.waveGap;
    }
  };

  return mgr;
}
