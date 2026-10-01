// ctx.ui: mounts the shell + HUD, routes input actions to the panels. main.js calls ui.init(ctx) once, ui.update(dt) per frame.
import { h, setLayer, toast, popup, confirmPop } from './dom.js';
import { settings } from './settings.js';
import { createHud } from './hud.js';
import { openInventory } from './inventory.js';
import { openWheel } from './wheel.js';
import { createShell } from './shell.js';
import { fullscreen } from './fullscreen.js';
import { openSettings } from './settings_panel.js';

const CSS = ['../../css/ui.css', '../../css/hud.css'];
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
  hud: null, shell: null, game: null, handlesDeath: true,
  toast, popup, confirm: confirmPop,
  get blocking() { return !!panel || ui.shell?.state !== 'playing'; },
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
    });
    ui.shell = createShell(ctx, root, ui);

    const inp = ctx.input;
    if (inp?.on) {
      inp.on('inventory', () => ui.toggle('inventory'));
      inp.on('wheel', () => ui.toggle('wheel'));
      inp.on('pause', () => { if (panel) ui.closePanels(); else if (ui.shell.state === 'playing') ui.shell.pause(); else if (ui.shell.state === 'paused') ui.shell.resume(); });
      inp.on('toggleView', () => settings.set('view', settings.get('view') === 'first' ? 'third' : 'first'));
    }
    // Esc on desktop while the pointer is free: pause (input only emits when unlocked)
    const bus = ctx.bus;
    bus?.on('player:death', () => showDeath());
    bus?.on('player:respawn', () => { deathEl?.remove(); deathEl = null; });
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
    else if (q.has('play')) {
      ui.shell.play({ id: null, temp: true, name: 'Test world', seed: q.get('seed') || 'synthwild', mode: q.get('mode') || 'survival', difficulty: 'normal', source: 'local', mine: true }, { fresh: true });
    } else ui.shell.start();
  },

  toggle(kind) {
    if (panel?.kind === kind) { ui.closePanels(); return; }
    if (ui.shell?.state !== 'playing') return;
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
  closePanels() { panel?.p.close(); panel = null; },
  openSettings: () => openSettings(root, {}),

  update(dt) {
    ui.hud?.update(dt);
    ui.shell?.update(dt);
  },
};

function showDeath() {
  if (deathEl || !root) return;
  const ctx = ctxRef;
  const keep = settings.get('keepInventory');
  deathEl = h('div.sw-pause', { style: { background: 'radial-gradient(ellipse at center, rgba(60,0,20,.35), rgba(20,0,10,.7))' } },
    h('div.card.glass', {},
      h('h2', {}, 'SUIT OFFLINE'),
      h('div.sub', {}, keep ? 'You kept everything.' : 'Your backpack dropped as a glowing Memory Cache. Go back and grab it! Your hotbar is safe.'),
      h('button.sw-btn.primary', { onclick: () => {
        deathEl?.remove(); deathEl = null;
        (ctx.game?.respawn || ctx.player?.respawn)?.call(ctx.game?.respawn ? ctx.game : ctx.player);
        ctx.input?.requestPointer?.();
      } }, 'Reboot suit')));
  ctx.input?.releasePointer?.();
  root.append(deathEl);
}

export default ui;
