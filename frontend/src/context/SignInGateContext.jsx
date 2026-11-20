import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import InlineOtpSheet from '../components/auth/InlineOtpSheet.jsx';
import { useAuth } from './AuthContext.jsx';

const SignInGateContext = createContext(null);

function afterSheetPops(fn) {
  if (!window.history.state?.__dzInlineOtpGate) { fn(); return; }
  let fallback = 0;
  const run = () => { window.removeEventListener('popstate', run); window.clearTimeout(fallback); fn(); };
  window.addEventListener('popstate', run);
  fallback = window.setTimeout(run, 1000);
}

export function SignInGateProvider({ children }) {
  const { isIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [gate, setGate] = useState(null);
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(null);

  const openGate = useCallback((next) => { setGate(next); setOpen(true); }, []);

  useEffect(() => {
    if (!verified || !isIn) return;
    setVerified(null);
    const here = location.pathname + location.search + location.hash;
    if (verified.next && verified.next !== here) { navigate(verified.next); return; }
    try {
      verified.resume?.();
    } catch (err) {
      console.error('[sign-in gate] resume failed', err);
    }
  }, [isIn, location, navigate, verified]);

  return (
    <SignInGateContext.Provider value={openGate}>
      {children}
      {gate ? (
        <InlineOtpSheet
          open={open}
          reason={gate.reason}
          onClose={() => setOpen(false)}
          onVerified={() => { setOpen(false); afterSheetPops(() => setVerified(gate)); }}
        />
      ) : null}
    </SignInGateContext.Provider>
  );
}

export function useOpenSignInGate() {
  const open = useContext(SignInGateContext);
  if (!open) throw new Error('useOpenSignInGate must be used within SignInGateProvider');
  return open;
}
