// ?dbg streams player/AP state to a LAN log sink (tools/dbgsink.py) so a remote playtest can be watched live.
export function startDebugLog(g, url = `http://${location.hostname}:8897/log`) {
  let batch = [], lastAp = null, logN = 0, seq = 0;
  const push = (o) => batch.push({ t: +(performance.now() / 1000).toFixed(2), ...o });
  const r = (v, d = 0) => (typeof v === 'number' ? +v.toFixed(d) : v);
  window.addEventListener('error', (e) => push({ k: 'error', msg: String(e.message), at: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => push({ k: 'error', msg: String(e.reason?.stack || e.reason) }));
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('button, [class*="krz-"]');
    push({ k: 'tap', el: el ? (el.className || el.tagName).toString().slice(0, 60) : e.target.tagName, txt: el?.textContent?.trim().slice(0, 30), x: e.clientX | 0, y: e.clientY | 0 });
  }, true);
  const send = () => {
    if (!batch.length) return;
    const body = JSON.stringify({ seq: seq++, ua: navigator.userAgent.slice(0, 60), w: innerWidth, h: innerHeight, lines: batch });
    batch = [];
    fetch(url, { method: 'POST', mode: 'no-cors', body, keepalive: true }).catch(() => {});
  };
  push({ k: 'start', href: location.href });
  setInterval(() => {
    try {
      const P = g.S.player, st = g.state();
      const L = g.log();
      for (; logN < L.length; logN++) push({ k: 'log', ...L[logN] });
      if (!P) return push({ k: 'state', mode: st.mode, player: null });
      const ap = P.ap;
      if (ap && ap !== lastAp) {
        lastAp = ap;
        push({ k: 'fp', autoThrottle: typeof g.traffic?.autoThrottle, stableFinal: 'stableFinal' in ap });
        const o = ap._emit.bind(ap);
        ap._emit = (t, d) => { try { push({ k: 'ap', type: t, d: d && JSON.parse(JSON.stringify(d, (key, v) => (typeof v === 'number' ? +v.toFixed(1) : v))) }); } catch (e) { /* */ } return o(t, d); };
      }
      const p = st.player, ac = P.ac;
      push({
        k: 'state', ph: p.phase, sub: ap?.sub, i: ap?.i, land: ap?.landing ? `${ap.landing.label}/${ap.landing.pattern}` : null,
        x: r(p.x), z: r(p.z), agl: r(p.agl), kt: r(p.speedKt), hdg: r(p.heading), fpm: r(p.vsFpm), gnd: p.onGround, crash: p.crashed,
        pitch: r(ac.pitch * 57.3), bank: r(ac.bank * 57.3), ovr: ap?.overridden, apOff: !!P.apOff,
        axis: P.axis ? Object.fromEntries(Object.entries(P.axis).map(([k, v]) => [k, `${v.mode}:${r(v.val, 2)}`])) : null,
        man: P.manual ? Object.fromEntries(Object.entries(P.manual).filter(([, v]) => v != null).map(([k, v]) => [k, r(v, 2)])) : null,
        ctl: ac.ctl ? Object.fromEntries(Object.entries(ac.ctl).map(([k, v]) => [k, r(v, 2)])) : null,
        warp: st.game?.timeScale ?? g.S.timeScale, fps: st.fps, view: st.view,
      });
    } catch (e) { push({ k: 'dbgerr', msg: String(e) }); }
  }, 500);
  setInterval(send, 1000);
  addEventListener('pagehide', send);
  const tag = document.createElement('div');
  tag.textContent = 'DBG';
  tag.style.cssText = 'position:fixed;left:50%;bottom:2px;transform:translateX(-50%);font:700 9px system-ui;color:#f55;opacity:.7;z-index:99999;pointer-events:none';
  document.body.append(tag);
}
