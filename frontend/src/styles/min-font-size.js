export const MIN_FONT_PX = 12;

const ROOT_PX = 16;

const ABSOLUTE = /^\s*(-?\d*\.?\d+)(px|rem)\s*$/;

function measure(value) {
  const m = ABSOLUTE.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  return { px: unit === 'rem' ? n * ROOT_PX : n, unit };
}

const floorValue = (unit, min) => (unit === 'rem' ? `${min / ROOT_PX}rem` : `${min}px`);

export default function minFontSize({ min = MIN_FONT_PX } = {}) {
  return {
    postcssPlugin: 'draazy-min-font-size',
    Declaration: {
      'font-size': (decl) => {
        const m = measure(decl.value);
        if (m === null || m.px >= min) return;
        decl.value = floorValue(m.unit, min);
      },
    },
  };
}

minFontSize.postcss = true;
