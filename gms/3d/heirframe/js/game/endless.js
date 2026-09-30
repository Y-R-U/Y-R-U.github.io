// P6 post-game runtime: Legacy / Overclock / Voice Hunt announcements and the Succession hand-over.
import { toUiWarehouse } from '../sim/ui_adapt.js';
import { ROMAN } from '../ui/panel_legacy.js';

export function createEndless(G, { ui, audio, fx, player, log }) {
  const sim = G.sim;
  const quiet = () => G.quiet;
  sim.on('legacy', (p) => { if (!quiet()) ui?.toast(`+${p.gained} Legacy point${p.gained > 1 ? 's' : ''}`, 'gold', { sub: `${p.points} to spend · Warehouse ▸ Legacy` }); log(`legacy +${p.gained} (${p.gen} this gen)`); });
  sim.on('heir:rank', (p) => { if (!quiet()) ui?.sting(`Heir Core rank ${p.rank}`, `Heir Protocol +${p.rank * 5}%`, 'unlock', 3000); });
  sim.on('overclock:unlock', (p) => { log('overclock ' + p.n); if (!quiet()) ui?.sting(`Overclock ${ROMAN(p.n)}`, p.n === 1 ? 'Harder contracts, better loot · pick it on the board' : 'Unlocked on the contract board', 'unlock', 3200); });
  sim.on('voice:hunt', (p) => { log(`voice hunt ${p.id} in ${p.district}`); if (!quiet()) { ui?.sting('A Voice surfaces', `${p.name} · ${p.districtName}`, 'alert', 3600); audio.sfx('alarm', { vol: 0.4 }); } });
  sim.on('voice:moved', (p) => { if (!quiet()) ui?.toast(`${p.name} moved on`, 'warn', { sub: `Now hiding in ${p.districtName}` }); });
  sim.on('voice:caught', (p) => { log(`voice caught ${p.id}`); ui?.sting(`${p.name} silenced`, `${p.relic || 'Voice relic'} · ${p.left ? `${p.left} still hiding` : 'all five silenced'}`, 'unlock', 4000); audio.sting?.('win'); });

  // Warehouse ▸ Legacy ▸ Pass the Frame
  async function pass(name, heirloom) {
    const r = sim.succession(name, heirloom);
    if (!r.ok) { ui?.toast(r.reason === 'legacy' ? `Earn ${r.need} Legacy first (${r.have}/${r.need})` : r.reason === 'level' ? 'Reach level 60 first' : 'Not now', 'warn'); return r; }
    log(`succession gen ${r.gen} ${r.name}`);
    ui?.panel.close();
    G.quiet = true;
    G.coach?.skipAll();
    fx.beam(player.pos, 0xffd27a, 1.2, 10, 3);
    fx.ring(player.pos, 5, 0xffd27a, 0.8);
    await G.frames?.deploy(sim.activeFrame(), { reason: 'succession' });
    if (G.districts?.id !== 'aurum_plaza') await G.districts.travel('aurum_plaza', { via: 'dev', quiet: true });
    G.quiet = false;
    G.hud?.update?.(0, {});
    ui?.sting(`Generation ${r.gen}`, `${r.name} takes the frame · +${Math.round(15 * Math.min(r.gen - 1, 10))}% XP`, 'level', 4200);
    if (r.duty) setTimeout(() => ui?.toast(`Estate duty −${r.duty.toLocaleString('en-US')} cr`, 'warn', { sub: 'Credits above 50,000 go to the Concord treasury' }), 1800);
    setTimeout(() => ui?.toast('The family tree grows', 'good', { sub: 'Codex ▸ Family · the story replays as an Echo run' }), 3600);
    sim.save();
    return r;
  }
  const refresh = () => { if (ui?.panel.current === 'warehouse') ui.panel.update(toUiWarehouse(sim)); };
  return { pass, refresh };
}
