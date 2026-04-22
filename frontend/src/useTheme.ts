import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'hermeschain-theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* noop */
  }
  const prefersLight =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

/**
 * Tiny theme state hook. Writes `data-theme` onto <html> and persists the
 * choice in localStorage. The FOUC-prevention script in index.html sets
 * the attribute before first paint so React picks up in the correct mode.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => readInitial());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const toggle = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return [theme, toggle];
}
