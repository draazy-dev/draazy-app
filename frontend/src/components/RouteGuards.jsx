import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdminFlags } from '../context/AdminFlagsContext.jsx';
import { useAppFlags } from '../context/AppFlagsContext.jsx';
import { canAccessModule, portalBase } from '../lib/adminModules.js';

function GuardPending() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const { isIn, loading } = useAuth();
  const location = useLocation();
  if (loading) return <GuardPending />;
  if (!isIn) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

export function RoleRoute({ roles, redirect = '/staff-login', children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <GuardPending />;
  if (!user) return <Navigate to={`${redirect}?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={redirect} replace />;
  return children;
}

export function FlagRoute({ flag, children }) {
  const { user } = useAuth();
  const { tabEnabled } = useAdminFlags();
  if (!tabEnabled(flag)) return <Navigate to={portalBase(user)} replace />;
  return children;
}

export function ModuleRoute({ moduleKey, children }) {
  const { user, loading: authLoading } = useAuth();
  if (authLoading) return <GuardPending />;
  if (!canAccessModule(user, moduleKey)) return <Navigate to={portalBase(user)} replace />;
  return children;
}

export function AppFlagRoute({ flag, children }) {
  const { flagEnabled } = useAppFlags();
  if (!flagEnabled(flag)) return <Navigate to="/" replace />;
  return children;
}
