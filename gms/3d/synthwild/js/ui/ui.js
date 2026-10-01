// ctx.ui: mounts the shell + HUD, routes input actions to the panels. main.js calls ui.init(ctx) once, ui.update(dt) per frame.
import { h, setLayer, toast, popup, confirmPop } from './dom.js';
import { settings } from './settings.js';
import { createHud } from './hud.js';
import { openInventory } from './inventory.js';
import { openWheel } from './wheel.js';
import { createShell } from './shell.js';
import { fullscreen } from './fullscreen.js';
import { openSettings } from './settings_panel.js';
import { createCommandBar } from '../minigames/command.js';

const CSS = ['../../css/ui.css', '../../css/hud.css', '../../css/minigames.css'];
function loadCss() {
  for (const p of CSS) {
    const href = new URL(p, import.meta.url).href;
    if ([...document.styleSheets].some((s) => s.href === href) || document.querySelector(`link[href="${href}"]`)) continue;
    document.head.append(h('link', { rel: 'stylesheet', href }));
  }
  if (!document.querySelector('link[data-sw-fonts]')) {
    document.head.append(h('link', { rel: 'stylesheet', 'data-sw-fonts': '1',
      href: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&family=Orbitron:wght@700;900&display=swap' }));
  }
}

let ctxRef = null, root = null, panel = null, deathEl = null;

export const ui = {
  hud: null, shell: null, cmd: null, game: null, handlesDeath: true,
  toast, popup, confirm: confirmPop,
  get blocking() { return !!panel || !!ui.cmd?.isOpen || !!ctxRef?.game?.stations?.isOpen || ui.shell?.state !== 'playing'; },
  get panel() { return panel?.kind || null; },

  // game: optional { start, stop, save } (otherwise js/main.js's `game` export is imported lazily).
  init(ctx, game) {
    ctxRef = ctx;
    if (game) ui.game = game;
    loadCss();
    const host = ctx.uiRoot || document.getElementById('ui-root') || document.body.appendChild(h('div', { id: 'ui-root' }));
    host.classList.add('sw-root');
    root = h('div.sw-layer');
    host.append(root);
    setLayer(root, ctx.audio);
    settings.init(ctx);

    const applyScale = () => document.documentElement.style.setProperty('--ui', settings.get('uiScale'));
    const applyHc = () => document.documentElement.classList.toggle('hc', !!settings.get('highContrast'));
    applyScale(); applyHc();
    settings.on('uiScale', applyScale);
    settings.on('highContrast', applyHc);

    ui.hud = createHud(ctx, root, {
      inventory: () => ui.toggle('inventory'),
      wheel: () => ui.toggle('wheel'),
      pause: () => ui.shell.pause(),
      dusk: () => duskWarning(),
    });
    ui.shell = createShell(ctx, root, ui);
    ui.cmd = createCommandBar(ctx, root, ui);
    if (window.__game) window.__game.shell = ui.shell;

    const inp = ctx.input;
    if (inp?.on) {
      inp.on('inventory', () => ui.toggle('inventory'));
      inp.on('wheel', () => ui.toggle('wheel'));
      inp.on('pause', () => { if (ui.cmd?.isOpen) { ui.cmd.close(); return; } if (ui.shell.noAutoPause && ui.shell.state === 'playing' && !panel) return; if (panel || ctx.game?.stations?.isOpen) ui.closePanels(); else if (ui.shell.state === 'playing') ui.shell.pause(); else if (ui.shell.state === 'paused') ui.shell.resume(); });
      inp.on('toggleView', () => settings.set('view', settings.get('view') === 'first' ? 'third' : 'first'));
    }
    // Esc on desktop while the pointer is free: pause (input only emits when unlocked)
    const bus = ctx.bus;
    bus?.on('player:death', () => showDeath());
    bus?.on('player:respawn', () => { deathEl?.remove(); deathEl = null; });
    bus?.on('brush:notUndoable', () => toast('That one is too big to undo', { kind: 'warn', ms: 2200 }));
    bus?.on('brush:copy', (d) => toast(`Copied ${d?.size ? d.size.map((v) => +(v / 4).toFixed(2)).join('×') : ''} — paste it from the tool wheel`, { kind: 'good', ms: 2400 }));
    bus?.on('brush:pick', (d) => { if (d && d.found === false) toast('You don’t have that block. Find or make some first!', { kind: 'warn', ms: 2400 }); });
    bus?.on('item:fabricate', () => ctx.audio?.sfx('fabricate'));
    bus?.on('player:noAmmo', () => { ctx.audio?.sfx('deny'); toast('No Pulse Charges left', { kind: 'warn', ms: 1800 }); });
    bus?.on('player:sleep', () => toast('Sleep Pod set as your respawn point', { kind: 'good' }));
    bus?.on('inv:break', (d) => toast(`${ctx.game?.items?.get?.(d.id)?.name || 'Tool'} broke!`, { kind: 'warn' }));

    const once = () => { fullscreen.restore(); removeEventListener('pointerdown', once, true); };
    addEventListener('pointerdown', once, true);

    ui.shell.preload();
    const q = new URLSearchParams(location.search);
    // main.js starts the engine itself for ?auto/?shot/?cam; the shell just adopts that session.
    if (q.get('auto') === '1' || q.get('shot') === '1' || q.has('cam')) {
      settings.set('introSeen', true);
      ui.shell.adopt();
    } else if (q.has('intro')) ui.shell.runIntro(true).then(() => ui.shell.start());
    else if (q.has('mgtest')) {
      settings.set('introSeen', true);
      ui.shell.noAutoPause = true;
      ui.shell.playMinigame(q.get('mgtest'), { variant: q.get('variant') || undefined });
    } else if (q.has('play')) {
      ui.shell.play({ id: null, temp: true, name: 'Test world', seed: q.get('seed') || 'synthwild', mode: q.get('mode') || 'survival', difficulty: 'normal', source: 'local', mine: true }, { fresh: true });
    } else ui.shell.start();
  },

  toggle(kind) {
    if (panel?.kind === kind) { ui.closePanels(); return; }
    if (ctxRef?.game?.stations?.isOpen) { ctxRef.game.stations.close(); return; }
    if (ui.shell?.state !== 'playing') return;
    if (ctxRef?.session?.mode === 'minigame' && (kind === 'wheel' || !ctxRef.game?.inv?.slots?.some(Boolean))) return;
    ui.closePanels();
    const ctx = ctxRef;
    ctx.input?.releasePointer?.(); ctx.input?.releaseAll?.();
    if (ctx.input) ctx.input.enabled = false;
    const onClose = () => {
      if (panel?.p === p) panel = null;
      if (ui.shell?.state === 'playing' && ctx.input) { ctx.input.enabled = true; ctx.input.requestPointer?.(); }
    };
    const p = kind === 'inventory' ? openInventory(ctx, root, { onClose }) : openWheel(ctx, root, { onClose });
    if (p) panel = { kind, p };
    ctx.bus?.emit('ui:open', { panel: kind });
  },
  closePanels() { panel?.p.close(); panel = null; ctxRef?.game?.stations?.isOpen && ctxRef.game.stations.close(); },
  openSettings: () => openSettings(root, {}),

  update(dt) {
    ui.hud?.update(dt);
    ui.shell?.update(dt);
  },
};

let subEl = null;
// Short narrator line with an on-screen subtitle (respects the subtitles setting).
export function say(key, text, ms = 4500) {
  if (!root) return;
  ctxRef?.audio?.vo?.(key);
  if (!settings.get('subtitles')) return;
  subEl?.remove();
  subEl = h('div.sw-say.glass', {}, text);
  root.append(subEl);
  const el = subEl;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}
function duskWarning() {
  toast('Night is coming — build a shelter and light it!', { kind: 'warn', ms: 5000 });
  say('n01', 'The sun is going down soon. Build a little shelter, and light it up!');
}

function showDeath() {
  if (deathEl || !root || ctxRef?.session?.mode === 'minigame') return;
  const ctx = ctxRef;
  const keep = settings.get('keepInventory');
  const where = ctx.game?.spawnPoint ? 'at your Sleep Pod' : 'at the landing site';
  deathEl = h('div.sw-pause', { style: { background: 'radial-gradient(ellipse at center, rgba(60,0,20,.35), rgba(20,0,10,.7))' } },
    h('div.card.glass', {},
      h('h2', {}, 'SUIT OFFLINE'),
      h('div.sub', {}, keep ? 'You kept everything.' : 'Your backpack dropped as a glowing Memory Cache. Go back and grab it! Your hotbar is safe.'),
      h('div.sub', {}, `You'll reboot ${where}. Nearby monsters were scared off.`),
      h('button.sw-btn.primary', { onclick: () => {
        deathEl?.remove(); deathEl = null;
        (ctx.game?.respawn || ctx.player?.respawn)?.call(ctx.game?.respawn ? ctx.game : ctx.player);
        ctx.input?.requestPointer?.();
      } }, 'Reboot suit')));
  ctx.input?.releasePointer?.();
  root.append(deathEl);
}

export default ui;
