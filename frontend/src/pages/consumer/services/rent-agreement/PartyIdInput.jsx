import { useTranslation } from 'react-i18next';
import IdInput from '../../../../components/IdInput.jsx';

export default function PartyIdInput({ masked, held, kind, value, onChange, placeholder, ...rest }) {
  const { t } = useTranslation();
  if (masked && !value && !held) return <input readOnly value={masked} data-testid={`ra-masked-${kind}`} {...rest} />;
  const keep = masked && held;
  const hint = keep ? t('services.ra.heldId', { masked }) : placeholder;
  return <IdInput kind={kind} value={value} onChange={onChange} placeholder={hint} data-held={keep ? 'true' : undefined} {...rest} />;
}
