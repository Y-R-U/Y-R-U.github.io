// Clued admin page: stats, live rooms, protection level, alerts. The server checks the
// Firebase ID token's email against CLUED_ADMINS; this page only renders what it's given.
import { h, fmtNum } from '../ui/kit.js?v=202610071629';
import { toast } from '../ui/popup.js?v=202610071629';
import { API } from './api.js?v=202610071629';

const root = document.getElementById('adm');
const gate = document.getElementById('gate');
let auth = null;

async function call(method, path, body) {
  const tok = auth ? await Promise.race([auth.getIdToken().catch(() => null), new Promise(r => setTimeout(() => r(null), 5000))]) : null;
  const res = await fetch(API + path, {
    method, cache: 'no-store',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function signInPanel(msg) {
  gate.replaceChildren(h('p', {}, msg), h('button.btn.primary', { type: 'button', onclick: async () => {
    try { await auth.signInGoogle(); load(); } catch (e) { toast(e.message || 'Sign-in failed'); }
  } }, 'Sign in with Google'));
}

const SERIES = [['rooms', 'var(--coral)'], ['joins', 'var(--mint)'], ['challenges', 'var(--grape)'], ['refusals', 'var(--bad)']];

function chart(days) {
  const rows = days.map(d => ({ day: d.day.slice(5), rooms: (d.stats.rooms_public || 0) + (d.stats.rooms_private || 0), joins: d.stats.joins || 0, challenges: d.stats.challenges || 0, refusals: d.stats.refusals || 0 }));
  const W = 700, H = 200, pad = 26, bw = (W - pad) / rows.length;
  const top = Math.max(1, ...rows.flatMap(r => SERIES.map(([k]) => r[k])));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 20}`);
  svg.classList.add('chart');
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; svg.append(e); return e; };
  el('text', { x: 0, y: 10 }, String(top));
  el('line', { x1: pad, x2: W, y1: H, y2: H, stroke: '#1f1a4d', 'stroke-width': 1 });
  rows.forEach((r, i) => {
    const x0 = pad + i * bw, w = (bw - 6) / SERIES.length;
    SERIES.forEach(([k, c], j) => {
      const hgt = (r[k] / top) * (H - 14);
      const rect = el('rect', { x: x0 + 3 + j * w, y: H - hgt, width: Math.max(1, w - 1), height: hgt, fill: c, rx: 2 });
      rect.append(Object.assign(document.createElementNS(ns, 'title'), { textContent: `${r.day} ${k}: ${r[k]}` }));
    });
    el('text', { x: x0 + bw / 2, y: H + 14, 'text-anchor': 'middle' }, r.day);
  });
  return h('div', {}, svg, h('div.legend', {}, ...SERIES.map(([k, c]) => h('span', {}, h('i', { style: { background: c } }), k))));
}

const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

function render(d) {
  const today = d.days[d.days.length - 1].stats;
  const kpi = (label, v, sub = '') => h('div.kpi', {}, h('small', {}, label), h('b', {}, String(v)), sub ? h('small', {}, sub) : null);
  const levels = h('div.levels', {}, ...d.levels.map((name, i) => h('button.chip', { type: 'button', class: i === d.level ? 'on' : '', onclick: async () => {
    try { await call('POST', '/admin/level', { level: i }); toast(`Level ${i}: ${name}`); load(); } catch (e) { toast(e.message); }
  } }, `${i} · ${name}`)));
  const roomRows = d.rooms.map(r => h('tr', {},
    h('td', {}, r.code), h('td', {}, r.title || '—'), h('td', {}, r.public ? 'public' : 'private', r.kids ? ' · kids' : ''),
    h('td', {}, r.phase === 'question' || r.phase === 'reveal' ? `Q${r.q + 1}/${r.total}` : r.phase),
    h('td', {}, `${r.online}/${r.players}`), h('td', {}, r.host + (r.signedHost ? ' ✓' : '')), h('td', {}, ago(r.touched)),
    h('td', {}, h('button.btn.small.danger', { type: 'button', onclick: async () => {
      try { await call('POST', `/admin/rooms/${r.code}/close`); toast(`Closed ${r.code}`); load(); } catch (e) { toast(e.message); }
    } }, 'Close'))));
  const alertRows = d.alerts.map(a => h('tr', {}, h('td', {}, new Date(a.at).toLocaleString()), h('td.alert-kind', {}, a.kind), h('td', {}, a.msg), h('td.muted', {}, a.delivered)));
  root.replaceChildren(
    h('div.row', { style: { justifyContent: 'space-between' } }, h('h1', {}, 'Clued admin'), h('span.muted', {}, `up ${d.uptime} · alerts via ${[d.channels.ntfy && 'ntfy', d.channels.email && 'email'].filter(Boolean).join(' + ') || 'log only'}`)),
    h('div.panel', {}, h('h2', {}, 'Protection level'), levels, h('p.muted.tiny', {}, `Auto-escalates to 1 above ${d.caps.escalateRoomsHour} rooms/hour or at ${d.caps.escalateRefusalsHour} cap refusals/hour. Never auto-lowers.`)),
    h('div.kpis', {},
      kpi('Live rooms', d.live.rooms, `${d.live.public}/${d.caps.public} public · ${d.live.private}/${d.caps.private} private`),
      kpi('Players online', d.live.players), kpi('Live connections', `${d.live.sse}/${d.caps.sse}`),
      kpi('Last hour', d.hour.rooms, `rooms · ${d.hour.refusals} refusals`),
      kpi('Today: rooms', (today.rooms_public || 0) + (today.rooms_private || 0), `${today.hosts_signed || 0} signed-in hosts · ${today.hosts_anon || 0} anon`),
      kpi('Today: joins', today.joins || 0, `${today.distinct_ips || 0} distinct visitors`),
      kpi('Today: challenges', `${d.live.challengesToday}/${d.caps.challengesPerDay}`, `${today.challenge_plays || 0} plays`),
      kpi('Today: peaks', today.peak_players || 0, `players · ${today.peak_rooms || 0} rooms · ${today.peak_sse || 0} conns`)),
    h('div.panel', {}, h('h2', {}, 'Last 14 days'), chart(d.days)),
    h('div.panel', {}, h('h2', {}, `Live rooms (${d.rooms.length})`), d.rooms.length ? h('div.scroll', {}, h('table', {},
      h('tr', {}, ...['Code', 'Title', 'Type', 'Phase', 'Online', 'Host', 'Active', ''].map(t => h('th', {}, t))), ...roomRows)) : h('p.muted', {}, 'No rooms right now.')),
    h('div.panel', {}, h('div.row', { style: { justifyContent: 'space-between' } }, h('h2', {}, 'Recent alerts'),
      h('button.btn.small', { type: 'button', onclick: async () => {
        try { const r = await call('POST', '/admin/test-alert'); toast(r.sent ? 'Test alert sent' : 'Rate-limited: one test per hour'); setTimeout(load, 1500); } catch (e) { toast(e.message); }
      } }, 'Send test alert')),
      d.alerts.length ? h('div.scroll', {}, h('table', {}, ...alertRows)) : h('p.muted', {}, 'No alerts yet.')));
}

async function load() {
  try {
    render(await call('GET', '/admin/overview'));
  } catch (e) {
    if (e.status === 401) signInPanel('Sign in with your admin Google account.');
    else if (e.status === 403) signInPanel(`${auth?.user?.email || 'This account'} is not a Clued admin.`);
    else gate.replaceChildren(h('p', {}, `Couldn’t load: ${e.message}`));
  }
}

(async () => {
  try {
    const m = await import('/lib/auth/auth.js');
    auth = { ...m.auth, signInGoogle: m.signInGoogle, getIdToken: () => m.auth.getIdToken(), get user() { return m.auth.user; } };
    await Promise.race([m.auth.ready(), new Promise(r => setTimeout(r, 5000))]);
  } catch (e) {
    gate.replaceChildren(h('p', {}, 'The br8t account layer didn’t load, so admin sign-in isn’t available here.'));
    return;
  }
  await load();
  setInterval(() => { if (!document.hidden && document.querySelector('.kpis')) load(); }, 20000);
})();
