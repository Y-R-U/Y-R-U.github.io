// Settings — every switch that controls how much the app talks to you, plus the escape hatches.
import { settings, flag } from '../core/store.js';
import { el, clear, button, toggle, toast, confirmBox } from '../core/ui.js';
import { resetTours, BADGES, badgesEarned, say } from '../core/coach.js';
import { sfx } from '../core/sfx.js';
import { project } from '../core/project.js';
import { idb } from '../core/db.js';
import { zipSupport } from '../core/pack.js';

const CSS = `
.st { padding:22px; overflow:auto; flex:1; }
.st-wrap { max-width:720px; margin:0 auto; }
.st-item { display:flex; align-items:center; gap:14px; padding:14px 0; border-bottom:1px solid var(--edge); }
.st-item .grow { flex:1; }
.st-item b { display:block; }
.st-item small { color:var(--dim); font-size:.86em; line-height:1.4; }
.st-danger { border:2px solid var(--red); border-radius:12px; padding:16px; margin-top:22px;
  background:rgba(255,90,73,.06); }
`;

let pane;

const SWITCHES = [
  ['popups', '💬', 'Guide popups', 'Blocky pops up with a short tip the first time you open each tool. Turn this off if you already know your way around.'],
  ['hints', '💡', 'Little hints', 'Hold or hover over a button to see what it does.'],
  ['sound', '🔊', 'Sounds', 'Clicks, dings and celebration noises.'],
  ['motion', '✨', 'Animations', 'Movement and confetti. Turn off if it makes you feel sick or your device is slow.'],
  ['grid', '📏', 'Show grids', 'The pixel grid when painting and the floor grid when modelling.'],
  ['bigText', '🔠', 'Bigger writing', 'Makes everything in the app easier to read.'],
  ['advanced', '🧑‍💻', 'Expert mode', 'Shows the extra boxes: raw JSON, Molang expressions, rotations and pivots. Nothing breaks if you turn it on.']
];

function render() {
  clear(pane);
  const wrap = el('div.st-wrap');
  pane.appendChild(el('div.st', {}, [wrap]));

  wrap.appendChild(el('h2.panel-title', { text: 'HOW MUCH SHOULD I HELP?' }));
  const box = el('div.card');
  for (const [key, icon, title, desc] of SWITCHES) {
    box.appendChild(el('div.st-item', {}, [
      el('span', { text: icon, style: { fontSize: '1.5em' } }),
      el('div.grow', {}, [el('b', { text: title }), el('small', { text: desc })]),
      toggle(settings.get(key), v => { settings.set(key, v); sfx.play(v ? 'good' : 'click'); })
    ]));
  }
  box.appendChild(el('div.st-item', {}, [
    el('span', { text: '🔁', style: { fontSize: '1.5em' } }),
    el('div.grow', {}, [el('b', { text: 'Show all the popups again' }), el('small', { text: 'Forgets which guides you have already seen.' })]),
    button('Reset', { kind: 'ghost', onClick: () => { resetTours(); } })
  ]));
  wrap.appendChild(box);

  // badges
  const got = badgesEarned();
  wrap.appendChild(el('h2.panel-title', { text: 'BADGES · ' + got.length + '/' + Object.keys(BADGES).length }));
  wrap.appendChild(el('div.card', {}, [
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } }, Object.entries(BADGES).map(([id, b]) =>
      el('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px',
          background: 'var(--panel2)', border: '2px solid var(--edge)', fontSize: '.86em',
          opacity: got.includes(id) ? '1' : '.32', filter: got.includes(id) ? 'none' : 'grayscale(1)'
        }, title: b.desc
      }, [el('span', { text: b.icon }), el('span', { text: b.title })])
    ))
  ]));

  // about / storage
  wrap.appendChild(el('h2.panel-title', { text: 'ABOUT' }));
  wrap.appendChild(el('div.card', {}, [
    el('p', { html: '<b>Addon Studio</b> makes Minecraft <b>Bedrock</b> add-ons — the Minecraft on phones, tablets, Windows, Xbox and Switch. It does not work with Minecraft: Java Edition.' }),
    el('p', { style: { color: 'var(--dim)', fontSize: '.9em' }, html: 'Everything you make is stored <b>on this device only</b>, in your browser. Nothing is uploaded anywhere. Export a <b>.mcaddon</b> to keep a copy you can share.' }),
    zipSupport.compress ? null : el('p', { style: { color: 'var(--gold)' }, text: 'Heads up: this browser cannot squash files, so your .mcaddon will be bigger than normal. It will still work.' }),
    el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap', marginTop: '10px' } }, [
      button('Read the written guide', { kind: 'ghost', icon: '📖', onClick: () => window.open('../guide/', '_blank') }),
      button('More add-ons', { kind: 'ghost', icon: '🧩', onClick: () => window.open('../', '_blank') })
    ])
  ]));

  // danger zone
  wrap.appendChild(el('div.st-danger', {}, [
    el('b', { text: '⚠️ Careful buttons' }),
    el('p', { style: { color: 'var(--dim)', fontSize: '.9em', margin: '6px 0 12px' }, text: 'These cannot be undone.' }),
    el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
      button('Forget my badges', {
        kind: 'ghost', onClick: async () => {
          if (await confirmBox({ title: 'Forget every badge?', body: 'You can earn them all again.', ok: 'Forget', danger: true })) {
            flag.set('badges', []); render(); toast('Badges cleared');
          }
        }
      }),
      button('Delete EVERYTHING', {
        kind: 'danger', onClick: async () => {
          if (!await confirmBox({ title: 'Delete every add-on?', body: 'Every project on this device will be gone for ever. Export anything you want to keep first!', ok: 'Delete it all', danger: true, icon: '💀' })) return;
          if (!await confirmBox({ title: 'Really sure?', body: 'Last chance.', ok: 'Yes, delete', danger: true, icon: '💀' })) return;
          const list = await project.list();
          for (const p of list) await idb.del('proj:' + p.id);
          await idb.set('projects', []);
          flag.del('lastProject');
          await project.close();
          toast('All gone.', 'warn');
          window.openTool('home');
        }
      })
    ])
  ]));
}

export default {
  id: 'settings', title: 'Settings', icon: '⚙️',
  mount(root) {
    if (!document.getElementById('set-css')) document.head.appendChild(el('style#set-css', { text: CSS }));
    pane = root;
  },
  show() { render(); },
  hide() {}
};
