export function interpolateOutreachTemplate(body, variables) {
  return String(body || '').replace(/\{(\w+)\}/g, (whole, key) => {
    const value = variables?.[key];
    return value == null || value === '' ? whole : String(value);
  });
}
