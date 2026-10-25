import { useEffect, useState } from 'react';
import { getFlatmateDetail } from '../../../services/flatmateService.js';
import { getProperty } from '../../../services/propertyService.js';
import { toSavedCard } from '../flatmates/helpers.js';

const FLATMATE_KINDS = new Set(['room', 'group', 'post']);

const toListingCard = (p) => (p
  ? { title: p.title, img: p.image, price: p.price, deal: p.deal, bhk: p.bhk, loc: p.locality, available: true }
  : { available: false });

const toFlatmateCard = (item) => {
  const c = toSavedCard(item);
  return c ? { title: c.title, img: c.img, price: c.price, bhk: c.sub, loc: c.loc, available: true } : { available: false };
};

const loadCard = (kind, id) => (kind === 'property'
  ? getProperty(id).then(toListingCard)
  : getFlatmateDetail(kind, id).then((d) => toFlatmateCard(d?.item)));

/** The PropChip card for a listing (`property`) or a flatmate `room` / `group` / `post`; null for anything else. */
export function useTargetCard(kind, id, title) {
  const known = kind === 'property' || FLATMATE_KINDS.has(kind);
  const key = known && id ? `${kind}:${id}` : null;
  const [card, setCard] = useState(null);
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    loadCard(kind, id).then((c) => { if (live) setCard({ key, ...c }); }, () => {}); // a failed read keeps the title-only chip
    return () => { live = false; };
  }, [key, kind, id]);
  if (!key) return null;
  const loaded = card?.key === key ? card : null;
  return { title, ...loaded };
}
