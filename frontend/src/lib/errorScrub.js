const RULES = [
  [/(?<=[\w/.%-])[?#][^\s"'`)<>]+/g, '?[redacted]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\bBearer\s+\S+/gi, 'Bearer [token]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]'],
  [/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, '[id]'],
  [/(?:\+91[\s-]?)?\d{5}[\s-]?\d{5}\b|\d{10,}/g, '[number]'],
  [/[A-Za-z0-9_+=-]{32,}/g, '[token]'],
];

// Cut before scrubbing so a huge input cannot stall the regexes, then again so the cap holds.
export function scrub(text, max = 1000) {
  let out = typeof text === 'string' ? text.slice(0, max * 2 + 200) : '';
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out.slice(0, max);
}

const BROWSERS = [
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/],
];
const SYSTEMS = [['Android', /Android/], ['iOS', /iPhone|iPad|iPod/], ['Windows', /Windows/], ['macOS', /Macintosh/], ['Linux', /Linux/]];

export function uaFamily(ua = '') {
  const [browser, major] = BROWSERS.map(([n, re]) => [n, re.exec(ua)?.[1]]).find(([, v]) => v) ?? ['Other'];
  const system = SYSTEMS.find(([, re]) => re.test(ua))?.[0] ?? 'Other';
  return `${browser}${major ? ` ${major}` : ''} / ${system}`;
}
