// Do not change either algorithm without updating all consumers: derived listing attributes
// (facing, floor, age) would shift for existing data.

export function fnvHash(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
