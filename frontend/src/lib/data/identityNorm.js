export const digits = (m) => String(m || '').replace(/\D/g, '');

export const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const pin = (p) => (digits(p).length === 6 ? digits(p) : '');

export const hashToken = (s) => {
  const str = String(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};
