# Browser-based fallback integration

User-approved direction: cloud separation first; if the cloud quota is exhausted, run a model in the same Willow Tree page with no software installation.

## Candidate

[incidentist/web-audio-separation](https://github.com/incidentist/web-audio-separation) (MIT) provides an ONNX Runtime Web implementation with `createSeparator('UVR-MDX-NET-Voc_FT')`, `loadModel()` and `separate(objectUrl)`. It advertises a roughly 67 MB model and WebGPU/WASM fallback.

## Integration work needed

- Bundle `web-audio-separation` and `onnxruntime-web` for GitHub Pages using a pinned version and reproducible build; avoid depending on a fragile unversioned CDN module.
- Test the library's returned stem order, codec (typically WAV), duration, browser memory use and progress API.
- Run separation in a worker where supported so the mixer UI remains responsive.
- On quota error, automatically switch to browser processing and explain the one-time ~67 MB model download. Offer cancel/retry and handle unsupported browsers.
- Reuse the existing `done()`/mixer pipeline, setting correct WAV download extensions for local stems and cleaning up blob URLs when another track loads.
- Test with an actual 3-4 minute track on Chrome/Edge, and a device without WebGPU. Verify both tracks audibly and ensure no cloud upload occurs on the fallback path.

**Not yet integrated or verified.** Keep the existing live cloud service and manual alternative link until the local integration passes browser tests.
