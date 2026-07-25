#!/bin/bash
# Deploy the Exercise Library to GitHub Pages.
#
#   ./deploy.sh                 → sync from iCloud, commit, push
#   ./deploy.sh "message"       → same, with your own commit message
#   ./deploy.sh --dry-run       → show what would change, touch nothing
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
  exit 0
fi
echo "→ Commits to push:"
git log origin/main..HEAD --oneline

echo "→ Pushing to GitHub..."
git push -q origin main
echo "✓ Pushed. GitHub Pages redeploys in ~30-60 seconds."
echo "  https://ryanrothe.github.io/workouts/"
echo
echo "  On your phone: open the app on wifi and pull down to refresh."
