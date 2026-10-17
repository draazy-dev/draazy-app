const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

export const cleanAadhaar = (v) => onlyDigits(v).slice(0, 12);
export const formatAadhaar = (v) => cleanAadhaar(v).replace(/(\d{4})(?=\d)/g, '$1 ');

// PAN is AAAAA9999A, so a character that does not fit its position is dropped rather than kept to fail later.
export function cleanPan(v) {
  let out = '';
  for (const c of String(v ?? '').toUpperCase()) {
    if (out.length === 10) break;
    if ((out.length < 5 || out.length === 9 ? /[A-Z]/ : /\d/).test(c)) out += c;
  }
  return out;
}

export function cleanMobile(v) {
  const d = onlyDigits(v);
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d.slice(0, 10);
}
export const formatMobile = (v) => cleanMobile(v).replace(/^(\d{5})(?=\d)/, '$1 ');

export const ID_KINDS = {
  aadhaar: { clean: cleanAadhaar, format: formatAadhaar, inputMode: 'numeric', autoComplete: 'off' },
  pan: { clean: cleanPan, format: cleanPan, inputMode: 'text', autoComplete: 'off', autoCapitalize: 'characters' },
  mobile: { clean: cleanMobile, format: formatMobile, inputMode: 'numeric', autoComplete: 'tel-national', type: 'tel' },
};
