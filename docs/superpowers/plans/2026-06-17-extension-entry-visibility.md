# Extension Entry Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make extension `entries.commands`, `entries.services`, `entries.dashboards`, `config`, `assets`, and `manifest` declarations visible in Control Center review and installed-plugin surfaces, paired with Phase 57's explicit dashboard-open action.

**Architecture:** Add a small renderer-only declaration component shared by `PluginsPane` and `CatalogPane`. Feed it from existing `PluginPackageReviewViewState` and `PluginViewState` contracts; keep command/service execution behavior unchanged so declaration-only packages remain non-runnable, while Phase 57 attaches an explicit dashboard-open action.

**Tech Stack:** Electron main process, React + Vite Control Center, TypeScript shared contracts, Playwright UI smoke tests, Node native tests.

---

### Task 1: Write Failing UI Coverage

**Files:**
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Add expectations for plugin review declarations**

In `installs Catalog plugins from the review panel with the demo API`, add assertions after the package metadata expectations:

```js
await expect(reviewPanel).toContainText('Entry declarations')
await expect(reviewPanel).toContainText('Command entries')
await expect(reviewPanel).toContainText('weather-report')
await expect(reviewPanel).toContainText('Service entries')
await expect(reviewPanel).toContainText('weather-companion')
await expect(reviewPanel).toContainText('Dashboard entries')
await expect(reviewPanel).toContainText('weather-dashboard')
```

In `installs manual plugin packages from the Plugins review panel with the demo API`, add assertions after `命令：hello`:

```js
await expect(reviewPanel).toContainText('Entry declarations')
await expect(reviewPanel).toContainText('Command entries')
await expect(reviewPanel).toContainText('hello')
await expect(reviewPanel).toContainText('Service entries')
await expect(reviewPanel).toContainText('manual-companion')
await expect(reviewPanel).toContainText('Dashboard entries')
await expect(reviewPanel).toContainText('manual-dashboard')
await expect(reviewPanel).toContainText('Config')
await expect(reviewPanel).toContainText('config.schema.json')
await expect(reviewPanel).toContainText('Assets')
await expect(reviewPanel).toContainText('assets/manual-card.html')
await expect(reviewPanel).toContainText('Manifest')
await expect(reviewPanel).toContainText('Demo local data disclosure.')
```

After the installed manual plugin row assertions, add:

```js
await expect(pluginRow).toContainText('Entry declarations')
await expect(pluginRow).toContainText('Command entries')
await expect(pluginRow).toContainText('hello')
await expect(pluginRow).toContainText('Service entries')
await expect(pluginRow).toContainText('manual-companion')
await expect(pluginRow).toContainText('Dashboard entries')
await expect(pluginRow).toContainText('manual-dashboard')
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run test:control-center
```

Expected: FAIL because the current Control Center does not render entry declaration sections.

### Task 2: Add Shared Declaration Renderer

**Files:**
- Create: `src/control-center/src/components/PluginEntryDetails.tsx`
- Modify: `src/control-center/src/styles.css`

- [ ] **Step 1: Create renderer component**

Create `src/control-center/src/components/PluginEntryDetails.tsx`:

```tsx
import type {
  JsonObject,
  PluginEntriesViewState,
  PluginManifestViewState,
  PluginViewState
} from '../../../shared/openpet-contracts'

type PluginEntryDetailsSource = Pick<PluginManifestViewState, 'entries' | 'config' | 'configSchema' | 'manifest' | 'assets'> |
  Pick<PluginViewState, 'entries'>

const hasEntries = (entries?: PluginEntriesViewState) => Boolean(
  entries?.commands?.length ||
  entries?.services?.length ||
  entries?.dashboards?.length
)

const formatManifest = (manifest?: JsonObject) => {
  if (!manifest || Object.keys(manifest).length === 0) return ''
  return JSON.stringify(manifest, null, 2)
}

export function PluginEntryDetails({ source, compact = false }: { source?: PluginEntryDetailsSource | null, compact?: boolean }) {
  const entries = source?.entries
  const configPath = 'config' in (source || {}) ? source?.config || source?.configSchema || '' : ''
  const assets = 'assets' in (source || {}) && Array.isArray(source?.assets) ? source.assets : []
  const manifestText = 'manifest' in (source || {}) ? formatManifest(source?.manifest) : ''

  if (!hasEntries(entries) && !configPath && !assets.length && !manifestText) return null

  return (
    <div className={compact ? 'plugin-entry-details compact' : 'plugin-entry-details'}>
      <strong>Entry declarations</strong>
      {entries?.commands?.length ? (
        <div className="plugin-entry-section">
          <span>Command entries</span>
          {entries.commands.map((command) => (
            <code key={command.id}>{command.id}{command.command ? ` · ${command.command}` : ''}</code>
          ))}
        </div>
      ) : null}
      {entries?.services?.length ? (
        <div className="plugin-entry-section">
          <span>Service entries</span>
          {entries.services.map((service) => (
            <code key={service.id}>{service.id}{service.command ? ` · ${service.command}` : ''}</code>
          ))}
        </div>
      ) : null}
      {entries?.dashboards?.length ? (
        <div className="plugin-entry-section">
          <span>Dashboard entries</span>
          {entries.dashboards.map((dashboard) => (
            <code key={dashboard.id}>{dashboard.id}{dashboard.url ? ` · ${dashboard.url}` : ''}</code>
          ))}
        </div>
      ) : null}
      {configPath ? (
        <div className="plugin-entry-section">
          <span>Config</span>
          <code>{configPath}</code>
        </div>
      ) : null}
      {assets.length ? (
        <div className="plugin-entry-section">
          <span>Assets</span>
          {assets.map((asset) => <code key={asset}>{asset}</code>)}
        </div>
      ) : null}
      {manifestText ? (
        <div className="plugin-entry-section">
          <span>Manifest</span>
          <pre>{manifestText}</pre>
        </div>
      ) : null}
      <small>These declarations are shown for review. Services are not started; dashboards open only through an explicit Control Center action.</small>
    </div>
  )
}
```

- [ ] **Step 2: Add styles**

Append near plugin styles in `src/control-center/src/styles.css`:

```css
.plugin-entry-details {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #dde2e8;
  border-radius: 8px;
  background: #f8fafc;
}

.plugin-entry-details.compact {
  padding: 10px;
}

.plugin-entry-details > strong {
  color: #374151;
  font-size: 13px;
}

.plugin-entry-section {
  display: grid;
  gap: 6px;
}

.plugin-entry-section > span,
.plugin-entry-details small {
  color: #6b7280;
  font-size: 12px;
}

.plugin-entry-section code,
.plugin-entry-section pre {
  margin: 0;
  padding: 6px 8px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  border-radius: 6px;
  background: #eef2f7;
  color: #1f2937;
  font-size: 11px;
}
```

### Task 3: Wire Review And Plugin Surfaces

**Files:**
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `src/control-center/src/panes/CatalogPane.tsx`
- Modify: `src/control-center/src/api/control-center-api.ts`

- [ ] **Step 1: Render declarations in Plugins pane**

Import the component:

```tsx
import { PluginEntryDetails } from '../components/PluginEntryDetails'
```

Add below the review panel command line:

```tsx
<PluginEntryDetails source={plugin} />
```

Add below the installed plugin command buttons:

```tsx
<PluginEntryDetails source={plugin} compact />
```

- [ ] **Step 2: Render declarations in Catalog review**

Import the component in `CatalogPane.tsx`:

```tsx
import { PluginEntryDetails } from '../components/PluginEntryDetails'
```

Add below the signature/block errors in `CatalogPluginReview`:

```tsx
<PluginEntryDetails source={plugin} />
```

- [ ] **Step 3: Enrich demo review payloads**

Update `createDemoPluginReview()` to include one command, service, dashboard, config, asset, and manifest disclosure.

Update `demoManualPluginReview.plugin` similarly:

```ts
entries: {
  commands: [{ id: 'hello', title: 'Say hello', command: 'node ./index.js', cwd: '.' }],
  services: [{ id: 'manual-companion', title: 'Manual Companion', command: 'npm run companion', cwd: '.' }],
  dashboards: [{ id: 'manual-dashboard', title: 'Manual Dashboard', url: 'http://127.0.0.1:8787' }]
},
config: 'config.schema.json',
configSchema: 'config.schema.json',
manifest: {
  dataLocations: [{ path: 'OPENPET_DATA_DIR', description: 'Demo local data disclosure.' }]
},
assets: ['assets/manual-card.html']
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run test:control-center
```

Expected: PASS, 10/10 Playwright tests.

### Task 4: Record Phase 57

**Files:**
- Create: `docs/phases/phase-57-extension-entry-visibility.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`
- Modify: `docs/productization-v1.1-todo-design.md`
- Modify: `docs/project-context.json`

- [ ] **Step 1: Create phase record**

Record the goal, non-goals, implementation summary, test-first evidence, and verification commands.

- [ ] **Step 2: Update live docs factually**

Add that Control Center now displays extension entry declarations in plugin review and installed-plugin surfaces. Dashboard opening is covered by `2026-06-17-plugin-dashboard-open.md`; do not claim service start/stop, setup execution, health checks, or shell command support.

### Task 5: Review, Verify, Commit

**Files:**
- Create: `docs/reviews/phase-57-extension-entry-visibility-review.md`

- [ ] **Step 1: Run production review**

Run:

```bash
python3 /Users/mango/.agents/skills/production-code-quality-review/scripts/collect-review-context.py --repo /Users/mango/project/codex/OpenPet
```

Use `production-code-quality-review` references, inspect the diff, record findings, and apply fixes.

- [ ] **Step 2: Full verification**

Run:

```bash
npm run check:syntax
npm run test:control-center
npm test
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json', 'utf8')); console.log('project-context ok')"
```

- [ ] **Step 3: Commit and push**

Run:

```bash
git add README.md README.zh-CN.md docs src tests
git commit -m "feat: show extension entry declarations"
git push origin codex/extension-entry-visibility
```

---

## Self-Review

- Spec coverage: The plan covers review UI, installed plugin UI, Catalog review UI, demo payloads, docs, production review, and verification.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: The plan uses existing `PluginEntriesViewState`, `PluginManifestViewState`, `PluginViewState`, and `PluginPackageReviewViewState` names from shared contracts.
