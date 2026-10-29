import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { logoutUser, readAccessToken, readUser, sessionHinted } from '../lib/auth.js';
import * as authService from '../services/authService.js';
import { clearConversationDeviceState } from '../services/conversationService.js';
import { unregisterPushSubscription } from '../services/notificationService.js';
import { ApiError, NetworkError, restoreSession, SESSION_ENDED_EVENT } from '../services/http.js';
import { primeMeBootstrap } from '../services/meBootstrapService.js';

const AuthContext = createContext(null);

async function removePushSubscription() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await unregisterPushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readUser());
  const [loading, setLoading] = useState(() => Boolean(user) || sessionHinted());

  const sessionGen = useRef(0);

  useEffect(() => {
    if (!loading) return undefined;
    let cancelled = false;
    const mine = sessionGen.current;
    const stale = () => cancelled || sessionGen.current !== mine;
    (async () => {
      try {
        if (!readAccessToken() && !(sessionHinted() && await restoreSession())) {
          if (!stale()) {
            logoutUser();
            setUser(null);
          }
          return;
        }
        const fresh = await authService.getMe();
        if (!stale()) setUser(fresh ?? null);
      } catch (err) {
        const answered = !(err instanceof NetworkError) && !(err instanceof ApiError && err.status !== 401);
        if (!stale() && answered) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onEnded = () => {
      sessionGen.current += 1;
      setUser(null);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);

  const login = useCallback(async (data) => {
    sessionGen.current += 1;
    const who = await authService.login(data);
    primeMeBootstrap();
    setUser(who);
    return who;
  }, []);
  const register = useCallback(async (data) => {
    sessionGen.current += 1;
    const { user: who, wasNew } = await authService.register(data);
    primeMeBootstrap();
    setUser(who);
    return wasNew;
  }, []);
  const staffVerify = useCallback(async (data) => {
    sessionGen.current += 1;
    const who = await authService.staffVerify(data);
    primeMeBootstrap();
    setUser(who);
    return who;
  }, []);
  const staffConfirm = useCallback(async (data) => {
    sessionGen.current += 1;
    const result = await authService.staffConfirm(data);
    primeMeBootstrap();
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    sessionGen.current += 1;
    setUser(null);
    try {
      await removePushSubscription();
      await clearConversationDeviceState();
      localStorage.removeItem('draazy.listings.lastSearch.v1');
      localStorage.removeItem('draazy.flatmates.lastSearch.v1');
      Object.keys(localStorage)
        .filter((key) => key.startsWith('dzDraft:') || key.startsWith('draazyOwnerKYC:'))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
    }
    await authService.logout();
  }, []);

  const update = useCallback(async (patch) => {
    sessionGen.current += 1;
    setUser(await authService.updateMe(patch));
  }, []);

  const refreshUser = useCallback(async () => {
    const mine = sessionGen.current;
    try {
      const fresh = await authService.getMe();
      if (fresh && sessionGen.current === mine) {
        setUser(fresh);
        return fresh;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[auth] background profile refresh failed', err);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isIn: !!user,
      role: user?.role ?? null,
      hasEverListed: (user?.listingsCount ?? 0) > 0,
      login,
      register,
      staffVerify,
      staffConfirm,
      logout,
      update,
      refreshUser,
    }),
    [user, loading, login, register, staffVerify, staffConfirm, logout, update, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
