import { el, btn } from './dom.js?v=20261004b';

export function createPostcard(hero, ctx) {
  const { model, game } = ctx;
  const chip = btn('hero-chip offer-chip', '📷', (e) => { e.stopPropagation(); chip.hidden = true; take(); }, 'Take a postcard');
  chip.hidden = true;
  hero.appendChild(chip);
  let chipTimer = 0;

  function compose() {
    const src = ctx.heroView().querySelector('canvas');
    if (!src || !src.width) return null;
    const W = 1200, H = 1500, pad = 48, ph = 1100;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf6ec';
    g.fillRect(0, 0, W, H);
    const iw = W - pad * 2, ih = ph - pad;
    const sr = src.width / src.height, dr = iw / ih;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sr > dr) { sw = sh * dr; sx = (src.width - sw) / 2; } else { sh = sw / dr; sy = (src.height - sh) / 2; }
    g.save();
    g.beginPath();
    g.roundRect ? g.roundRect(pad, pad, iw, ih, 18) : g.rect(pad, pad, iw, ih);
    g.clip();
    g.drawImage(src, sx, sy, sw, sh, pad, pad, iw, ih);
    const vg = g.createRadialGradient(W / 2, pad + ih / 2, ih * 0.35, W / 2, pad + ih / 2, ih * 0.8);
    vg.addColorStop(0, 'rgba(255,220,170,0)');
    vg.addColorStop(1, 'rgba(120,70,30,0.28)');
    g.fillStyle = vg;
    g.fillRect(pad, pad, iw, ih);
    g.restore();
    const font = (w, s) => `${w} ${s}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    g.fillStyle = '#2b3440';
    g.font = font(800, 64);
    g.fillText(model.name(), pad, ph + 90);
    g.font = font(600, 40);
    g.fillStyle = '#5b6b78';
    const kids = model.kids().length;
    g.fillText(`Age ${model.age()} · Generation ${model.gen()} · ${model.home().emoji || ''} ${model.home().name || ''}`, pad, ph + 150);
    g.font = font(500, 34);
    const d = new Date();
    g.fillText(`${model.ownedCount()} businesses${kids ? ` · ${kids} kid${kids > 1 ? 's' : ''}` : ''} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, pad, ph + 200);
    g.font = font(800, 40);
    g.fillStyle = '#e8a23a';
    g.textAlign = 'right';
    g.fillText('Idle Life 2', W - pad, ph + 90);
    g.font = '96px serif';
    g.fillText('🍋', W - pad, ph + 230);
    g.strokeStyle = '#d9cdb6';
    g.setLineDash([10, 10]);
    g.lineWidth = 3;
    g.strokeRect(W - pad - 140, pad + 20, 120, 150);
    return c;
  }

  async function take() {
    const c = compose();
    if (!c) { ctx.toast('📷 Not ready'); return; }
    const flash = el('div', 'cam-flash');
    hero.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
    ctx.audio.sfx.pop();
    game.act('postcardTaken', {});
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    const name = `idle-life-gen${model.gen()}-age${model.age()}.png`;
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ files: [file], title: 'Idle Life 2' }); return; } catch {}
    }
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    ctx.toast('📷 Saved');
  }

  return {
    take,
    compose,
    chip,
    offer() {
      chip.hidden = false;
      chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop');
      clearTimeout(chipTimer);
      chipTimer = setTimeout(() => { chip.hidden = true; }, 8000);
    },
  };
}
