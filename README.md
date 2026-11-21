# Willow Tree Audio Studio

Willow Tree's private browser-based audio production library, backed by Cloudflare R2, D1 and Workers.

## Deployment status (21 November 2026)
- Initial Worker and database have been deployed and the owner confirmed a green `/health` response.
- **Library code and browser interface are committed to GitHub but NOT yet deployed.**
- Do not run `setup.sh` again; initial provisioning is complete.
- Current milestone: private original-audio library with upload, search, preview, download, soft-delete, restore and an audit trail.
- Multitrack waveform editing, AI vocal removal, real user authentication and automatic 90-day purge are **not** implemented yet.

## First library deployment
On the same Mac used for the initial Cloudflare setup:

```bash
cd ~/Willow-Tree-Vocal-Remover
git pull
node --check src/index.js
node --check src/studio.js
bash -n deploy-library.sh
bash deploy-library.sh
```

The deployment script verifies the Cloudflare account, obtains explicit confirmation, generates a 64-character admin access token, saves it privately in Cloudflare Worker secrets, then deploys the new Worker. **Keep the printed token in your password manager. Do not post it to chat, GitHub or email.** It will not be recoverable from the Worker. Running this script again rotates the token and invalidates the previous one.

After deploying, open:
- [Audio Studio](https://willowtree-audio-api.nickabull.workers.dev/studio)
- [Health check](https://willowtree-audio-api.nickabull.workers.dev/health)

The browser interface requires the token for access. It stores the token only in memory, not local storage or cookies. A page reload locks it again. The first build has one shared administrator credential, so use it only with trusted people on trusted devices; individual presenter accounts and Cloudflare Access are the next security milestone.

## File handling
- Supported: MP3, WAV, FLAC, AIFF, M4A and OGG.
- This initial implementation limits uploads to **20 MiB** per recording; large professional WAV files will need a multipart/resumable upload flow.
- The original is stored privately in R2; title and artist metadata are stored in D1.
- Trash is recoverable; **90-day automatic purging has not yet been implemented**.
- File extensions and content types are checked, but audio decoding / antivirus scanning are not yet provided. Use only trusted test files initially.
- No automatic off-site backup or operational dashboard exists yet.

## Architecture
- Worker: `willowtree-audio-api`
- D1 database: `willowtree-audio-db`
- Private R2 bucket: `willowtree-audio-files`
- Same-origin interface: `/studio`
- Public, metadata-only liveness endpoint: `/health`
- All library operations: `/api/*` (bearer-token protected)

This is intentionally isolated from all Tivvy resources. `wrangler.jsonc` is generated locally and intentionally git-ignored.

## Later milestones
1. Cloudflare Access or verified identity-provider auth and per-person roles.
2. Large-file streaming upload, media validation and previews.
3. Searchable rich metadata, batch import and tagging.
4. Version history, automatic 90-day trash expiry, tested backups.
5. Multitrack browser editor (reuse suitable Eldoret architecture).
6. Separate compute service for AI vocal and instrumental stems.

## Safety
Never commit any Cloudflare token or secret. Keep copyrighted recordings private and respect relevant licence terms.
