import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_CONTACT_GATE } from '../../../lib/contact.js';
import { contactStatus } from '../../../services/contactService.js';

export function useContactGate(propertyId, refreshKey = '') {
  const [gate, setGate] = useState(NO_CONTACT_GATE);
  const [loading, setLoading] = useState(Boolean(propertyId));
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const ask = ++latest.current;
    if (!propertyId) {
      setGate(NO_CONTACT_GATE);
      setLoading(false);
      return NO_CONTACT_GATE;
    }
    const next = await contactStatus(propertyId);
    if (ask === latest.current) {
      setGate(next);
      setLoading(false);
    }
    return next;
  }, [propertyId]);

  useEffect(() => {
    const ask = ++latest.current;
    const alive = () => ask === latest.current;
    setLoading(Boolean(propertyId));

    if (!propertyId) {
      setGate(NO_CONTACT_GATE);
      setLoading(false);
      return undefined;
    }

    contactStatus(propertyId)
      .then((next) => {
        if (alive()) setGate(next);
      })
      .catch(() => {
        if (alive()) setGate(NO_CONTACT_GATE);
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });

    return () => {
      latest.current += 1;
    };
  }, [propertyId, refreshKey]);

  return { gate, loading, setGate, refresh };
}
