const configuredApiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const API_BASE = configuredApiBase;

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
