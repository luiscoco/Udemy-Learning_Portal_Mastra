#!/usr/bin/env bash
# Verifies, archives and commits an OpenSpec change.
# Usage: scripts/finish-change.sh <change-name> "<spec purpose>" "<commit subject>" "<commit body>"
set -euo pipefail
change="$1"; purpose="$2"; subject="$3"; body="${4:-}"
npx openspec validate "$change" --strict
npm run verify > .data/verify.log 2>&1 || { grep -E "Tests |  error|error TS|✖|×|FAIL" .data/verify.log | head -20; echo "VERIFY FAILED"; exit 1; }
grep -E "Tests " .data/verify.log | tail -1
npx playwright test > .data/e2e.log 2>&1 || { grep -E "x  |Error:|failed" .data/e2e.log | head -20; echo "E2E FAILED"; exit 1; }
grep -E "passed|flaky" .data/e2e.log | tail -2
sed -i 's/^- \[ \] /- [x] /' "openspec/changes/$change/tasks.md"
npx openspec archive "$change" -y > /dev/null
for f in $(grep -rl "TBD - created by archiving change $change" openspec/specs); do
  sed -i "s/^TBD - created by archiving change $change. Update Purpose after archive./$purpose/" "$f"
done
npx openspec validate --all --strict | tail -1
git add -A
git commit -q -m "$subject" -m "$body" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline | head -1
