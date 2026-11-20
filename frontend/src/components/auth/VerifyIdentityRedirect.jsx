import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

export default function VerifyIdentityRedirect({
  onClose,
  source = 'unknown',
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    navigate('/verify-identity', {
      state: {
        source,
        returnTo: location.pathname + location.search,
      },
    });
    onClose?.();
  }, [location.pathname, location.search, navigate, onClose, source]);

  return null;
}
