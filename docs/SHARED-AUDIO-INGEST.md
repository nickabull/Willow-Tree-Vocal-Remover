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
