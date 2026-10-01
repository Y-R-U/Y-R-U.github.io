// Command bar: `/` or `T` while playing (or the Commands chip in the pause menu). Only exists in the DOM while open,
// so it never steals WASD. /play <game> [length], /quit, /help, /time day|night, /tp spawn.
import { h, toast } from '../ui/dom.js';
import { GAMES, loadGame } from './registry.js';

export function createCommandBar(ctx, root, ui) {
  let bar = null, wasEnabled = true;

  const cheats = () => ctx.session?.mode === 'build' || !!ctx.session?.meta?.cheats;
  const say = (t, kind = 'info', ms = 3200) => toast(t, { kind, ms });

  const COMMANDS = {
    help: { args: '', desc: 'list commands', run() {
      say('/play <game> · /quit · /time day|night · /tp spawn. Games: ' + GAMES.map((g) => g.id).join(', '), 'info', 6000);
    } },
    play: { args: '<game>', desc: 'start a mini-game', async run([id, variant]) {
      if (!id) return say('Which one? Try /play parkour', 'warn');
      const key = GAMES.find((g) => g.id === id || g.id.startsWith(id))?.id;
      if (!key || !(await loadGame(key))) return say(`No mini-game called "${id}". Type /help for the list.`, 'warn');
      ui.shell.playMinigame(key, { variant });
    } },
    quit: { args: '', desc: 'leave to the title', run() { ui.shell.quit(); } },
    time: { args: 'day|night', desc: 'set the time', cheat: true, run([v]) {
      const t = { day: 0.3, noon: 0.375, dusk: 0.72, night: 0.85, midnight: 0.875 }[v];
      if (t == null) return say('Try /time day or /time night', 'warn');
      ctx.sky?.setTime?.(t); say(`Time set to ${v}`, 'good');
    } },
    tp: { args: 'spawn', desc: 'teleport', cheat: true, run([v]) {
      if (v !== 'spawn') return say('Try /tp spawn', 'warn');
      const sp = ctx.game?.spawnPoint || (ctx.world?.spawn && { x: ctx.world.spawn[0], y: ctx.world.spawn[1], z: ctx.world.spawn[2] });
      if (!sp) return say('No spawn point yet', 'warn');
      ctx.player?.teleport?.(sp.x, sp.y + 0.02, sp.z); say('Whoosh!', 'good');
    } },
  };

  async function run(line) {
    const parts = line.replace(/^\//, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const [name, ...args] = parts;
    const c = COMMANDS[name.toLowerCase()];
    if (!c) return say(`Unknown command /${name}. Type /help`, 'warn');
    if (c.cheat && ctx.session?.mode === 'minigame') return say('Not during a mini-game', 'warn');
    if (c.cheat && !cheats()) return say('That command works in Build mode, or in worlds with commands turned on.', 'warn');
    try { await c.run(args.map((a) => a.toLowerCase())); } catch (e) { say('That didn’t work: ' + (e?.message || e), 'bad'); }
  }

  function open(prefill = '/') {
    if (bar) return;
    const inp = ctx.input;
    wasEnabled = inp?.enabled !== false;
    if (inp) { inp.releasePointer?.(); inp.releaseAll?.(); inp.enabled = false; }
    const field = h('input.sw-input', { type: 'text', value: prefill, autocomplete: 'off', spellcheck: false, autocapitalize: 'off', enterkeyhint: 'go', 'aria-label': 'Command' });
    const hints = h('div.mg-cmd-hints', {}, Object.entries(COMMANDS).map(([k, c]) =>
      h('button', { class: c.cheat && !cheats() ? 'off' : '', onclick: () => { field.value = '/' + k + (c.args ? ' ' : ''); field.focus(); } }, '/' + k + (c.args ? ' ' + c.args : ''))));
    bar = h('div.mg-cmd.glass', {}, h('div.row', {}, field, h('button.sw-btn.primary.small', { onclick: () => submit() }, 'Go')), hints);
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'wheel']) bar.addEventListener(ev, stop, { passive: true });
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') close();
    });
    root.append(bar);
    setTimeout(() => { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }, 20);
    function submit() { const v = field.value; close(); run(v); }
  }
  function close() {
    if (!bar) return;
    bar.remove(); bar = null;
    const inp = ctx.input;
    if (inp && wasEnabled && ui.shell?.state === 'playing' && !ui.panel) { inp.enabled = true; }
  }

  // Opens on `/` or `T` only while playing, with nothing else open, and never while typing in a field.
  document.addEventListener('keydown', (e) => {
    if (bar || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
    if (ui.shell?.state !== 'playing' || ui.blocking) return;
    if (e.key === '/' || e.key === 't' || e.key === 'T') { e.preventDefault(); e.stopPropagation(); open(e.key === '/' ? '/' : '/'); }
  }, true);

  return { open, close, run, get isOpen() { return !!bar; } };
}
