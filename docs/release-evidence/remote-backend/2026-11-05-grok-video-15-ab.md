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

Both OpenPet requests supplied the same reference image, prompt, `1280x720` output, and two-second request. Each run completed Provider submission, polling, content download, frame extraction, green-screen matting, despill, stabilization, Sprite/GIF/contact-sheet generation, and temporal QA. The later upstream audit below limits what these requests prove.

| Model | Provider artifact | QA result | Loop seam ratio | Body scale CV | Root X std | Notes |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| `grok-imagine-video` | 697,764 bytes | `ok=true` | 0.0684813 | 0.0111063 | 20.8966 | 6 unique motion frames; no mask dropout |
| `grok-imagine-video-1.5` | 584,621 bytes | `ok=true` | 0.0115184 | 0.0080069 | 0.3727 | 6 unique motion frames; no mask dropout; alpha flicker 0.0004546 |

The second output measured a lower loop seam ratio, body-scale variance, and root drift. These are measurements of two generated outputs, not evidence of a difference between upstream models.

## Upstream audit correction (2026-11-06)

Mango channel #345 maps both `grok-imagine-video-1.5` and its preview alias to `grok-imagine-video`. Historical Grok Web jobs record `input_image_count=0`: the generic gateway DTO discarded OpenPet's `image_url`. Consequently this sample does not establish reference-conditioned generation, identity preservation, or superior quality from a distinct 1.5 model. The configured default remains selectable, but its previous model-selection rationale is withdrawn.

OpenPet `2eb6f725` now sends the native `image: {url: dataURL}` first-frame object. Mango API `e2e64b981` preserves that object through its existing host video protocol; deployment CI `42106616711` succeeded and the production version matches. A real request using Mikan's accepted canonical image created Grok Console job `video_GKfCMehn-xQjNIuTDinvCrGH` with `input_image_count=1`. It failed because the upstream rejected the account's free usage/provisioning state. Grok Web currently rejects image input locally. This verifies reference transport only; a completed reference-conditioned video and complete Creator package remain pending.

## Boundary

The original outputs prove text-conditioned Provider generation and technical post-processing. They do not prove reference-conditioned video, a complete Creator pet pack, or human art approval.
