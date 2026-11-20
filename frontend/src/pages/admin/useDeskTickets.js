import { useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission } from '../../lib/adminModules.js';

export default function useDeskTickets(count) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  if (!hasPermission(user, 'tickets:read')) return null;
  return {
    on: params.get('view') === 'tickets',
    show: () => setParams({ view: 'tickets' }, { replace: true }),
    tab: { key: 'tickets', label: 'Customer tickets', count: count ?? null },
  };
}
