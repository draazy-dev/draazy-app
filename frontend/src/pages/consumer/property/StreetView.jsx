import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import { GOOGLE_MAPS_API_KEY } from '../../../lib/mapsConfig.js';

// The panorama lookup and the Embed iframe are both free SKUs; a JS StreetViewPanorama would bill per load.
export default function StreetView({ lat, lng, tr }) {
  const [pano, setPano] = useState(null);

  useEffect(() => {
    setPano(null);
    if (!GOOGLE_MAPS_API_KEY || !lat || !lng) return undefined;
    let live = true;
    const pin = { lat: Number(lat), lng: Number(lng) };
    const { maps } = window.google;
    Promise.all([maps.importLibrary('streetView'), maps.importLibrary('geometry')])
      .then(async ([{ StreetViewService, StreetViewSource }, { spherical }]) => {
        const { data } = await new StreetViewService().getPanorama({ location: pin, radius: 50, sources: [StreetViewSource.GOOGLE] });
        if (live) setPano({ id: data.location.pano, date: data.imageDate, heading: Math.round(spherical.computeHeading(data.location.latLng, pin)) });
      })
      // No Google imagery within 50 m (most inner lanes and gated societies) rejects with ZERO_RESULTS: no tile.
      .catch(() => {});
    return () => { live = false; };
  }, [lat, lng]);

  if (!pano) return null;
  const view = `pano=${encodeURIComponent(pano.id)}&heading=${pano.heading}`;
  return (
    <div className="mt-5" data-testid="property-street-view">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 min-w-0">
          <Icon name="eye" className="w-4 h-4 text-brand-teal-3 flex-shrink-0" /> {tr('property.streetView')}
          {pano.date ? <span className="text-xs font-normal text-slate-400">· {pano.date}</span> : null}
        </h3>
        <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&${view}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-teal-2 flex items-center gap-1 flex-shrink-0">
          {tr('property.streetViewOpen')} <Icon name="external-link" className="w-3.5 h-3.5" />
        </a>
      </div>
      <iframe
        title={tr('property.streetView')}
        src={`https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&${view}&pitch=0&fov=80`}
        loading="lazy"
        // The site-wide no-referrer would hide our origin from the Embed key's referrer restriction.
        referrerPolicy="strict-origin"
        allowFullScreen
        className="w-full h-[220px] sm:h-[300px] rounded-2xl border border-white/10"
      />
    </div>
  );
}
