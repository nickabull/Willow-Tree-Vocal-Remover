#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
test -f wrangler.jsonc || { echo "Missing wrangler.jsonc: run setup.sh first."; exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required"; exit 1; }
echo "Willow Tree Library: protected first deployment"
echo "This updates ONLY the Worker configured by local wrangler.jsonc."
npx wrangler whoami
read -r -p "Verify account above; type WILLOWTREE to continue: " answer
[[ "$answer" == "WILLOWTREE" ]] || { echo "Cancelled"; exit 0; }
echo "A fresh admin token will be generated. Save it securely; it will be shown once."
read -r -p "Type YES to rotate/create the token and deploy: " confirmed
[[ "$confirmed" == "YES" ]] || { echo "Cancelled"; exit 0; }
token="$(openssl rand -hex 32)"
printf '%s' "$token" | npx wrangler secret put ADMIN_API_TOKEN
npx wrangler deploy
printf '\nSAVE THIS TOKEN IN YOUR PASSWORD MANAGER (it will not be shown again):\n%s\n\n' "$token"
unset token
echo "Open https://willowtree-audio-api.nickabull.workers.dev/studio"
