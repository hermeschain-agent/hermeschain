/**
 * Background service worker — the single owner of the wallet. It hosts the
 * controller (one keyholder, shared by the popup and the dapp provider),
 * gates dapps behind a per-origin connection allow-list, and routes every
 * connect/sign through an approval popup. MV3 may evict this worker; the wallet
 * then auto-locks and the popup re-prompts for the password.
 */
import * as wallet from './wallet/wallet.ts';
import { fetchSnapshot, submitSend } from './wallet/api.ts';
import { getItem, setItem } from './wallet/storage.ts';
import {
  WALLET_MESSAGE,
  PROVIDER_MESSAGE,
  APPROVAL_MESSAGE,
  type WalletRequest,
  type WalletResponse,
  type WalletStatus,
  type PendingApproval,
  type ApprovalRequest,
} from './messages.ts';

const CONNECTIONS_KEY = 'hermes.connections.v1';

// ---- wallet RPC (popup) ----------------------------------------------------

async function status(): Promise<WalletStatus> {
  const unlocked = wallet.isUnlocked();
  return {
    initialized: await wallet.isInitialized(),
    unlocked,
    accounts: unlocked ? wallet.getAccounts().map((a) => ({ address: a.address, index: a.index })) : [],
    activeAddress: unlocked ? wallet.getActiveAccount().address : null,
  };
}

async function handleWallet(req: WalletRequest): Promise<unknown> {
  switch (req.type) {
    case 'getStatus': return status();
    case 'createWallet': return wallet.createWallet(req.password);
    case 'importWallet': return { account: await wallet.importWallet(req.password, req.mnemonic) };
    case 'unlock': await wallet.unlock(req.password); return status();
    case 'lock': wallet.lock(); return {};
    case 'addAccount': return { account: await wallet.addAccount() };
    case 'setActiveAccount': await wallet.setActiveAccount(req.index); return status();
    case 'signTransfer': return wallet.signTransfer(req.toAddress, req.amount, req.nonce);
    case 'exportMnemonic': return { mnemonic: await wallet.exportMnemonic(req.password) };
    case 'reset': await wallet.reset(); return {};
    default: throw new Error('unknown request');
  }
}

// ---- connection allow-list -------------------------------------------------

async function connectedOrigins(): Promise<string[]> {
  return (await getItem<string[]>(CONNECTIONS_KEY)) ?? [];
}
async function isConnected(origin: string): Promise<boolean> {
  return (await connectedOrigins()).includes(origin);
}
async function addConnection(origin: string): Promise<void> {
  const list = await connectedOrigins();
  if (!list.includes(origin)) {
    list.push(origin);
    await setItem(CONNECTIONS_KEY, list);
  }
}
async function removeConnection(origin: string): Promise<void> {
  await setItem(CONNECTIONS_KEY, (await connectedOrigins()).filter((o) => o !== origin));
}

// ---- approval popups -------------------------------------------------------

interface PendingSlot extends PendingApproval {
  resolve: () => void;
  reject: (e: Error) => void;
  windowId?: number;
}
const pending = new Map<string, PendingSlot>();

function requestApproval(
  origin: string,
  kind: PendingApproval['kind'],
  payload: PendingApproval['payload'],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const slot: PendingSlot = { id, origin, kind, payload, resolve, reject };
    pending.set(id, slot);
    chrome.windows.create(
      { url: chrome.runtime.getURL(`popup.html#approve=${id}`), type: 'popup', width: 380, height: 620 },
      (win) => {
        if (win?.id) slot.windowId = win.id;
      },
    );
  });
}

function settle(id: string, approved: boolean): void {
  const slot = pending.get(id);
  if (!slot) return;
  pending.delete(id);
  if (slot.windowId) chrome.windows.remove(slot.windowId).catch(() => {});
  if (approved) slot.resolve();
  else slot.reject(new Error('user rejected request'));
}

async function handleApproval(req: ApprovalRequest): Promise<unknown> {
  if (req.type === 'getPending') {
    const slot = pending.get(req.id);
    if (!slot) throw new Error('request expired');
    return { id: slot.id, origin: slot.origin, kind: slot.kind, payload: slot.payload, locked: !wallet.isUnlocked() };
  }
  settle(req.id, req.approved);
  return {};
}

// If a pending approval's window is closed without a decision, reject it.
chrome.windows.onRemoved.addListener((windowId) => {
  for (const slot of pending.values()) {
    if (slot.windowId === windowId) settle(slot.id, false);
  }
});

// ---- dapp provider ---------------------------------------------------------

async function handleProvider(method: string, params: { to?: string; amount?: string | number } | undefined, origin: string): Promise<unknown> {
  switch (method) {
    case 'connect': {
      if (!(await isConnected(origin))) {
        await requestApproval(origin, 'connect', {}); // throws if rejected
        await addConnection(origin);
      }
      if (!wallet.isUnlocked()) throw new Error('wallet is locked — open the Hermes extension to unlock');
      return { accounts: [wallet.getActiveAccount().address] };
    }
    case 'getAccounts': {
      if (!(await isConnected(origin)) || !wallet.isUnlocked()) return { accounts: [] };
      return { accounts: [wallet.getActiveAccount().address] };
    }
    case 'signAndSend': {
      if (!(await isConnected(origin))) throw new Error('not connected — call hermes.connect() first');
      if (!wallet.isUnlocked()) throw new Error('wallet is locked');
      const to = String(params?.to ?? '');
      const amount = params?.amount;
      if (!to || amount == null) throw new Error('to and amount are required');
      await requestApproval(origin, 'signAndSend', { to, amount }); // throws if rejected
      const snap = await fetchSnapshot(wallet.getActiveAccount().address);
      const signed = await wallet.signTransfer(to, amount, snap.nonce);
      const result = (await submitSend(signed)) as { txHash?: string };
      return { txHash: result?.txHash, signed };
    }
    case 'disconnect': {
      await removeConnection(origin);
      return {};
    }
    default:
      throw new Error(`unsupported method: ${method}`);
  }
}

// ---- router ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  const reply = (p: Promise<unknown>): true => {
    p.then((data) => sendResponse({ ok: true, data } satisfies WalletResponse)).catch((e) =>
      sendResponse({ ok: false, error: String(e?.message ?? e) } satisfies WalletResponse),
    );
    return true;
  };
  switch ((msg as { channel?: string }).channel) {
    case WALLET_MESSAGE:
      return reply(handleWallet((msg as { request: WalletRequest }).request));
    case PROVIDER_MESSAGE: {
      const m = msg as { method: string; params?: { to?: string; amount?: string | number }; origin: string };
      return reply(handleProvider(m.method, m.params, sender.origin ?? m.origin));
    }
    case APPROVAL_MESSAGE:
      return reply(handleApproval((msg as { request: ApprovalRequest }).request));
    default:
      return false;
  }
});
