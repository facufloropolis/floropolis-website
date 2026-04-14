#!/bin/bash
# Install git hooks for the floropolis-upgrade repo.
# Safe to run repeatedly. Run once after cloning.

set -e
cd "$(git rev-parse --show-toplevel)"

mkdir -p .git/hooks
cat > .git/hooks/pre-push <<'HOOK'
#!/bin/bash
# Pre-push hook — Floropolis preflight gate.
# Blocks push if build fails, image refs broken, images >10MB, or catalog integrity fails.
cd "$(git rev-parse --show-toplevel)"
bash scripts/preflight.sh || exit 1
exit 0
HOOK
chmod +x .git/hooks/pre-push

echo "✅ pre-push hook installed at .git/hooks/pre-push"
echo "  - runs scripts/preflight.sh on every push"
echo "  - blocks on: build failure, broken image refs, images >10MB, catalog integrity"
