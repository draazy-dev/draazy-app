import { parseAmount } from '../../../lib/format';

export const groupPairs = (s) => s.replace(/\d+/g, (run, at) => {
  let out = '';
  for (let k = 0; k < run.length; k++) {
    if ((k > 0 || (at > 0 && /\w/.test(s[at - 1]))) && (run.length - k) % 2 === 0) out += ',';
    out += run[k];
  }
  return out;
});

export const formatIndian = (v) => {
  const raw = String(v ?? '');
  const s = raw.includes('.') ? String(Math.round(Number.parseFloat(raw.replace(/[^\d.]/g, ''))) || '') : raw.replace(/\D/g, '');
  if (!s) return '';
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return (rest ? groupPairs(rest) + ',' : '') + last3;
};

export const formatMoneyInput = (v) => {
  const s = String(v ?? '');
  const dot = s.indexOf('.');
  return dot === -1 ? formatIndian(s) : formatIndian(s.slice(0, dot)) + s.slice(dot);
};

export const moneyWords = (v) => {
  const num = parseAmount(v);
  if (!num) return '';
  if (num >= 10000000) return `≈ ₹ ${(num / 10000000).toFixed(2).replace(/\.00$/, '')} Crore`;
  if (num >= 100000) return `≈ ₹ ${(num / 100000).toFixed(2).replace(/\.00$/, '')} Lakh`;
  if (num >= 1000) return `≈ ₹ ${(num / 1000).toFixed(2).replace(/\.00$/, '')} Thousand`;
  return `≈ ₹ ${num}`;
};

export const perUnit = (amount, area, unitLabel = 'sq.ft') => {
  const price = parseAmount(amount);
  const unitArea = parseAmount(area);
  if (!price || !unitArea) return '';
  return `≈ ₹ ${formatIndian(Math.round(price / unitArea))} / ${unitLabel}`;
};
