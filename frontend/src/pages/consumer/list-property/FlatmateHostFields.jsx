import { BadgeCheck, Home, Users } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import IdInput from '../../../components/IdInput.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import Select from '../../../components/ui/Select';
import { useAuth } from '../../../context/AuthContext.jsx';
import { getLocality } from '../../../services/localityService.js';
import { PillRow, FieldError } from './controls.jsx';
import { useGroupPickers } from '../flatmates/useGroupPickers.js';
import { fld, lbl } from './styles.js';

const bhkOf = (raw) => {
  const n = Math.min(4, parseInt(raw, 10));
  return n > 0 ? String(n) : '';
};

// Links the room to the host's own approved listing (owner tier) or Draazy tenancy (agreement match), and fills
// what that row already knows. The locality is re-read so an archived name is never written back.
function ClaimPicker({ rows, status, retry, value, label, hint, onPick }) {
  const { t } = useTranslation();
  const hintId = useId();
  if (status === 'error') {
    return (
      <p className="text-xs text-gray-400">
        {t('common.somethingWentWrong')}{' '}
        <button type="button" onClick={retry} className="text-teal-300 font-semibold underline">{t('common.retry')}</button>
      </p>
    );
  }
  if (status !== 'ready' || !rows?.length) return null;
  return (
    <div>
      <p className={lbl}>{label}</p>
      <Select
        value={rows.some((row) => row.claimId === value) ? value : ''}
        onChange={(id) => onPick(rows.find((row) => row.claimId === id) || null)}
        placeholder={t('listProperty.flatmate.attach.none')}
        ariaLabel={label}
        ariaDescribedBy={hintId}
        options={[{ value: '', label: t('listProperty.flatmate.attach.none') }, ...rows.map((row) => ({ value: row.claimId, label: row.label }))]}
      />
      <p id={hintId} className="text-gray-500 text-xs mt-1.5">{hint}</p>
    </div>
  );
}

export default function FlatmateHostFields({ form, set, errors, onLocalityChange }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pickers = useGroupPickers(user, true);
  const L = (key) => t(`listProperty.flatmate.label.${key}`);
  const A = (key) => t(`listProperty.flatmate.attach.${key}`);
  const role = (Icon, key) => <span className="inline-flex items-center gap-2"><Icon className="w-4 h-4 text-teal-400" aria-hidden="true" />{L(key)}</span>;
  const listings = (pickers.myApprovedListings || []).map((l) => ({ ...l, claimId: l.uuid || l.id, label: l.title || l.society || l.locality }));
  const tenancies = (pickers.myTenancies || []).filter((x) => x.propId).map((x) => ({ ...x, claimId: x.propId, label: x.title || x.address }));

  // Bumped on every pick, role switch and unmount so a slow locality lookup never lands on a newer choice.
  const pickSeq = useRef(0);
  useEffect(() => () => { pickSeq.current += 1; }, []);

  const attach = async (row) => {
    const seq = ++pickSeq.current;
    set('attachedPropertyId', row?.claimId || '');
    if (!row) return;
    if (bhkOf(row.bhk)) set('bhk', bhkOf(row.bhk));
    if (form.hostRole === 'tenant' && row.ownerMobile) set('ownerConsentMobile', row.ownerMobile.slice(-10));
    const live = row.localitySlug ? await getLocality(row.localitySlug).catch(() => null) : null;
    if (seq === pickSeq.current && live && !live.archived) onLocalityChange(live.name, { slug: live.slug, lat: live.lat, lng: live.lng });
  };

  return (
    <div className="mb-6">
      <p className={lbl}>{L('role')}<RequiredMark /></p>
      <PillRow
        label={L('role')}
        options={[['owner', role(Home, 'owner')], ['tenant', role(Users, 'tenant')]]}
        value={form.hostRole}
        onChange={(v) => { if (v !== form.hostRole) { pickSeq.current += 1; set('attachedPropertyId', ''); } set('hostRole', v); }}
      />
      {form.hostRole === 'owner' && (
        <div className="mt-3">
          <ClaimPicker rows={listings} status={pickers.myApprovedListingsStatus} retry={pickers.retryMyApprovedListings} value={form.attachedPropertyId} label={A('listing')} hint={A('listingHint')} onPick={attach} />
        </div>
      )}
      {form.hostRole === 'tenant' && (
        <div className="mt-3 space-y-3">
          <ClaimPicker rows={tenancies} status={pickers.myTenanciesStatus} retry={pickers.retryMyTenancies} value={form.attachedPropertyId} label={A('tenancy')} hint={A('tenancyHint')} onPick={attach} />
          <label data-err="ownerConsent" className={`flex min-h-[44px] items-start gap-3 rounded-xl border bg-white/[0.03] p-3 text-sm leading-5 ${errors.ownerConsent ? 'dz-invalid border-red-400/60' : 'border-white/10'}`}>
            <input
              type="checkbox"
              checked={!!form.ownerConsent}
              onChange={(e) => set('ownerConsent', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-teal-500"
            />
            <span className="block font-medium text-white">{t('listProperty.host.ownerConsentTitle')}<RequiredMark /></span>
          </label>
          <FieldError show={!!errors.ownerConsent}>{t('listProperty.err.ownerConsent')}</FieldError>
          <div data-err="ownerConsentMobile">
            <label htmlFor="room-owner-mobile" className={lbl}>{L('ownerMobile')}<RequiredMark /></label>
            <IdInput id="room-owner-mobile" kind="mobile" value={form.ownerConsentMobile} onChange={(v) => set('ownerConsentMobile', v)} placeholder={t('listProperty.ph.tenDigit')} aria-required="true" className={`${fld} ${errors.ownerConsentMobile ? 'dz-invalid' : ''}`} />
            <FieldError show={!!errors.ownerConsentMobile}>{t('listProperty.err.ownerMobile')}</FieldError>
          </div>
          <p className="flex items-start gap-2 text-xs text-gray-400" data-testid="room-agreement-later">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
            {t('listProperty.host.agreementLater')}
          </p>
        </div>
      )}
    </div>
  );
}
