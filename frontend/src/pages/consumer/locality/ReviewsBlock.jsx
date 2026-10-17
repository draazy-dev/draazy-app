import { Trans, useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { Stars } from '../property/Stars.jsx';
import { StarInput } from '../property/StarInput.jsx';
import { OwnReviewBar } from '../property/OwnReviewBar.jsx';

export default function ReviewsBlock({ activeName, locReviews, summary, summaryFailed, onSubmit, revText, setRevText, pick, setPick, editing, busy, onEdit, onDelete, onCancel }) {
  const { t } = useTranslation();
  /** The headline is the server aggregate, not an average of the cards (page one only). A failed read
   * must not reuse the "no reviews yet" copy: that claims nobody reviewed the area. */
  const loading = !summary && !summaryFailed;
  const rated = !!summary && summary.count > 0 && Number.isFinite(summary.avg);
  const showForm = editing || !locReviews.some((rv) => rv.mine);
  return (
    <div className="glass-card rounded-2xl p-6 reveal">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Icon name="star" className="w-5 h-5 text-amber-400" /> {t('locality.reviewsTitle')}</h2>
        <div className="text-sm text-gray-300">
          {loading ? <span className="skeleton inline-block h-4 w-28 rounded align-middle" aria-hidden="true" />
            : summaryFailed ? <span className="text-amber-300/80 inline-flex items-center gap-1.5" data-testid="locality-rating-unavailable"><Icon name="alert-triangle" className="w-4 h-4" /> {t('locality.reviewsUnavailable')}</span>
              : rated ? <><span className="text-amber-400 font-bold">{summary.avg.toFixed(1)}</span> ★ · {t('locality.reviewsCount', { count: summary.count })}</>
                : t('locality.reviewsNone')}
        </div>
      </div>
      {showForm && (
      <form onSubmit={onSubmit} data-testid="locality-review-composer" className="rounded-xl p-4 mb-5" style={{ background: 'rgb(var(--dz-c-white) / .03)', border: '1px solid rgb(var(--dz-c-white) / calc(.08 * var(--dz-line-boost)))' }}>
        <label htmlFor="locality-review-input" className="block text-sm font-semibold text-white mb-2"><Trans i18nKey="locality.reviewPrompt" values={{ name: activeName }} components={{ 1: <span className="text-teal-400" /> }} /></label>
        <div className="mb-3"><StarInput value={pick} onChange={setPick} size={22} /></div>
        <textarea id="locality-review-input" value={revText} onChange={(e) => setRevText(e.target.value)} rows={2} placeholder={t('locality.reviewPlaceholder')} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-teal-400/50" />
        <div className="flex gap-2 mt-3">
          <button type="submit" disabled={busy} className="btn-teal px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"><Icon name="send" className="w-4 h-4" /> {t(editing ? 'common.updateReview' : 'locality.reviewPost')}</button>
          {editing && <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/5">{t('common.cancel')}</button>}
        </div>
      </form>
      )}
      <div className="space-y-3">
        {locReviews.length ? locReviews.map((rv) => (
          <div key={rv.id} className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-1"><span className="font-semibold text-sm">{rv.user}</span><Stars value={rv.rating} size={14} /></div>
            <p className="text-gray-400 text-sm">{rv.text}</p>
            {rv.mine && !editing && <OwnReviewBar onEdit={onEdit} onDelete={onDelete} busy={busy} />}
          </div>
        )) : <p className="text-gray-500 text-sm">{t('locality.reviewBeFirst', { name: activeName })}</p>}
      </div>
    </div>
  );
}
