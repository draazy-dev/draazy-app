import { useMemo } from 'react';
import Icon from '../../../components/Icon.jsx';
import MobileField from '../../../components/MobileField.jsx';
import NativeSelect from '../../../components/ui/NativeSelect.jsx';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, getCatLabel } from '../../../lib/data/support.js';
import { suggestFaqs } from './suggestFaqs.js';

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

export default function TicketForm({ form, set, fld, submit, submitting, faqs }) {
  const { t } = useTranslation();
  const suggestions = useMemo(() => suggestFaqs(`${form.subject} ${form.message}`, faqs), [form.subject, form.message, faqs]);
  return (
    <div className="glass-card rounded-2xl p-6 sm:p-7 reveal">
      <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <Icon name="ticket-plus" className="w-5 h-5 text-teal-400" /> {t('misc.tfRaiseNew')}
      </h2>
      <p className="text-gray-500 text-xs mb-5">
        {t('misc.tfReplyNote')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ticket-name" className="block text-sm font-medium text-gray-300 mb-2">
            {t('misc.tfYourName')} <span className="text-rose-400">*</span>
          </label>
          <input
            id="ticket-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            type="text"
            placeholder={t('misc.tfYourNamePlaceholder')}
            className={fld}
          />
        </div>
        <div>
          <label htmlFor="ticket-mobile" className="block text-sm font-medium text-gray-300 mb-2">
            {t('misc.tfMobile')} <span className="text-rose-400">*</span>
          </label>
          <MobileField id="ticket-mobile" value={form.mobile} onChange={(v) => set('mobile', v)} placeholder={t('misc.tfMobilePlaceholder')} disabled />
          <p className="text-gray-500 text-xs mt-1.5">{t('misc.tfMobileLocked')}</p>
        </div>
        <div>
          <label htmlFor="ticket-category" className="block text-sm font-medium text-gray-300 mb-2">
            {t('misc.tfCategory')} <span className="text-rose-400">*</span>
          </label>
          <NativeSelect id="ticket-category" value={form.category} onChange={(e) => set('category', e.target.value)} className={fld}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {getCatLabel(c.key)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ticket-subject" className="block text-sm font-medium text-gray-300 mb-2">
            {t('misc.tfSubject')} <span className="text-rose-400">*</span>
          </label>
          <input
            id="ticket-subject"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            maxLength={SUBJECT_MAX}
            type="text"
            placeholder={t('misc.tfSubjectPlaceholder')}
            className={fld}
          />
          <p className="mt-1 text-right text-xs text-gray-500">{form.subject.length}/{SUBJECT_MAX}</p>
          {suggestions.length > 0 && (
            <div className="mt-2 rounded-xl border border-teal-400/20 bg-teal-400/5 p-3" data-testid="faq-suggestions">
              <p className="text-xs font-semibold text-teal-300 mb-1">{t('misc.tfFaqSuggest')}</p>
              {suggestions.map((f) => (
                <details key={f.id} className="group">
                  <summary className="cursor-pointer py-1.5 text-sm text-white list-none flex items-start gap-1.5">
                    <Icon name="chevron-right" className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
                    {f.question}
                  </summary>
                  <p className="pl-5 pb-2 text-sm text-gray-400 leading-relaxed">{f.answer}</p>
                </details>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ticket-message" className="block text-sm font-medium text-gray-300 mb-2">
            {t('misc.tfDescribe')} <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="ticket-message"
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            maxLength={MESSAGE_MAX}
            rows={4}
            placeholder={t('misc.tfDescribePlaceholder')}
            className={fld + ' resize-none'}
          />
          <p className="mt-1 text-right text-xs text-gray-500">{form.message.length}/{MESSAGE_MAX}</p>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        aria-busy={submitting}
        className="btn-teal w-full mt-5 py-3.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Icon name="send" className="w-4 h-4" /> {t('misc.tfSubmit')}
      </button>
    </div>
  );
}
