import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { inr, genderPref, foodLabel, seatsLeft, hostTierMeta, showHostBadge, moveInLabel, FLATMATE_IMG, roomTitle } from '../helpers.js';
import { roomKindOf, perPersonRent, bestPerPersonRent, hasSharerAlready, roomTypeLabel } from '../model.js';
import { FURN_KEY } from '../constants.js';
import { Fresh, ReviewChip } from '../atoms.jsx';
import { roomPriceLabel, occupancyNote, canChooseShare } from '../RoomCard.jsx';
import LivingStyleSection from '../livingStyle/LivingStyleSection.jsx';
import { DetailLayout, Identity, TrustPanel, Sheet, Section, SpecGrid, ItemGrid, SplitTiles, TermsSection, Gallery, PriceCard, StickyAsk } from './parts.jsx';
import { deriveFloor } from '../../property/derivations.js';
import { PhotoShare, ReportLink } from './DetailActions.jsx';
import RoomAskButton from '../RoomAskButton.jsx';

const SHARES = [['solo', 'shareSolo'], ['bring', 'shareBring'], ['match', 'shareMatch']];
const FLOORS_IN_HOUSE = { 1: 'Ground', 2: 'G+1', 3: 'G+2', 4: 'G+3+' };

export default function RoomDetail({ r, owned, ask, onAsk, onReport, ownerPanel }) {
  const { t } = useTranslation();
  const [share, setShare] = useState('solo');
  const shareMax = r.shareMax || 1;
  const canShare = canChooseShare(r);
  const kind = roomKindOf(r);
  const tierMeta = showHostBadge(r, r.reviewStatus, !!r.verified) ? hostTierMeta(r) : null;
  const note = occupancyNote(r, t);
  const moveIn = r.moveIn || r.availableFrom;
  const loc = r.localities?.[0] || '';
  const title = roomTitle(r);
  const photos = r.photos?.length ? r.photos : [r.img || FLATMATE_IMG];
  const price = inr(bestPerPersonRent(r));
  const bath = r.attachedBath && t(r.attachedBath === 'attached' ? 'flatmates.attachedBath' : 'flatmates.sharedBath');
  const furnishing = FURN_KEY[r.furnishing] && t('flatmates.' + FURN_KEY[r.furnishing]);
  const specs = r.specs || {};
  const trust = [
    tierMeta
      ? [tierMeta.label, tierMeta.icon, t(r.verificationTier === 'owner' ? 'flatmates.trustOwnerBody' : 'flatmates.trustTenantBody')]
      : r.verified && [t('flatmates.verified'), 'shield-check', t('flatmates.trustVerifiedRoomBody')],
  ].filter(Boolean);
  const split = [[t('flatmates.splitAlone'), inr(r.budget)], [t('flatmates.nSharingWord', { count: 2 }), inr(perPersonRent(r, 2)), t('flatmates.splitEach')]];
  if (shareMax >= 3) split.push([t('flatmates.nSharingWord', { count: 3 }), inr(perPersonRent(r, 3)), t('flatmates.splitEach')]);

  const cta = !owned && <RoomAskButton ask={ask} onAsk={() => onAsk(r, canShare ? share : 'solo')} className="w-full px-4 py-3" />;

  const header = (
    <>
      <Identity
        title={title}
        meta={<span className="inline-flex items-center gap-1"><Icon name="map-pin" className="w-3.5 h-3.5 text-teal-300 shrink-0" />{[r.title && r.society, loc].filter(Boolean).join(', ')}</span>}
        badges={<>
          {r.seatsOpen != null && <span className="dz-tag chip font-bold text-gray-200">{seatsLeft(r) > 0 ? t('flatmates.seatsOpen', { count: seatsLeft(r) }) : t('flatmates.filled')}</span>}
          <ReviewChip status={r.reviewStatus} kind="room" id={r.id} owned={owned} />
          <Fresh item={r} />
        </>}
      />
      <TrustPanel items={trust} />
    </>
  );

  const aside = (
    <>
      {ownerPanel}
      <PriceCard
        label={roomPriceLabel(r, t)}
        value={price}
        sub={canShare ? <SplitTiles tiles={split} /> : hasSharerAlready(r) && (
          <p className="text-xs text-teal-200/90 mt-1">{t('flatmates.roomRentIs', { price: inr(r.budget) })} · {t('flatmates.roomHasSharer')}</p>
        )}
        facts={[['wallet', t('flatmates.deposit'), r.deposit ? inr(r.deposit) : '\u2014'], ['calendar', t('flatmates.moveIn'), moveIn ? moveInLabel(moveIn, 'From ') : '\u2014']]}
        cta={cta}
      >
        {note && <p className="mt-3 text-xs text-gray-300 inline-flex items-center gap-1.5"><Icon name="users" className="w-3.5 h-3.5 shrink-0 text-teal-300" />{note}</p>}
        {!owned && canShare && !ask && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">{t('flatmates.howTakeRoom')}</p>
            <div className="flex flex-wrap gap-1.5">
              {SHARES.map(([v, k]) => (
                <button key={v} type="button" onClick={() => setShare(v)} aria-pressed={share === v} className={'seg min-h-[40px] text-xs font-semibold px-3 rounded-xl' + (share === v ? ' active text-white' : ' text-gray-400')}>{t('flatmates.' + k)}</button>
              ))}
            </div>
          </div>
        )}
      </PriceCard>
    </>
  );

  return (
    <DetailLayout
      report={!owned && <ReportLink label={t('flatmates.ariaReportRoom')} onReport={() => onReport({ id: r.id, title, ownerName: title, kind: 'share' })} />}
      hero={<Gallery id={r.id} photos={photos} alt={title} actions={<PhotoShare text={t('flatmates.shareRoomText', { society: title, locality: loc, price: inr(r.budget) })} />} />}
      header={header}
      aside={aside}
      sticky={cta && <StickyAsk price={price} label={roomPriceLabel(r, t)}>{cta}</StickyAsk>}
    >
      <Sheet>
        <Section icon="door-open" title={t('flatmates.detailTheRoom')}>
          <SpecGrid items={[
            ['door-open', t('flatmates.detailRoom'), [kind && t('flatmates.roomKind_' + kind), roomTypeLabel(r, t)].filter(Boolean).join(' · ')],
            ['bath', t('flatmates.detailBath'), bath],
            ['sofa', t('property.furnishingLabel'), furnishing],
            ['users', t('flatmates.detailOpenTo'), genderPref(r.gender)],
            ['utensils', t('flatmates.detailFood'), foodLabel(r.food)],
          ]} />
        </Section>
        <Section icon="home" title={t('flatmates.detailTheFlat')}>
          <SpecGrid items={[
            ['bed-double', t('flatmates.detailFlat'), r.flatType],
            ['house', t('flatmates.detailHome'), r.homeTypeLabel !== 'Flat' && r.homeTypeLabel],
            ['layers', t('property.floor'), specs.floor && deriveFloor(specs)],
            ['layers', t('flatmates.detailFloors'), FLOORS_IN_HOUSE[specs.floorsInHouse]],
            ['shower-head', t('property.bathrooms'), specs.bathrooms && (specs.bathrooms >= 4 ? '4+' : specs.bathrooms)],
            ['sun', t('property.balconies'), specs.balconies != null && (specs.balconies === 0 ? t('flatmates.detailNone') : specs.balconies >= 3 ? '3+' : specs.balconies)],
            ['building-2', t('flatmates.detailCommunity'), r.gatedCommunity && t('flatmates.gated')],
            ['compass', t('property.facing'), r.facing],
            ['eye', t('property.overlooking'), r.overlooking],
          ]} />
        </Section>
        {specs.furniture?.length > 0 && <Section icon="armchair" title={t('flatmates.detailFurniture')}><ItemGrid items={specs.furniture} /></Section>}
        {r.note && <Section icon="message-square" title={t('flatmates.detailAbout')}><p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{r.note}</p></Section>}
        <TermsSection item={r} />
        <LivingStyleSection kind="room" id={r.id} owned={owned} />
      </Sheet>
    </DetailLayout>
  );
}
