# WILLOW TREE AUDIO STUDIO — PROJECT-HANDOVER.md

**Snapshot:** 21 November 2026, UK time  
**Project:** Browser-based Willow Tree Audio Studio, combining vocal/stem separation, audio editing, searchable asset storage and staff access.  
**Canonical source:** [nickabull/Willow-Tree-Vocal-Remover](https://github.com/nickabull/Willow-Tree-Vocal-Remover).  
**Status rule:** Distinguish user-observed results, committed code, proposed functionality, and unverified deployments. This file is a point-in-time handover, not proof of continuous background operation.

## 1. Aim and agreed decisions

- Willow Tree wants **one web-based audio production page**, accessible by authorised staff, rather than switching between Audacity, vocalremover.org and x-minus.pro.
- Prefer the familiar **Audacity-style editing workflow**, in a **dark Willow Tree-branded interface**; do *not* claim the entire C++ Audacity desktop application can simply be embedded in WordPress. Reuse open-source components/code only where technically suitable and compatible with licensing, including GPL requirements.
- Reuse the **existing Willow Tree Vocal Remover app and artwork** found in the GitHub repository: this work predates the new Cloudflare backend.
- Reuse useful parts of the **Eldoret multitrack/home-automation and Bull's Hits playout work** after inspecting and testing relevant code. Keep live playout independent from the website.
- Store original recordings and audio derivatives in **private Cloudflare R2**, searchable records/metadata, project and audit information in **Cloudflare D1**, and expose protected APIs with **Cloudflare Workers**. Use separate Willow Tree resources: **never alter Tivvy R2/D1/Workers**.
- Explore integration into the existing **WordPress Willow Tree website**, preferably via a dedicated studio page/subdomain linked from WordPress. A Custom HTML/iframe embed may be possible but requires verifying WordPress restrictions, origins, authentication and Content Security Policy. The existing deployed Worker sets `frame-ancestors 'none'` for /studio, so embedding requires deliberate security work; simply copying an iframe won't work currently.
- Central web releases mean staff receive new Willow Tree versions without desktop installs. Monitor supported library updates through GitHub Dependabot, stage/test releases, deploy intentionally, and keep rollback options. Do not assume new Audacity releases automatically update a separate web editor.
- Full user-specific diagnostic **audit log**: who did what and when, with meaningful before/after values, outcomes, error correlation IDs, authenticated user IDs, admin-only filtering/export. Avoid logging passwords, tokens or confidential audio/transcripts. Document and enforce retention/privacy policy.
- Preserve originals, version edits, recoverable trash (target **90 days**, not implemented), project recovery, permissions and tested backups.

## 2. External tools and references

User currently uses:
- https://vocalremover.org/next/ — quick vocal/instrumental separation
- https://x-minus.pro/ — model-based separation options
- https://github.com/audacity/audacity — Audacity source, desktop C++ project (GPL)
- WordPress Willow Tree website — user has site access, exact URL/integration path not yet provided.

Do not rely on unsupported assertions about those products' current feature sets; recheck before integration.

## 3. Source repositories and existing work

**Willow Tree GitHub:** https://github.com/nickabull/Willow-Tree-Vocal-Remover

Existing original application files **already present before our Cloudflare implementation**:
- `index.html`, `style.css`, `app.js`
- `Willow Tree Black SQUARE no background.png`
- `Willow Tree Black SQUARE.png`
- `willow-dance-background.jpg`
- `willow-original-optimized.svg`
- `browser-fallback/INTEGRATION.md`
- `cloud-backend/` with an earlier vocal separation service prototype.

Inspected original `index.html`: branded Willow Tree login, **Firebase email/password authentication**, reset/sign-out and an admin shortcut. It refers to **Willow Tree Dance & Theatre Arts**, which is important: do not assume the project belongs to a radio station without reconciling actual user intent. Earlier assistant prose called it 'Willow Tree Radio', but repo artwork identifies dance/theatre work; preserve the existing brand and verify intended organisation/site before branding changes.

Original editor already exposes an editor waveform canvas, selection, playback/selection playback, stop, undo, trim, cut, fade in/out, gain, edited WAV export; the original `app.js` includes cloud separation and browser fallback. **Code exists; quality and current live operability have not been systematically tested.** Original Firebase auth gates the UI, not automatically the new Cloudflare API.

Related projects:
- `nickabull/Eldoret-Home-Automation`
- `nickabull/Eldoret-Playout`
- `nickabull/Eldoret-Playout-Demo`
- overall dashboard `nickabull/Tiverton-Town-Control-Centre/project-hub.html`

## 4. Cloudflare environment: verified by user on 21 Nov 2026

- Worker: `willowtree-audio-api`
- Live URL: https://willowtree-audio-api.nickabull.workers.dev/
- Health: https://willowtree-audio-api.nickabull.workers.dev/health
- Studio: https://willowtree-audio-api.nickabull.workers.dev/studio
- D1: `willowtree-audio-db`
- R2: `willowtree-audio-files` (private)
- D1 initial migration: `migrations/0001_initial.sql`

User terminal confirmed Wrangler 4.166.0 deployment, both D1/R2 bindings, initial migration success, and a health response:
`{"status":"ok","service":"willowtree-audio-api","database":true,"storage_binding":true}`.

User later ran `bash deploy-library.sh`, accepted confirmations, saved generated long administrator token securely, and showed a screenshot of the new Audio Library at /studio with an uploaded **Galaxy Ident** recording. **The user's screenshot is evidence of the new library interface; do not infer all API paths have passed independent automated integration tests.**

User's Mac initially had no npx or Homebrew; installed Node.js v26.13.1, npm 11.20.0, authenticated Wrangler via GitHub/Cloudflare browser flow. The setup should now be reproducible; no need to rerun `setup.sh`. Never ask for or copy the admin token.

## 5. GitHub Cloudflare implementation

Files created/updated:
- `setup.sh`: first-time resource provisioning with interactive confirmation
- `deploy-library.sh`: confirm Cloudflare account, generate and set `ADMIN_API_TOKEN` secret, deploy Worker; running again rotates the token
- `package.json`: Wrangler dependency
- `migrations/0001_initial.sql`: `audio_assets`, `projects`, `audit_events`
- `src/index.js`: Worker health, bearer-token-protected /api handlers: asset list/search, original upload, detail, download, soft delete, restore, basic audit query; serves /studio
- `src/studio.js`: initial browser library with token unlock, upload, search, preview, download, trash/restore
- `.github/dependabot.yml`: weekly supported dependency/GitHub Actions update checks, proposed PRs; not autonomous upgrades or automatic deploy
- `migrations/0002_activity_log.sql`: append-oriented detailed `activity_log` schema (not yet applied to production)
- `docs/AUDIT-TRAIL.md`: design spec (not yet integrated into live Worker)
- `README.md`: deployment instructions; note may need updating as development advances.

Current prototype **limitations**:
- `ADMIN_API_TOKEN` is a shared administrator credential, **cannot identify individual people**. Do not assign historical events to named users based on shared token.
- Existing `audit_events` uses actor `initial-admin` and only some mutations, not complete user diagnostics.
- Upload limit **20 MiB per recording**; needs secure large-file/multipart handling for longer WAV/FLAC.
- Authentication uses token in browser memory; no Firebase ID-token validation on Worker yet. Avoid sharing token widely.
- File extension/content-type checks exist; no strong audio sniffing, malware scanning or transcoding assurance yet.
- No confirmed 90-day automated purge, tested backups or full revision graph.
- /studio has `frame-ancestors 'none'`; WordPress embed needs explicit origin allowlisting, or use standalone link.
- Cloudflare Workers should coordinate, not perform heavy AI model inference; choose suitable off-Worker CPU/GPU service.

## 6. Audit log agreement and status

User requested *exactly who has done what* for support, incident investigation and tracing user actions.

Committed but **not live**:
- `migrations/0002_activity_log.sql` with event UUID/UTC date, actor UID/email/name/type, action, resource and project IDs, request/session IDs, outcome, before/after JSON, safe details and error code. Indexes for user/time/resource/action.
- `docs/AUDIT-TRAIL.md`: authentication/trust, event scope, safety/retention, admin-only filters, CSV export.

Next implementation:
1. Integrate existing Firebase sign-in with **server-side Firebase ID-token verification** (signatures, issuer, audience, expiry, user status; backend-enforced roles).
2. Design admin/producer/presenter permissions; retain immutable UID and optional email snapshot in event.
3. Capture upload, download, preview, rename, edit/effect, separation job, save/export, trash/restore, permission and error events. Add reliable per-request correlation IDs.
4. Make D1 mutations and audit writes transactional when possible; reconcile R2/D1 partial failure.
5. Build admin-only filterable Activity Log with CSV export. Record export actions and establish privacy/retention policy.
6. Include deploy/version changes in project-level log when practical.

## 7. Planned editing roadmap

**Phase A — useful preview:** restore original Willow Tree colours, existing images and typography; move current library into coherent UI; inspect and port tested waveform tools from original `app.js`. Load the example Galaxy Ident file and verify playback, selection, trim, fade, gain, undo and WAV export.

**Phase B — staff login and audit:** verified Firebase identities, role access, private R2, user-level event trails, admin diagnostic screen; replace shared token workflow for normal staff.

**Phase C — multitrack:** inspect Eldoret code; multi-layer editing, draggable clips, music beds, speech, crossfades, labels, zoom, keyboard shortcuts, non-destructive versions/projects, autosave/recovery, multi-format exports.

**Phase D — AI separation:** reuse proven original cloud and in-browser fallback approach, allow selectable models and A/B comparison, save original/vocals/instrumental/other stems as linked versions; handle provider quotas and suitable processing infrastructure; verify licensing.

**Phase E — WordPress:** confirm exact website and staff access model, decide embedded vs dedicated subdomain, validate browser framing and third-party auth/cookies, mobile responsive interface, same-origin API flow/CORS, consent/security, release/rollback.

**Phase F — maintenance:** tests/CI, staged releases, Dependabot PR review, observability, backups/retention, migration rollbacks, media limits/virus validation, dependency and Audacity feature watch.

## 8. Operating instructions / how to continue

Start each new session by inspecting **this handover and actual repository and deployment state**, not inferring status from this snapshot. Check `git log`, relevant files, Cloudflare health and the latest user-observed screenshot. Treat user reports and successful commits as distinct from independently verified live feature tests.

Use GitHub for changes. Before deployment, review affected resource names and ask approval if destructive, permission-sensitive or live-user-impacting. Keep Tivvy isolated. Never expose user keys, tokens, emails, secrets or original copyrighted media in logs or the public project hub. Add a dated entry below after every meaningful change, recording exactly what was committed, deployed, tested, and what remains unknown.

## 9. Project log

### 21 Nov 2026 — Architecture
- Confirmed Audacity open source, discussed integrating vocalremover.org and x-minus.pro in one page; chose browser-based custom editor instead of desktop Audacity fork.
- Agreed on R2/D1/Workers, linked originals/derivatives, metadata/search, recoverable trash, version history and role security.
- Agreed to reuse existing Eldoret multitrack architecture where useful; avoid coupling radio playout to web runtime.

### 21 Nov 2026 — Provisioning
- Created Cloudflare starter files inside existing Willow Tree GitHub repository and scripted setup.
- User installed Node.js, authenticated Wrangler and ran provisioning; terminal confirmed successful D1 initial migration and Worker deployment.
- User viewed healthy /health JSON.

### 21 Nov 2026 — First Audio Library
- Committed first protected API and /studio interface, `deploy-library.sh` and README updates.
- User generated/stored admin secret and shared a screenshot of the UI with the Galaxy Ident test recording.
- Live staff auth, large uploads and broad test coverage outstanding.

### 21 Nov 2026 — Existing assets and updates
- Located original Willow Tree vocal remover assets, dance imagery, Firebase login, editor controls and separation/fallback code inside repository.
- Committed `.github/dependabot.yml` for weekly dependency update PRs. No automatic production merges/deploys.

### 21 Nov 2026 — Audit log
- Committed `migrations/0002_activity_log.sql` and `docs/AUDIT-TRAIL.md`; not yet deployed. Agreed named-user traceability, diffs, admin CSV export and diagnostic correlation IDs.

### 21 Nov 2026 — WordPress integration and project continuity
- User confirmed access to the Willow Tree WordPress website and asked for future integrated studio page, full handover, overall project hub update and new restart prompt.
- Dedicated WordPress-linked studio is preferred to avoid iframe/auth complications; embed may be feasible after security configuration.
- This handover is the canonical Willow Tree project snapshot; overall project hub entry to point here.

### 21 Nov 2026 — Dark waveform editor first integration (after noon)
- **Committed to GitHub, NOT yet deployed or browser tested.** Created `src/editor.js`, including client-side browser decoding, waveform canvas, drag selection, play/stop, cut/trim, fade in/out, gain, up to 10 undo steps and 16-bit PCM WAV export. Edits modify only an in-memory decoded buffer, preserving the R2 original. This is a **single-track preview**, NOT full Audacity parity or multitrack editing.
- Updated `src/studio.js` to show an **Edit** action for library recordings, and a local-file input in the editor; on edit, the authenticated studio API supplies the recording blob. Reused original Willow Tree logo and background from existing repo and shifted colour styling toward pink/dark.
- Updated `src/index.js` studio image Content Security Policy to allow existing raw GitHub artwork. No new public audio endpoints; existing API bearer-token protection remains in place.
- Locking the library clears the in-memory editor buffer, history and selection.
- Static checks using a JavaScript parser successfully compiled all three JS modules, both assembled inline scripts, and found no duplicate element IDs. **Actual browser audio processing, export quality, waveform interaction, remote image rendering and Cloudflare deployment still require user verification.** No work on Firebase identity verification or the detailed per-user activity log has been deployed.
- Deployment from the already configured Willow Tree project on the user's Mac: `cd ~/Willow-Tree-Vocal-Remover && git pull && node --check src/editor.js && node --check src/studio.js && node --check src/index.js && npx wrangler deploy`. This **does not rotate** the existing admin token; do not rerun `deploy-library.sh` for ordinary updates.
- After deployment, sign in to `/studio` with the existing locally saved token, click **Edit** on a trusted test recording, verify waveform, short selection, fades, undo, play, WAV export and that the R2 original still downloads unchanged. Report browser errors before adding multitrack/stems.

### 21 Nov 2026 — Beta 1 browser QA: Editor remains hidden; original logo appears blank
- User successfully deployed Worker version `2a272955-248b-403d-8840-3abf469fab03` and supplied live screenshot. Library shows Galaxy Ident and 'Loaded in editor', but editor panel does not appear. Original Willow Tree background is visible while the logo renders as a blank white tile.
- Root-cause hypothesis: editor awaited `AudioContext.resume()` after an asynchronous protected download, potentially waiting on browser user-gesture restrictions, **before** revealing the editor. Corrected `src/editor.js` to reveal editor and loading status *before* decode and to avoid resuming the AudioContext during decoding; resume is requested on Play instead. Decoding errors now stay visible in the editor rather than being hidden by the library. This addresses the observed symptom; browser retest remains required.
- Replaced logo reference with the original SVG `willow-original-optimized.svg` and changed its white tile to a black background. Existing original background is retained.
- GitHub commits: `cd7cb0bc8659828d2d899307ef242e6fed93aa45` (editor fix) and `236366e335d7cdc12be65b7b84842ac091b35ba7` (original logo). Assembled page and both inline scripts passed static JavaScript syntax checks. **Not yet deployed**; no claim of successful editor/browser functionality until user confirms.
- Next: run `cd ~/Willow-Tree-Vocal-Remover && git pull && npx wrangler deploy`, hard refresh /studio, unlock, click Edit on Galaxy Ident, and report exact message inside editor plus logo rendering. Existing audio library should remain unchanged.
