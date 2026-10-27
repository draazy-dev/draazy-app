import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import Icon from '../../../components/Icon.jsx';
import { useLocalityCoords } from './useLocalityCoords.js';
import { inr, seekerBudget, initials, avatarGrad, perHead, seatsLeft, allVerified, moveInLabel, roomTitle, seekerTitle, FLATMATE_IMG } from './helpers.js';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, mapColorScheme } from '../../../lib/mapsConfig.js';
import { getActiveCityGeo } from '../../../lib/geoConfig.js';
import MapUnavailable from '../../../components/property/MapUnavailable.jsx';
import ErrorBoundary from '../../../components/ErrorBoundary.jsx';

const MAX_ROWS = 3;
const IW_OFFSET = [0, -22];
// A price marker stands taller than a bubble: its tail puts the anchor 7px below the pill.
const PRICE_IW_OFFSET = [0, -42];

// stable identity so vis.gl doesn't re-run setOptions each render
const PREFIX = { group: 'g', room: 'r', seeker: 's' };

// A map cluster is a mixed feed just like the list, so this dispatches on the
// record's own `kind` rather than on the active tab.
function rowModel(item, t) {
  if (item.kind === 'room') {
    return {
      prefix: 'r', title: roomTitle(item), verified: !!item.verified, verifiedLabel: t('flatmates.verified'),
      meta: inr(item.budget) + t('flatmates.perMonth') + ' · ' + (item.roomType || item.flatType || t('flatmates.roomFallback')),
      thumb: item.img || item.cover || FLATMATE_IMG, avatarText: null, avatarGrad: 'from-teal-500 to-indigo-500',
    };
  }
  if (item.kind === 'group') {
    const left = seatsLeft(item);
    return {
      prefix: 'g', title: item.title, verified: allVerified(item), verifiedLabel: t('flatmates.allVerified'),
      meta: inr(perHead(item)) + t('flatmates.perMonth') + ' · ' + (left > 0 ? t('flatmates.seatsLeft', { count: left }) : t('flatmates.full')),
      thumb: null, avatarText: null, avatarIcon: 'users-round', avatarGrad: 'from-indigo-500 to-teal-500',
    };
  }
  return {
    prefix: 's', title: seekerTitle(item), verified: !!item.verified, verifiedLabel: t('flatmates.verifiedSeeker'),
    meta: seekerBudget(item) + t('flatmates.perMonth') + ' · ' + moveInLabel(item.moveIn),
    thumb: null, avatarText: initials(item.name), avatarGrad: avatarGrad(item.gender),
  };
}

function PostRow({ item, saved, onSave, onInterest, onRoomInterest, onJoin, interestedFor, goToPosting, locality }) {
  const { t } = useTranslation();
  const m = rowModel(item, t);
  const saveKey = m.prefix + ':' + item.id;
  const isSaved = !!saved[saveKey];
  const interested = interestedFor(item);

  let action;
  const accepted = interested?.status === 'accepted';
  if (item.kind === 'room') {
    action = accepted
      ? <button className="dz-sp-cta" onClick={() => goToPosting(m.prefix, item.id, locality)}><Icon name="message-circle" /> {t('flatmates.messageOwner')}</button>
      : interested
        ? <button className="dz-sp-cta is-done" disabled><Icon name="check-check" /> {t('flatmates.sent')}</button>
        : <button className="dz-sp-cta" onClick={() => onRoomInterest(item)}><Icon name="hand-heart" /> {t('flatmates.message')}</button>;
  } else if (item.kind === 'group') {
    const full = seatsLeft(item) <= 0;
    action = accepted
      ? <button className="dz-sp-cta is-done" disabled><Icon name="check-check" /> {t('flatmates.joined')}</button>
      : full
        ? <button className="dz-sp-cta is-off" disabled><Icon name="lock" /> {t('flatmates.full')}</button>
        : interested
          ? <button className="dz-sp-cta is-done" disabled><Icon name="check-check" /> {t('flatmates.sent')}</button>
          : <button className="dz-sp-cta" onClick={() => onJoin(item)}><Icon name="user-check" /> {t('flatmates.request')}</button>;
  } else {
    action = interested
      ? <button className="dz-sp-cta is-done" disabled><Icon name="check-check" /> {t('flatmates.interested')}</button>
      : <button className="dz-sp-cta" onClick={() => onInterest(item)}><Icon name="hand-heart" /> {t('flatmates.interest')}</button>;
  }

  return (
    <div className="dz-sp-row">
      <button type="button" className="dz-sp-rowmain" onClick={() => goToPosting(m.prefix, item.id, locality)} title={t('flatmates.titleViewDetails')}>
        {m.thumb
          ? <img className="dz-sp-thumb" src={m.thumb} alt="" loading="lazy" />
          : <span className={'dz-sp-av bg-gradient-to-br ' + m.avatarGrad}>{m.avatarIcon ? <Icon name={m.avatarIcon} /> : m.avatarText}</span>}
        <span className="dz-sp-rowinfo">
          <span className="dz-sp-rowtitle">{m.title}{m.verified ? <span role="img" aria-label={m.verifiedLabel} title={m.verifiedLabel} className="inline-flex shrink-0"><Icon name="shield-check" className="dz-sp-vtick" /></span> : null}</span>
          <span className="dz-sp-rowmeta">{m.meta}</span>
        </span>
        <Icon name="chevron-right" className="dz-sp-chev" />
      </button>
      <div className="dz-sp-rowact">
        {action}
        <button type="button" className={'dz-sp-save' + (isSaved ? ' is-saved' : '')} aria-pressed={isSaved} aria-label={isSaved ? t('flatmates.saved') : t('flatmates.save')} onClick={() => onSave(saveKey)}><Icon name="heart" /></button>
      </div>
    </div>
  );
}

function framing(spots) {
  const pts = spots.map((s) => s.pos);
  if (pts.length >= 2) {
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    const pad = 0.03;
    return {
      defaultBounds: {
        north: Math.max(...lats) + pad, south: Math.min(...lats) - pad,
        east: Math.max(...lngs) + pad, west: Math.min(...lngs) - pad,
      },
    };
  }
  if (pts.length === 1) return { defaultCenter: { lat: pts[0][0], lng: pts[0][1] }, defaultZoom: 13 };
  return { defaultCenter: getActiveCityGeo().center, defaultZoom: 11 };
}

const priceLabel = (rent) => '₹' + Math.round(rent / 1000) + 'k';

/* Rooms sit on the host's pin (split rooms share their flat's), else their locality centre as the
   radius search does; seekers and teams have no address, so they stay one bubble per locality. */
function toSpots(items, localityCoords) {
  const spots = {};
  const seen = new Set();
  Object.entries(items).forEach(([loc, list]) => {
    list.forEach((item) => {
      const exact = item.kind === 'room' && item.lat != null && item.lng != null;
      const pos = exact ? [item.lat, item.lng] : localityCoords[loc];
      const id = (PREFIX[item.kind] || 's') + ':' + item.id;
      if (!pos || seen.has(id)) return;
      seen.add(id);
      const key = item.kind === 'room' ? 'pin:' + pos.join(',') : 'loc:' + loc;
      spots[key] = spots[key] || { key, pos, locality: loc, room: item.kind === 'room', items: [] };
      spots[key].items.push(item);
    });
  });
  return Object.values(spots);
}

function SpotMarker({ spot }) {
  const only = spot.items[0];
  if (spot.room && spot.items.length === 1 && only.budget > 0) {
    return <div className="price-marker" data-fm-pin="room">{priceLabel(only.budget)}</div>;
  }
  return <div className="map-pin" data-fm-pin={spot.room ? 'room' : 'area'}>{spot.items.length}</div>;
}

function FlatmateMap({ items, kindWord, onInterest, onRoomInterest, onJoin, onSave, saved, interestedFor, goToPosting }) {
  const { t } = useTranslation();
  const localityCoords = useLocalityCoords(Object.keys(items));
  const spots = useMemo(() => toSpots(items, localityCoords), [items, localityCoords]);
  const [openKey, setOpenKey] = useState(null);
  const open = openKey ? spots.find((s) => s.key === openKey) : null;
  // Stable identity so vis.gl doesn't re-run setOptions on every render (same
  // reason IW_OFFSET is hoisted) — framing() builds a fresh bounds/center object.
  const frame = useMemo(() => framing(spots), [spots]);
  if (!GOOGLE_MAPS_API_KEY) return <MapUnavailable style={{ height: 460 }} />;
  return (
    <ErrorBoundary scope="flatmate-map" fallback={<MapUnavailable style={{ height: 460 }} />}>
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="sf-map w-full rounded-2xl overflow-hidden border border-white/10 isolate relative" style={{ height: 460 }}>
        <Map
          {...frame}
          mapId={GOOGLE_MAPS_MAP_ID}
          colorScheme={mapColorScheme()}
          /* Not greedy: this map is 460px inside a scrolling page, so a greedy map would
           * swallow every one-finger drag. */
          gestureHandling="cooperative"
          clickableIcons={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {spots.map((spot) => (
            <AdvancedMarker
              key={spot.key}
              position={{ lat: spot.pos[0], lng: spot.pos[1] }}
              onClick={() => setOpenKey((cur) => (cur === spot.key ? null : spot.key))}
            >
              <SpotMarker spot={spot} />
            </AdvancedMarker>
          ))}
          {open ? (
            <InfoWindow
              position={{ lat: open.pos[0], lng: open.pos[1] }}
              pixelOffset={open.room ? PRICE_IW_OFFSET : IW_OFFSET}
              headerDisabled
              onClose={() => setOpenKey(null)}
              className="dz-gm-iw dz-gm-iw-share"
            >
              <div className="dz-sp">
                <div className="dz-sp-head">
                  <div className="dz-sp-title">{open.locality}</div>
                  <div className="dz-sp-sub">{t(`flatmates.${kindWord}Here`, { count: open.items.length })}</div>
                </div>
                <div className="dz-sp-list">
                  {open.items.slice(0, MAX_ROWS).map((item) => (
                    <PostRow key={(PREFIX[item.kind] || 's') + ':' + item.id} item={item} saved={saved} onSave={onSave} onInterest={onInterest} onRoomInterest={onRoomInterest} onJoin={onJoin} interestedFor={interestedFor} goToPosting={goToPosting} locality={open.locality} />
                  ))}
                </div>
                <button type="button" className="dz-sp-all" onClick={() => goToPosting(null, null, open.locality)}>
                  {open.items.length > MAX_ROWS ? t('flatmates.seeAllInLoc', { count: open.items.length, loc: open.locality }) : t('flatmates.openInList', { loc: open.locality })}
                  <Icon name="arrow-right" />
                </button>
              </div>
            </InfoWindow>
          ) : null}
        </Map>
      </div>
    </APIProvider>
    </ErrorBoundary>
  );
}

export default FlatmateMap;
