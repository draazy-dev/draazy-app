export const NEAR_DEFAULT_RADIUS = 5;
export const NEAR_DEFAULT_MODE = 'km';
export const NEAR_MAX_RADIUS = 25;
export const NEAR_MAX_MINUTES = 25;

export const nearMaxFor = (mode) => (mode === 'min' ? NEAR_MAX_MINUTES : NEAR_MAX_RADIUS);

export const clampNearRadius = (raw, max = NEAR_MAX_RADIUS) =>
  Math.min(max, Math.max(1, Math.round(Number(raw)) || 1));

export function nearToParams({ near, nearLabel = '', radius = NEAR_DEFAULT_RADIUS, mode = NEAR_DEFAULT_MODE } = {}) {
  const p = {};
  if (!near) return p;
  const parts = String(near).split(',');
  if (parts.length !== 2 || Number.isNaN(Number(parts[0])) || Number.isNaN(Number(parts[1]))) return p;
  p.near = near;
  if (nearLabel) p.nearlabel = nearLabel;
  if (typeof radius === 'number' && radius !== NEAR_DEFAULT_RADIUS) p.nearr = String(radius);
  if (mode && mode !== NEAR_DEFAULT_MODE) p.nearmode = mode;
  return p;
}
