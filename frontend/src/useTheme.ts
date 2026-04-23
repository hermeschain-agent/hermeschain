import { useEffect, useState } from 'react';

export type Theme = 'hermes' | 'black';

const STORAGE_KEY = 'hermeschain-theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'hermes';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'hermes' || saved === 'black') return saved;
  } catch {
    /* noop */
  }
  return 'hermes';
}

/**
 * Hermes-theme / black-theme toggle. Default is the Hermes teal/cream
 * canvas; toggle flips to pure black. Writes `data-theme` on <html>
 * (blank for Hermes, "black" for dark) so the default palette in :root
 * keeps ruling.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => readInitial());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'black') {
      root.setAttribute('data-theme', 'black');
    } else {
      root.removeAttribute('data-theme');
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const toggle = () =>
    setTheme((prev) => (prev === 'hermes' ? 'black' : 'hermes'));

  return [theme, toggle];
}
