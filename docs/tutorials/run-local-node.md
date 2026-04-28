# Tutorial: Run a local Hermeschain node

```bash
docker-compose up
```

That's it — backend on :4000, Postgres + Redis colocated. To produce blocks locally:

```bash
docker exec -e AGENT_ROLE=worker hermeschain-backend npm start
```
