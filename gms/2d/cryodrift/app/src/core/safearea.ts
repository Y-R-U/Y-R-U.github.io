/** Reads CSS env(safe-area-inset-*) via a probe so Pixi UI can dodge notches. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

let probe: HTMLDivElement | null = null;

export function initSafeArea(): void {
  probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
  document.body.appendChild(probe);
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}

function update(): void {
  if (!probe) return;
  const cs = getComputedStyle(probe);
  insets.top = parseFloat(cs.paddingTop) || 0;
  insets.right = parseFloat(cs.paddingRight) || 0;
  insets.bottom = parseFloat(cs.paddingBottom) || 0;
  insets.left = parseFloat(cs.paddingLeft) || 0;
}
