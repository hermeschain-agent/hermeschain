/** Message protocol between the popup/content scripts and the background
 *  service worker that hosts the wallet. */

export type WalletRequest =
  | { type: 'getStatus' }
  | { type: 'createWallet'; password: string }
  | { type: 'importWallet'; password: string; mnemonic: string }
  | { type: 'unlock'; password: string }
  | { type: 'lock' }
  | { type: 'addAccount' }
  | { type: 'setActiveAccount'; index: number }
  | { type: 'signTransfer'; toAddress: string; amount: string; nonce: number }
  | { type: 'exportMnemonic'; password: string }
  | { type: 'reset' };

export interface WalletStatus {
  initialized: boolean;
  unlocked: boolean;
  accounts: { address: string; index: number }[];
  activeAddress: string | null;
}

export interface WalletResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const WALLET_MESSAGE = 'hermes-wallet-rpc';
