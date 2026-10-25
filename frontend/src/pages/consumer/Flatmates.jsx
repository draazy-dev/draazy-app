import { lazy, Suspense } from 'react';
import Icon from '../../components/Icon.jsx';
import Hero from './flatmates/Hero.jsx';
import '../../styles/routes/filters.css';
import '../../styles/routes/flatmates.css';
import FilterBar from './flatmates/FilterBar.jsx';
import FlatmateMapGate from './flatmates/FlatmateMapGate.jsx';
import Results from './flatmates/Results.jsx';
import SupplyModals from './flatmates/SupplyModals.jsx';
import VerifyIdentityRedirect from '../../components/auth/VerifyIdentityRedirect.jsx';
import Empty from './flatmates/Empty.jsx';
import { useFlatmates, emptyFilters, MAP_MAX_AREAS } from './flatmates/useFlatmates.jsx';
const FlatmateMap = lazy(() => import('./flatmates/FlatmateMap.jsx'));

export default function Flatmates() {
  const fm = useFlatmates();
  const {
    rootRef, t, user, isVerified, openVerify,
    filters, setF, viewMode, setViewMode, seg, budgetLbl,
    smartSearchFlat, setFilters, tab, sortMode, onSort, clearFilters,
    flatmateTabs, mapGated, gateAreas, kindWord,
    filtersActive, mapItems, setMapAreas, onInterest, onRoomInterest, onJoin,
    onSave, saved, interestedFor, goToPosting, myPost, myRooms, myGroups,
    activeList, otherCount, otherTab, switchTab,
    ownsGroup, ownsRoom,
    toast, activeFilterCount, raiseHint,
    openPostChooser,
    verifyOpen, setVerifyOpen,
    feedFailed, feedError, retryFeeds, total, verifiedTotal, page, goToPage, pageCount,
    loaded, searching,
  } = fm;
  return (
    <div ref={rootRef} className="sf-page">
      <div className="pt-6 pb-20 min-h-[100dvh]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

          <Hero user={user} isVerified={isVerified} openVerify={openVerify} />

          <FilterBar filters={filters} setF={setF} viewMode={viewMode} setViewMode={setViewMode} seg={seg} budgetLbl={budgetLbl} smartSearchFlat={smartSearchFlat} setFilters={setFilters} emptyFilters={emptyFilters} tab={tab} sortMode={sortMode} onSort={onSort} onReset={clearFilters} tabs={flatmateTabs} searching={searching} total={total} loaded={loaded} />

          {viewMode === 'map' ? (
            mapGated ? (
              <FlatmateMapGate
                key={tab}
                areas={gateAreas}
                maxAreas={MAP_MAX_AREAS}
                onShow={setMapAreas}
                onSwitchList={() => setViewMode('list')}
                kindWord={kindWord}
                filters={filters}
                setF={setF}
                filtersActive={filtersActive}
                onClearFilters={clearFilters}
              />
            ) : Object.keys(mapItems).length === 0 ? (
              <Empty
                icon="map-pin"
                title={filters.near ? t('flatmates.noKindNearPlace', { kind: t('flatmates.kind_' + kindWord), place: filters.nearLabel || t('flatmates.thatPlace') }) : t('flatmates.noKindFocused', { kind: t('flatmates.kind_' + kindWord) })}
                text={filters.near ? t('flatmates.widenRadius') : t('flatmates.widenBudgetArea')}
                filtersActive={filtersActive}
                onClearFilters={clearFilters}
              />
            ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs text-gray-500 flex items-center gap-1.5"><Icon name="info" className="w-3.5 h-3.5" /> {t('flatmates.mapInfo', { kind: t('flatmates.kind_' + kindWord) })}</p>
                {filters.near ? (
                  <button type="button" onClick={() => setF({ near: '', nearLabel: '', nearRadius: 5, nearMode: 'km' })}                   className="dz-chip dz-chip--accent dz-chip--sm hover:bg-rose-500/15 hover:border-rose-400/40 hover:text-rose-200">
                                      <Icon name="map-pinned" /> {t('flatmates.nearChip', { label: filters.nearLabel || t('flatmates.placeWord'), radius: filters.nearRadius, unit: filters.nearMode === 'min' ? t('flatmates.unitMin') : t('flatmates.unitKm') })} <Icon name="x" />
                  </button>
                ) : (
                  <button type="button" onClick={() => setMapAreas(new Set())} className="text-[11px] font-medium text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"><Icon name="rotate-ccw" className="w-3 h-3" /> {t('flatmates.changeAreas')}</button>
                )}
              </div>
              <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" /></div>}>
                <FlatmateMap
                  items={mapItems}
                  kindWord={kindWord}
                  onFilter={(l) => setF({ locality: l })}
                  onInterest={onInterest}
                  onRoomInterest={onRoomInterest}
                  onJoin={onJoin}
                  onSave={onSave}
                  saved={saved}
                  interestedFor={interestedFor}
                  goToPosting={goToPosting}
                />
              </Suspense>
            </div>
            )
          ) : (
            <Results tab={tab} myPost={myPost} myRooms={myRooms} myGroups={myGroups} activeList={activeList} total={total} verifiedTotal={verifiedTotal} page={page} pageCount={pageCount} onGoToPage={goToPage} loaded={loaded} searching={searching} otherCount={otherCount} otherTab={otherTab} onSwitchTab={switchTab} saved={saved} onSave={onSave} ownsGroup={ownsGroup} ownsRoom={ownsRoom} filtersActive={filtersActive} onClearFilters={clearFilters} onPost={openPostChooser} filters={filters} toast={toast} activeFilterCount={activeFilterCount} raiseHint={raiseHint} onRaiseBudget={() => raiseHint && setF({ budget: [filters.budget[0], raiseHint.budget] })} feedFailed={feedFailed} feedError={feedError} onRetryFeeds={retryFeeds} sortMode={sortMode} onSort={onSort} setF={setF} budgetLbl={budgetLbl} />
          )}
        </div>
      </div>

      <SupplyModals s={fm} />

      {verifyOpen && (
        <VerifyIdentityRedirect
          source="flatmates"
          onClose={() => setVerifyOpen(false)}
        />
      )}
    </div>
  );
}
