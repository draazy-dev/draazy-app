import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import LocalitySelect from '../../../components/ui/LocalitySelect.jsx';
import AutosaveBanner from '../../../components/AutosaveBanner.jsx';
import FieldError from '../../../components/ui/FieldError.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import HeadlineField from '../../../components/ui/HeadlineField.jsx';
import AmountInput from './AmountInput.jsx';
import MoveInField from './MoveInField.jsx';
import ChoiceRow from './ChoiceRow.jsx';
import SeekerMustHaves from './MustHaveFields.jsx';
import { MAX_LOCALITIES } from './constants.js';
import { seekerHeadline } from './helpers.js';
import useScrollLock from '../../../hooks/useScrollLock.js';
import useModalDialog from '../../../hooks/useModalDialog.js';
import LivingStyleInline from './livingStyle/LivingStyleInline.jsx';
import ProfileNameNote from './ProfileNameNote.jsx';

const lbl = 'block text-sm font-medium text-gray-400 mb-2';

export default function PostModal({ setPostOpen, submitPost, takeDownPost, postFormRef, postDraft, post, setPost, postErr, editingId }) {
  const [localityBusy, setLocalityBusy] = useState(false);
  const [moreToggled, setMoreToggled] = useState(null);
  const hasExtras = !!(post.age || post.occupation || post.title || post.note || post.roomPref !== 'any' || post.verifiedContactOnly);
  // Latched, so clearing the last optional field does not collapse the section under the cursor.
  if (hasExtras && moreToggled === null) setMoreToggled(true);
  const hiddenError = ['age', 'title', 'note'].some((name) => postErr.has(name));
  const { t: tr } = useTranslation();
  /* Without the lock a thumb that reaches the end of this form goes on scrolling the results
   * behind it, so the sheet closes onto a board that has moved. */
  useScrollLock();
  const panelRef = useModalDialog(true, () => setPostOpen(false));
  const title = tr(editingId ? 'flatmates.editModalTitle' : 'flatmates.postModalTitle');
  return (
    <div className="sf-modal" onClick={() => setPostOpen(false)}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="dz-modal-panel border border-white/10 rounded-3xl w-full max-w-xl p-6 sm:p-7 outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {editingId ? (
              <p className="mt-1 text-xs text-gray-400">
                {tr('flatmates.oneLiveRequest')}{' '}
                <button type="button" onClick={takeDownPost} className="font-semibold text-teal-300 underline underline-offset-2">{tr('flatmates.takeDownForNew')}</button>
              </p>
            ) : null}
          </div>
          <button onClick={() => setPostOpen(false)} aria-label={tr('common.close')} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white"><Icon name="x" className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submitPost} className="space-y-4" ref={postFormRef}>
          <AutosaveBanner restored={postDraft.restored} onStartFresh={postDraft.startFresh} />
          <div>
            <label className={lbl}>{tr('flatmates.preferredLocalities')}<RequiredMark /> <span className="text-gray-600">{tr('flatmates.upToN', { count: MAX_LOCALITIES })}</span></label>
            <LocalitySelect
              multi
              autoClose
              max={MAX_LOCALITIES}
              values={post.localities}
              onChange={(arr) => { if (arr.length <= MAX_LOCALITIES || arr.length < post.localities.length) { setPost({ ...post, localities: arr }); postErr.clear('localities'); } }}
              placeholder={tr('flatmates.addLocalities')}
              invalid={postErr.has('localities')}
              dataErr="localities"
              ariaLabel={tr('flatmates.preferredLocalities')}
              onBusyChange={setLocalityBusy}
            />
            <FieldError show={postErr.has('localities')}>{postErr.msg('localities')}</FieldError>
          </div>
          <div>
            <span className={lbl}>{tr('flatmates.budgetShareLabel')}<RequiredMark /></span>
            <div className="grid grid-cols-2 gap-3">
              <div><AmountInput value={post.budget} onChange={(v) => { setPost({ ...post, budget: v }); postErr.clear('budget'); }} className={postErr.cx('budget')} data-err="budget" placeholder={tr('flatmates.rangeFrom')} aria-label={tr('flatmates.budgetMinAria')} aria-required="true" /><FieldError show={postErr.has('budget')}>{postErr.msg('budget')}</FieldError></div>
              <div><AmountInput value={post.budgetMax} onChange={(v) => { setPost({ ...post, budgetMax: v }); postErr.clear('budgetMax'); }} className={postErr.cx('budgetMax')} data-err="budgetMax" placeholder={tr('flatmates.rangeUpTo')} aria-label={tr('flatmates.budgetMaxAria')} /><FieldError show={postErr.has('budgetMax')}>{postErr.msg('budgetMax')}</FieldError></div>
            </div>
          </div>
          <div><span className={lbl}>{tr('flatmates.moveIn')}</span><MoveInField value={post.moveIn} onChange={(v) => setPost({ ...post, moveIn: v })} label={tr('flatmates.moveIn')} /></div>
          <div><ProfileNameNote invalid={postErr.has('name')} /><FieldError show={postErr.has('name')}>{postErr.msg('name')}</FieldError></div>
          <div><span className={lbl}>{tr('flatmates.iAmA')}</span><ChoiceRow label={tr('flatmates.iAmA')} options={[['female', tr('flatmates.optWoman')], ['male', tr('flatmates.optMan')], ['any', tr('flatmates.optPreferNotSay')]]} value={post.gender} onChange={(v) => setPost({ ...post, gender: v })} /></div>
          <div><span className={lbl}>{tr('flatmates.flatmatePrefWith')}</span><ChoiceRow label={tr('flatmates.flatmatePrefWith')} options={[['any', tr('flatmates.optAnyone')], ['women', tr('flatmates.optWomenOnly')], ['men', tr('flatmates.optMenOnly')]]} value={post.flatPref} onChange={(v) => setPost({ ...post, flatPref: v })} /></div>
          <SeekerMustHaves post={post} setPost={setPost} />
          <details
            open={hiddenError || !!moreToggled}
            onToggle={(e) => setMoreToggled(e.currentTarget.open)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5"
            data-testid="seeker-more-details"
          >
            <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-2.5 text-sm font-semibold text-white">
              <span>{tr('flatmates.moreAboutYou')}</span>
              <Icon name="chevron-down" className="faq-chevron h-4 w-4 flex-shrink-0 text-gray-400 transition-transform" />
            </summary>
            <div className="space-y-4 pb-3.5 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="fp-age" className={lbl}>{tr('flatmates.age')}</label><input id="fp-age" type="number" inputMode="numeric" value={post.age} onChange={(e) => { setPost({ ...post, age: e.target.value }); postErr.clear('age'); }} className={'field w-full rounded-xl px-3.5 py-2.5 text-sm' + postErr.cx('age')} data-err="age" placeholder={tr('flatmates.agePlaceholder')} /><FieldError show={postErr.has('age')}>{postErr.msg('age')}</FieldError></div>
                <div><label htmlFor="fp-occupation" className={lbl}>{tr('flatmates.occupation')}</label><input id="fp-occupation" value={post.occupation} onChange={(e) => setPost({ ...post, occupation: e.target.value })} className="field w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder={tr('flatmates.occupationPlaceholder')} /></div>
              </div>
              <div><span className={lbl}>{tr('flatmates.roomPreference')}</span><ChoiceRow label={tr('flatmates.roomPreference')} options={[['any', tr('flatmates.optNoPreference')], ['private', tr('flatmates.optPrivateRoom')], ['shared', tr('flatmates.optSharedRoom')]]} value={post.roomPref} onChange={(v) => setPost({ ...post, roomPref: v })} /></div>
              <HeadlineField
                value={post.title}
                onChange={(value) => { setPost({ ...post, title: value }); postErr.clear('title'); }}
                suggestion={seekerHeadline(post)}
                error={postErr.has('title') ? postErr.msg('title') : ''}
                labelClassName="block text-sm font-medium text-gray-400"
                inputClassName="field w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
              <div><label htmlFor="fp-note" className={lbl}>{tr('flatmates.shortNote')}</label><textarea id="fp-note" value={post.note} onChange={(e) => { setPost({ ...post, note: e.target.value }); postErr.clear('note'); }} rows={2} className={'field w-full rounded-xl px-3.5 py-2.5 text-sm resize-none' + postErr.cx('note')} data-err="note" placeholder={tr('flatmates.notePlaceholder')} /><FieldError show={postErr.has('note')}>{postErr.msg('note')}</FieldError></div>
              <label className="flex items-start gap-2.5 text-sm leading-5 text-gray-300 cursor-pointer select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
                <input type="checkbox" checked={post.verifiedContactOnly} onChange={(e) => setPost({ ...post, verifiedContactOnly: e.target.checked })} className="w-4 h-4 mt-0.5 shrink-0 accent-teal-500" />
                <Icon name="shield-check" className="w-3.5 h-3.5 mt-[3px] shrink-0 text-teal-400" />
                <span className="min-w-0">{tr('flatmates.verifiedContactPre')} <span className="text-teal-300 font-semibold">{tr('flatmates.verifiedSeekersTerm')}</span> {tr('flatmates.verifiedContactSuf')}</span>
              </label>
            </div>
          </details>
          <LivingStyleInline />
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={() => setPostOpen(false)} className="btn-ghost text-sm font-medium text-gray-300 px-5 py-2.5 rounded-xl">{tr('flatmates.cancel')}</button>
            <button type="submit" disabled={localityBusy} className="btn-teal text-sm font-semibold text-white px-6 py-2.5 rounded-xl inline-flex items-center gap-2 disabled:opacity-70"><Icon name="send" className="w-4 h-4" /> {editingId ? tr('flatmates.updateRequest') : tr('flatmates.postRequestBtn')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
