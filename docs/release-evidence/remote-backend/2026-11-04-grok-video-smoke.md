# Guangzhou Grok Video Provider Smoke

- Date: 2026-11-04
- GitHub revision: `549650eb8acfe7a0c9ba8c0c7895c892f69ad35e`
- Pull request: `#100`
- Main CI: `41798807159` (`success`)
- Backend: Guangzhou resident host, `openpet-backend-host.service`
- Deployment snapshot: `/var/backups/openpet/20261104T095727Z-851866`

## Deployment Verification

- Service is `active` and `enabled`.
- Health is `ready / resident`.
- Backend listeners remain loopback-only at `127.0.0.1:48330` and `127.0.0.1:48332`.
- Mesh Nginx remains bound to `10.144.144.8:80/443`.
- Deployed `grok-video-provider.js` SHA-256 is `e17cd3437bb0a0f2692bdf248dc5a3cb1588bba22e9d72b422cd637c0d58f7d2`, matching `origin/main`.
- Resident Provider keys remain in the root-managed `/etc/openpet/provider-keys.json` boundary with mode `0600` and owner `openpet:openpet`; no secret value was printed or copied into evidence.

## Live Model Discovery

The adapter called Mango API `/v1/models` using the resident secret boundary. The response contained 93 total models and these compatible video models:

```text
grok-imagine-video
grok-imagine-video-1.5
```

`grok-imagine-video-1.5-preview` had appeared in an earlier catalog response but was absent from this live response. The adapter remains compatible with it and only exposes it when returned by the Provider.

## Real Generation

The smoke used the repository reference `cat_anime/flames/bai_no_bg/01_no_bg.png`, the default `grok-imagine-video` model, a locked-camera idle-loop prompt, `1280x720`, `16:9`, and `720p`.

- Provider task: `task_mYZuEK0xO3a9u8s35z3uFYarRUvYr7J6`
- Terminal state: `completed`, followed by a successful content download
- Media: ISO MP4, H.264 video, 1280x720, 24 fps, 6.04 seconds
- Bytes: `1,657,509`
- SHA-256: `41b8af081d63c63429ae40eedd56c72b88f89fe45d875657c0f2dfd55bb50c88`

## Downstream Creator Processing

The generated MP4 was passed through the shipped Creator video decoder, full-timeline sampler, edge-connected chroma-key matte, despill, stable placement, Sprite sheet, contact sheet, and animated GIF pipeline on the Backend host.

- Source frames: 145
- Selected frames: 6 of 6 required by the idle motion driver
- Temporal QA: `ok=true`, no failure codes
- Unique motion frames: 6
- Mask dropout rate: 0
- Loop seam ratio: `0.035298894714480784`
- Body scale coefficient of variation: `0.010677841881926919`
- Processed Sprite SHA-256: `89d608d6e1721addbfb84aa545dea5a13ef36a7587bc345a5053b411a44666bd`
- Animated GIF SHA-256: `6baa64e36865d6fe68c3eb4dce342a8f12c8ed733ef8dfd5c1a690535560b0c6`

This proves the default Provider request, polling, download, frame extraction, matting, normalization, artifact generation, and deterministic temporal QA path for one real idle video. It does not claim that the full Creator `idle` / `waving` / `jumping` set or human art approval has completed.
