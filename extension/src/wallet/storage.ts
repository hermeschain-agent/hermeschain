/**
 * Minimal async key/value storage over chrome.storage.local, with an in-memory
 * fallback for non-extension contexts (unit tests, dev). chrome.storage.local
 * persists across browser restarts but is NOT synced, which is what a wallet
 * vault wants.
 */

const mem = new Map<string, unknown>();

function chromeLocal(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const area = chromeLocal();
  if (area) {
    const result = await area.get(key);
    return result[key] as T | undefined;
  }
  return mem.get(key) as T | undefined;
}

export async function setItem(key: string, value: unknown): Promise<void> {
  const area = chromeLocal();
  if (area) {
    await area.set({ [key]: value });
    return;
  }
  mem.set(key, value);
}

export async function removeItem(key: string): Promise<void> {
  const area = chromeLocal();
  if (area) {
    await area.remove(key);
    return;
  }
  mem.delete(key);
}
