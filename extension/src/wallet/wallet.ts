/**
 * Wallet controller — the in-memory + persisted state machine the popup and
 * the dapp provider both drive. Ties together the keyring (key derivation +
 * signing), the encrypted vault (at-rest secret), and storage.
 *
 * The unlocked seed lives in module memory only; in the MV3 service worker
 * that memory is cleared when the worker is evicted, so the wallet auto-locks
 * — a feature, not a bug. Callers re-`unlock()` with the password.
 */
import {
  type HermesAccount,
  type SignedSend,
  accountFromMnemonic,
  generateMnemonicPhrase,
  isValidMnemonic,
  signSend,
} from '../crypto/keyring.ts';
import { type EncryptedVault, encryptVault, decryptVault } from '../crypto/vault.ts';
import { getItem, setItem, removeItem } from './storage.ts';

const VAULT_KEY = 'hermes.vault.v1';
const META_KEY = 'hermes.meta.v1';

interface WalletMeta {
  accountCount: number;
  activeIndex: number;
}

let unlockedMnemonic: string | null = null;
let accounts: HermesAccount[] = [];
let activeIndex = 0;

export async function isInitialized(): Promise<boolean> {
  return Boolean(await getItem<EncryptedVault>(VAULT_KEY));
}

export function isUnlocked(): boolean {
  return unlockedMnemonic !== null;
}

async function persist(password: string, mnemonic: string, accountCount: number): Promise<void> {
  await setItem(VAULT_KEY, await encryptVault(password, mnemonic));
  await setItem(META_KEY, { accountCount, activeIndex: 0 } satisfies WalletMeta);
}

/** Create a brand-new wallet. Returns the seed phrase ONCE for the user to back up. */
export async function createWallet(password: string): Promise<{ mnemonic: string; account: HermesAccount }> {
  if (await isInitialized()) throw new Error('a wallet already exists');
  const mnemonic = generateMnemonicPhrase(12);
  await persist(password, mnemonic, 1);
  await unlock(password);
  return { mnemonic, account: accounts[0] };
}

/** Restore a wallet from an existing seed phrase. */
export async function importWallet(password: string, mnemonic: string): Promise<HermesAccount> {
  if (!isValidMnemonic(mnemonic)) throw new Error('invalid recovery phrase');
  await persist(password, mnemonic.trim(), 1);
  await unlock(password);
  return accounts[0];
}

export async function unlock(password: string): Promise<HermesAccount[]> {
  const vault = await getItem<EncryptedVault>(VAULT_KEY);
  if (!vault) throw new Error('no wallet to unlock');
  const mnemonic = await decryptVault(password, vault); // throws on wrong password
  const meta = (await getItem<WalletMeta>(META_KEY)) ?? { accountCount: 1, activeIndex: 0 };
  unlockedMnemonic = mnemonic;
  accounts = [];
  for (let i = 0; i < Math.max(1, meta.accountCount); i++) {
    accounts.push(await accountFromMnemonic(mnemonic, i));
  }
  activeIndex = Math.min(Math.max(0, meta.activeIndex), accounts.length - 1);
  return accounts;
}

export function lock(): void {
  unlockedMnemonic = null;
  accounts = [];
  activeIndex = 0;
}

function assertUnlocked(): void {
  if (!unlockedMnemonic) throw new Error('wallet is locked');
}

export function getAccounts(): HermesAccount[] {
  return accounts;
}

export function getActiveAccount(): HermesAccount {
  assertUnlocked();
  return accounts[activeIndex];
}

export async function setActiveAccount(index: number): Promise<void> {
  if (index < 0 || index >= accounts.length) throw new Error('no such account');
  activeIndex = index;
  await setItem(META_KEY, { accountCount: accounts.length, activeIndex } satisfies WalletMeta);
}

export async function addAccount(): Promise<HermesAccount> {
  assertUnlocked();
  const account = await accountFromMnemonic(unlockedMnemonic!, accounts.length);
  accounts.push(account);
  await setItem(META_KEY, { accountCount: accounts.length, activeIndex } satisfies WalletMeta);
  return account;
}

/** Sign a transfer from the active account (backend-verifiable). */
export async function signTransfer(
  toAddress: string,
  amount: number | string,
  nonce: number,
): Promise<SignedSend> {
  return signSend(getActiveAccount(), { toAddress, amount, nonce });
}

/** Reveal the seed phrase for backup (requires the password — never cached). */
export async function exportMnemonic(password: string): Promise<string> {
  const vault = await getItem<EncryptedVault>(VAULT_KEY);
  if (!vault) throw new Error('no wallet');
  return decryptVault(password, vault);
}

/** Wipe the wallet from this device. Irreversible without the seed phrase. */
export async function reset(): Promise<void> {
  lock();
  await removeItem(VAULT_KEY);
  await removeItem(META_KEY);
}
