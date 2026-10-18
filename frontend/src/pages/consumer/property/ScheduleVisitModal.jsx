import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import ContactsExhaustedModal from '../../../components/property/ContactsExhaustedModal.jsx';
import DateField from '../../../components/ui/DateField.jsx';
import TimeField from '../../../components/ui/TimeField.jsx';
import { slotFromParts, todayIso } from '../../../lib/visitWhen.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useSignInGate } from '../../../lib/useSignInGate.js';
import useScrollLock from '../../../hooks/useScrollLock.js';
import useModalDialog from '../../../hooks/useModalDialog.js';
import { scheduleVisit } from '../../../services/visitService.js';
import { track } from '../../../lib/pmf.js';

const nextDayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ScheduleVisitModal({ p, isIn, onClose, toast }) {
  const { t } = useTranslation();
  const { isIn: authIn, loading: authLoading } = useAuth();
  const sendToSignIn = useSignInGate();
  const [visitDate, setVisitDate] = useState(nextDayIso());
  const [visitTime, setVisitTime] = useState('10:30 AM');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const signedIn = isIn ?? authIn;
  const returnPath = p?.id ? `/property/${encodeURIComponent(String(p.id))}?visit=1` : undefined;
  const gated = useRef(false);
  const past = new Date(slotFromParts(visitDate, visitTime)) <= new Date();

  useScrollLock();
  useEffect(() => {
    if (authLoading || signedIn || gated.current) return;
    gated.current = true;
    if (sendToSignIn('schedule', returnPath)) onClose();
  }, [authLoading, onClose, returnPath, sendToSignIn, signedIn]);

  const panelRef = useModalDialog(true, onClose);

  const submit = async () => {
    if (busy) return;
    if (past) {
      setError(t('property.pastSlot'));
      return;
    }
    if (!signedIn) {
      if (sendToSignIn('schedule', returnPath)) onClose();
      return;
    }
    setBusy(true);
    setError('');
    let keepMounted = true;
    try {
      await scheduleVisit({
        propertyId: p?.uuid || p?.id || '',
        listing: p?.title || [p?.bhk, p?.type, p?.locality].filter(Boolean).join(' ') || t('property.typeFallback'),
        ownerMobile: p?.ownerMobile || '',
        dateIso: visitDate,
        time: visitTime,
        note: msg.trim(),
      });
      setDone(true);
      track('visit_requested', { id: p?.id });
      toast(t('property.visitRequestedToast'), 'success');
    } catch (e) {
      if (e?.status === 401) {
        if (sendToSignIn('schedule', returnPath)) {
          keepMounted = false;
          onClose();
        }
        return;
      }
      if (e?.code === 'contact_quota_exhausted') {
        setQuotaOpen(true);
        return;
      }
      const message = e?.code === 'contact_pending_limit' ? t('property.contactPendingLimit')
        : e?.code === 'recently_withdrawn' ? (e.message || t('property.recentlyWithdrawn'))
        : e?.status === 409 ? t('property.visitAlreadyBooked') : t('property.visitRequestFailed');
      setError(message);
    } finally {
      if (keepMounted) setBusy(false);
    }
  };

  if (!authLoading && !signedIn) return null;
  if (quotaOpen) return <ContactsExhaustedModal onClose={onClose} />;

  return (
    <div className="dz-modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1} className="dz-modal outline-none" role="dialog" aria-modal="true" aria-label={t('property.scheduleVisit')} style={{ maxWidth: 600 }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">{t('property.scheduleVisit')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('property.scheduleVisitSub')}</p>
          </div>
          <button type="button" onClick={onClose} className="dz-modal-x min-h-[44px] min-w-[44px]" aria-label={t('property.close')}><Icon name="x" className="w-5 h-5" /></button>
        </div>
        {done ? (
          <div className="text-center py-5">
            <Icon name="calendar-check" className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-semibold">{t('property.visitRequested')}</p>
            <p className="text-slate-400 text-sm mt-1">{t('property.visitRequestedBody')}</p>
            <button type="button" onClick={onClose} className="btn-teal w-full mt-5 min-h-[44px] px-4">{t('property.done')}</button>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-4">
              <div>
                <p className="text-sm font-medium text-gray-300 mb-3">{t('property.selectDate')}</p>
                <DateField value={visitDate} onChange={setVisitDate} min={todayIso()} ariaLabel={t('property.selectDate')} className="field w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-300 mb-3">{t('property.selectTimeSlot')}</p>
                <TimeField value={visitTime} onChange={setVisitTime} invalid={past} ariaLabel={t('property.selectTimeSlot')} className="field w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
                {past ? <p id="visit-past-hint" role="alert" className="mt-2 text-xs text-rose-300">{t('property.pastSlot')}</p> : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t('property.message')} <span className="text-gray-500 font-normal">{t('property.optional')}</span></label>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder={t('property.anyRequirements')} className="field w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 resize-none" />
              </div>
            </div>
            {error ? <p role="alert" className="mb-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button type="button" onClick={submit} disabled={busy || past} aria-describedby={past ? 'visit-past-hint' : undefined} className="btn-teal w-full min-h-[44px] flex items-center justify-center gap-2 px-4 disabled:opacity-60"><Icon name="calendar-check" className="w-4 h-4" /> {t('property.confirmVisit')}</button>
          </>
        )}
      </div>
    </div>
  );
}
