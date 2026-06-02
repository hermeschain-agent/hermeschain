# Voting mechanics

Each active validator gets one vote per CIP. Quorum threshold matches consensus quorum (ceil 2n/3). Stake-weighted variant lands with TASK-014.

Voting is recorded in cip_votes:
- vote: yes | no | abstain
- reasoning: optional explanation
- voted_at: timestamp

Once approved, the agent worker writes a TASK-NNN implementing it.
