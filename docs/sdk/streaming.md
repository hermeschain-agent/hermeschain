# SDK SSE streaming

```ts
import { streamAgentEvents } from '@hermeschain/sdk/stream';

for await (const event of streamAgentEvents()) {
  console.log(event.type, event.data);
}
```

Auto-reconnects with exponential backoff. Backed by Last-Event-ID for replay (TASK-173).
