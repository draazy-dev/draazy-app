import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import Select from '../ui/Select.jsx';
import DateField from '../ui/DateField.jsx';
import IdGateStep, { useIdGate } from './IdGateStep.jsx';
import AgreementUpload from '../../pages/consumer/flatmates/AgreementUpload.jsx';
import { getFlatmateDetail, requestGroupBadge, requestRoomBadge } from '../../services/flatmateService.js';

const STATE_CHIP = {
  approved: ['dash.roomBadge.approved', 'bg-emerald-500/15 text-emerald-300'],
  pending: ['dash.roomBadge.pending', 'bg-amber-500/15 text-amber-300'],
  rejected: ['dash.roomBadge.rejected', 'bg-rose-500/15 text-rose-300'],
  none: ['dash.roomBadge.notRequested', 'bg-white/[0.08] text-gray-400'],
};

const EVIDENCE = {
  agreement: { category: 'Rent agreement', label: 'dash.roomBadge.agreement', cta: null },
  bill: { category: 'Electricity Bill', label: 'dash.roomBadge.bill', cta: 'dash.roomBadge.billCta' },
};

const stateOf = (item) => {
  const requested = item?.agreementDeclared || !!item?.host?.agreementDoc?.id;
  if (!requested) return 'none';
  const status = String(item?.host?.reviewStatus || item?.reviewStatus || '').toLowerCase();
  return STATE_CHIP[status] ? status : 'none';
};

const isTenantHome = (kind, item) => item?.hostRole === 'tenant' && !(kind === 'group' && item.hunting);

const localDay = () => new Date().toLocaleDateString('en-CA');
const periodOk = (p) => !!p.from && !!p.till && p.till > p.from && p.till > localDay();

function PeriodFields({ period, onChange }) {
  const { t } = useTranslation();
  const invalid = !!period.from && !!period.till && !periodOk(period);
  const field = (key, testId) => (
    <div data-testid={testId}>
      <p className="text-gray-400 text-[11px] font-medium mb-1">{t(`dash.roomBadge.${key}`)}</p>
      <DateField value={period[key]} onChange={(iso) => onChange({ ...period, [key]: iso })}
        ariaLabel={t(`dash.roomBadge.${key}Aria`)} invalid={invalid && key === 'till'} className="w-full" />
    </div>
  );
  return (
    <fieldset>
      <legend className="text-gray-500 text-[11px] font-medium mb-1.5">{t('dash.roomBadge.period')}</legend>
      <div className="grid grid-cols-2 gap-2">
        {field('from', 'badge-period-from')}
        {field('till', 'badge-period-till')}
      </div>
      {invalid && <p className="text-rose-300 text-[11px] mt-1.5">{t('dash.roomBadge.periodInvalid')}</p>}
    </fieldset>
  );
}

function EvidenceForm({ personalDocs, hostDoc, busy, disabled, onRequest }) {
  const { t } = useTranslation();
  const [type, setType] = useState('agreement');
  const [pickedId, setPickedId] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const [period, setPeriod] = useState({ from: hostDoc?.validFrom || '', till: hostDoc?.validTill || '' });
  const ev = EVIDENCE[type];
  const hostDocId = hostDoc?.id || '';
  const vaultDocs = (personalDocs || []).filter((d) => d.category === ev.category);
  const selectedId = pickedId || (vaultDocs.some((d) => d.id === hostDocId) ? hostDocId : '');
  const docId = uploaded?.id || selectedId;
  const needsPeriod = type === 'agreement';
  const choose = (next) => { setType(next); setPickedId(''); setUploaded(null); };
  const send = () => onRequest(needsPeriod ? { id: docId, validFrom: period.from, validTill: period.till } : { id: docId });

  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-gray-500 text-[11px] font-medium mb-1.5">{t('dash.roomBadge.whichDoc')}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('dash.roomBadge.whichDoc')}>
          {Object.keys(EVIDENCE).map((key) => (
            <button key={key} type="button" role="radio" aria-checked={type === key} onClick={() => choose(key)} data-testid={`badge-evidence-${key}`}
              className={'min-h-[44px] px-3 rounded-xl border text-sm font-semibold transition ' + (type === key ? 'border-teal-400/60 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20')}>
              {t(EVIDENCE[key].label)}
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-[11px] mt-1.5">{t(type === 'bill' ? 'dash.roomBadge.billHint' : 'dash.roomBadge.agreementHint')}</p>
      </div>
      {vaultDocs.length > 0 && !uploaded && (
        <div>
          <Select value={selectedId} onChange={setPickedId} searchable={false} placeholder={t('dash.roomBadge.vaultPlaceholder')} ariaLabel={t('dash.roomBadge.vaultPick')}
            options={vaultDocs.map((d) => ({ value: d.id, label: d.name || d.id }))} className="w-full" />
          <p className="text-gray-500 text-[11px] mt-2">{t('dash.roomBadge.uploadNew')}</p>
        </div>
      )}
      <AgreementUpload key={type} category={ev.category} cta={ev.cta ? t(ev.cta) : null}
        ariaLabel={type === 'bill' ? t('dash.roomBadge.billCta') : t('listProperty.host.agreementAria')}
        doc={uploaded} onChange={(d) => { setUploaded(d); if (d?.id) setPickedId(''); }} />
      {needsPeriod && <PeriodFields period={period} onChange={setPeriod} />}
      <p className="flex items-start gap-1.5 text-[11px] text-gray-500"><Icon name="lock" className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('dash.roomBadge.privateNote')}</p>
      <button type="button" onClick={send} disabled={disabled || !docId || uploaded?.uploading || busy || (needsPeriod && !periodOk(period))} data-testid="request-room-badge"
        className="w-full sm:w-auto min-h-[44px] px-4 rounded-lg bg-brand-teal text-ink text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
        <Icon name="shield-check" className="w-4 h-4" /> {busy ? t('dash.roomBadge.requesting') : t('dash.roomBadge.request')}
      </button>
    </div>
  );
}

export default function RoomBadgeRequestCard({ kind = 'room', roomId, personalDocs, onRequested, toast }) {
  const { t } = useTranslation();
  const { canRequest, inReview } = useIdGate();
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const seq = ++latest.current;
    try {
      const res = await getFlatmateDetail(kind, roomId);
      if (seq !== latest.current) return;
      if (!res.owned || !isTenantHome(kind, res.item)) {
        setFailed(true);
        return;
      }
      setDetail(res);
      setFailed(false);
    } catch {
      if (seq === latest.current) setFailed(true);
    }
  }, [kind, roomId]);

  useEffect(() => {
    setDetail(null);
    load();
    return () => { latest.current += 1; };
  }, [load]);

  if (failed) {
    return (
      <div data-testid="room-badge-request-card" className="glass-card rounded-2xl p-4 sm:p-5 flex items-center gap-3">
        <p className="text-rose-300 text-sm flex-1">{t('dash.roomBadge.loadFailed')}</p>
        <button type="button" onClick={load} className="min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-teal-300 text-xs font-semibold">{t('common.retry')}</button>
      </div>
    );
  }
  if (!detail) return <div className="glass-card rounded-2xl min-h-[96px] animate-pulse" />;

  const item = detail.item;
  const state = stateOf(item);
  const [chipKey, chipCls] = STATE_CHIP[state];
  const reason = item.host?.reviewReason || '';
  const consentPending = kind === 'group' ? !item.ownerConsent : item.host?.ownerConsentConfirmed === false;

  const request = async (agreementDoc) => {
    setBusy(true);
    try {
      await (kind === 'group' ? requestGroupBadge : requestRoomBadge)(roomId, { agreementDoc });
      toast(t('dash.roomBadge.requestedToast'), 'success');
      await load();
      onRequested?.();
    } catch (err) {
      toast(err?.message || t('dash.roomBadge.requestFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="room-badge-request-card" data-state={state} className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-500/15 text-teal-400"><Icon name="shield-check" className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-semibold truncate">{t('dash.roomBadge.title')}</p>
            <span data-testid="room-badge-state" className={'dz-tag font-semibold ' + chipCls}>{t(chipKey)}</span>
          </div>
          <p className="mt-1 text-xs text-gray-300">{item.title}</p>
          <p className="text-gray-400 text-xs mt-0.5">
            {state === 'approved' ? t('dash.roomBadge.lineApproved')
              : state === 'pending' ? t('dash.roomBadge.linePending')
              : state === 'rejected' ? (reason ? t('dash.roomBadge.lineRejected', { reason }) : t('dash.roomBadge.lineRejectedNoReason'))
              : t('dash.roomBadge.lineNone')}
          </p>
          {consentPending && <p className="text-amber-200 text-xs mt-1">{t('dash.roomBadge.consentNeeded')}</p>}
        </div>
      </div>
      {(state === 'none' || state === 'rejected') && (
        <>
          {(inReview || !canRequest) && <div className="mt-4"><IdGateStep inReview={inReview} source="flatmate_badge" /></div>}
          <EvidenceForm personalDocs={personalDocs} hostDoc={item.host?.agreementDoc} busy={busy} disabled={!canRequest} onRequest={request} />
        </>
      )}
    </div>
  );
}
