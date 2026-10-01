// R3 reviewer C: GPU time per frame on this machine (EXT_disjoint_timer_query_webgl2), whole frame and per chunk part.
//   node tools/review_c_gpu.mjs   (mobile viewport, Med quality, night)
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';
const PORT = 9335, BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT, ['--use-angle=metal', '--enable-webgl-draft-extensions']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?play=1&nointro&t=0.85&seed=perfnight');
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true');
  await sleep(8000);
  console.log(JSON.stringify(await pg.game(`
    const gl = C.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { ext: false, exts: gl.getSupportedExtensions().filter((e) => /timer/i.test(e)) };
    const R = C.renderer, mats = C.render.materials, res = {};
    const measure = async (label, setup, undo) => {
      setup?.(); const qs = [];
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); R.render(C.scene, C.camera); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
      }
      await new Promise((r) => setTimeout(r, 300));
      const t = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null).filter((x) => x != null).sort((a, b) => a - b);
      undo?.(); res[label] = { n: t.length, medianMs: t.length ? +t[t.length >> 1].toFixed(3) : null };
    };
    await measure('full scene');
    const hide = (m) => { const l = []; C.render.group.children.forEach((o) => { if (o.material === m && o.visible) { o.visible = false; l.push(o); } }); return () => l.forEach((o) => (o.visible = true)); };
    let u; await measure('no water', () => (u = hide(mats.water)), () => u());
    await measure('no cutout', () => (u = hide(mats.cutout)), () => u());
    await measure('no opaque', () => (u = hide(mats.opaque)), () => u());
    await measure('no chunks', () => (C.render.group.visible = false), () => (C.render.group.visible = true));
    const dome = C.scene.children.find((o) => o.isMesh && o.material?.uniforms?.uZenith);
    await measure('sky dome drawn after terrain (renderOrder 1.5)', () => (dome.renderOrder = 1.5), () => (dome.renderOrder = -10));
    await measure('sky LOW define (no stars/aurora/clouds)', () => { dome.material.defines.LOW = ''; dome.material.needsUpdate = true; }, () => { delete dome.material.defines.LOW; dome.material.needsUpdate = true; });
    await measure('full scene again');
    for (const pitch of [0.6, -0.4]) { C.player.pitch = pitch; await new Promise((r) => setTimeout(r, 200));
      await measure('pitch ' + pitch + ' as is'); await measure('pitch ' + pitch + ' sky after terrain', () => (dome.renderOrder = 1.5), () => (dome.renderOrder = -10)); }
    C.player.pitch = 0;
    if (${JSON.stringify(process.env.KIDS || '')}) {
    C.render.group.visible = false;
    const kids = C.scene.children.filter((o) => o !== C.render.group && o.visible);
    for (const k of kids) { let n = 0; k.traverse(() => n++); await measure('chunks off, minus ' + (k.name || k.type) + '#' + k.id + ' (' + n + ' objs)', () => (k.visible = false), () => (k.visible = true)); }
    C.render.group.visible = true; }
    return { ext: true, pr: R.getPixelRatio(), size: [R.domElement.width, R.domElement.height], res };`), null, 1));
} finally { stopBrowser(PORT); }
