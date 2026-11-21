# Willow Tree Audio Studio

A private, browser-based audio production system for Willow Tree Radio. This repository starts with isolated Cloudflare R2 + D1 + Workers infrastructure. It will eventually support an audio library, multitrack editing, and AI vocal/stem separation.

## Current status
**Infrastructure scaffold only. Not deployed or production-ready.** The Worker exposes a health check, not uploads or a public audio library. Do not put real audio in the system until authentication and access controls are built.

## Resources
- R2 bucket: `willowtree-audio-files` (private by default)
- D1 database: `willowtree-audio-db`
- Worker: `willowtree-audio-api`

These names are intentionally separate from Tivvy.

## First-time deployment (manual approval required)
Requirements: Node.js, npm, Python 3, bash and Cloudflare access.

```bash
npx wrangler login
bash setup.sh
```

The script shows the Cloudflare account, asks you to verify it and type confirmations, then creates or reuses named resources, applies the migration and deploys the initial Worker. Cloudflare might charge for resources. Do not run against the wrong account.

The generated `wrangler.jsonc` is intentionally git-ignored because it contains the account-specific D1 identifier. A successful /health response verifies basic bindings only.

## Next features
1. Cloudflare Access / authenticated API users and roles.
2. Secure private R2 audio uploads with metadata and server-side validation.
3. Search, playback, versioning, trash recovery and audit logs.
4. Browser waveform and multitrack editor.
5. External AI stem-separation processor, coordinated by Workers.
6. Backup, restoration tests, staging and production controls.

### Safety
No Tivvy resources are referenced in these scripts. Never commit Cloudflare tokens or secrets. Keep production audio private and respect recording and music rights.
