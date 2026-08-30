// What the dev server says, what the backends say, what the store is holding, and what the engine
// is drawing. The only tab that polls anything.

import { registerTab } from '../hub.js';

registerTab({
  id: 'status',
  mount(el, ctx) {
    el.innerHTML = `
      <section><h2>Dev server</h2><div class="row">
        <button data-act="refresh" class="primary">Refresh</button>
        <button data-act="loadall">Load every document</button>
        <span class="dim" data-role="clock"></span></div>
        <div data-role="server"></div></section>
      <section><h2>Backends</h2><div data-role="backends"></div>
        <p class="dim" style="font-size:12px">These probes are passive — ACE-Step and Flux unload
        after 120 s idle and nothing here wakes them.</p></section>
      <section><h2>Generation queue</h2><div data-role="queue"></div></section>
      <section><h2>Documents</h2><div data-role="docs"></div></section>
      <section><h2>Browser</h2><div data-role="browser"></div></section>
      <section><h2>Engine</h2><div data-role="engine"></div></section>`;

    const q = s => el.querySelector(`[data-role=${s}]`);
    el.querySelector('[data-act=refresh]').onclick = () => refresh(true);
    el.querySelector('[data-act=loadall]').onclick = async () => {
      await Promise.all([...ctx.data.kinds()].filter(k => k !== 'levels').map(k => ctx.data.load(k)));
      for (const id of await ctx.data.levelIds()) await ctx.data.load('levels', id);
      ctx.toast('loaded every document');
      paintDocs();
    };

    const cell = (on, yes, no) => `<span class="${on ? 'good' : 'bad'}">${on ? yes : no}</span>`;
    const rows = pairs => `<table>${pairs.map(([k, v]) =>
      `<tr><th>${k}</th><td class="wide">${v}</td></tr>`).join('')}</table>`;

    async function refresh(force) {
      const s = await ctx.api.status({ force });
      q('clock').textContent = `checked ${new Date().toLocaleTimeString()}`;
      q('server').innerHTML = rows([
        ['reachable', cell(s.devserver, `yes — ${ctx.api.base || 'same origin'}`, 'NO — localStorage mode')],
        ['root', s.root || '—'],
        ['page', `${location.href}`],
        ['gate', `isLocal() → <span class="good">true</span> (hostname ${location.hostname || 'file:'})`],
      ]);
      const d = s.detail || {};
      q('backends').innerHTML = rows([
        ['kokoro TTS', cell(s.kokoro, 'ready', 'python or script missing') + ` <span class="dim">${d.kokoroPython || ''}</span>`],
        ['ACE-Step (music)', cell(s.ace, 'answering', 'not running') +
          (d.aceLoaded === null ? '' : ` <span class="dim">model ${d.aceLoaded ? 'resident' : 'unloaded'}</span>`)],
        ['mflux (images)', cell(s.flux, 'answering', 'not running') +
          (d.fluxWarm === null ? '' : ` <span class="dim">worker ${d.fluxWarm ? 'warm' : 'cold'}, queue ${d.fluxQueue}</span>`)],
        ['LTX (not ours)', d.ltxWarm === null ? '<span class="dim">no answer</span>' :
          d.ltxWarm ? '<span class="warnc">warm — holds ~16 GB, music and images will wait</span>' : '<span class="good">idle</span>'],
      ]);
      paintQueue();
      ctx.hub.refreshStatus();
    }

    async function paintQueue() {
      const r = await ctx.api.queue();
      if (!r.ok) return void (q('queue').innerHTML = '<span class="dim">no dev server</span>');
      const jobs = (r.jobs || []).slice().reverse();
      q('queue').innerHTML = `<p class="dim" style="font-size:12px">ACE-Step and Flux cannot both
        fit in 24 GB, so one queue runs them one at a time.</p>` + (jobs.length
        ? `<table><tr><th>job</th><th>kind</th><th>state</th><th>out</th><th class="wide">note</th></tr>${
          jobs.map(j => `<tr><td class="dim">${j.id}</td><td>${j.kind}</td>
            <td class="${j.state === 'error' ? 'bad' : j.state === 'done' ? 'good' : 'warnc'}">${j.state}${
              j.position ? ` #${j.position}` : ''}</td><td class="dim">${j.out || ''}</td>
            <td class="wide dim">${esc(j.note || '')}</td></tr>`).join('')}</table>`
        : '<span class="dim">nothing generated this session</span>');
    }

    function paintDocs() {
      const list = ctx.data.list();
      q('docs').innerHTML = list.length ? `<table>
        <tr><th>document</th><th>from</th><th>state</th><th>bytes</th><th class="wide">last save</th></tr>${
        list.map(e => `<tr><td>${e.key}</td>
          <td class="dim">${e.source || '—'}${e.staleDraft ? ' <span class="warnc">+draft</span>' : ''}</td>
          <td class="${e.dirty ? 'warnc' : 'good'}">${e.dirty ? 'unsaved' : 'clean'}</td>
          <td class="dim">${e.bytes}</td>
          <td class="wide ${e.lastSave ? (e.lastSave.ok ? 'good' : 'bad') : 'dim'}">${
            e.lastSave ? `${e.lastSave.ok ? 'ok' : 'FAILED'} → ${esc(e.lastSave.where || '')} ${esc(e.lastSave.error || '')}
              ${new Date(e.lastSave.at).toLocaleTimeString()}` : 'not saved this session'}</td></tr>`).join('')}
        </table>` : '<span class="dim">nothing loaded yet — open the Data tab or press Load every document</span>';
      const h = ctx.data.storageHealth();
      q('browser').innerHTML = rows([
        ['localStorage', h.ok ? `<span class="good">ok</span> <span class="dim">${(h.bytes / 1024).toFixed(1)} kB used, ${(h.mine / 1024).toFixed(1)} kB of it dev drafts</span>`
          : `<span class="bad">${h.error}</span>`],
        ['undo history', `${ctx.data.historyLabels().length} steps${ctx.data.canRedo() ? ', redo available' : ''}`],
        ['user agent', navigator.userAgent],
        ['viewport', `${innerWidth}×${innerHeight} @ dpr ${devicePixelRatio}`],
      ]);
    }

    function paintEngine() {
      const w = window.__wf;
      const app = ctx.app;
      if (!w && !app) return void (q('engine').innerHTML = '<span class="dim">no engine on window.__wf yet</span>');
      let s = null;
      try { s = w?.stats?.(); } catch { /* stats not wired */ }
      const info = app?.renderer?.info;
      q('engine').innerHTML = rows([
        ['frames drawn', w?.frames ? w.frames() : '—'],
        ['fps', s?.fps != null ? s.fps.toFixed?.(1) ?? s.fps : '—'],
        ['frame ms', s?.frame?.avg != null ? s.frame.avg.toFixed(2) : (s?.ms ?? '—')],
        ['draw calls', info?.render?.calls ?? '—'],
        ['triangles', info?.render?.triangles?.toLocaleString?.() ?? '—'],
        ['textures', s?.texMB != null ? `${s.texMB.toFixed?.(1) ?? s.texMB} MB` : '—'],
        ['quality preset', w?.quality?.preset ?? '—'],
      ]);
    }

    refresh(false);
    paintDocs();
    paintEngine();
    const t1 = setInterval(paintEngine, 1000);
    const t2 = setInterval(() => { paintQueue(); paintDocs(); }, 4000);
    this._stop = () => { clearInterval(t1); clearInterval(t2); };
  },
  unmount() { this._stop?.(); },
});

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
