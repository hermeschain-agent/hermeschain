/**
 * Injected into the page's main world by the content script. Exposes
 * `window.hermes`, a minimal EIP-1193-style provider. It holds NO keys and
 * NO extension privileges — every call is relayed (via window.postMessage) to
 * the content script, then the background, where approval + signing happen.
 */
(() => {
  const TO_CONTENT = 'hermes:to-content';
  const TO_PAGE = 'hermes:to-page';
  const EVENT = 'hermes:event';

  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || !e.data || typeof e.data !== 'object') return;
    const data = e.data as Record<string, unknown>;
    if (data.channel === TO_PAGE) {
      const slot = pending.get(data.id as number);
      if (!slot) return;
      pending.delete(data.id as number);
      if (data.error) slot.reject(new Error(String(data.error)));
      else slot.resolve(data.result);
    } else if (data.channel === EVENT) {
      const set = listeners.get(data.event as string);
      if (set) for (const cb of set) try { cb(data.payload); } catch { /* ignore */ }
    }
  });

  function request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      window.postMessage({ channel: TO_CONTENT, id, method, params }, '*');
    });
  }

  const hermes = {
    isHermes: true,
    /** Request connection; returns the connected account address(es). */
    connect: () => request('connect') as Promise<{ accounts: string[] }>,
    getAccounts: () => request('getAccounts') as Promise<{ accounts: string[] }>,
    /** Ask the user to approve, then sign + broadcast a transfer. */
    signAndSend: (tx: { to: string; amount: string | number }) =>
      request('signAndSend', tx) as Promise<{ txHash?: string }>,
    disconnect: () => request('disconnect'),
    request: ({ method, params }: { method: string; params?: unknown }) => request(method, params),
    on(event: string, cb: (payload: unknown) => void) {
      (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(cb);
    },
    removeListener(event: string, cb: (payload: unknown) => void) {
      listeners.get(event)?.delete(cb);
    },
  };

  try {
    Object.defineProperty(window, 'hermes', { value: Object.freeze(hermes), configurable: false });
  } catch {
    (window as unknown as { hermes: unknown }).hermes = hermes;
  }
  window.dispatchEvent(new Event('hermes#initialized'));
})();
