#!/bin/bash
# Deploy patentpending.app to production via Vercel CLI
# Must be run from the patent-pending-app directory
#
# ✅ GitHub auto-deploy connected 2026-03-20 (HotHands-LLC/patent-pending-app → main).
# git push now auto-deploys. Use this script only as a manual fallback.
#
#   Select: HotHands-LLC/patent-pending-app, branch: main
set -e
VTOKEN=$(cat ~/.openclaw/workspace/credentials/vercel-token.txt)
echo "[deploy] Triggering production deploy..."
vercel --prod --token "$VTOKEN" --yes
echo "[deploy] Done. patentpending.app updated."
