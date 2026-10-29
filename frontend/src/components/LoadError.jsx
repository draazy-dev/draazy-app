import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { isReachabilityFailure } from '../hooks/useConnectivity.js';

export default function LoadError({ message, error, onRetry, className = 'glass-card rounded-2xl p-5' }) {
  const { t } = useTranslation();
  return (
    <div className={`${className} flex flex-col items-center text-center gap-3`}>
      <Icon name="alert-triangle" className="w-8 h-8 text-amber-400" />
      <p className="text-gray-300 text-sm">{isReachabilityFailure(error) ? t('connectivity.listUnreachable') : message}</p>
      <button onClick={onRetry} className="dz-control dz-control--action px-4 gap-1.5">
        <Icon name="refresh-cw" className="w-4 h-4" /> {t('common.retry')}
      </button>
    </div>
  );
}
