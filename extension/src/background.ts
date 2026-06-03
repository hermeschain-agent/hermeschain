/**
 * Background service worker — the single owner of the wallet. It hosts the
 * controller (so the unlocked seed lives in ONE place, shared by the popup and,
 * later, the dapp provider) and answers RPC messages. MV3 may evict this
 * worker; the wallet then auto-locks and the popup re-prompts for the password.
 */
import * as wallet from './wallet/wallet.ts';
import {
  WALLET_MESSAGE,
  type WalletRequest,
  type WalletResponse,
  type WalletStatus,
} from './messages.ts';

async function status(): Promise<WalletStatus> {
  const unlocked = wallet.isUnlocked();
  return {
    initialized: await wallet.isInitialized(),
    unlocked,
    accounts: unlocked ? wallet.getAccounts().map((a) => ({ address: a.address, index: a.index })) : [],
    activeAddress: unlocked ? wallet.getActiveAccount().address : null,
  };
}

async function handle(req: WalletRequest): Promise<unknown> {
  switch (req.type) {
    case 'getStatus':
      return status();
    case 'createWallet':
      return wallet.createWallet(req.password);
    case 'importWallet':
      return { account: await wallet.importWallet(req.password, req.mnemonic) };
    case 'unlock':
      await wallet.unlock(req.password);
      return status();
    case 'lock':
      wallet.lock();
      return {};
    case 'addAccount':
      return { account: await wallet.addAccount() };
    case 'setActiveAccount':
      await wallet.setActiveAccount(req.index);
      return status();
    case 'signTransfer':
      return wallet.signTransfer(req.toAddress, req.amount, req.nonce);
    case 'exportMnemonic':
      return { mnemonic: await wallet.exportMnemonic(req.password) };
    case 'reset':
      await wallet.reset();
      return {};
    default:
      throw new Error('unknown request');
  }
}

chrome.runtime.onMessage.addListener((envelope, _sender, sendResponse) => {
  if (!envelope || envelope.channel !== WALLET_MESSAGE) return false;
  handle(envelope.request as WalletRequest)
    .then((data) => sendResponse({ ok: true, data } satisfies WalletResponse))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) } satisfies WalletResponse));
  return true; // async response
});
