# Tutorial: CLI quickstart (TASK-281+)

```bash
npm install -g @hermeschain/cli
hermes status
hermes balance Hermes123abc...
hermes head
```

For tx submission, sign first via SDK then pass the JSON payload:

```bash
hermes send-raw <signed-tx-json>
```
