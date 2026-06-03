const configuredApiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Resolution order:
//   1. VITE_API_URL when explicitly set (e.g. point local dev at a remote API)
//   2. http://localhost:4000 in local dev (Vite serves :5173, the API runs on :4000)
//   3. '' (same-origin) in production, where the backend serves the built frontend
const devFallback =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : '';

export const API_BASE = configuredApiBase || devFallback;

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
