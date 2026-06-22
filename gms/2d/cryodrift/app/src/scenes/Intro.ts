import { Application, BlurFilter, Container, Sprite, type Texture } from 'pixi.js';
import { RGBSplitFilter } from 'pixi-filters';

/**
 * The microscope dive (build plan §7) — one continuous push from "specimen on a
 * slide" to "you ARE the specimen". A focus-rack (blur → sharp), chromatic
 * aberration easing in, and a zoom into the dish, then a fade to the live game
 * already running underneath. Skippable, and never built when intro/reduce-motion
 * is off (caller decides). Lasts < 3s.
 */
export class Intro {
  private container = new Container();
  private sprite: Sprite;
  private blur = new BlurFilter({ strength: 24, quality: 4 });
  private rgb = new RGBSplitFilter();
  private t = 0;
  private readonly dur = 2.7;
  private done = false;
  private tickFn: () => void;
  private skipBtn: HTMLButtonElement;

  constructor(
    private readonly app: Application,
    tex: Texture,
    private readonly onDone: () => void,
  ) {
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 0.6); // aim the zoom at the dish (lower-centre of the photo)
    this.sprite.filters = [this.blur, this.rgb];
    this.container.addChild(this.sprite);
    this.app.stage.addChild(this.container); // on top of everything

    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'skipIntro';
    this.skipBtn.className = 'btn';
    this.skipBtn.textContent = 'Skip ›';
    this.skipBtn.addEventListener('click', () => this.finish());
    document.body.appendChild(this.skipBtn);

    this.tickFn = () => this.update(this.app.ticker.deltaMS / 1000);
    this.app.ticker.add(this.tickFn);
    this.update(0);
  }

  private update(dt: number): void {
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    const easeIn = p * p;

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const tw = this.sprite.texture.width;
    const th = this.sprite.texture.height;
    const cover = Math.max(w / tw, h / th);
    const contain = Math.min(w / tw, h / th);

    const s = contain * 1.04 + (cover * 1.9 - contain * 1.04) * easeIn;
    this.sprite.scale.set(s);
    this.sprite.position.set(w / 2, h / 2);

    // focus rack: sharp by ~75%
    this.blur.strength = 24 * (1 - Math.min(1, p / 0.75));

    // chromatic aberration eases in then settles
    const ab = Math.sin(p * Math.PI) * 8;
    this.rgb.redX = -ab;
    this.rgb.blueX = ab;
    this.rgb.greenY = ab * 0.4;

    // fade to reveal the live game underneath
    this.container.alpha = p < 0.78 ? 1 : Math.max(0, 1 - (p - 0.78) / 0.22);

    if (p >= 1) this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.app.ticker.remove(this.tickFn);
    this.app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
    this.skipBtn.remove();
    this.onDone();
  }
}
