import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import LocalitySearchInput from '../../../components/search/LocalitySearchInput.jsx';
import NearPlaceField from './NearPlaceField.jsx';

/* The map only appears after focusing on 1–maxAreas localities: a whole city of bubbles is expensive. */
export default function FlatmateMapGate({ areas, maxAreas, onShow, onSwitchList, kindWord, filters, setF, filtersActive, onClearFilters }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState([]);

  const pickArea = (loc) => setDraft((prev) => (prev.includes(loc.name) || prev.length >= maxAreas ? prev : [...prev, loc.name]));
  const removeArea = (name) => setDraft((prev) => prev.filter((n) => n !== name));

  return (
    <div className="glass rounded-2xl border border-white/10 flex items-center justify-center px-6 py-12" style={{ minHeight: 520 }}>
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/12 border border-teal-400/25">
          <Icon name="map-pin" className="h-7 w-7 text-teal-300" />
        </div>

        <h3 className="text-xl font-bold text-white">{t('flatmates.focusTitle')}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          {t('flatmates.focusIntro', { max: maxAreas })}
        </p>

        {areas.length ? (
          <>
            <div className="mx-auto mt-5 max-w-sm text-left">
              <LocalitySearchInput onPick={pickArea} clearOnPick placeholder={t('flatmates.searchAnyLocality')} ariaLabel={t('flatmates.fLocality')} />
            </div>

            {draft.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {draft.map((name) => (
                  <button
                    key={name}
                    type="button"
                    data-sf-area={name}
                    onClick={() => removeArea(name)}
                    aria-label={t('flatmates.ariaRemoveArea', { name })}
                    className="dz-chip dz-chip--accent dz-chip--sm hover:bg-rose-500/15 hover:border-rose-400/40 hover:text-rose-200"
                  >
                    {name}
                    <Icon name="x" />
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => onShow(new Set(draft))}
              disabled={draft.length === 0}
              className="h-btn mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 text-sm font-bold text-slate-950 transition-all disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
            >
              <Icon name="map" className="w-4 h-4" /> {t('flatmates.showMapView')}
            </button>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-gray-400">
            {t('flatmates.noKindMatchYet', { kind: t('flatmates.kind_' + kindWord) })}{' '}
            {filtersActive ? (
              <button type="button" onClick={onClearFilters} className="text-teal-400 hover:text-teal-300 font-medium underline underline-offset-2">{t('flatmates.clearFilters')}</button>
            ) : t('flatmates.checkBackSoon')}
          </div>
        )}

        <div className="mt-7 pt-6 border-t border-white/10 text-left">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-300">
            <Icon name="map-pinned" className="w-3.5 h-3.5 text-teal-300" /> {t('flatmates.orSearchNearPlace')}
          </p>
          <NearPlaceField filters={filters} setF={setF} />
        </div>

        <p className="mt-6 text-xs text-gray-600">
          {t('flatmates.preferEverythingPre')}{' '}
          <button type="button" onClick={onSwitchList} className="text-teal-400 hover:text-teal-300 font-medium underline underline-offset-2">{t('flatmates.viewList')}</button> {t('flatmates.preferEverythingSuf')}
        </p>
      </div>
    </div>
  );
}
