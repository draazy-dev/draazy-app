import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';

/* Shown in place of a Google Map that is unconfigured, refused by Google or crashed. Callers pass
   the map's own wrapper style/className so the placeholder occupies the identical footprint. */
export default function MapUnavailable({ style, className = '', note, detail, action }) {
  const { t } = useTranslation();
  return (
    <div
      className={'w-full rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center bg-white/[0.02] ' + className}
      style={style}
    >
      <div className="text-center px-6 py-10">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
          <Icon name="map-pin" className="h-6 w-6 text-gray-500" />
        </div>
        <p className="text-sm font-semibold text-gray-300">{note || t('pmap.mapUnavailable')}</p>
        <p className="mt-1 text-xs text-gray-500">{detail || t('pmap.mapNotConfigured')}</p>
        {action ? (
          <button type="button" onClick={action.onClick} className="mt-4 min-h-11 px-5 rounded-full btn-primary text-sm font-semibold">{action.label}</button>
        ) : null}
      </div>
    </div>
  );
}
