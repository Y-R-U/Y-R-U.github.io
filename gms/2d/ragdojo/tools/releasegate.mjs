import assert from 'node:assert/strict';
import { CDP, serve, ROOT } from './cdp.mjs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
const sleep = ms => new Promise(r => setTimeout(r,ms));
for (const edition of ['itch', 'home']) {
  const srv = await serve(join(ROOT,'dist',edition));
  const c = await CDP.launch({gpu:true});
  try {
    let navigations = 0;
    c.on('Page.frameNavigated', p => { if (!p.frame.parentId) navigations++; });
    await c.viewport(900,460,1,true);
    // Seed a pre-monetisation DARK save; paid access must not trust it.
    await c.goto(srv.base+'/index.html');
    assert.ok(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
    await c.eval(`localStorage.setItem('ragdojo.save.v2',JSON.stringify({theme:'dark',darkUnlocked:true,everWon:true,level:20,wins:20,stash:{light:{level:44,wins:45,completed:true,records:{championships:1,wins:45}}},premium:true,owned:true}))`);
    await c.goto(srv.base+'/index.html?unlock=1&auto=1&level=44&checkout=success');
    assert.ok(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
    assert.equal(await c.eval("!!window.__ragdojo || !!window.__input"),false,'release must remove debug hooks');
    assert.equal(await c.eval("document.getElementById('boot').classList.contains('show')"),true,'auto cheat removed');
    await c.eval("document.getElementById('startBtn').click()");
    assert.equal(await c.eval("document.getElementById('app').classList.contains('dark')"),false,'editable save cannot unlock DARK');
    await c.eval("document.getElementById('btnDark').click()");
    assert.equal(await c.eval("document.getElementById('premium').classList.contains('show')"),true);
    if (edition==='itch') {
      assert.equal(await c.eval("document.getElementById('btnCheckout').classList.contains('hidden')"),true);
      assert.equal(await c.eval("document.getElementById('btnRestore').classList.contains('hidden')"),true);
      assert.equal(await c.eval("document.getElementById('premiumHome').target"),'_blank');
    }
    await c.eval("document.getElementById('btnPremiumClose').click();document.getElementById('btnFight').click()");
    await c.frames(120);
    assert.equal(await c.eval("document.getElementById('pauseBtn').classList.contains('hidden')"),false,'guest plays a fight');
    await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");
    const saved = JSON.parse(await c.eval("localStorage.getItem('ragdojo.save.v2')"));
    assert.equal((saved.theme === 'dark' ? saved.level : saved.stash.dark.level),20,'legacy DARK career preserved');
    await c.viewport(390,844,1,true);
    await c.eval("document.getElementById('btnUpgrade').click()");
    await c.frames(20);
    await c.shot(join(ROOT,'dist',`${edition}-portrait.png`));
    const before=navigations;
    await sleep(12000);
    assert.equal(navigations,before,'no reload loop');
    const offOrigin=c.offOrigin(srv.base);
    assert.deepEqual(offOrigin,[],'release fonts and play work without remote requests');
    assert.equal(c.errors.length,0,c.errors.join('\n'));
    const bundle = await readFile(join(ROOT,'dist',edition,'js/main.js'),'utf8');
    assert.ok(!bundle.includes('sourceMappingURL='));
    console.log(`PASS ${edition}: guest fight, forged-save DARK denial, legacy progress preserved, cheat flags removed, portrait, 12-second reload guard, no external requests/errors`);
  } finally {c.close();srv.close();}
}
