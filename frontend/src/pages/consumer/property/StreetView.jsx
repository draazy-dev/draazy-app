import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { GOOGLE_MAPS_API_KEY } from '../../../lib/mapsConfig.js';

/* Lookup and Embed are free SKUs; the Static preview bills past its free monthly quota, a JS panorama per load.
   The Embed's chrome (address card, compass, zoom, footer) can't be switched off, so it waits behind a tap. */
export default function StreetView({ lat, lng, tr }) {
  const [pano, setPano] = useState(null);
  const [open, setOpen] = useState(false);
  const [noPreview, setNoPreview] = useState(false);

  useEffect(() => {
    setPano(null);
    setOpen(false);
    setNoPreview(false);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left cursor-pointer"
      >
        {noPreview ? null : (
          <img
            src={`https://maps.googleapis.com/maps/api/streetview?size=640x320&${view}&pitch=0&fov=80&return_error_code=true&key=${GOOGLE_MAPS_API_KEY}`}
            alt=""
            loading="lazy"
            // The site-wide no-referrer would hide our origin from the key's referrer restriction.
            referrerPolicy="strict-origin"
            // A key without the Static API enabled answers 403; the tile then falls back to a plain row.
            onError={() => setNoPreview(true)}
            className="block h-[180px] sm:h-[260px] w-full object-cover transition-opacity group-hover:opacity-90"
          />
        )}
        <span className={noPreview
          ? 'flex items-center justify-between gap-3 px-4 py-3 text-white'
          : 'absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-12 text-pure-white'}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="eye" className="w-4 h-4 flex-shrink-0" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-sm font-semibold">{tr('property.streetView')}</span>
              {pano.date ? <span className="block text-xs opacity-75">{pano.date}</span> : null}
            </span>
          </span>
          <span className={'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ' + (noPreview
            ? 'border-brand-teal-2/30 bg-brand-teal-1/10 text-brand-teal-3'
            : 'border-white/25 bg-black/35 text-pure-white backdrop-blur-sm')}
          >
            <Icon name="compass" className="w-3.5 h-3.5" /> {tr('property.streetViewExplore')}
          </span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="xl" title={tr('property.streetView')}>
        <iframe
          title={tr('property.streetView')}
          src={`https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&${view}&pitch=0&fov=80`}
          referrerPolicy="strict-origin"
          allowFullScreen
          className="block w-full h-[45dvh] sm:h-[60dvh] rounded-xl border border-white/10"
        />
        <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&${view}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-teal-2">
          {tr('property.streetViewOpen')} <Icon name="external-link" className="w-3.5 h-3.5" />
        </a>
      </Modal>
    </div>
  );
}
