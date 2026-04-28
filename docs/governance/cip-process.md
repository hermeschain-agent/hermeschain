# CIP process

Hermeschain Improvement Proposal lifecycle:

1. Author drafts CIP doc (this directory)
2. Submit via POST /api/cip with proposal JSON
3. Validators debate via /api/cip/:id/debate (debate_messages table)
4. Voting period opens (validators cast yes/no/abstain)
5. If quorum agrees, status → approved; agent worker prioritizes implementation
6. Once shipped, status → implemented at block N

See cips + cip_votes + debate_messages tables in schema.ts.
