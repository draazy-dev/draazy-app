import { useEffect } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, GOOGLE_MAPS_HAS_DDS, mapColorScheme } from '../../../lib/mapsConfig.js';
import { unionBounds, validBounds } from '../../../lib/geoConfig.js';
import { cssColour } from '../../../lib/themeColour';

const BOUNDARY_LAYER_TYPES = ['ADMINISTRATIVE_AREA_LEVEL_3', 'ADMINISTRATIVE_AREA_LEVEL_2'];

function DistrictOutlines({ placeIds }) {
  const map = useMap();
  const key = placeIds.join(',');

  useEffect(() => {
    if (!map || typeof map.getFeatureLayer !== 'function') return undefined;
    const wanted = new Set(key ? key.split(',') : []);
    const style = {
      strokeColor: cssColour('teal-500'), strokeWeight: 2, strokeOpacity: 1,
      fillColor: cssColour('teal-500'), fillOpacity: 0.12,
    };
    const layers = [];
    for (const type of BOUNDARY_LAYER_TYPES) {
      try {
        const layer = map.getFeatureLayer(type);
        layer.style = wanted.size ? (opts) => (wanted.has(opts.feature?.placeId) ? style : null) : null;
        layers.push(layer);
      } catch {
      }
    }
    return () => layers.forEach((layer) => { layer.style = null; });
  }, [map, key]);

  return null;
}

function DistrictBoxes({ boxes }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  const key = JSON.stringify(boxes);

  useEffect(() => {
    if (!map || !maps) return undefined;
    const list = JSON.parse(key);
    const rects = GOOGLE_MAPS_HAS_DDS ? [] : list.map((bounds) => new maps.Rectangle({
      map, bounds, clickable: false,
      strokeColor: cssColour('teal-500'), strokeWeight: 1.5, strokeOpacity: 0.8,
      fillColor: cssColour('teal-500'), fillOpacity: 0.08,
    }));
    const all = unionBounds(list);
    if (all) map.fitBounds(all, 24);
    return () => rects.forEach((r) => r.setMap(null));
  }, [map, maps, key]);

  return null;
}

export default function DistrictMap({ areas }) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const boxes = areas.map((a) => a.bounds).filter(validBounds);
  const placeIds = areas.map((a) => a.placeId).filter(Boolean);
  const all = unionBounds(boxes);
  const center = all ? { lat: (all.north + all.south) / 2, lng: (all.east + all.west) / 2 } : { lat: 18.553, lng: 73.86 };

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="h-56 overflow-hidden rounded-xl border border-white/10 sm:h-72" data-testid="district-map">
        <Map
          mapId={GOOGLE_MAPS_MAP_ID}
          colorScheme={mapColorScheme()}
          defaultCenter={center}
          defaultZoom={8}
          gestureHandling="cooperative"
          clickableIcons={false}
          disableDefaultUI
          zoomControl
          style={{ width: '100%', height: '100%' }}
        >
          {GOOGLE_MAPS_HAS_DDS ? <DistrictOutlines placeIds={placeIds} /> : null}
          <DistrictBoxes boxes={boxes} />
        </Map>
      </div>
    </APIProvider>
  );
}
