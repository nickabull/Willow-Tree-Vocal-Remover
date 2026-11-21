# Shared audio ingest pilot (Willow Tree and Bull's Hits)

This is a **local, isolated FFmpeg transcoding prototype**. It processes one file and creates a separate 24-bit/48 kHz signed PCM WAV plus machine-readable checksum/codec metadata. It does **not** yet upload to R2, update D1, queue cloud jobs, or run automatically when the website uploads an audio file. The current Cloudflare Worker remains unchanged.

## Why
Willow Tree's Galaxy Ident has RIFF/WAVE codec tag 80 (MPEG in WAV), which the browser audio decoder couldn't read. Instead of adding codec-specific patches, use FFprobe to identify the *actual* compressed audio and FFmpeg to create a consistent PCM working copy.

The same conversion contract is reusable by Bull's Hits / Eldoret, although its on-air engine needs independent acceptance tests and a verified offline cache. The original upload must remain untouched; the PCM working copy is a derived asset.

## Local pilot

Install FFmpeg with FFprobe (version can be checked with `ffmpeg -version` and `ffprobe -version`). Node.js is already installed on the user's Mac. Then:

```bash
cd ~/Willow-Tree-Vocal-Remover
git pull
node tools/normalise-audio.mjs "/path/to/Galaxy Ident.wav" "./audio-pilot-output"
```

Input: a local recording you control. The command reads the source but never modifies it. Output: `<sha-prefix>-pcm24-48k.wav` and `<sha-prefix>-report.json` under `audio-pilot-output`. Neither is uploaded automatically. Duplicate outputs are rejected rather than overwritten. Audio is not logged or printed; only technical metadata appears in JSON.

To check the output:

```bash
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,bits_per_raw_sample -of default=noprint_wrappers=1 ./audio-pilot-output/OUTPUT.wav
```

Expected: `pcm_s24le`, `48000`, 1 or 2 channels, and 24 raw bits. Listen to the result before uploading any derivative to production.

### Safeguards and limits
- One hour / 1 GiB input pilot cap; three-minute FFmpeg process limit.
- Only mono or stereo outputs; original multichannel input rejected.
- Source and derivative SHA-256 stored for deduplication and integrity checks.
- Media codecs are **not** assumed from filename or extension.
- Dedicated compute is required for hosted automation. Cloudflare Workers can coordinate jobs but should not be expected to run FFmpeg conversion themselves.
- Temporary outputs are cleaned on errors. The output filename uses the source hash to avoid collision/overwriting.
- This prototype is not a production-hardened service: no sandboxing, malware scanning, resource quotas by user, IAM role separation, rollback orchestration, or upload reconciliation.

## Next step: cloud pipeline
1. Secure audio ingress in R2 (larger multipart upload and server-side validation).
2. Queue pending conversion job in D1/Queue; include source hash, actor UID, source asset ID, status, request ID and retries.
3. Trusted isolated FFmpeg worker pulls originals through narrowly scoped credentials, converts and verifies format/hash.
4. Uploads separate derivative R2 object and updates D1 asset relationship **after** upload success; retries must be idempotent.
5. Editor opens derived PCM object. Avoid silently loading compressed originals.
6. Shared conversion specification reused by Eldoret/Bull's Hits; **separate** buckets/projects/access control and mandatory verified local sync for playback.

## Licensing
FFmpeg licensing depends on how it is built and which external libraries are included. Check selected build/distribution terms before hosting commercial services.

## Phase 2 code (committed, **not yet deployed**)

The GitHub repository now contains an end-to-end **queue/processor/editor integration prototype**:

- `migrations/0003_normalisation_jobs.sql`: statuses, attempts, lease, source-to-derived relationship and backfill for older active originals.
- `src/index.js`: normalisation job created alongside every new original upload; an authenticated asset-status endpoint.
- `src/processing.js`: separate token-protected processor endpoints; claim a job, fetch an original, submit validated mono/stereo 24-bit/48 kHz WAV derivative, record audit and attach the resulting asset.
- `tools/audio-processor.mjs`: Node.js FFmpeg/FFprobe runner (polls queue, safely processes source in an isolated temporary directory, uploads working copy).
- `src/studio.js`: queue status on uploads, no 'Edit' on undecoded original, edit the linked PCM copy when ready.

**These files are only in GitHub.** No Cloudflare migration, new secret, or deployment has been run, and no dedicated conversion host/daemon is running. Merely publishing the Worker would leave jobs pending until a conversion runner is deployed. The project must not claim 'automatic conversion working' until an end-to-end hosted test has passed.

### Safe deployment order

1. Export/back up D1 and preserve R2. Review `0003` and apply it **once to the correct remote D1 database**, before deploying Worker code. `0002` is a separate, as-yet-unapplied audit migration; check migration history first.
2. Generate a **different** high-entropy `PROCESSOR_API_TOKEN` Worker secret, distinct from `ADMIN_API_TOKEN`. Store it in a secure secret manager on the *trusted dedicated conversion host*, never in Git, browser JavaScript, or chat.
3. Deploy Worker from the correctly configured, gitignored local Wrangler project settings. Confirm D1/R2 bindings; first test existing file downloads and trash/restore. Processor routes must not use the browser admin token.
4. On a trusted, isolated Linux/Node+FFmpeg host with HTTPS access to the Worker, set `WILLOW_API_BASE_URL` (Worker origin) and `PROCESSOR_API_TOKEN` securely and run `node tools/audio-processor.mjs`; use `--once` for one poll then stop. Run under a service supervisor with logs. This **must not** run in a browser or depend on a user's Mac being awake for live production.
5. Upload a small, **new** copy of Galaxy Ident via the ordinary web uploader. Verify queue → processor → derivative R2 object → D1 status complete → editor waveform/playback, including audit and trash semantics. Test browser refresh, long job, network drop, retries and corrupt input before user rollout.

### Known pilot limitations / required work before production

- Upload maximum is still **20 MiB** at the Worker API; derivative upload maximum **90 MiB** and buffering in Worker memory; large music shows may exceed that. Replace with presigned, multipart R2 transfer before broad use.
- Supports WAV, MP3, FLAC, M4A, OGG, AIFF where FFmpeg can decode, but formats must be validated on actual samples. Currently forces **stereo output** even for mono input; decide whether to retain mono channels based on library standards.
- Processing jobs use a 10-minute lease, three retries and a primitive claim endpoint; long-running/large-file work needs heartbeats, distributed concurrency testing and strict idempotent completion.
- Current admin credential is a shared browser token, **not individual user identity**; work on verified per-user authentication, permissions and audit attribution.
- Processor is a prototype, not a hardened container or cloud deployment. Secure execution isolation, malware scanning, precise resource limits, observability, secrets lifecycle and reconciliation are not done.
- Source and derived assets are linked and conversion recorded; byte hashes in R2 metadata do not by themselves prove full production content integrity. Add manifest checks, independent media analysis, loudness/true-peak statistics and playout-cache verification.
- Backfill excludes originals that already have active PCM derivatives; if an existing derived copy was not properly standardised, it requires a separate audit before reuse.
- Testing performed so far: static JavaScript syntax checks, plus previous **local** Galaxy Ident 24-bit conversion on the user's Mac. The new Worker/processor integration has **not** been exercised against deployed D1/R2.

### Operational rule

Do not request repeated manual audio conversion from Willow Tree staff. If the queue is unavailable, show 'Awaiting conversion' and report processing failure clearly. An uploaded original is not automatically editable until it has a verified working copy.
