import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  APIProvider, Map, AdvancedMarker, useMap, MapControl, ControlPosition, useApiLoadingStatus, APILoadingStatus,
} from '@vis.gl/react-google-maps';
import { useTranslation } from 'react-i18next';
import { MapPinOff } from 'lucide-react';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, mapColorScheme } from '../../../lib/mapsConfig.js';
import MapUnavailable from '../../../components/property/MapUnavailable.jsx';
import ErrorBoundary from '../../../components/ErrorBoundary.jsx';
import '../../../styles/components/location-picker.css';

function readLatLng(e) {
  const ll = (e && e.detail && e.detail.latLng) || (e && e.latLng) || null;
  if (!ll) return null;
  const lat = typeof ll.lat === 'function' ? ll.lat() : ll.lat;
  const lng = typeof ll.lng === 'function' ? ll.lng() : ll.lng;
  return lat == null || lng == null ? null : [lat, lng];
}

// Static — vis.gl re-runs setOptions when style/props change identity, so hoist.
const MAP_STYLE = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 18.5590, lng: 73.7760 };
const finiteCoord = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function Recenter({ flyTo, zoom }) {
  const map = useMap();
  const lat = finiteCoord(flyTo?.[0]);
  const lng = finiteCoord(flyTo?.[1]);
  useEffect(() => {
    if (!map || lat == null || lng == null) return;
    map.setCenter({ lat, lng });
    map.setZoom(zoom);
  }, [map, lat, lng, zoom]);
  return null;
}

function ZoomButtons() {
  const map = useMap();
  const { t } = useTranslation();
  const zoomBy = (delta) => {
    if (!map) return;
    map.setZoom((map.getZoom() || 16) + delta);
  };
  return (
    <MapControl position={ControlPosition.RIGHT_BOTTOM}>
      <div className="m-3 overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 shadow-xl">
        <button type="button" onClick={() => zoomBy(1)} aria-label={t('listProperty.locationSmart.zoomIn')} className="block h-11 w-11 text-xl font-semibold text-white active:bg-white/15">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label={t('listProperty.locationSmart.zoomOut')} className="block h-11 w-11 border-t border-white/10 text-2xl font-semibold text-white active:bg-white/15">−</button>
      </div>
    </MapControl>
  );
}

function ReportFailure({ onUnavailable }) {
  const status = useApiLoadingStatus();
  const failed = status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE;
  useEffect(() => {
    if (failed && onUnavailable) onUnavailable();
  }, [failed, onUnavailable]);
  return null;
}

/* With Maps down the pin comes from the society or locality pick, so a dead 280px box only pushes the form down.
   `hint` is help that only makes sense while there is a map to drag. */
export function PinMapBox({ invalid = false, hint = null, ...props }) {
  const { t } = useTranslation();
  const [down, setDown] = useState(false);
  const markDown = useCallback(() => setDown(true), []);
  const note = (
    <p className="flex items-start gap-1.5 text-xs text-amber-300" role="status" data-testid="map-down-note">
      <MapPinOff className="mt-px h-3.5 w-3.5 shrink-0" /> {t('listProperty.locationPicker.down')}
    </p>
  );
  if (!GOOGLE_MAPS_API_KEY) return note;
  /* A failed map stays mounted but hidden: tearing it down while Google's script is still unwinding throws from
     its cleanup into the page's error boundary instead of this one. */
  return (
    <>
      {down ? note : null}
      <div hidden={down} style={{ height: 280, borderRadius: 14, overflow: 'hidden', border: `1px solid ${invalid ? 'rgb(var(--dz-c-red-400) / .6)' : 'rgb(var(--dz-c-white) / .1)'}` }}>
        <LocationPicker {...props} onUnavailable={markDown} />
      </div>
      {down ? null : hint}
    </>
  );
}

export default function LocationPicker(props) {
  const { t } = useTranslation();
  return (
    <ErrorBoundary scope="location-picker" fallback={<MapUnavailable style={{ height: '100%' }} note={t('listProperty.locationPicker.unavailable')} />}>
      <GoogleLocationPicker {...props} />
    </ErrorBoundary>
  );
}

function GoogleLocationPicker({
  lat, lng, flyTo, onMove,
  gestureHandling = 'greedy',
  defaultZoom = 13,
  recenterZoom = 15,
  showZoomControls = false,
  onUnavailable,
}) {
  const { t } = useTranslation();
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const move = useCallback((e) => {
    const p = readLatLng(e);
    if (p) onMoveRef.current(p[0], p[1]);
  }, []);
  const markerPosition = useMemo(() => {
    const markerLat = finiteCoord(lat);
    const markerLng = finiteCoord(lng);
    return markerLat == null || markerLng == null ? null : { lat: markerLat, lng: markerLng };
  }, [lat, lng]);
  if (!GOOGLE_MAPS_API_KEY) return <MapUnavailable style={{ height: '100%' }} note={t('listProperty.locationPicker.unavailable')} />;
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <ReportFailure onUnavailable={onUnavailable} />
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        colorScheme={mapColorScheme()}
        defaultCenter={markerPosition || DEFAULT_CENTER}
        defaultZoom={defaultZoom}
        gestureHandling={gestureHandling}
        clickableIcons={false}
        disableDefaultUI
        mapTypeControl={false}
        zoomControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        rotateControl={false}
        scaleControl={false}
        keyboardShortcuts={false}
        onClick={move}
        style={MAP_STYLE}
      >
        <Recenter flyTo={flyTo} zoom={recenterZoom} />
        {markerPosition ? (
          <AdvancedMarker position={markerPosition} draggable onDragEnd={move}>
            <div className="lp-pin"><span className="lp-pin__dot" /></div>
          </AdvancedMarker>
        ) : null}
        {showZoomControls && <ZoomButtons />}
      </Map>
    </APIProvider>
  );
}
