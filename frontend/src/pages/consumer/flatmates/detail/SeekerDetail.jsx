import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { avatarGrad, initials, seekerBudget, moveInLabel, seekerTitle, mustHaves } from '../helpers.js';
import { FLAT_PREF_LBL, ROOM_PREF_LBL } from '../constants.js';
import { Fresh, MustHaveChips } from '../atoms.jsx';
import { SeekerAskButton } from '../SeekerCard.jsx';
import LivingStyleSection from '../livingStyle/LivingStyleSection.jsx';
import { DetailLayout, Identity, TrustPanel, Sheet, Section, SpecGrid, PriceCard, StickyAsk } from './parts.jsx';
import { ReportLink, TitleShare } from './DetailActions.jsx';

const GENDER_KEY = { female: 'optWoman', male: 'optMan' };

export default function SeekerDetail({ r, owned, ask, onAsk, onReport, ownerPanel }) {
  const { t } = useTranslation();
  const cta = !owned && <SeekerAskButton r={r} ask={ask} onInterest={onAsk} />;
  const about = [
    ['user', t('flatmates.detailGender'), GENDER_KEY[r.gender] && t('flatmates.' + GENDER_KEY[r.gender])],
    ['user-round', t('flatmates.age'), r.age],
    ['briefcase', t('flatmates.occupation'), r.occupation],
  ];
  const hasAbout = about.some(([, , v]) => v);

  const header = (
    <>
      <Identity
        avatar={<div className={'w-14 h-14 rounded-full bg-gradient-to-br ' + avatarGrad(r.gender) + ' flex items-center justify-center text-white text-lg font-bold shrink-0'}>{initials(r.name)}</div>}
        title={seekerTitle(r)}
        action={<TitleShare text={'Flatmate: ' + r.name} />}
        meta={r.title && r.name}
        badges={<Fresh item={r} />}
      />
      <TrustPanel items={r.verified ? [[t('flatmates.verifiedSeeker'), 'shield-check', t('flatmates.trustVerifiedSeekerBody')]] : []} />
    </>
  );

  const aside = (
    <>
      {ownerPanel}
      <PriceCard
        label={t('flatmates.budgetMonth')}
        value={seekerBudget(r)}
        facts={[['calendar', t('flatmates.moveIn'), moveInLabel(r.moveIn)], ['map-pin', t('flatmates.detailAreas'), (r.localities || []).join(', ')]]}
        cta={cta}
      >
        {r.verifiedContactOnly && <p className="mt-3 text-xs text-gray-300 inline-flex items-center gap-1.5"><Icon name="shield" className="w-3.5 h-3.5 text-teal-300" /> {t('flatmates.acceptsVerifiedOnly')}</p>}
      </PriceCard>
    </>
  );

  return (
    <DetailLayout
      report={!owned && <ReportLink label={t('flatmates.ariaReportPost')} onReport={() => onReport({ id: r.id, title: 'Flatmate: ' + r.name, ownerName: r.name, ownerMobile: r.mobile, kind: 'share' })} />}
      header={header}
      aside={aside}
      sticky={cta && <StickyAsk price={seekerBudget(r)} label={t('flatmates.budgetMonth')}>{cta}</StickyAsk>}
    >
      <Sheet>
        <Section icon="search" title={t('flatmates.detailLookingFor')}>
          <MustHaveChips items={mustHaves(r, t)} className="mb-3" />
          <SpecGrid items={[
            ['bed', t('flatmates.detailRoomPref'), ROOM_PREF_LBL[r.roomPref || 'any']],
            ['users', t('flatmates.detailFlatPref'), FLAT_PREF_LBL[r.flatPref || 'any']],
          ]} />
        </Section>
        {(hasAbout || r.note) && (
          <Section icon="message-square" title={t('flatmates.detailAbout')}>
            <SpecGrid items={about} />
            {r.note && <p className={'text-sm text-gray-300 leading-relaxed whitespace-pre-line' + (hasAbout ? ' mt-3' : '')}>{r.note}</p>}
          </Section>
        )}
        <LivingStyleSection kind="post" id={r.id} owned={owned} />
      </Sheet>
    </DetailLayout>
  );
}
