# Packaged Runtime Pending Report

Generated at: 2026-07-06T16:34:37.809Z

This directory contains the current `v1.0.1-rc.3` packaged-runtime operator packet for macOS. It was generated from the release assets without launching the packaged app.

- `packaged-runtime-smoke-report.json` records the current artifact metadata, `artifact.signed=false`, and the broken signature text under `artifact.signatureEvidence`.
- `packaged-runtime-smoke-runbook.md` is an operator guide for a later real packaged-app validation run.
- Every packaged-runtime check remains `pending` until a real launched packaged-app session fills evidence.

This packet is useful because it preserves the current release truth in a structured report shape. It does not prove packaged runtime readiness by itself.
