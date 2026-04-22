/**
 * Canonical Account record.
 *
 * Phase-3 / account-model / step-2. Typed wrapper around on-state
 * account data — balance, nonce, codeHash, storageRoot. codeHash and
 * storageRoot are empty strings for EOAs (externally-owned accounts);
 * contract accounts populate them.
 */

export interface Account {
  readonly address: string;
  readonly balance: string;      // BigInt-safe unsigned integer
  readonly nonce: number;
  readonly codeHash: string;     // '' for EOAs, 32-byte hex for contracts
  readonly storageRoot: string;  // '' for EOAs, root of storage sub-trie otherwise
}

const UINT_STRING = /^\d+$/;
const HEX32 = /^[0-9a-f]{64}$/;

export function makeAccount(input: {
  address: string;
  balance: string;
  nonce: number;
  codeHash?: string;
  storageRoot?: string;
}): Account {
  if (!input.address) throw new Error('account: address required');
  if (!UINT_STRING.test(input.balance)) {
    throw new Error('account: balance must be unsigned integer string');
  }
  if (!Number.isInteger(input.nonce) || input.nonce < 0) {
    throw new Error('account: nonce must be non-negative integer');
  }
  const codeHash = input.codeHash ?? '';
  const storageRoot = input.storageRoot ?? '';
  if (codeHash && !HEX32.test(codeHash)) {
    throw new Error(`account: codeHash must be 32-byte hex or empty, got "${codeHash}"`);
  }
  if (storageRoot && !HEX32.test(storageRoot)) {
    throw new Error('account: storageRoot must be 32-byte hex or empty');
  }
  if ((codeHash === '') !== (storageRoot === '')) {
    throw new Error('account: codeHash and storageRoot must both be set or both empty');
  }

  return Object.freeze({
    address: input.address,
    balance: input.balance,
    nonce: input.nonce,
    codeHash,
    storageRoot,
  });
}

export function isContract(account: Account): boolean {
  return account.codeHash !== '';
}

export function addBalance(account: Account, delta: string): Account {
  const next = (BigInt(account.balance) + BigInt(delta)).toString();
  if (next.startsWith('-')) {
    throw new Error(`account: balance underflow (${account.balance} + ${delta})`);
  }
  return makeAccount({ ...account, balance: next });
}
