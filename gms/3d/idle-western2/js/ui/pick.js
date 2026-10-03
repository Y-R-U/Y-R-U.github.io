// Adapter over lane S (render/spectacle/director.js, exposed as host.world.spectacle). Everything here also works
// without it: the fallbacks compose host.pick hits and plot anchors. Shapes: docs/UI.md "Spectacle hooks".
const HUB_FALLBACK = ['hub', 'saloon', 'shine'];
const S_SCENES = new Set(['duel', 'brawl', 'robbery', 'stagecoach', 'fling', 'piano']);

export function createSpectacle({ host, game }) {
  const sp = () => host.world?.spectacle || null;
  const out = { x: 0, y: 0, visible: false };

  function project(world) {
    const p = host.project('hero', world);
    out.x = p.x; out.y = p.y; out.visible = p.visible;
    return out;
  }
  function lineAnchor(lineId) {
    const a = lineId && host.anchor(lineId);
    return a ? [a[0], a[1], a[2]] : null;
  }
  function fromHost(hit) {
    if (!hit) return { kind: 'street', lineId: null };
    if (hit.kind === 'event') return { kind: 'event', eventId: hit.eventId || hit.id, lineId: hit.lineId, hit };
    if (hit.kind === 'courier') return { kind: 'courier', hit };
    const id = String(hit.id || '');
    if (hit.kind === 'target') {
      if (id === 'piano') return { kind: 'piano', lineId: hit.lineId };
      if (id === 'hat') return { kind: 'hat' };
      if (id.startsWith('char:')) return { kind: 'char', char: id.slice(5), lineId: hit.lineId };
    }
    if (hit.lineId && game.state.build?.[hit.lineId]) return { kind: 'build', lineId: hit.lineId, hit };
    if (hit.kind === 'pile') return { kind: 'pile', lineId: hit.lineId, hit };
    return { kind: 'street', lineId: hit.lineId || null, hit };
  }

  const api = {
    get live() { return !!sp(); },
    has(kind) { return !!sp() && S_SCENES.has(kind); },

    // W7 winner for a hero tap: minigame > event > fling > piano > char > construction > pile > street.
    // Spectacle answers {kind, act?, payload?, ...}; 'site' is normalised to 'build'.
    pickHero(clientX, clientY, ts) {
      const s = sp();
      if (s?.pickHero) {
        try {
          const h = s.pickHero(clientX, clientY, ts);
          if (h) {
            if (h.kind === 'site') return { ...h, kind: 'build' };
            if (h.kind === 'event') return { ...h, eventId: h.eventId || h.id, hit: h };
            if (h.kind === 'courier') return { kind: 'courier', hit: h };
            if (h.kind === 'target' || h.kind === 'pile' || h.kind === 'ground') return fromHost(h);
            return h;
          }
        } catch (e) { console.error(e); }
      }
      return fromHost(host.pick('hero', clientX, clientY));
    },

    // Screen anchor (hero-view px) for a speech bubble or overlay: Spectacle's bubble(char) first, else the plot.
    bubbleAnchor(char) {
      const a = sp()?.bubble?.(char);
      if (a) return a;
      const lineId = game.data.charLine?.[char];
      const w = lineAnchor(lineId && game.state.lines[lineId]?.lv > 0 ? lineId : null);
      return w ? project(w) : null;
    },
    anchor(what, lineFallback) {
      const a = sp()?.bubble?.(what);
      if (a && a.visible) return a;
      const w = lineAnchor(lineFallback);
      if (w) { const p = project(w); if (p.visible) return { ...p }; }
      for (const id of HUB_FALLBACK) {
        if (id === lineFallback) continue;
        const a2 = host.anchor(id);
        if (a2) { const p = project(a2); if (p.visible) return { ...p }; }
      }
      return null;
    },
    // Live duel from Spectacle: {phase: intro|paces|standoff|ecu|draw|result, drawAt (performance.now of the DRAW frame), id}.
    duel() { return sp()?.duel?.() || null; },
    // Held drunk: {id, x, y, targets:[{id, x, y, visible}]} in hero px.
    fling() { return sp()?.fling?.() || null; },
  };
  return api;
}
