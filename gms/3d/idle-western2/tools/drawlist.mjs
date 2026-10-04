// node tools/drawlist.mjs [vp=desktop] [tod=17.5] — groups one hero render's draw calls by object (scene + shadow pass).
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
const [vp = 'desktop', tod = '17.5', pin = 'saloon'] = process.argv.slice(2);
const port = launch({ port: +(process.env.CDP_PORT || 9331) });
try {
  const page = await openPage(port);
  await page.goto(GAME + `?nosave=1&demo=1&tod=${tod}`, VIEWPORTS[vp]);
  await page.wait('window.__iw2 && window.__iw2.ready', 30000);
  await page.eval(`window.__iw2.world.heroRig.pin('${pin}')`);
  await sleep(4000);
  const r = await page.eval(`new Promise((res) => {
    const w = window.__iw2.world, sc = w.scene, prev = sc.onBeforeRender;
    let rec = null, frames = 0, out = [];
    const nameOf = (o) => { let s = o.name || (o.type + '[' + (o.material?.type || '').replace('Material','') + ' v' + (o.geometry?.attributes?.position?.count ?? '?') + ']'); let p = o.parent; let k = 0; while (p && p !== sc && k < 6) { if (p.name || p.userData?.plotId) s = (p.name || ('plot:' + p.userData.plotId)) + '/' + s; p = p.parent; k++; } return s; };
    sc.onBeforeRender = function (renderer, s, cam, rt) {
      if (!renderer.__wrapped) {
        renderer.__wrapped = true;
        const rbd = renderer.renderBufferDirect.bind(renderer);
        renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
          if (rec) { const sh = material.isMeshDepthMaterial || material.isMeshDistanceMaterial; const k = (sh ? 'SH ' : '') + nameOf(object); rec[k] = (rec[k] || 0) + 1; }
          return rbd(camera, scene, geometry, material, object, group);
        };
      }
      if (cam === w.heroRig.camera) { if (rec) { out.push(rec); } rec = {}; frames++; if (frames > 40) { sc.onBeforeRender = prev; res(out); } }
      else if (rec && Object.keys(rec).length) { out.push(rec); rec = null; }
      return prev.call(this, renderer, s, cam, rt);
    };
  })`, 30000);
  // pick the largest frame
  let best = r[0]; for (const f of r) if (Object.values(f).reduce((a, b) => a + b, 0) > Object.values(best).reduce((a, b) => a + b, 0)) best = f;
  const tot = Object.values(best).reduce((a, b) => a + b, 0);
  const sh = Object.entries(best).filter(([k]) => k.startsWith('SH ')).reduce((a, [, v]) => a + v, 0);
  console.log('frames', r.length, 'max total', tot, 'shadow', sh, 'scene', tot - sh, 'sizes', r.map((f) => Object.values(f).reduce((a, b) => a + b, 0)).join(','));
  const scene = Object.entries(best).filter(([k]) => !k.startsWith('SH ')).sort();
  for (const [k, v] of scene) console.log(String(v).padStart(3), k);
  console.log('--- shadow');
  for (const [k, v] of Object.entries(best).filter(([k]) => k.startsWith('SH ')).sort()) console.log(String(v).padStart(3), k);
  await page.close();
} finally { stop(port); }
