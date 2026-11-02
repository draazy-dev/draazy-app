export const toDecimal = (v) => {
  const cleaned = String(v ?? '').replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
};

export const toMoney = (v) => {
  const decimal = toDecimal(v);
  const dot = decimal.indexOf('.');
  return dot === -1 ? decimal : decimal.slice(0, dot + 3);
};

export const roundMoney = (v) => {
  const rupees = Math.round(parseFloat(v));
  return Number.isFinite(rupees) ? String(rupees) : '';
};

export const cleanText = (v) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/^\s+/, '');
