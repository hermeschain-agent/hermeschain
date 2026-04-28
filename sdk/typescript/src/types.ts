export interface ChainStatus {
  status: string;
  chainLength: number;
  pendingTransactions: number;
  validators: number;
  totalTransactions: number;
}

export interface Receipt {
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  blockNumber: number;
  from: string;
  to: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  status: number;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    transactionHash: string;
  }>;
}

export type VmOp =
  | { op: 'PUSH'; args: [number | string] }
  | { op: 'POP' }
  | { op: 'ADD' } | { op: 'SUB' } | { op: 'MUL' } | { op: 'DIV' } | { op: 'MOD' }
  | { op: 'EQ' } | { op: 'LT' } | { op: 'GT' }
  | { op: 'AND' } | { op: 'OR' } | { op: 'NOT' }
  | { op: 'SSTORE'; args: [string, string] }
  | { op: 'LOG'; args: { topics?: string[]; data?: string } }
  | { op: 'STOP' }
  | { op: 'REVERT'; args?: [string] };
