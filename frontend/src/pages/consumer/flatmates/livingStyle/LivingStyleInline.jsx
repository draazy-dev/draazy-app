import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import LivingStyleQuestions, { LoadError } from './LivingStyleQuestions.jsx';
import { STYLE_KEYS } from './questions.js';
import useLivingStyle from './useLivingStyle.js';

/** The questionnaire, open by default, for the post forms. Each tap saves to the profile,
 *  so nothing rides on the post's submit. */
export default function LivingStyleInline({ className = '' }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const style = useLivingStyle();
  if (!style.signedIn) return null;
  const onChange = (next) => style.save(next).catch(() => toast(t('flatmates.ls.saveFailed'), 'error'));
  return (
    <section data-testid="ls-inline" className={'rounded-2xl border border-white/10 bg-white/[.03] ' + className}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon name="heart-handshake" className="w-5 h-5 text-pink-300 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">
            {t('flatmates.ls.inlineTitle')}
            <span data-testid="ls-inline-progress" className="ml-2 text-xs font-normal text-teal-300">{t('flatmates.ls.progress', { n: style.count, total: STYLE_KEYS.length })}</span>
          </span>
          <span className="block text-xs text-gray-400">{t('flatmates.ls.inlineSub')}</span>
        </span>
      </div>
      <div className="px-4 pb-4">
        {style.status === 'error' && <LoadError onRetry={style.reload} />}
        <LivingStyleQuestions answers={style.answers} onChange={onChange} disabled={style.status !== 'ready'} />
      </div>
    </section>
  );
}
