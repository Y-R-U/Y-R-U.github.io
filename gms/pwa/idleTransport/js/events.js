// ============================================================
// Idle Transport Empire - Random Events System
// ============================================================

let nextEventAt = 0;

function scheduleEvent() {
    nextEventAt = Date.now() + 30000 + Math.random() * 60000;
}

function tickEvents() {
    if (Date.now() < nextEventAt) return;
    const hasRoute = ROUTES.some(d => G.routes[d.id] && G.routes[d.id].level > 0);
    if (!hasRoute) { scheduleEvent(); return; }
    const evt = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    fireEvent(evt);
    scheduleEvent();
}

function fireEvent(evt) {
    const banner = document.getElementById('event-banner');
    const ico = document.getElementById('evt-ico');
    const txt = document.getElementById('evt-txt');
    const tmr = document.getElementById('evt-timer');

    ico.textContent = evt.icon;
    txt.textContent = evt.text;
    banner.classList.add('show');
    Audio.sfx('event');

    let rem = evt.dur;
    tmr.textContent = rem + 's';

    const iv = setInterval(() => {
        rem--;
        tmr.textContent = rem + 's';
        if (rem <= 0) { clearInterval(iv); banner.classList.remove('show'); banner.onclick = null; }
    }, 1000);

    banner.onclick = () => {
        clearInterval(iv);
        banner.classList.remove('show');
        banner.onclick = null;
        G.eventsCaught++;
        Audio.sfx('earn');
        applyEvent(evt);
        checkAchievements();
        UI.updateHUD();
    };
}

function applyEvent(evt) {
    if (evt.effect === 'cash') {
        const ps = getPerSec();
        const bonus = ps > 0 ? ps * evt.mul : getClickVal() * 100;
        G.money += bonus;
        G.totalEarned += bonus;
        showToast('Bonus: +' + fmtMoney(bonus) + '!', 'green');
    } else {
        G.bonuses.push({
            effect: evt.effect,
            mul: evt.mul,
            endTime: Date.now() + (evt.bonusDur || 30) * 1000
        });
        showToast(evt.mul + 'x ' + evt.effect + ' for ' + evt.bonusDur + 's!', 'green');
    }
}
