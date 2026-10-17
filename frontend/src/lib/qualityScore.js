
/* A list row carries counts instead of the gallery, description and amenity list. */
const photosOf = (l) => l.photoCount ?? ((l.gallery && l.gallery.length) || (l.image ? 1 : 0));

/* `label` is the English band name for untranslated chips; `labelKey` is the i18n key for the same band. */
export function qualityColor(score) {
  if (score >= 80) return { ring: 'text-emerald-400', bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'Excellent', labelKey: 'ui.qualityExcellent' };
  if (score >= 50) return { ring: 'text-amber-400', bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'Good', labelKey: 'ui.qualityGood' };
  return { ring: 'text-rose-400', bg: 'bg-rose-500/15', text: 'text-rose-300', label: 'Needs work', labelKey: 'ui.qualityNeedsWork' };
}

export function qualityTips(l) {
  const tips = [];
  if (photosOf(l) < 3) tips.push('Add more photos (3+ recommended)');
  if ((l.descLength ?? (l.desc || '').length) < 100) tips.push('Write a detailed description (100+ chars)');
  if (!l.ownerVerified && !l.ownershipVerified) tips.push('Complete verification for trust badge');
  if (!((l.amenityCount ?? l.amenities?.length ?? 0) >= 3)) tips.push('Add amenities to attract more views');
  if (!l.facing) tips.push('Add facing direction');
  if (!l.floor) tips.push('Specify floor number');
  return tips;
}
