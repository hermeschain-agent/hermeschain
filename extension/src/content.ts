/**
 * Content script (isolated world). Injects inpage.js into the page's main world
 * and relays provider requests to the background, plus pushes wallet events
 * (accountsChanged / disconnect) back to the page.
 */
import { PROVIDER_MESSAGE, type WalletResponse } from './messages.ts';

const TO_CONTENT = 'hermes:to-content';
const TO_PAGE = 'hermes:to-page';
const EVENT = 'hermes:event';

// Inject the page-world provider.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inpage.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Page → background → page.
window.addEventListener('message', async (e: MessageEvent) => {
  if (e.source !== window || !e.data || (e.data as Record<string, unknown>).channel !== TO_CONTENT) return;
  const { id, method, params } = e.data as { id: number; method: string; params?: unknown };
  try {
    const res = (await chrome.runtime.sendMessage({
      channel: PROVIDER_MESSAGE,
      method,
      params,
      origin: location.origin,
    })) as WalletResponse;
    if (res?.ok) window.postMessage({ channel: TO_PAGE, id, result: res.data }, '*');
    else window.postMessage({ channel: TO_PAGE, id, error: res?.error || 'request failed' }, '*');
  } catch (err) {
    window.postMessage({ channel: TO_PAGE, id, error: String((err as Error)?.message ?? err) }, '*');
  }
});

// Background → page events (e.g. accountsChanged on lock/disconnect).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.channel === EVENT) {
    window.postMessage({ channel: EVENT, event: msg.event, payload: msg.payload }, '*');
  }
});
