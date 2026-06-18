# OpenPet Plugin Cleanup Evidence Update Commands

Run these from the repository root after reviewing the collected evidence. Replace placeholders with concrete file paths or transcript excerpts.

```bash
npm run update-plugin-cleanup-evidence-report -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-report.json' --set-env machine="$(hostname)" --set-env runner="manual plugin cleanup validation" --set-env evidence="<evidence directory or transcript link>"
npm run validate-plugin-cleanup-evidence-report -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-report.json' --allow-pending
```

Do not use these commands to mark checks as pass until the matching real-host cleanup evidence exists.
