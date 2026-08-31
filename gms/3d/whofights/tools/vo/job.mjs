// The dev server's /api/encode returns a job id; this is the one poller both VO tools wait on.
// 600 tries, quick at first and then a second apiece, so a clip queued behind a whole-cast batch
// has about ten minutes. gen_lines.mjs used to give up at 60 s and say nothing at all.
export async function waitJob(base, id) {
  for (let i = 0; i < 600; i++) {
    const s = await fetch(`${base}/api/job/${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null);
    if (s && (s.state === 'done' || s.state === 'error')) return s;
    await new Promise(r => setTimeout(r, i < 6 ? 250 : 1000));
  }
  return { ok: false, state: 'error', error: 'gave up waiting for the encode job after 10 minutes' };
}
