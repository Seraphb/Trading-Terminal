import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

const ThemeContext = createContext({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }) {
  const auth = useAuth();
  const activeTheme = auth?.user?.theme === 'light' ? 'light' : 'dark';
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('qt-theme') || activeTheme || 'dark';
    } catch {
      return activeTheme || 'dark';
    }
  });

  useEffect(() => {
    setTheme(activeTheme);
  }, [activeTheme, auth?.activeProfileId]);

  useEffect(() => {
    try { localStorage.setItem('qt-theme', theme); } catch {}
    document.documentElement.setAttribute('data-qt-theme', theme);
  }, [theme]);

  const toggle = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      auth?.updateProfile?.({ theme: next });
      return next;
    });
  };

  const value = useMemo(() => ({ theme, toggle }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
