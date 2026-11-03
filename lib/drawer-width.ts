// Largeur du panneau de détails (en pixels) : bornes et ajustement.
// Les bornes ne valent que sur écran large ; en dessous, le panneau est une feuille pleine largeur.

export const DRAWER_MIN_WIDTH = 420;
export const DRAWER_MAX_WIDTH = 1100;
export const DRAWER_DEFAULT_WIDTH = 640;
export const DRAWER_KEY_STEP = 24;
export const DRAWER_KEY_STEP_LARGE = 96;

// Bornes effectives : jamais plus que la fenêtre, et le minimum ne dépasse jamais le maximum.
export function drawerWidthBounds(viewportWidth: number): { min: number; max: number } {
  const max = Math.max(0, Math.min(DRAWER_MAX_WIDTH, Math.floor(viewportWidth)));
  return { min: Math.min(DRAWER_MIN_WIDTH, max), max };
}

export function clampDrawerWidth(width: number, viewportWidth: number): number {
  const { min, max } = drawerWidthBounds(viewportWidth);
  if (!Number.isFinite(width)) return Math.min(Math.max(DRAWER_DEFAULT_WIDTH, min), max);
  return Math.min(Math.max(Math.round(width), min), max);
}
