#!/usr/bin/env bash
#
# Install Radar's git hooks into .git/hooks/. Run once per fresh clone.
#
# .git/hooks/ is not versioned, so this install step is required in every
# clone. CI does not replace this; it is a local safety net for the person
# running 'git commit'.
#

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
SRC="$REPO_ROOT/scripts/pre-commit.sh"
DEST="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -f "$SRC" ]; then
  echo "missing: $SRC"
  exit 1
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "installed pre-commit secret-scan hook at:"
echo "  $DEST"
echo ""
echo "verify with:"
echo "  ls -l $DEST"
