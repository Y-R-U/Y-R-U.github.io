// Built editions, served off games.br8t.com (no purchase API): LIGHT and DARK are free,
// CYBER/DEITIES stay shut with a calm "coming soon", and an editable save cannot open them.
import assert from 'node:assert/strict';
import { CDP, serve, ROOT } from './cdp.mjs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
const sleep = ms => new Promise(r => setTimeout(r,ms));
const K = 'ragdojo.save.v2';
const shown = id => `document.getElementById('${id}').classList.contains('show')`;
const hidden = id => `document.getElementById('${id}').classList.contains('hidden')`;
const app = c => `document.getElementById('app').classList.contains('${c}')`;
for (const edition of ['itch', 'home']) {
  const srv = await serve(join(ROOT,'dist',edition));
  const c = await CDP.launch({gpu:true});
  try {
    let navigations = 0;
    c.on('Page.frameNavigated', p => { if (!p.frame.parentId) navigations++; });
    await c.viewport(900,460,1,true);
    const boot = async (save, query = '') => {
      await c.goto(srv.base+'/index.html');
      assert.ok(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
      await c.eval(`localStorage.setItem('${K}',${JSON.stringify(JSON.stringify(save))})`);
      await c.goto(srv.base+'/index.html'+query);
      assert.ok(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
      await c.eval("document.getElementById('startBtn').click()");
    };

    // Free DARK: a plain BULLY winner walks straight in, and is asked (once) to support.
    await boot({everWon:true,completed:true,darkUnlocked:true,level:44,wins:45});
    assert.equal(await c.eval(`document.getElementById('btnDark').classList.contains('locked')`),false,'DARK is not locked without a purchase');
    await c.eval("document.getElementById('btnDark').click()");
    assert.ok(await c.eval(app('dark')),'DARK opens without a purchase');
    assert.equal(await c.eval(shown('premium')),false,'entering DARK never opens a panel');
    assert.equal(await c.eval(hidden('nudge')),false,'entering DARK shows the support note');
    await c.eval("document.getElementById('btnNudgeClose').click()");
    assert.ok(await c.eval(hidden('nudge')),'the note dismisses');
    await c.eval("document.getElementById('btnDark').click();document.getElementById('btnDark').click()");
    assert.ok(await c.eval(app('dark')) && await c.eval(hidden('nudge')),'the note is frequency-capped');
    await c.eval("document.getElementById('btnFight').click()"); await c.frames(60);
    assert.equal(await c.eval(hidden('pauseBtn')),false,'a DARK fight starts for a guest');
    assert.ok(await c.eval(hidden('nudge')) && !(await c.eval(shown('hub'))),'no note mid-fight');
    await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");

    // A forged CYBER save with every flag a cheat might try. It must park, not open.
    await c.eval("localStorage.removeItem('ragdojo.nudge.v1')");
    await boot({theme:'cyborg',everWon:true,completed:true,darkUnlocked:true,thugWon:true,simulantWon:true,level:20,wins:20,
      stash:{light:{level:44,wins:45,completed:true,records:{championships:1,wins:45}},dark:{level:30,wins:30}},premium:true,owned:true},
      '?unlock=1&auto=1&level=44&checkout=success');
    assert.equal(await c.eval("!!window.__ragdojo || !!window.__input"),false,'release must remove debug hooks');
    assert.equal(await c.eval(app('cyborg')),false,'editable save cannot open CYBER');
    assert.ok(await c.eval(app('dark')),'a parked CYBER run lands in free DARK');
    assert.equal(await c.eval(hidden('nudge')),true,'parking is not "entering DARK"');
    await c.eval("document.getElementById('btnDark').click()");
    assert.ok(await c.eval(shown('worlds')),'past THUG the toggle is a worlds list');
    const rows = await c.eval(`[...document.querySelectorAll('#worldRows [data-world]')].map(b=>b.dataset.world+':'+(b.disabled?'off':'on')+':'+b.querySelector(':scope > small').textContent).join('|')`);
    assert.match(rows,/light:on/); assert.match(rows,/cyborg:on:support the dev/); assert.match(rows,/god:on:support the dev/);
    await c.eval(`document.querySelector('#worldRows [data-world="cyborg"]').click()`);
    assert.ok(await c.eval(shown('premium')),'an earned-but-unpaid world opens the upgrade');
    assert.equal(await c.eval(app('cyborg')),false);
    const status = await c.eval("document.getElementById('purchaseStatus').textContent");
    assert.match(status, edition==='itch' ? /games\.br8t\.com/ : /coming soon/i, status);
    assert.ok(await c.eval(hidden('btnCheckout')) && await c.eval(hidden('btnRestore')),'no checkout or restore off the home site');
    assert.equal(await c.eval("document.getElementById('premiumHome').target"),'_blank');
    await c.eval("document.getElementById('btnPremiumClose').click()");
    await c.eval("document.getElementById('btnFight').click()"); await c.frames(60);
    assert.equal(await c.eval(hidden('pauseBtn')),false,'parked player still fights in DARK');
    await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");
    const parked = JSON.parse(await c.eval(`localStorage.getItem('${K}')`));
    assert.equal(parked.theme,'dark'); assert.equal(parked.stash.cyborg.level,20,'earned CYBER career preserved');

    for (const [w,h] of [[390,844],[844,390]]) {
      await c.viewport(w,h,1,true);
      await c.eval("document.getElementById('btnUpgrade').click()");
      await c.frames(20);
      await c.shot(join(ROOT,'dist',`${edition}-upgrade-${w}x${h}.png`));
      await c.eval("document.getElementById('btnPremiumClose').click()");
    }
    const before=navigations;
    await sleep(12000);
    assert.equal(navigations,before,'no reload loop');
    assert.deepEqual(c.offOrigin(srv.base),[],'release fonts and play work without remote requests');
    assert.equal(c.errors.length,0,c.errors.join('\n'));
    const bundle = await readFile(join(ROOT,'dist',edition,'js/main.js'),'utf8');
    assert.ok(!bundle.includes('sourceMappingURL='));
    console.log(`PASS ${edition}: free DARK + capped support note, forged-save CYBER denial, parked career kept, graceful upgrade copy, no cheats, 12-second reload guard, no external requests/errors`);
  } finally {c.close();srv.close();}
}
