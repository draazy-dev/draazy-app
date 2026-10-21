import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import InlineOtpSheet from '../components/auth/InlineOtpSheet.jsx';
import { useAuth } from './AuthContext.jsx';

const SignInGateContext = createContext(null);

// The sheet pops its own history entry on close; acting before that pop lands would have it pop the action's entry.
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
  // `gate` outlives the close so the sheet stays mounted: an unmounted sheet never pops its history entry.
  const [gate, setGate] = useState(null);
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(null);

  const openGate = useCallback((next) => { setGate(next); setOpen(true); }, []);

  // Resume only once AuthContext has committed the user, so the action's requests carry the new session.
  useEffect(() => {
    if (!verified || !isIn) return;
    setVerified(null);
    const here = location.pathname + location.search + location.hash;
    // A different `next` carries the intent in its URL; resuming would act on the page being left.
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
