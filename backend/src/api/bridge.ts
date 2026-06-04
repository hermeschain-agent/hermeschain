/**
 * Cross-chain bridge API.
 *
 * Hermeschain is the source chain: assets are LOCKED here, an M-of-N relayer
 * set ATTESTS the lock, and a wrapped representation is MINTED on the
 * destination chain (lock-and-mint). The lock is recorded as the canonical
 * `BridgeLockEvent` (see ../hermes-generated/bridge-lock-event-record), the
 * same shape relayers observe in the design. A transfer's lifecycle
 * (locking → attesting → minting → completed) is a deterministic function of
 * elapsed time, so status is computed on read with no background worker and is
 * consistent across the web + worker processes.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../database/db';
import {
  makeLockEvent,
  type BridgeLockEvent,
} from '../hermes-generated/bridge-lock-event-record';

const bridgeRouter = Router();

// ── Bridge configuration ───────────────────────────────────────────────────
const SOURCE_CHAIN = { id: 'hermeschain', name: 'Hermeschain', short: 'HERMES' };
const DESTINATION_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', short: 'ETH', wrapped: 'hHERMES' },
  { id: 'solana', name: 'Solana', short: 'SOL', wrapped: 'hHERMES' },
  { id: 'bnb', name: 'BNB Chain', short: 'BNB', wrapped: 'hHERMES' },
];
const RELAYER_COUNT = 7; // N
const RELAYER_THRESHOLD = 5; // M-of-N attestation
const FEE_BPS = 10; // 0.10% bridge fee
const BLOCK_TIME_MS = 2000; // modeled confirmation cadence
const CONFIRMATIONS_REQUIRED = 6;
const SIG_INTERVAL_MS = 1500; // ~one relayer signature per 1.5s
const LOCK_CONFIRM_MS = BLOCK_TIME_MS * CONFIRMATIONS_REQUIRED; // ~12s
const ATTEST_MS = SIG_INTERVAL_MS * RELAYER_THRESHOLD; // ~7.5s
const MINT_MS = 2000;
const ETA_SECONDS = Math.round((LOCK_CONFIRM_MS + ATTEST_MS + MINT_MS) / 1000);

function randomHash(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Decimal string → integer base-units string (no float round-off). */
function toBaseUnits(amount: string, decimals = 18): string {
  const [whole = '0', frac = ''] = amount.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const combined = (whole.replace(/\D/g, '') + fracPadded).replace(/^0+/, '');
  return combined || '0';
}

interface BridgeStatus {
  phase: 'locking' | 'attesting' | 'minting' | 'completed';
  label: string;
  confirmations: number;
  confirmationsRequired: number;
  signatures: number;
  threshold: number;
  relayers: number;
  progress: number;
}

function computeStatus(createdAtMs: number, nowMs: number): BridgeStatus {
  const elapsed = Math.max(0, nowMs - createdAtMs);
  const base = {
    confirmationsRequired: CONFIRMATIONS_REQUIRED,
    threshold: RELAYER_THRESHOLD,
    relayers: RELAYER_COUNT,
  };
  if (elapsed < LOCK_CONFIRM_MS) {
    const confirmations = Math.min(
      CONFIRMATIONS_REQUIRED,
      Math.floor(elapsed / BLOCK_TIME_MS),
    );
    return {
      ...base,
      phase: 'locking',
      label: 'Locking on Hermeschain',
      confirmations,
      signatures: 0,
      progress: (elapsed / LOCK_CONFIRM_MS) * 0.45,
    };
  }
  const attestElapsed = elapsed - LOCK_CONFIRM_MS;
  const signatures = Math.min(
    RELAYER_THRESHOLD,
    Math.floor(attestElapsed / SIG_INTERVAL_MS) + 1,
  );
  if (signatures < RELAYER_THRESHOLD) {
    return {
      ...base,
      phase: 'attesting',
      label: `Relayer attestation ${signatures}/${RELAYER_THRESHOLD}`,
      confirmations: CONFIRMATIONS_REQUIRED,
      signatures,
      progress: 0.45 + (signatures / RELAYER_THRESHOLD) * 0.45,
    };
  }
  if (attestElapsed < ATTEST_MS + MINT_MS) {
    return {
      ...base,
      phase: 'minting',
      label: 'Minting on destination',
      confirmations: CONFIRMATIONS_REQUIRED,
      signatures: RELAYER_THRESHOLD,
      progress: 0.95,
    };
  }
  return {
    ...base,
    phase: 'completed',
    label: 'Completed',
    confirmations: CONFIRMATIONS_REQUIRED,
    signatures: RELAYER_THRESHOLD,
    progress: 1,
  };
}

function rowToTransfer(row: any, nowMs: number) {
  const createdAtMs = new Date(row.created_at).getTime();
  const status = computeStatus(createdAtMs, nowMs);
  const minted = status.phase === 'minting' || status.phase === 'completed';
  return {
    id: String(row.id),
    sourceChain: row.source_chain,
    destinationChain: row.destination_chain,
    asset: row.asset,
    amount: row.amount,
    sender: row.sender,
    recipient: row.recipient,
    nonce: Number(row.nonce),
    lockHeight: Number(row.lock_height),
    lockTxHash: row.lock_tx_hash,
    destinationTxHash: minted ? row.destination_tx_hash : null,
    createdAt: row.created_at,
    status,
  };
}

bridgeRouter.get('/config', (_req, res) => {
  res.json({
    sourceChain: SOURCE_CHAIN,
    destinationChains: DESTINATION_CHAINS,
    asset: 'HERMES',
    relayers: RELAYER_COUNT,
    threshold: RELAYER_THRESHOLD,
    feeBps: FEE_BPS,
    etaSeconds: ETA_SECONDS,
    confirmationsRequired: CONFIRMATIONS_REQUIRED,
  });
});

bridgeRouter.get('/transfers', async (req, res) => {
  try {
    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20),
    );
    const { rows } = await db.query(
      'SELECT * FROM bridge_transfers ORDER BY created_at DESC, id DESC LIMIT $1',
      [limit],
    );
    const now = Date.now();
    res.json({ transfers: rows.map((r) => rowToTransfer(r, now)) });
  } catch {
    res.json({ transfers: [] });
  }
});

bridgeRouter.post('/lock', async (req, res) => {
  try {
    const { toChain, amount, sender, recipient, asset, fromChain } =
      req.body ?? {};
    if (fromChain && fromChain !== SOURCE_CHAIN.id) {
      return res
        .status(400)
        .json({ error: 'Bridging is supported from Hermeschain only.' });
    }
    const dest = DESTINATION_CHAINS.find((c) => c.id === toChain);
    if (!dest) {
      return res.status(400).json({ error: 'Unsupported destination chain.' });
    }
    if (!sender || typeof sender !== 'string') {
      return res
        .status(400)
        .json({ error: 'A Hermeschain sender address is required.' });
    }
    if (!recipient || typeof recipient !== 'string') {
      return res
        .status(400)
        .json({ error: `A ${dest.name} recipient address is required.` });
    }
    const amountStr = String(amount ?? '').trim();
    if (!/^\d+(\.\d+)?$/.test(amountStr) || Number(amountStr) <= 0) {
      return res
        .status(400)
        .json({ error: 'Amount must be a positive number.' });
    }
    const amountBase = toBaseUnits(amountStr, 18);

    let lockHeight = 0;
    try {
      const r = await db.query('SELECT COALESCE(MAX(height), 0) AS h FROM blocks');
      lockHeight = Number(r.rows[0]?.h ?? 0);
    } catch {
      /* memory mode */
    }

    let nonce = 0;
    try {
      const r = await db.query(
        'SELECT COALESCE(MAX(nonce), -1) + 1 AS n FROM bridge_transfers WHERE sender = $1',
        [sender],
      );
      nonce = Number(r.rows[0]?.n ?? 0);
    } catch {
      /* memory mode */
    }

    const lockTxHash = randomHash();
    const destinationTxHash = randomHash();

    // Validate via the canonical bridge lock-event shape (throws on bad input).
    const lockEvent: BridgeLockEvent = makeLockEvent({
      sourceChainId: SOURCE_CHAIN.id,
      destinationChainId: dest.id,
      nonce,
      sender,
      recipient,
      asset: typeof asset === 'string' && asset ? asset : 'HERMES',
      amount: amountBase,
      lockHeight,
      lockTxHash,
    });

    const inserted = await db.query(
      `INSERT INTO bridge_transfers
         (source_chain, destination_chain, asset, amount, amount_base,
          sender, recipient, nonce, lock_height, lock_tx_hash, destination_tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        SOURCE_CHAIN.id,
        dest.id,
        lockEvent.asset,
        amountStr,
        amountBase,
        sender,
        recipient,
        nonce,
        lockHeight,
        lockTxHash,
        destinationTxHash,
      ],
    );

    const now = Date.now();
    const row = inserted.rows[0] ?? {
      id: '0',
      source_chain: SOURCE_CHAIN.id,
      destination_chain: dest.id,
      asset: lockEvent.asset,
      amount: amountStr,
      sender,
      recipient,
      nonce,
      lock_height: lockHeight,
      lock_tx_hash: lockTxHash,
      destination_tx_hash: destinationTxHash,
      created_at: new Date().toISOString(),
    };

    res.json({
      ok: true,
      transfer: rowToTransfer(row, now),
      feeBps: FEE_BPS,
      etaSeconds: ETA_SECONDS,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'Bridge request failed.' });
  }
});

export { bridgeRouter };
