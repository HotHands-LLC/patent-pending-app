#!/bin/bash
# Deploy patentpending.app to production via Vercel CLI
# Must be run from the patent-pending-app directory
#
# ⚠️  TEMPORARY: Vercel has no GitHub auto-deploy configured.
# Pushes to main do NOT auto-deploy. You must run this script manually.
#
# Chad action (2-min setup):
#   vercel.com → patent-pending-app → Settings → Git → Connect Repository
#   Select: HotHands-LLC/patent-pending-app, branch: main
#   Once connected, git push will auto-deploy. This script becomes optional.
set -e
VTOKEN=$(cat ~/.openclaw/workspace/credentials/vercel-token.txt)
echo "[deploy] Triggering production deploy..."
vercel --prod --token "$VTOKEN" --yes
echo "[deploy] Done. patentpending.app updated."
