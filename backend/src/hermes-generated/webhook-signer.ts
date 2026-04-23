/**
 * Webhook HMAC signer + verifier.
 *
 * Phase-11 / webhooks / step-2. Same implementation used on both
 * sides so consumers can verify the exact bytes the server sent.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const HEADER_SIG = 'X-Hermeschain-Signature';
const HEADER_TS = 'X-Hermeschain-Timestamp';
const MAX_TIMESTAMP_SKEW_SEC = 5 * 60;

export interface SignedEnvelope {
  readonly body: string;          // JSON body, verbatim
  readonly headers: Record<string, string>;
}

export function signPayload(body: string, secret: string, nowMs: number = Date.now()): SignedEnvelope {
  const ts = Math.floor(nowMs / 1000);
  const payload = `${ts}.${body}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return {
    body,
    headers: {
      [HEADER_SIG]: `sha256=${sig}`,
      [HEADER_TS]: ts.toString(),
      'Content-Type': 'application/json',
    },
  };
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyIncoming(
  body: string,
  headers: Record<string, string | undefined>,
  secret: string,
  nowMs: number = Date.now(),
): VerifyResult {
  const sigHeader = headers[HEADER_SIG.toLowerCase()] ?? headers[HEADER_SIG];
  const tsHeader = headers[HEADER_TS.toLowerCase()] ?? headers[HEADER_TS];
  if (!sigHeader || !tsHeader) {
    return { ok: false, reason: 'missing auth headers' };
  }

  const ts = Number.parseInt(tsHeader, 10);
  if (!Number.isInteger(ts)) {
    return { ok: false, reason: 'bad timestamp' };
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (Math.abs(nowSec - ts) > MAX_TIMESTAMP_SKEW_SEC) {
    return { ok: false, reason: 'stale signature' };
  }

  const expectedSig = createHmac('sha256', secret)
    .update(`${ts}.${body}`)
    .digest('hex');
  const providedSig = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const providedBuf = Buffer.from(providedSig, 'hex');

  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, reason: 'signature length mismatch' };
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
