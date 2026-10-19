// Card portraits: robots' renderPortrait (cached 3D renders) -> <img>/<canvas> in a card's .art box.
// Renders are serialised so a 30-card grid doesn't stall a frame per card all at once.
export function createPortraits({ engine, units }) {
  const cache = new Map();
  let chain = Promise.resolve();

  function get(u) {
    const model = u.model || u.id;
    const faction = u.rarity === 'legendary' ? 'legendary' : u.faction;
    const key = [model, u.rarity, faction].join('|');
    if (!cache.has(key)) {
      const p = chain = chain.then(async () => {
        if (!units?.renderPortrait) return null;
        try { return await units.renderPortrait(model, { rarity: u.rarity, faction, engine, renderer: engine?.renderer, size: 256 }); }
        catch (e) { console.warn('[portraits] render failed', model, e.message); return null; }
      });
      cache.set(key, p);
    }
    return cache.get(key);
  }

  async function fill(art, u) {
    const img = await get(u);
    if (!img || !art.isConnected) return;
    let el;
    if (typeof img === 'string') { el = new Image(); el.src = img; el.decoding = 'async'; }
    else if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) el = img.cloneNode ? cloneVisual(img) : img;
    else if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
      el = document.createElement('canvas'); el.width = img.width; el.height = img.height;
      el.getContext('2d').drawImage(img, 0, 0);
    }
    if (!el) return;
    el.className = 'portrait';
    art.querySelector('.ph')?.remove();
    art.prepend(el);
  }

  function cloneVisual(src) {
    if (src instanceof HTMLImageElement) return src.cloneNode();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0); return c;
  }

  return { get, fill };
}
