import { STRAINS, UPGRADES, type UpgradeDef } from '../config/balance';
import { css, PAL } from '../config/palette';
import { settings, saveSettings, type QualityTier } from '../core/settings';
import type { Game } from '../core/Game';
import type { Sound } from '../audio/Sound';
import type { World } from '../sim/World';
import { applyQuality } from '../core/quality';

type El = HTMLElement;

function h(tag: string, attrs: Record<string, string> = {}, kids: (El | string)[] = []): El {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) el.append(kid);
  return el;
}

/**
 * DOM scene/menu layer (build plan §1 state machine + §4 hybrid UI). Static,
 * text-heavy screens live in crisp accessible DOM; the live HUD stays in Pixi.
 */
export class UI {
  private root: El;
  private controls: El;
  private hint: El;
  private chosenStrain = 'cyto';

  constructor(
    private readonly game: Game,
    private readonly sound: Sound,
  ) {
    this.root = document.getElementById('ui')!;
    this.controls = document.getElementById('controls')!;
    this.hint = document.getElementById('hint')!;

    document.getElementById('pause')!.addEventListener('click', () => {
      if (this.game.state === 'playing') {
        this.sound.ui();
        this.game.pause();
        this.showPause();
      }
    });

    game.onWaveClear = (choices) => this.showUpgrade(choices);
    game.onDeath = (world) => this.showGameOver(world);
  }

  private overlay(...kids: El[]): void {
    const panel = h('div', { class: 'panel' }, kids);
    const ov = h('div', { class: 'overlay' }, [panel]);
    this.root.replaceChildren(ov);
  }

  private clear(): void {
    this.root.replaceChildren();
  }

  private showControls(on: boolean): void {
    this.controls.classList.toggle('hidden', !on);
  }

  // ── main menu ──
  showMenu(): void {
    this.game.startDemo();
    this.showControls(false);
    this.hint.classList.add('hidden');

    const brand = h('div', { class: 'brand' }, [
      h('h1', {}, ['CRYO', h('span', {}, ['DRIFT'])]),
      h('div', { class: 'sub' }, ['a specimen, adrift']),
    ]);

    const label = h('div', { class: 'title-sm' }, ['select strain']);
    const cards = h('div', { class: 'cards' });
    const cardEls: El[] = [];
    STRAINS.forEach((s) => {
      const card = h('div', { class: 'card' + (s.id === this.chosenStrain ? ' sel' : '') }, [
        h('h3', { style: `color:${css(s.tint)}` }, [s.name]),
        h('p', {}, [s.blurb]),
      ]);
      card.addEventListener('click', () => {
        this.chosenStrain = s.id;
        cardEls.forEach((c) => c.classList.remove('sel'));
        card.classList.add('sel');
        this.sound.ui();
      });
      cardEls.push(card);
      cards.append(card);
    });

    const play = h('button', { class: 'btn' }, ['Begin Culture']);
    play.addEventListener('click', () => this.startRun());
    const set = h('button', { class: 'btn ghost' }, ['Settings']);
    set.addEventListener('click', () => this.showSettings('menu'));

    this.overlay(brand, label, cards, play, set);
  }

  private startRun(): void {
    this.sound.unlock();
    this.sound.ui();
    this.clear();
    this.game.start(this.chosenStrain);

    const revealControls = (): void => {
      this.showControls(true);
      this.hint.classList.remove('hidden');
      setTimeout(() => this.hint.classList.add('hidden'), 4000);
    };

    if (settings.intro && !settings.reduceMotion && this.game.hasIntro()) {
      this.showControls(false);
      this.game.playIntro(revealControls);
    } else {
      revealControls();
    }
  }

  // ── pause ──
  showPause(): void {
    this.showControls(false);
    const resume = h('button', { class: 'btn' }, ['Resume']);
    resume.addEventListener('click', () => {
      this.clear();
      this.showControls(true);
      this.game.resume();
    });
    const restart = h('button', { class: 'btn ghost' }, ['Restart Culture']);
    restart.addEventListener('click', () => {
      this.clear();
      this.showControls(true);
      this.game.restart();
    });
    const quit = h('button', { class: 'btn ghost' }, ['Abandon → Menu']);
    quit.addEventListener('click', () => this.showMenu());
    const set = h('button', { class: 'btn ghost' }, ['Settings']);
    set.addEventListener('click', () => this.showSettings('pause'));
    this.overlay(h('div', { class: 'brand' }, [h('h1', { style: 'font-size:34px' }, ['PAUSED'])]), resume, restart, set, quit);
  }

  // ── upgrade pick ──
  showUpgrade(choices: UpgradeDef[]): void {
    this.showControls(false);
    const title = h('div', { class: 'brand' }, [
      h('h1', { style: 'font-size:30px' }, ['MUTATE']),
      h('div', { class: 'sub' }, [`culture stabilized · day ${this.game.world.wave}`]),
    ]);
    const cards = h('div', { class: 'cards' });
    (choices.length ? choices : UPGRADES.slice(0, 3)).forEach((u) => {
      const card = h('div', { class: 'card' }, [
        h('div', { class: 'tag', style: `color:${css(u.color)}` }, ['organelle']),
        h('h3', { style: `color:${css(u.color)}` }, [u.name]),
        h('p', {}, [u.desc]),
      ]);
      card.addEventListener('click', () => {
        this.clear();
        this.showControls(true);
        this.game.pickUpgrade(u.id);
      });
      cards.append(card);
    });
    this.overlay(title, cards);
  }

  // ── game over ──
  showGameOver(world: World): void {
    this.showControls(false);
    const mins = Math.floor(world.runTime / 60);
    const secs = Math.floor(world.runTime % 60);
    const summary = h('div', { class: 'summary' }, [
      h('div', { class: 'k' }, ['SCORE']),
      h('div', { class: 'v big' }, [String(world.score)]),
      h('div', { class: 'k' }, ['CULTURE DAY']),
      h('div', { class: 'v' }, [String(Math.max(1, world.wave))]),
      h('div', { class: 'k' }, ['LYSED']),
      h('div', { class: 'v' }, [String(world.kills)]),
      h('div', { class: 'k' }, ['BEST COMBO']),
      h('div', { class: 'v' }, ['×' + world.bestStreak]),
      h('div', { class: 'k' }, ['SURVIVED']),
      h('div', { class: 'v' }, [`${mins}:${String(secs).padStart(2, '0')}`]),
    ]);
    const again = h('button', { class: 'btn' }, ['Culture Again']);
    again.addEventListener('click', () => {
      this.clear();
      this.showControls(true);
      this.game.restart();
    });
    const menu = h('button', { class: 'btn ghost' }, ['Menu']);
    menu.addEventListener('click', () => this.showMenu());
    this.overlay(
      h('div', { class: 'brand' }, [h('h1', { style: `font-size:34px;color:${css(PAL.danger)}` }, ['LYSED']), h('div', { class: 'sub' }, ['the specimen has dispersed'])]),
      summary,
      again,
      menu,
    );
  }

  // ── settings ──
  private showSettings(back: 'menu' | 'pause'): void {
    const rows: El[] = [];

    rows.push(this.toggleRow('Swap thumbs (aim ↔ drift)', settings.swapSticks, (v) => { settings.swapSticks = v; }));
    rows.push(this.sliderRow('Stick sensitivity', 0.5, 1.5, 0.05, settings.sensitivity, (v) => { settings.sensitivity = v; }));
    rows.push(this.sliderRow('Volume', 0, 1, 0.05, settings.volume, (v) => { settings.volume = v; this.sound.setVolume(v); }));
    rows.push(this.selectRow('Quality', ['auto', 'high', 'medium', 'low'], settings.quality, (v) => { settings.quality = v as QualityTier | 'auto'; applyQuality(this.game.renderer); }));
    rows.push(this.toggleRow('Reduce motion', settings.reduceMotion, (v) => { settings.reduceMotion = v; }));
    rows.push(this.toggleRow('Cinematic intro', settings.intro, (v) => { settings.intro = v; }));

    const done = h('button', { class: 'btn' }, ['Done']);
    done.addEventListener('click', () => {
      saveSettings();
      this.sound.ui();
      if (back === 'menu') this.showMenu();
      else this.showPause();
    });

    this.overlay(h('div', { class: 'brand' }, [h('h1', { style: 'font-size:30px' }, ['SETTINGS'])]), ...rows, done);
  }

  private toggleRow(label: string, val: boolean, on: (v: boolean) => void): El {
    const t = h('div', { class: 'toggle' + (val ? ' on' : '') });
    t.addEventListener('click', () => {
      val = !val;
      t.classList.toggle('on', val);
      on(val);
      this.sound.ui();
    });
    return h('div', { class: 'settings-row' }, [h('span', {}, [label]), t]);
  }

  private sliderRow(label: string, min: number, max: number, step: number, val: number, on: (v: number) => void): El {
    const s = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) }) as HTMLInputElement;
    s.addEventListener('input', () => on(parseFloat(s.value)));
    return h('div', { class: 'settings-row' }, [h('span', {}, [label]), s]);
  }

  private selectRow(label: string, opts: string[], val: string, on: (v: string) => void): El {
    const wrap = h('div', { class: 'cards row', style: 'gap:6px;flex:1;max-width:230px' });
    const els: El[] = [];
    opts.forEach((o) => {
      const b = h('div', { class: 'card' + (o === val ? ' sel' : ''), style: 'padding:8px;text-align:center' }, [h('span', { style: 'font-size:10px;letter-spacing:0.1em' }, [o.toUpperCase()])]);
      b.addEventListener('click', () => {
        els.forEach((e) => e.classList.remove('sel'));
        b.classList.add('sel');
        on(o);
        this.sound.ui();
      });
      els.push(b);
      wrap.append(b);
    });
    return h('div', { class: 'settings-row' }, [h('span', {}, [label]), wrap]);
  }
}
