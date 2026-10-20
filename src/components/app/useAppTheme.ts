'use client';

import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'recordweb-theme';
const THEME_CHANGE_EVENT = 'recordweb-theme-change';

function themeFromDocument(): AppTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark';
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>('dark');

  useEffect(() => {
    const synchronize = () => setThemeState(themeFromDocument());
    const synchronizeStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isAppTheme(event.newValue)) return;
      document.documentElement.dataset.theme = event.newValue;
      setThemeState(event.newValue);
    };

    synchronize();
    window.addEventListener(THEME_CHANGE_EVENT, synchronize);
    window.addEventListener('storage', synchronizeStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, synchronize);
      window.removeEventListener('storage', synchronizeStorage);
    };
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(themeFromDocument() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
