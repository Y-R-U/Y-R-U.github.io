import { KT, FT } from './vmath.js';

const AXL = [['stick', 'STICK'], ['throttle', 'THR'], ['rudder', 'RUD'], ['brake', 'BRK'], ['flaps', 'FLP']];

export function createHUD(root) {
  const el = document.createElement('div');
  el.id = 'krz-hud';
  el.innerHTML = `
    <div class="krz-hud-strip">
      <div class="krz-cell"><b data-k="spd">0</b><small data-k="spdU">KT</small></div>
      <div class="krz-cell"><b data-k="alt">0</b><small data-k="altU">FT</small></div>
      <div class="krz-cell"><b data-k="hdg">000</b><small>HDG</small></div>
      <div class="krz-cell"><b data-k="vs">0</b><small data-k="vsU">FPM</small></div>
      <div class="krz-cell" data-k2="fuel" hidden><b data-k="fuel">100</b><small>FUEL</small></div>
    </div>
    <div class="krz-ap" data-mode="AUTOPILOT">
      <span class="krz-ap-mode">AUTOPILOT</span><span class="krz-ap-phase">—</span>
    </div>
    <div class="krz-axes">${AXL.map(([k, t]) => `<span data-ax="${k}">${t}</span>`).join('')}</div>
    <div class="krz-banner" hidden></div>`;
  root.append(el);
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  const ap = el.querySelector('.krz-ap'), apMode = el.querySelector('.krz-ap-mode'), apPhase = el.querySelector('.krz-ap-phase');
  const banner = el.querySelector('.krz-banner');
  const axes = Object.fromEntries(AXL.map(([k]) => [k, el.querySelector(`[data-ax="${k}"]`)]));
  const fuelCell = el.querySelector('[data-k2="fuel"]');
  let bannerT = 0, last = '', lastFuel = -1, lowWarned = false;
  return {
    el,
    setVisible(v) { el.hidden = !v; },
    update(dt, ac, status, mode, modes, units) {
      const metric = units === 'metric';
      const s = metric ? ac.speed * 3.6 : ac.speed / KT, a = metric ? ac.alt : ac.alt / FT, v = metric ? ac.vs : ac.vs / FT * 60;
      const txt = `${Math.round(s)}|${Math.round(a / (metric ? 1 : 10)) * (metric ? 1 : 10)}|${Math.round(ac.heading)}|${Math.round(v / 10) * 10}|${mode}|${status.phase}`;
      if (txt !== last) {
        last = txt;
        q('spd').textContent = Math.round(s);
        q('alt').textContent = metric ? Math.round(a) : Math.round(a / 10) * 10;
        q('hdg').textContent = String(Math.round(ac.heading) % 360).padStart(3, '0');
        q('vs').textContent = (v > 0 ? '+' : '') + (metric ? v.toFixed(1) : Math.round(v / 10) * 10);
        q('spdU').textContent = metric ? 'KM/H' : 'KT';
        q('altU').textContent = metric ? 'M' : 'FT';
        q('vsU').textContent = metric ? 'M/S' : 'FPM';
        ap.dataset.mode = mode;
        apMode.textContent = mode;
        apPhase.textContent = status.phase && status.phase !== mode ? status.phase : '';
      }
      const stick = modes.elevator === 'manual' || modes.aileron === 'manual' ? 'manual' : modes.elevator;
      const m2 = { stick, throttle: modes.throttle, rudder: modes.rudder, brake: modes.brake, flaps: modes.flaps };
      for (const k in axes) if (axes[k].dataset.m !== m2[k]) axes[k].dataset.m = m2[k];
      // D20: fuel as a fraction (TRAFFIC's aircraft API); hidden until the aircraft reports fuel.
      const ff = ac.fuelFraction ?? ac.fuelFrac ?? null;
      if (ff != null) {
        const pct = Math.max(0, Math.round(ff * 100));
        if (pct !== lastFuel) {
          lastFuel = pct; fuelCell.hidden = false; q('fuel').textContent = pct + '%';
          fuelCell.dataset.low = pct <= 15 ? '1' : '';
          if (pct <= 15 && !lowWarned) { lowWarned = true; this.flash('LOW FUEL · LAND AND DEMAND IT TO REFUEL', 'warn', 4); }
          if (pct > 30) lowWarned = false;
        }
      } else if (!fuelCell.hidden) fuelCell.hidden = true;
      if (bannerT > 0 && (bannerT -= dt) <= 0) { banner.hidden = true; el.classList.remove('krz-flash'); }
    },
    // PLAYTEST_2 B9: the banner takes the AP pill + axis chips' place instead of growing the HUD into the subtitles
    flash(text, kind = 'info', secs = 2.5) {
      banner.textContent = text; banner.dataset.kind = kind; banner.hidden = false; bannerT = secs;
      el.style.setProperty('--krz-banner-top', `${(el.querySelector('.krz-hud-strip').offsetHeight || 40) + 6}px`);
      el.classList.add('krz-flash');
    },
  };
}
