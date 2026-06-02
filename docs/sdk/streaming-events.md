# SDK event streaming reference

```ts
import { streamAgentEvents, streamLogs, streamMempool } from '@hermeschain/sdk/stream';

// Filter mempool stream by address
for await (const tx of streamMempool({ from: myAddr })) {
  console.log('outbound tx', tx.hash);
}

// Filter logs by topic
for await (const log of streamLogs({ topic0: '0xabc...' })) {
  console.log('event', log.address, log.data);
}
```

All streams support reconnect with Last-Event-ID for missed-event replay.
