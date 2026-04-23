#!/usr/bin/env bash
#
# Radar pre-commit hook. Blocks commits that include API key patterns or
# known-sensitive filenames in the staged diff.
#
# Installed into .git/hooks/pre-commit by scripts/install-hooks.sh.
#

set -euo pipefail

# Value-level patterns. The length thresholds avoid matching the short pattern
# names quoted inside CLAUDE.md's rule text.
VALUE_PATTERN='(sk-ant-[A-Za-z0-9_-]{40,})|(sk-proj-[A-Za-z0-9_-]{20,})|(ghp_[A-Za-z0-9]{30,})|(xoxp-[A-Za-z0-9_-]{20,})|(sb_secret_[A-Za-z0-9_]{20,})|(eyJ[A-Za-z0-9_=-]{30,}\.[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{10,})'

# Scan only added lines in the staged diff.
MATCHES=$(git diff --cached -U0 | grep -E "^\+" | grep -v "^+++ " | grep -E "$VALUE_PATTERN" || true)

if [ -n "$MATCHES" ]; then
  echo ""
  echo "pre-commit secret scan FAILED"
  echo ""
  echo "The following staged lines look like secret values:"
  echo ""
  echo "$MATCHES" | sed 's/^/  /'
  echo ""
  echo "Remove them from the staged diff. If this is a genuine false positive"
  echo "you can bypass with 'git commit --no-verify', but verify carefully first."
  echo ""
  exit 1
fi

# Also refuse to stage files whose name alone signals secret content.
FORBIDDEN_FILES=$(git diff --cached --name-only | grep -E '^(\.env$|\.env\.local$|\.env\.development\.local$|\.env\.test\.local$|\.env\.production\.local$|.*\.key$|.*\.pem$|agents/[^/]+/\.agent-ids\.json$)' || true)

if [ -n "$FORBIDDEN_FILES" ]; then
  echo ""
  echo "pre-commit FAILED: refusing to commit sensitive filenames:"
  echo ""
  echo "$FORBIDDEN_FILES" | sed 's/^/  /'
  echo ""
  echo "Unstage with 'git restore --staged <path>' and confirm the file belongs"
  echo "in .gitignore."
  echo ""
  exit 1
fi

exit 0
