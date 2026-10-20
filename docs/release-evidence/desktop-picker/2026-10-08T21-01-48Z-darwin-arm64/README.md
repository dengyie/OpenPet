# Desktop Picker Smoke Evidence

Local unsigned macOS arm64 packaged-app observation captured on 2026-10-09 (Asia/Shanghai) using the isolated profile `/tmp/openpet-demo-picker-followup-20261009`.

The packaged app launched, opened Control Center, exercised plugin picker cancel and valid-package review, showed invalid-package feedback, exercised Actions and Pet Pack picker cancellation, imported the Picker Smoke Pet pack, and preserved state after a Control Center renderer refresh. The report records **8/9** checks passed. `plugin-install-disabled` remains `pending` because the reviewed local plugin was not installed without a separate confirmation.

The artifact is unsigned and this evidence is for local demo behavior only. It does not establish signed release readiness.

- Report: [`desktop-picker-smoke-report.json`](./desktop-picker-smoke-report.json)
- Runbook: [`desktop-picker-smoke-runbook.md`](./desktop-picker-smoke-runbook.md)
- Fixture inputs: [`fixtures/`](./fixtures/)
