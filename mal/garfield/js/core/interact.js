import * as THREE from '../../vendor/three/three.module.js';

// Proximity interactables. The nearest eligible one is highlighted with a glowing ring + bobbing paw marker.
export function createInteract({ scene, events, ui, camera }) {
  const items = new Map();
  const v = new THREE.Vector3(), p = new THREE.Vector3();

  const marker = new THREE.Group();
  marker.renderOrder = 10;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 10;
  marker.add(ring);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 14), dotMat);
  arrow.rotation.x = Math.PI;
  arrow.renderOrder = 11;
  marker.add(arrow);
  marker.visible = false;
  scene?.add(marker);

  const api = {
    current: null,
    enabled: true,
    register(def) {
      const it = { radius: 0.6, heightTol: 0.6, label: 'Interact', enabled: () => true, ...def };
      items.set(it.id, it);
      return () => {
        if (items.get(it.id) !== it) return;
        items.delete(it.id);
        if (api.current === it) { try { it.prop?.highlight?.(false); } catch {} api.current = null; ui?.hud?.set?.({ interactLabel: null }); marker.visible = false; }
      };
    },
    unregister(id) { items.delete(id); },
    clear() { try { api.current?.prop?.highlight?.(false); } catch {} items.clear(); api.current = null; },
    get items() { return items; },
    setScene(s) { s.add(marker); },
    posOf(it) { return it.getPos ? it.getPos(p) || p : (it.pos?.isVector3 ? it.pos : p.set(...(it.pos || [0, 0, 0]))); },
    update(dt, from) {
      let best = null, bestD = Infinity;
      if (api.enabled && from) {
        for (const it of items.values()) {
          let ok = false;
          try { ok = it.enabled(); } catch {}
          if (!ok) continue;
          const ip = api.posOf(it);
          const d = Math.hypot(ip.x - from.x, ip.z - from.z);
          if (d > it.radius) continue;
          if (Math.abs(ip.y - from.y) > it.heightTol) continue;
          if (d < bestD) { bestD = d; best = it; }
        }
      }
      if (best !== api.current) {
        try { api.current?.prop?.highlight?.(false); } catch {}
        try { best?.prop?.highlight?.(true); } catch {}
        api.current = best;
        ui?.hud?.set?.({ interactLabel: best ? best.label : null });
        events?.emit('highlight', { id: best?.id || null });
      }
      marker.visible = !!best && best.marker !== false;
      if (best) {
        const ip = api.posOf(best);
        const t = performance.now() / 1000;
        marker.position.copy(ip);
        const s = 1 + Math.sin(t * 5) * 0.08;
        ring.scale.setScalar(s * (best.ringScale || 1));
        ring.position.y = 0.02;
        arrow.position.y = (best.markerHeight ?? 0.45) + Math.sin(t * 4) * 0.05;
        arrow.rotation.y = t * 2;
      }
    },
    trigger(source = 'key') {
      const it = api.current;
      if (!it) return false;
      events?.emit('interact', { id: it.id, source });
      try { it.onInteract?.(it); } catch (e) { console.error('[interact]', it.id, e); }
      return true;
    },
    // Screen pick for click/tap: the highlighted target only, within a generous radius.
    pick(cx, cy) {
      const it = api.current;
      if (!it || !camera) return null;
      v.copy(api.posOf(it)); v.y += 0.15;
      v.project(camera);
      if (v.z > 1) return null;
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      return Math.hypot(sx - cx, sy - cy) < Math.max(70, innerHeight * 0.12) ? it : null;
    },
  };
  return api;
}
