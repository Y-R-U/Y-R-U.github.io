import { el, btn, setText } from './dom.js?v=20261004c';
import { fmtCash } from '../state/format.js?v=20261004c';

// Town tab = the 3D world: the hero rig pulls back to an establishing shot (heroRig.town), district pins
// are projected over it, and a tap on the world flies there (handled by app.onHeroTap).
export function createTown(hero, ctx, { onOpen, onClose }) {
  const { game, host, model, data, geo } = ctx;
  const layer = el('div', 'town-layer');
  layer.hidden = true;
  const close = btn('town-close', '✕', (e) => { e.stopPropagation(); api.close(); }, 'Close town');
  layer.append(close);
  hero.appendChild(layer);
  let active = false, lastRefresh = 0;
  const pins = new Map();
  const centers = new Map();

  for (const d of data.districts) {
    const p = btn('town-pin', '', (e) => { e.stopPropagation(); tapDistrict(d); });
    p.append(el('span', 'tp-e', d.emoji), el('span', 'tp-n', d.name), el('span', 'tp-s'), el('div', 'bar'));
    p.lastChild.appendChild(el('i'));
    layer.appendChild(p);
    pins.set(d.id, p);
  }

  function center(dId) {
    if (centers.has(dId)) return centers.get(dId);
    let x = 0, z = 0, n = 0;
    for (const l of data.lines) {
      const p = l.district === dId && host.world.plots.get(l.id);
      if (!p) continue;
      x += p.group.position.x; z += p.group.position.z; n++;
    }
    const c = n ? [x / n, 4, z / n] : null;
    centers.set(dId, c);
    return c;
  }

  function refresh() {
    const next = data.districts.find((d) => !model.districtOpen(d.id));
    for (const d of data.districts) {
      const p = pins.get(d.id);
      const open = model.districtOpen(d.id);
      const qp = model.q('permit', { districtId: d.id });
      p.classList.toggle('open', open);
      p.classList.toggle('next', d === next);
      p.classList.toggle('far', !open && d !== next);
      p.classList.toggle('can', !open && d === next && qp.affordable);
      p.classList.toggle('blocked', !open && !!qp.blocked);
      const lines = data.lines.filter((l) => l.district === d.id);
      const owned = lines.filter((l) => game.state.lines[l.id].lv > 0).length;
      let s, prog;
      if (open) { s = `${owned}/${lines.length}`; prog = owned / lines.length; }
      else if (d !== next) { s = '🔒'; prog = 0; }
      else if (qp.blocked) { s = '🔒 ' + qp.blocked; prog = 0; }
      else { s = (qp.affordable ? '🔓 ' : '🔒 ') + fmtCash(qp.cost); prog = Math.min(1, model.cash() / Math.max(1, qp.cost)); }
      setText(p.children[2], s);
      p.lastChild.firstChild.style.setProperty('--p', prog.toFixed(3));
    }
  }

  function flyToDistrict(d) {
    const first = data.lines.find((l) => l.district === d.id && game.state.lines[l.id].lv > 0) || data.lines.find((l) => l.district === d.id);
    api.close();
    ctx.flyTo(first.id);
  }

  function tapDistrict(d) {
    if (model.districtOpen(d.id)) { flyToDistrict(d); return; }
    const r = game.act('permit', { districtId: d.id });
    if (r.ok) {
      ctx.celebrate(d.emoji + ' Open!');
      ctx.audio.sfx.kaching();
      ctx.buzz(25);
      ctx.bus.emit('ui:district', { districtId: d.id });
      refresh();
      ctx.textNow();
    } else if (r.code === 'funds') {
      const p = pins.get(d.id);
      p.classList.remove('nope');
      requestAnimationFrame(() => p.classList.add('nope'));
      ctx.audio.sfx.nope();
    } else if (r.code === 'locked') { ctx.toast('🔒 ' + r.msg, { ms: 3200 }); ctx.audio.sfx.nope(); }
  }

  const api = {
    get active() { return active; },
    open() {
      if (active) return;
      active = true;
      ctx.rig().town(true);
      layer.hidden = false;
      hero.classList.add('town-on');
      refresh();
      onOpen?.();
      ctx.audio.sfx.whoosh();
    },
    close() {
      if (!active) return;
      active = false;
      ctx.rig().town(false);
      layer.hidden = true;
      hero.classList.remove('town-on');
      onClose?.();
    },
    frame(now) {
      if (!active) return;
      if (now - lastRefresh > 300) { lastRefresh = now; refresh(); }
      for (const [id, p] of pins) {
        const c = center(id);
        const pr = c && host.project('hero', c);
        const off = !pr || !pr.visible;
        p.classList.toggle('off', off);
        if (!off) p.style.translate = `${pr.x | 0}px ${pr.y | 0}px`;
      }
    },
    refresh,
  };
  return api;
}
