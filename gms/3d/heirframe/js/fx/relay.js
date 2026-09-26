// Transit Relay light tunnel, drawn by the grade pass (uRelay 0..1 = tunnel strength → white-out at 1).
// run() eases in, calls swap() once a full-white frame is on screen, holds, eases out, then resolves.
export function createRelayFx(post) {
  const U = post.grade.uniforms;
  let job = null;
  const ease = (x) => x * x * (3 - 2 * x);
  const fx = {
    get active() { return !!job; },
    run({ inS = 0.85, holdS = 0.15, outS = 0.9, swap }) {
      if (job) return job.promise;
      let resolve, reject;
      const promise = new Promise((a, b) => { resolve = a; reject = b; });
      job = { phase: 'in', t: 0, inS, holdS, outS, swap, resolve, reject, promise, shown: 0, ms: 0 };
      return promise;
    },
    update(dt) {
      U.uRelayT.value += dt;
      if (!job) { U.uRelay.value = 0; return; }
      const j = job;
      j.t += dt;
      if (j.phase === 'in') {
        U.uRelay.value = ease(Math.min(1, j.t / j.inS));
        if (j.t >= j.inS) { j.phase = 'white'; j.t = 0; }
      } else if (j.phase === 'white') {
        U.uRelay.value = 1;
        // let two white frames reach the screen before the (blocking) district build
        if (++j.shown >= 3) {
          try { j.ms = j.swap?.() || 0; } catch (e) { job = null; U.uRelay.value = 0; j.reject(e); return; }
          j.phase = 'hold'; j.t = 0;
        }
      } else if (j.phase === 'hold') {
        U.uRelay.value = 1;
        if (j.t >= j.holdS) { j.phase = 'out'; j.t = 0; }
      } else {
        U.uRelay.value = 1 - ease(Math.min(1, j.t / j.outS));
        if (j.t >= j.outS) { U.uRelay.value = 0; job = null; j.resolve({ buildMs: j.ms }); }
      }
    },
  };
  return fx;
}
