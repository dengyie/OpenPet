# Guangzhou Grok Video 1.5 A/B Evidence

- Date: 2026-11-05
- Scope: real Provider generation plus the shipped Creator video post-processing chain
- Secret handling: no API key, session token, or private URL is recorded

## Live Catalog

Mango API `/v1/models` returned 100 models. The compatible video models were:

```text
grok-imagine-video
grok-imagine-video-1.5
```

The adapter keeps both models selectable. `grok-imagine-video-1.5` is now the quality-first default; the older model remains the explicit fallback.

## Same-input A/B

Both runs used the same reference image, prompt, `1280x720` output, and two-second request. Each run completed Provider submission, polling, content download, frame extraction, green-screen matting, despill, stabilization, Sprite/GIF/contact-sheet generation, and temporal QA.

| Model | Provider artifact | QA result | Loop seam ratio | Body scale CV | Root X std | Notes |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| `grok-imagine-video` | 697,764 bytes | `ok=true` | 0.0684813 | 0.0111063 | 20.8966 | 6 unique motion frames; no mask dropout |
| `grok-imagine-video-1.5` | 584,621 bytes | `ok=true` | 0.0115184 | 0.0080069 | 0.3727 | 6 unique motion frames; no mask dropout; alpha flicker 0.0004546 |

The 1.5 result is the better default for this sample because it had a materially lower loop seam ratio, lower body-scale variance, and near-zero root drift while preserving six distinct motion frames. This is a model-selection signal, not a substitute for the remaining three-action and human art-quality gates.

## Boundary

This evidence proves the real Provider and technical post-processing path. It does not claim that a complete `idle` / `waving` / `jumping` pet pack or human art approval has been completed.
