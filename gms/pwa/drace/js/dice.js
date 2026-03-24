/* DRace - Dice Module */
const Dice = (() => {
    const DICE_DOTS = {
        1: [[1, 1]],
        2: [[0, 0], [2, 2]],
        3: [[0, 0], [1, 1], [2, 2]],
        4: [[0, 0], [0, 2], [2, 0], [2, 2]],
        5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
        6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]]
    };

    function roll() {
        return Math.floor(Math.random() * 6) + 1;
    }

    function renderDiceFace(value) {
        const el = document.getElementById('dice-face');
        if (!el) return;

        const dots = DICE_DOTS[value];
        if (!dots) { el.textContent = '?'; return; }

        el.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 50 50');
        svg.setAttribute('width', '44');
        svg.setAttribute('height', '44');

        dots.forEach(([r, c]) => {
            const cx = 11 + c * 14;
            const cy = 11 + r * 14;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', 4.5);
            circle.setAttribute('fill', '#1a1a2e');
            svg.appendChild(circle);
        });

        el.appendChild(svg);
    }

    async function animateRoll(finalValue) {
        const diceEl = document.getElementById('dice');
        const duration = 600;
        const interval = 80;
        const steps = Math.floor(duration / interval);

        diceEl.classList.add('rolling');

        for (let i = 0; i < steps; i++) {
            const v = Math.floor(Math.random() * 6) + 1;
            renderDiceFace(v);
            await new Promise(r => setTimeout(r, interval));
        }

        renderDiceFace(finalValue);
        diceEl.classList.remove('rolling');
        diceEl.classList.add('bounce');
        setTimeout(() => diceEl.classList.remove('bounce'), 300);
    }

    return { roll, renderDiceFace, animateRoll };
})();
