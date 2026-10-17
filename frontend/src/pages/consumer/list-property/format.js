import { parseAmount } from '../../../lib/format';

export const formatIndian = (v) => {
  const raw = String(v ?? '');
  const s = raw.includes('.') ? String(Math.round(parseFloat(raw.replace(/[^\d.]/g, ''))) || '') : raw.replace(/\D/g, '');
  if (!s) return '';
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
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

export const perSqft = (amount, area) => perUnit(amount, area, 'sq.ft');
