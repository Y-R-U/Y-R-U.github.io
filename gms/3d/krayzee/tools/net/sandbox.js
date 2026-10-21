// Net sandbox: the lobby plus a top-down sky where every member flies a fake circuit, so two tabs can see each
// other's planes move before GAMEPLAY wires the net layer into the real game.
//   ?net=ws://127.0.0.1:8018/gms/3d/krayzee/net &name=Dirk &voices=toff,bubba &rank=duke &g=f &uid=alice (dev token)
//   &p2p=0 forces the relay; &freeze=1 sends a frozen plane (the falsification run of tools/net/test-mp.mjs)
import { createNet } from '../../js/net/index.js';
import { createLobby } from '../../js/net/lobby.js';
import { Aircraft } from '../../js/flight/aircraft.js';

const Q = new URLSearchParams(location.search);
const profile = () => ({ name: Q.get('name') || 'Dirk', gender: Q.get('g') === 'f' ? 'f' : 'm', rank: Q.get('rank') || 'baron',
  voice: (Q.get('voices') || 'toff').split(',')[0], favourites: (Q.get('voices') || 'toff').split(',').filter(Boolean) });
const uid = Q.get('uid');
const net = createNet({ profile, getToken: uid ? async () => `dev:${uid}` : null });

const local = new Aircraft({ id: 'me' });
const remotes = new Map();
const status = new Map();
const claims = [];
net.on('claim', (m) => claims.push(m));
let flying = false;
const seed = Math.random() * Math.PI * 2;

const lobby = createLobby({ net, profile, onStart: () => { flying = true; lobby.show(false); }, onClose: () => lobby.show(false) });
lobby.show(true);
document.getElementById('toLobby').onclick = () => lobby.show(true);
net.on('left', () => { flying = false; lobby.show(true); });

const cv = document.getElementById('sky'), cx = cv.getContext('2d'), hud = document.getElementById('hud');
const trails = new Map();

function flyFake(t) {
  const idx = Math.max(0, net.members.findIndex((m) => m.id === net.id));
  const cxw = idx * 900, R = 300, w = 50 / R;
  const a = Q.get('freeze') === '1' ? seed : seed + (t / 1000) * w;
  local.pos.set(cxw + Math.cos(a) * R, 300, Math.sin(a) * R);
  local.vel.set(-Math.sin(a) * 50, 0, Math.cos(a) * 50);
  if (Q.get('freeze') === '1') local.vel.set(0, 0, 0);
  local.q.setFromHPR((Math.atan2(local.vel.x, -local.vel.z) * 180) / Math.PI, 0, -20);
  local.ctl.throttle = 0.7;
}

function frame(t) {
  requestAnimationFrame(frame);
  net.tick(t, { ready: true, parked: !flying });
  if (flying && net.room) {
    flyFake(t);
    net.sendPlane(local, { hull: 100 }, t);
  }
  for (const m of net.members) {
    if (m.id === net.id) continue;
    let ac = remotes.get(m.id);
    if (!ac) remotes.set(m.id, (ac = new Aircraft({ id: m.id })));
    status.set(m.id, net.applyRemote(m.id, ac));
  }
  for (const id of remotes.keys()) if (!net.members.some((m) => m.id === id)) { remotes.delete(id); status.delete(id); trails.delete(id); }
  draw();
}
requestAnimationFrame(frame);

function draw() {
  const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
  cx.fillStyle = '#0d1a3c'; cx.fillRect(0, 0, W, H);
  const s = Math.min(W, H) / 3200, ox = W / 2 - 900 * s, oy = H / 2;
  const dot = (id, x, z, col, label) => {
    const tr = trails.get(id) || []; tr.push([x, z]); if (tr.length > 90) tr.shift(); trails.set(id, tr);
    cx.strokeStyle = col; cx.globalAlpha = 0.4; cx.beginPath();
    tr.forEach(([a, b], i) => (i ? cx.lineTo(ox + a * s, oy + b * s) : cx.moveTo(ox + a * s, oy + b * s))); cx.stroke();
    cx.globalAlpha = 1; cx.fillStyle = col; cx.beginPath(); cx.arc(ox + x * s, oy + z * s, 7 * devicePixelRatio, 0, 7); cx.fill();
    cx.font = `${12 * devicePixelRatio}px system-ui`; cx.fillText(label, ox + x * s + 10, oy + z * s - 10);
  };
  if (flying) dot('me', local.pos.x, local.pos.z, '#f7dc8f', 'you');
  for (const [id, ac] of remotes) {
    const m = net.members.find((x) => x.id === id);
    const st = status.get(id);
    if (st && st !== 'empty') dot(id, ac.pos.x, ac.pos.z, st === 'lost' ? '#888' : '#7fd3ff', `${m?.name || id} (${st})`);
  }
  const sum = net.linkSummary();
  hud.textContent = [`me ${net.id || '-'} ${net.isHost ? 'HOST' : ''}`, `room ${net.room?.code || '-'} ${net.phase || ''} epoch ${net.room?.epoch ?? '-'}`,
    `links ${sum ? (sum.alone ? 'alone' : `${sum.total - sum.relayed}/${sum.total} direct, ${sum.rtt} ms`) : '-'}`,
    `roomTime ${Math.round(net.roomTime())}`].join('\n');
}

window.__sb = {
  net, local, remotes, status, claims,
  get flying() { return flying; },
  remotePos: (id) => { const a = remotes.get(id); return a ? { x: a.pos.x, z: a.pos.z, st: status.get(id) } : null; },
  // Where this tab's own plane was at a given room time (for the CDP accuracy check).
  localAt: () => ({ x: local.pos.x, z: local.pos.z, rt: net.roomTime() }),
};
