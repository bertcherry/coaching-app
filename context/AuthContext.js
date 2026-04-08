import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store'; 

const AuthContext = createContext(null);
const API = 'https://auth-worker.bert-m-cherry.workers.dev';

// Decode a JWT payload without a library (it's just base64)
function decodeJWT(token) {
  const payload = token.split('.')[1];
  return JSON.parse(atob(payload));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // decoded JWT payload
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On app start, try to restore session from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const refresh = await SecureStore.getItemAsync('refreshToken');
        if (refresh) {
          const res = await fetch(`${API}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: refresh }),
          });
          if (res.ok) {
            const { accessToken: at } = await res.json();
            setAccessToken(at);
            setUser(decodeJWT(at));
          } else {
            await SecureStore.deleteItemAsync('refreshToken');
          }
        }
      } catch (e) {
        console.error('Session restore failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
          
    if (!res.ok) {
      console.log(res);
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const { accessToken: at, refreshToken: rt } = await res.json();
    await SecureStore.setItemAsync('refreshToken', rt);
    setAccessToken(at);
    setUser(decodeJWT(at));
  };

  const signOut = async () => {
    try {
      const rt = await SecureStore.getItemAsync('refreshToken');
      if (rt) {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
      }
    } finally {
      await SecureStore.deleteItemAsync('refreshToken');
      setAccessToken(null);
      setUser(null);
    }
  };

  // Attach this to all authenticated API calls
  const authFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) {
      // Access token expired — try refresh
      const rt = await SecureStore.getItemAsync('refreshToken');
      if (!rt) { signOut(); return res; }
      const refreshRes = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!refreshRes.ok) { signOut(); return res; }
      const { accessToken: newAt } = await refreshRes.json();
      setAccessToken(newAt);
      setUser(decodeJWT(newAt));
      // Retry original request with new token
      return fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${newAt}` },
      });
    }
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, signIn, signOut, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);