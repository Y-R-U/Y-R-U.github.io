// ============================================================
// Transport Empire - Random Events System
// ============================================================

let nextEventTime = 0;

function scheduleNextEvent() {
    const delay = 30000 + Math.random() * 60000; // 30-90 seconds
    nextEventTime = Date.now() + delay;
}

function checkEvent() {
    if (Date.now() < nextEventTime) return;

    const hasBiz = BUSINESS_DEFS.some(
        d => game.businesses[d.id] && game.businesses[d.id].level > 0
    );
    if (!hasBiz) {
        scheduleNextEvent();
        return;
    }

    const evt = EVENT_DEFS[Math.floor(Math.random() * EVENT_DEFS.length)];
    triggerEvent(evt);
    scheduleNextEvent();
}

function triggerEvent(evt) {
    const banner = document.getElementById('event-banner');
    const icon = document.getElementById('event-icon');
    const text = document.getElementById('event-text');
    const timer = document.getElementById('event-timer');

    icon.textContent = evt.icon;
    text.textContent = evt.text;
    banner.classList.add('show');
    AudioSystem.playSfx('event');

    let remaining = evt.duration;
    timer.textContent = remaining + 's';

    const interval = setInterval(() => {
        remaining--;
        timer.textContent = remaining + 's';
        if (remaining <= 0) {
            clearInterval(interval);
            banner.classList.remove('show');
            banner.onclick = null;
        }
    }, 1000);

    banner.onclick = () => {
        clearInterval(interval);
        banner.classList.remove('show');
        banner.onclick = null;
        game.eventsCaught++;
        AudioSystem.playSfx('earn');
        applyEventReward(evt);
        checkAchievements();
        UI.updateMoney();
        UI.render();
    };
}

function applyEventReward(evt) {
    if (evt.effect === 'cash') {
        const perSec = getTotalPerSec();
        let bonus;
        if (perSec > 0) {
            bonus = perSec * evt.mul;
        } else {
            bonus = getClickValue() * 100;
        }
        game.money += bonus;
        game.totalEarned += bonus;
        showToast('Bonus: +' + formatMoney(bonus) + '!', 'event');
    } else {
        game.activeBonuses.push({
            effect: evt.effect,
            mul: evt.mul,
            endTime: Date.now() + (evt.bonusDuration || 30) * 1000
        });
        showToast(
            `${evt.mul}x ${evt.effect} for ${evt.bonusDuration}s!`,
            'event'
        );
    }
}
