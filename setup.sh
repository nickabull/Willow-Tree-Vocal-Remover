#!/usr/bin/env bash
set -euo pipefail

R2_NAME='willowtree-audio-files'
DB_NAME='willowtree-audio-db'
WORKER_NAME='willowtree-audio-api'

for c in node npm python3; do command -v "$c" >/dev/null || { echo "Missing dependency: $c" >&2; exit 1; }; done
if [[ ! -f package.json || ! -f src/index.js ]]; then echo 'Run this from the repository root.' >&2; exit 1; fi

printf '\nWillow Tree Cloudflare provisioning\nR2: %s\nD1: %s\nWorker: %s\n' "$R2_NAME" "$DB_NAME" "$WORKER_NAME"
printf 'This creates/updates resources in your authenticated Cloudflare account.\n'
read -r -p 'Type WILLOWTREE to proceed: ' answer
[[ "$answer" == 'WILLOWTREE' ]] || { echo 'Cancelled.'; exit 0; }

npm install
npx wrangler whoami
printf '\nPlease verify the Cloudflare account shown above is intended.\n'
read -r -p 'Type YES to continue: ' confirmed
[[ "$confirmed" == 'YES' ]] || { echo 'Cancelled.'; exit 0; }

if ! npx wrangler r2 bucket list | grep -Fq "$R2_NAME"; then
  npx wrangler r2 bucket create "$R2_NAME"
else
  echo 'R2 bucket already exists; leaving unchanged.'
fi

npx wrangler d1 list --json > .d1-list.json
DB_ID="$(python3 - <<'PY'
import json
with open('.d1-list.json') as f: rows=json.load(f)
print(next((x.get('uuid','') for x in rows if x.get('name')=='willowtree-audio-db'),''))
PY
)"
if [[ -z "$DB_ID" ]]; then
  npx wrangler d1 create "$DB_NAME"
  npx wrangler d1 list --json > .d1-list.json
  DB_ID="$(python3 - <<'PY'
import json
with open('.d1-list.json') as f: rows=json.load(f)
print(next((x.get('uuid','') for x in rows if x.get('name')=='willowtree-audio-db'),''))
PY
)"
fi
[[ -n "$DB_ID" ]] || { echo 'Unable to resolve the D1 database ID.' >&2; exit 1; }
python3 - "$DB_ID" <<'PY'
import json,sys
config={"name":"willowtree-audio-api","main":"src/index.js","compatibility_date":"2026-11-01","workers_dev":True,"d1_databases":[{"binding":"DB","database_name":"willowtree-audio-db","database_id":sys.argv[1]}],"r2_buckets":[{"binding":"AUDIO","bucket_name":"willowtree-audio-files"}]}
with open('wrangler.jsonc','w') as f:json.dump(config,f,indent=2)
PY
npx wrangler d1 migrations apply "$DB_NAME" --remote
npx wrangler deploy
rm -f .d1-list.json
printf '\nProvisioned. Do not upload production audio until authentication is implemented.\n'
