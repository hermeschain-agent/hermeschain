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

// ---- Dapp provider (window.hermes) -----------------------------------------

export const PROVIDER_MESSAGE = 'hermes-provider-rpc';
export const APPROVAL_MESSAGE = 'hermes-approval-rpc';

export type ProviderMethod = 'connect' | 'getAccounts' | 'signAndSend' | 'disconnect';

export interface PendingApproval {
  id: string;
  origin: string;
  kind: 'connect' | 'signAndSend';
  /** for signAndSend: { to, amount } */
  payload: { to?: string; amount?: string | number };
}

export type ApprovalRequest =
  | { type: 'getPending'; id: string }
  | { type: 'resolve'; id: string; approved: boolean };
