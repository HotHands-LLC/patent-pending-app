#!/bin/bash
# Deploy patentpending.app to production via Vercel CLI
# Must be run from the patent-pending-app directory
set -e
VTOKEN=$(cat ~/.openclaw/workspace/credentials/vercel-token.txt)
echo "[deploy] Triggering production deploy..."
vercel --prod --token "$VTOKEN" --yes
echo "[deploy] Done. patentpending.app updated."
