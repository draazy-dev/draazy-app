import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

export default function ProfileNameNote({ invalid = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const name = user?.name?.trim();
  return (
    <div data-err="name" data-testid="profile-name-note" className={'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ' + (invalid ? 'border-red-400/60 bg-red-500/5' : 'border-white/10 bg-white/5')}>
      <Icon name="user-round" className="h-4 w-4 shrink-0 text-teal-400" />
      <span className="min-w-0 flex-1 text-gray-400">
        {name
          ? <>{t('flatmates.postingAs')} <span className="font-semibold text-white">{name}</span> · {t('flatmates.nameFromProfile')}</>
          : t('flatmates.addProfileName')}
      </span>
      <Link to="/dashboard#profile" className="shrink-0 font-medium text-teal-300 hover:text-teal-200">{t(name ? 'flatmates.editName' : 'flatmates.addName')}</Link>
    </div>
  );
}
