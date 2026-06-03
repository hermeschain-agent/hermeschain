#!/bin/bash
# Push the next un-pushed commit from tier-3-backlog to main with fresh date.
# Skips any commit whose tree-hash already matches main HEAD (to avoid pushing
# the same content twice when re-authored SHAs make rev-list "ahead" lie).

set -e
cd "$(dirname "$0")/../.."

git fetch origin main tier-3-backlog 2>&1 | tail -1

MAIN_TREE=$(git rev-parse origin/main^{tree})
PARENT=$(git rev-parse origin/main)
QUEUE=$(git rev-list --reverse origin/main..origin/tier-3-backlog)

NEXT=""
for sha in $QUEUE; do
  TREE=$(git rev-parse "${sha}^{tree}")
  if [ "$TREE" != "$MAIN_TREE" ]; then
    # Also check the prior 5 commits on main to handle the duplicate case
    DUP=0
    for prior in $(git rev-list -5 origin/main); do
      PRIOR_TREE=$(git rev-parse "${prior}^{tree}")
      if [ "$TREE" == "$PRIOR_TREE" ]; then
        DUP=1
        break
      fi
    done
    if [ $DUP -eq 0 ]; then
      NEXT=$sha
      break
    fi
  fi
done

if [ -z "$NEXT" ]; then
  echo "[PACE] queue drained — no un-pushed commits remain"
  exit 0
fi

TREE=$(git rev-parse "${NEXT}^{tree}")
MSG=$(git log -1 --pretty=%B "$NEXT")
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S +0000")

NEW=$(GIT_AUTHOR_NAME="hermes agent" \
      GIT_AUTHOR_EMAIL="hermeschain-agent@users.noreply.github.com" \
      GIT_AUTHOR_DATE="$NOW" \
      GIT_COMMITTER_NAME="hermes agent" \
      GIT_COMMITTER_EMAIL="hermeschain-agent@users.noreply.github.com" \
      GIT_COMMITTER_DATE="$NOW" \
      git commit-tree "$TREE" -p "$PARENT" -m "$MSG")

git push origin "${NEW}:refs/heads/main"
echo "[PACE] pushed ${NEW:0:8} ($(echo "$MSG" | head -1))"
