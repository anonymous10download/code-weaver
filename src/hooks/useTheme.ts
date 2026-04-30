import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Read the persisted theme from localStorage. Defaults to `light` when no
 * preference is stored (per product requirement: white mode by default).
 */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

/** Apply the given theme to the <html> element. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = theme;
}

/**
 * React hook for reading and updating the active theme. Persists to
 * localStorage and stays in sync across tabs / hook instances.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  // Keep DOM in sync (covers initial mount + any state changes).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync across tabs / windows and across multiple hook instances.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'dark' || e.newValue === 'light') {
        setThemeState(e.newValue);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail === 'dark' || detail === 'light') setThemeState(detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('themechange', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('themechange', onCustom as EventListener);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    setThemeState(t);
    window.dispatchEvent(new CustomEvent<Theme>('themechange', { detail: t }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

