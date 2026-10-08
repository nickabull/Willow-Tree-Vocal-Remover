# CPU backend deployment checklist (not yet deployed)

This container is a *candidate* for low-volume, CPU-only hosting. No free provider or end-to-end song separation has been verified.

## Container
Build from the `cloud-backend` directory on a Docker-capable host:

```sh
docker build -t willow-cpu .
docker run --rm -p 7860:7860 -e PORT=7860 willow-cpu
```

Visit `http://localhost:7860` and upload a short audio clip you have permission to process.

## Before connecting to the public Willow Tree website

1. Confirm the host's actual **free** pricing, sleeping policy, CPU/RAM/disk limits, maximum request duration, and outbound download allowances.
2. Verify a full 3–5-minute track, and measure processing time and memory usage. Demucs on CPU may be slow.
3. Add authentication and rate limiting at the host or reverse proxy before public exposure. The prototype currently has no access control.
4. Ensure Gradio's generated file URLs are reachable from the GitHub Pages frontend (HTTPS and CORS); verify actual API endpoint and output order.
5. Review privacy and retention. The prototype stores uploaded audio temporarily and attempts cleanup of its own work files after two hours; Gradio maintains a separate cache.
6. Only then change `app.js` to use the deployed endpoint, retaining a tested fallback.

Do not commit API keys, passwords, or access tokens into the public repository.
