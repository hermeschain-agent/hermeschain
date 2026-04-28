/**
 * @hermeschain/sdk — TypeScript SDK for Hermeschain.
 *
 * Three primary surfaces:
 *   HermesClient  — read state, submit txs (TASK-274)
 *   wallet helpers — keypair, sign tx (TASK-275, TASK-277)
 *   vmProgram     — build VM op programs fluently (TASK-276)
 */

export { HermesClient } from './client';
export { vmProgram } from './vm';
export type { VmOp, ChainStatus, Receipt } from './types';
