/** Who is signed in. One fetch of /auth/me at boot, then explicit transitions. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | signedOut | signedIn
  const [bootError, setBootError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.me(controller.signal)
      .then((data) => {
        setUser(data.user);
        setStatus(data.user ? 'signedIn' : 'signedOut');
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setBootError(error.message);
        setStatus('signedOut');
      });
    return () => controller.abort();
  }, []);

  const adopt = useCallback((data) => {
    setUser(data.user);
    setStatus('signedIn');
    setBootError(null);
    return data.user;
  }, []);

  const signIn = useCallback(async (credentials) => adopt(await api.login(credentials)), [adopt]);
  const signUp = useCallback(async (details) => adopt(await api.register(details)), [adopt]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus('signedOut');
    }
  }, []);

  const rename = useCallback(async (name) => {
    const data = await api.rename(name);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, status, bootError, signIn, signUp, signOut, rename }),
    [user, status, bootError, signIn, signUp, signOut, rename],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
