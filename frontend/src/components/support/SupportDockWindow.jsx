import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import SupportThread from '../../pages/consumer/messages/SupportThread.jsx';
import '../../styles/routes/messages.css';

export default function SupportDockWindow({ contextKey, opened, onMinimize, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return <SupportThread t={t} user={user} contextKey={contextKey} opened={opened} onMinimize={onMinimize} onClose={onClose} />;
}
