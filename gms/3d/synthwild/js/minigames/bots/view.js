// Rival bot bodies: lane 3's avatar model, recoloured per team, with a glowing team ring and a name tag.
import { createAvatar } from '../../player/avatar.js';
import { disposeObject } from '../../core/dispose.js';

function nameTag(T, text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,10,20,0.55)';
  const w = Math.min(250, g.measureText(text).width + 30);
  g.beginPath(); g.roundRect?.(128 - w / 2, 8, w, 48, 22); g.fill();
  g.fillStyle = color; g.fillText(text, 128, 33);
  const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(1.4, 0.35, 1);
  s.position.y = 2.25;
  return s;
}

export function createBotView(ctx, bot, team) {
  const T = ctx.THREE;
  const av = createAvatar();
  av.setPalette({ suit: team.suit, seam: team.glow });
  const g = new T.Group();
  g.add(av.root);
  const ring = new T.Mesh(new T.RingGeometry(0.42, 0.55, 24), new T.MeshBasicMaterial({ color: team.glow, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  const tag = nameTag(T, bot.name, team.css);
  g.add(tag);
  ctx.scene?.add(g);
  let flash = 0;
  return {
    group: g, avatar: av, tag,
    flash() { flash = 0.5; },
    update(dt) {
      g.position.set(bot.x, bot.y, bot.z);
      av.root.rotation.y = bot.yaw;
      av.update(dt, { speed: bot.speed, onGround: !bot.falling && (!bot.seg || bot.seg.kind === 'walk') });
      g.visible = !bot.hidden;
      tag.visible = !bot.hideTag;
      flash = Math.max(0, flash - dt);
      ring.material.opacity = bot.frozen > 0 ? 0.25 + 0.25 * Math.sin(performance.now() / 80) : 0.75;
      ring.scale.setScalar(1 + flash * 1.5);
    },
    dispose() { disposeObject(g); },
  };
}

export const TEAMS = {
  blue: { name: 'Blue', suit: 0xbfe2ff, glow: 0x3fa9ff, css: '#7cc6ff' },
  red: { name: 'Red', suit: 0xffc9c9, glow: 0xff4a5e, css: '#ff8a96' },
  green: { name: 'Green', suit: 0xd2ffd0, glow: 0x5dff7a, css: '#8cff9c' },
  gold: { name: 'Gold', suit: 0xffefc0, glow: 0xffc23d, css: '#ffd25e' },
};
