#!/bin/bash
# Deploy the Exercise Library to GitHub Pages.
#
#   ./deploy.sh                 → sync from iCloud, commit, push
#   ./deploy.sh "message"       → same, with your own commit message
#   ./deploy.sh --dry-run       → show what would change, touch nothing
#
# Since 2026-11-09 it also builds and deploys every profile instance (Alicia's app) from the same
# source with automation/exercise-library/build_profile.py. Program folders that belong only to a
# profile are kept off Ryan's site (PROFILE_ONLY; empty since 2026-11-09).
#
# Source of truth is the iCloud folder; this repo is just the deploy target.

set -euo pipefail

SRC="$HOME/Library/Mobile Documents/com~apple~CloudDocs/karl/outputs/personal/workout-trackers/exercise-library"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$SRC" ]; then
  echo "✗ Source folder not found:"
  echo "  $SRC"
  exit 1
fi

PROFILE_ONLY=()   # womens-program left this list 2026-11-09: it ships on Ryan's site too, view only
PROFILES=(alicia)
KARL_CORE="$HOME/Developer/karl-core"

DRY=""
MSG=""
case "${1:-}" in
  --dry-run) DRY="--dry-run" ;;
  "")        MSG="Update workout trackers" ;;
  *)         MSG="$1" ;;
esac

# --exclude keeps repo-only files (this script, .git) from being deleted by --delete.
echo "→ Syncing from iCloud..."
rsync -a --delete $DRY \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '.claude/' \
  --exclude 'deploy.sh' \
  $(for d in ${PROFILE_ONLY[@]+"${PROFILE_ONLY[@]}"}; do printf -- "--exclude %s/ " "$d"; done) \
  --itemize-changes \
  "$SRC"/ "$REPO"/

if [ -n "$DRY" ]; then
  echo "→ Dry run only. Nothing changed."
  exit 0
fi

cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "→ Changed files:"
  git status --short
  git add -A
  git commit -q -m "$MSG"
  echo "→ Committed: $MSG"
else
  echo "→ No file changes."
fi

# Commits can already be sitting here unpushed — a clean tree is not "nothing to do".
git fetch -q origin main
if [ -z "$(git log origin/main..HEAD --oneline)" ]; then
  echo "→ Nothing to push. Already up to date."
else
  echo "→ Commits to push:"
  git log origin/main..HEAD --oneline
  echo "→ Pushing to GitHub..."
  git push -q origin main
  echo "✓ Pushed. GitHub Pages redeploys in ~30-60 seconds."
  echo "  https://ryanrothe.github.io/workouts/"
  echo
  echo "  On your phone: open the app on wifi and pull down to refresh."
fi

# Profile instances: rebuilt from the same source every deploy (cheap, deterministic), then shipped.
for prof in "${PROFILES[@]}"; do
  echo
  echo "→ Profile: $prof"
  python3 -I "$KARL_CORE/automation/exercise-library/build_profile.py" --profile "$prof" --deploy
done
