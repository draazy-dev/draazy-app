export const inQuietHours = (prefs, at = new Date()) => {
  const q = prefs && prefs.quietHours;
  if (!q || !q.enabled) return false;
  const toMin = (s) => {
    const [h, m] = String(s || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const now = at.getHours() * 60 + at.getMinutes();
  const start = toMin(q.start);
  const end = toMin(q.end);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
};
