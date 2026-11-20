import { useTranslation } from 'react-i18next';
import PlaceSearchInput from './PlaceSearchInput.jsx';
import { fetchLocalitySuggestions, fetchPlaceDetails } from '../../lib/places.js';
import { resolveLocality, searchLocalities } from '../../services/localityService.js';
import { UserError, userMessage } from '../../lib/userMessage.js';

async function searchLocality(q, token) {
  const preds = await fetchLocalitySuggestions(q, token);
  if (preds.length) return preds;
  return (await searchLocalities(q)).map((l) => ({ slug: l.slug, mainText: l.name, locality: l }));
}

export default function LocalitySearchInput(props) {
  const { t } = useTranslation();

  async function resolve(s) {
    if (s.locality) return s.locality;
    const d = await fetchPlaceDetails(s).catch(() => null);
    if (d?.lat == null || d?.lng == null) throw new UserError(t('ui.localityFailed'));
    try {
      const loc = await resolveLocality({ placeId: d.placeId || s.placeId, name: d.name || s.mainText, lat: d.lat, lng: d.lng, types: d.types });
      return { slug: loc.slug, name: loc.name, lat: loc.lat ?? d.lat, lng: loc.lng ?? d.lng };
    } catch (e) {
      if (e?.status !== 422) throw new UserError(t('ui.localityFailed'));
      throw new UserError(userMessage(e, t('ui.localityPick')));
    }
  }

  return <PlaceSearchInput {...props} search={searchLocality} resolve={resolve} />;
}
