# Willow Tree — experimental CPU backend

This is a **separate prototype**, not the live website. It is not deployed and does not yet provide a stable API endpoint.

Uses Demucs `mdx_q` on CPU, exporting 192 kbps MP3 vocals and instrumental. One job runs at a time; 40 MB upload cap; 20-minute command timeout. CPU speed, host limits, and model quality have **not yet been tested**.

To try it on a compatible Python host with ffmpeg installed:

```sh
pip install -r requirements.txt
python app.py
```

On a host that supports Gradio, launch the app and test with a short, rights-cleared song. Do not expose publicly without authentication, file-retention cleanup, abuse controls, and resource limits. Generated temporary files currently persist until the host cleans them up.

**Hosting caution (October 2026):** Hugging Face lists CPU Basic hardware at zero hourly cost, but its documentation says creation of new compute Spaces requires a paid plan. Do not assume this can be deployed at £0 on a new free account.

Once a genuinely free CPU host has been verified, integrate its Gradio API into the existing website; do not replace the working GPU option before successful end-to-end tests.
