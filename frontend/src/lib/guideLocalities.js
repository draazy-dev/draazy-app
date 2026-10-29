export const GUIDE_LOCALITIES = {
  aundh: 'Aundh',
  balewadi: 'Balewadi',
  baner: 'Baner',
  hadapsar: 'Hadapsar',
  hinjawadi: 'Hinjawadi',
  kharadi: 'Kharadi',
  'koregaon-park': 'Koregaon Park',
  kothrud: 'Kothrud',
  magarpatta: 'Magarpatta',
  'pimple-saudagar': 'Pimple Saudagar',
  'viman-nagar': 'Viman Nagar',
  wakad: 'Wakad',
};

const slugOf = (name) => String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const guideSlugFor = ({ localitySlug, locality }) => [localitySlug, slugOf(locality)].find((s) => Object.hasOwn(GUIDE_LOCALITIES, s)) || null;
