# Block lifecycle state machine

```
new Block (height N) ──────► proofOfAI.validateBlock ──────► validatorManager.getConsensus
                                            │                              │
                                  fail │                          fail │
                                            ▼                              ▼
                            consensus_failed                     consensus_failed
                                            │                              │
                                            └──────────┬───────────────────┘
                                                       │
                                                       │ pass
                                                       ▼
                                          chain.addBlock (linear append)
                                                       │
                                       fork case: forkManager.addBlock
                                                       │
                                            heaviest? → handleReorg
```

Each transition emits an event on EventBus.
