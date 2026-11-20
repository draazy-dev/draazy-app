import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import AutosaveBanner from '../../../components/AutosaveBanner.jsx';
import FieldError from '../../../components/ui/FieldError.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import GroupPreferencesFields from './GroupPreferencesFields.jsx';
import ChoiceRow from './ChoiceRow.jsx';
import { MAX_GROUP_SEATS } from './helpers.js';
import useScrollLock from '../../../hooks/useScrollLock.js';
import useModalDialog from '../../../hooks/useModalDialog.js';
import LivingStyleInline from './livingStyle/LivingStyleInline.jsx';
import ProfileNameNote from './ProfileNameNote.jsx';

const lbl = 'block text-sm font-medium text-gray-400 mb-2';

export default function GroupModal({ setGroupOpen, submitGroup, grpFormRef, grpDraft, grp, setGrp, grpErr, editing = false }) {
  const { t: tr } = useTranslation();
  const title = tr(editing ? 'flatmates.groupEditTitle' : 'flatmates.groupModalTitle');
  const [localityBusy, setLocalityBusy] = useState(false);
  useScrollLock();
  const panelRef = useModalDialog(true, () => setGroupOpen(false));
  const policyField = <div><span className={lbl}>{tr('flatmates.openTo')}</span><ChoiceRow label={tr('flatmates.openTo')} options={[['women', tr('flatmates.optWomenOnly')], ['men', tr('flatmates.optMenOnly')], ['any', tr('flatmates.optAnyone')]]} value={grp.policy} onChange={(v) => setGrp({ ...grp, policy: v })} /></div>;
  const seatsField = <div><label htmlFor="grp-seats" className={lbl}>{tr('flatmates.peopleSharing')}</label><input id="grp-seats" type="number" inputMode="numeric" min="1" max={MAX_GROUP_SEATS} value={grp.seats} onChange={(e) => setGrp({ ...grp, seats: e.target.value })} className="field w-full rounded-xl px-3.5 py-2.5 text-sm" /></div>;
  return (
    <div className="sf-modal" onClick={() => setGroupOpen(false)}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="dz-modal-panel border border-white/10 rounded-3xl w-full max-w-xl p-6 sm:p-7 outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div><h2 className="text-xl font-bold text-white">{title}</h2>{!editing && <p className="text-gray-400 text-xs mt-1">{tr('flatmates.groupModalSubtitle')}</p>}</div>
          <button onClick={() => setGroupOpen(false)} aria-label={tr('common.close')} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white"><Icon name="x" className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submitGroup} className="space-y-4" ref={grpFormRef}>
          <AutosaveBanner restored={grpDraft.restored} onStartFresh={grpDraft.startFresh} />
          <div data-err="title"><label htmlFor="grp-title" className={lbl}>{tr('flatmates.groupTitleLabel')}<RequiredMark /></label><input id="grp-title" value={grp.title} onChange={(e) => { setGrp({ ...grp, title: e.target.value }); grpErr.clear('title'); }} className={'field w-full rounded-xl px-3.5 py-2.5 text-sm' + grpErr.cx('title')} placeholder={tr('flatmates.groupTitlePlaceholder')} /><FieldError show={grpErr.has('title')}>{grpErr.msg('title')}</FieldError></div>
          {policyField}
          <GroupPreferencesFields grp={grp} setGrp={setGrp} grpErr={grpErr} onLocalityBusy={setLocalityBusy} seatsField={seatsField} />
          <div><ProfileNameNote invalid={grpErr.has('name')} /><FieldError show={grpErr.has('name')}>{grpErr.msg('name')}</FieldError></div>
          <div><label htmlFor="grp-note" className={lbl}>{tr('flatmates.shortNote')}</label><textarea id="grp-note" value={grp.note} onChange={(e) => setGrp({ ...grp, note: e.target.value })} rows={2} className="field w-full rounded-xl px-3.5 py-2.5 text-sm resize-none" placeholder={tr('flatmates.groupNotePlaceholder')} /></div>

          <LivingStyleInline />
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={() => setGroupOpen(false)} className="btn-ghost text-sm font-medium text-gray-300 px-5 py-2.5 rounded-xl">{tr('flatmates.cancel')}</button>
            <button type="submit" disabled={localityBusy} className="btn-teal text-sm font-semibold text-white px-6 py-2.5 rounded-xl inline-flex items-center gap-2 disabled:opacity-70"><Icon name={editing ? 'check' : 'users-round'} className="w-4 h-4" /> {tr(editing ? 'flatmates.saveChanges' : 'flatmates.createGroupSubmit')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
