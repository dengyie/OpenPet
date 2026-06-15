<div align="center">

# 🐾 OpenPet

**An extensible, distributable, and operable Electron desktop pet platform**

[![Tests](https://img.shields.io/badge/tests-236%20node%20%2B%208%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.1-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Plugin Development](#plugin-development) • [Contributing](#contributing)

![OpenPet Demo](https://via.placeholder.com/800x400/1a1a1a/ffffff?text=OpenPet+Desktop+Pet+Platform)

</div>

---

## 🌟 Overview

**OpenPet** is an Electron-based desktop pet platform that evolved from a simple desktop mascot into an extensible pet runtime platform. A transparent-background cat stands on your desktop, supporting drag-and-drop, walking, action playback, and extensibility through plugins, AI, and HTTP APIs.

### Key Highlights

- 🎨 **Sprite Animation System** - Custom action frame import support
- 🤖 **AI Chat Integration** - OpenAI-compatible with semantic action triggers
- 🧩 **Plugin Ecosystem** - Permission-isolated plugin SDK for third-party extensions
- 📦 **Pet Pack Management** - Multi-pet pack support with one-click installation
- 🌐 **HTTP API + MCP** - Local API for external agent integration
- 🎛️ **Control Center** - React + Vite control panel with full UI configuration
- 🚀 **Desktop Release Track** - macOS release baseline; Windows packaging/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest tooling baseline with release-readiness gates still open

---

## ✨ Features

### 🎨 Pet Animation

- **Transparent Pet Window** - Adorable cat on your desktop
- **Drag & Drop** - Place anywhere on screen
- **Auto Walking** - Random movement within screen boundaries
- **Action Playback** - Custom action sequences
- **Speech Bubbles** - Display text messages
- **Frame Import** - Import ordered image sequences from folders

### 🤖 AI Integration

- **OpenAI-compatible API** - Supports OpenAI / Azure / compatible endpoints
- **Secure API Key Storage** - 0600 permissions, invisible to renderer
- **Persistent Session History** - Bounded conversation context
- **Semantic Action Triggers** - AI replies automatically trigger pet actions
- **Structured Behavior Orchestration** - tool-call + dry-run + cooldown
- **Configurable Rules** - actionId whitelist, trigger rules

### 🧩 Plugin System

- **Permission Whitelist** - `pet:say` / `ai:chat` / `network` / `storage`
- **Isolated Runtime** - Node permission model + VM isolation + short-lived processes
- **Restricted SDK** - No exposure of `require` / `process` / Electron
- **Config Schema** - Dynamic forms (string/number/boolean/enum)
- **Private Storage** - 64KB/plugin + 16KB/value quota
- **Catalog Directory** - Browse, install, and update plugins
- **Blocklist Governance** - Local blocklist to prevent risky packages

### 📦 Pet Pack Management

- **Manifest Schema** - `pet.json` defines pet packs
- **Full Lifecycle** - Check, import, enable, delete
- **Legacy Compatibility** - Built-in cat_anime/ as legacy-cat
- **User Install Directory** - `<userData>/pet-packs/`
- **Catalog Browse** - One-click install for third-party pet packs

### 🌐 HTTP API + MCP

- **Loopback Only** - `127.0.0.1` / `localhost` / `::1` only
- **Token-Gated** - All mutating operations require token
- **RESTful API** - `GET /api/status` / `POST /api/pet/say`
- **MCP JSON-RPC Bridge** - `POST /mcp`
- **Session Management** - TTL + revoke
- **Access Logs** - Persistent (tokens not logged)
- **Opt-in** - Disabled by default, UI toggle, port configuration

### 🎛️ Control Center

- **Pet Tab** - Scale, walk speed, bubble duration, auto-launch
- **Actions Tab** - Action list, import frames, pet pack management
- **AI Tab** - Provider config, API Key, connection test, chat window
- **Plugins Tab** - Plugin list, enable/disable, run commands, view logs
- **Catalog Tab** - Plugin/pet pack directory, install/update, permission review, blocklist
- **Service Tab** - HTTP service toggle, MCP endpoint, access logs
- **About Tab** - Version info, update check

---

## 🚀 Quick Start

### Requirements

- **Node.js**: >= 18.x
- **npm**: >= 9.x
- **OS**: macOS validated; Windows packaging/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest tooling baseline implemented but not release-ready; Linux/mobile are out of the current release scope

### Installation

```bash
# Clone the repository
git clone https://github.com/dengyie/OpenPet.git
cd OpenPet

# Install dependencies
npm install

# Start development mode
npm start
```

### Development Commands

```bash
npm start                    # Build Control Center + launch Electron
npm run dev:control-center   # Control Center hot reload (http://127.0.0.1:5173)
npm test                     # Run Node tests (236 tests)
npm run test:control-center  # Run Control Center Playwright UI regression tests
npm run check:syntax         # JS syntax validation
npm run generate-sprites     # Regenerate sprite sheets from cat_anime/flames/
npm run pack                 # electron-builder directory package
npm run dist                 # Generate current-host installer (macOS validated: DMG/ZIP)
```

---

## 📖 Documentation

### Main Docs

- **[CHANGELOG.md](./CHANGELOG.md)** - Release notes and version history
- **[project-documentation-design.md](./docs/project-documentation-design.md)** - Project goal, documentation layers, support-claim rules, and update playbooks
- **[HANDOFF.md](./docs/HANDOFF.md)** - Project handoff document
- **[jishuwendang.md](./docs/jishuwendang.md)** - Technical documentation (Chinese)
- **[productization-roadmap.md](./docs/productization-roadmap.md)** - Productization roadmap
- **[project-status-review.md](./docs/project-status-review.md)** - Comprehensive project review
- **[desktop-release-design.md](./docs/desktop-release-design.md)** - macOS + Windows desktop release design
- **[release-checklist.md](./docs/release-checklist.md)** - Release operator checklist and Windows evidence gates

### Architecture Docs

- **[pet-platform-development-plan.md](./docs/pet-platform-development-plan.md)** - Platform refactoring history
- **[mcp-usage.md](./docs/mcp-usage.md)** - MCP usage guide
- **[plugin-sandbox-evaluation.md](./docs/plugin-sandbox-evaluation.md)** - Plugin sandbox evaluation

### Phase Development Docs

- [Phase 1 - Control Center Modularization](./docs/phases/phase-1-control-center-modularization.md)
- [Phase 2 - Pet Pack Management](./docs/phases/phase-2-pet-pack-management.md)
- [Phase 3 - Plugin Ecosystem Productization](./docs/phases/phase-3-plugin-ecosystem.md)
- [Phase 4 - AI Behavior Orchestration](./docs/phases/phase-4-ai-behavior-orchestration.md)
- [Phase 5 - MCP Transport Productization](./docs/phases/phase-5-mcp-agent-productization.md)
- [Phase 6 - Distribution & Release Pipeline](./docs/phases/phase-6-distribution-release.md)
- [Phase 7 - Ecosystem Catalog Operations](./docs/phases/phase-7-ecosystem-operations.md)
- [Phase 8 - Windows Desktop Release](./docs/phases/phase-8-windows-desktop-release.md)
- [Phase 9 - Project Documentation Governance](./docs/phases/phase-9-project-documentation-governance.md)
- [Phase 10 - Project Documentation Design Hardening](./docs/phases/phase-10-project-documentation-design-hardening.md)
- [Phase 11 - Control Center Frontend Automation](./docs/phases/phase-11-control-center-frontend-automation.md)
- [Phase 12 - Control Center Saved Configuration Automation](./docs/phases/phase-12-control-center-saved-configuration-automation.md)
- [Phase 13 - Control Center Catalog Automation](./docs/phases/phase-13-control-center-catalog-automation.md)
- [Phase 14 - Control Center MCP Session Automation](./docs/phases/phase-14-control-center-mcp-session-automation.md)
- [Phase 15 - Project Documentation Design Consolidation](./docs/phases/phase-15-project-documentation-design-consolidation.md)

---

## 🧩 Plugin Development

### Plugin Structure

```
my-plugin/
├── plugin.json              # Plugin manifest
└── main.js                  # Plugin entry point
```

### plugin.json Example

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Your Name",
  "openpetApiVersion": "1.x",
  "permissions": ["pet:say", "ai:chat"],
  "networkAllowlist": ["https://api.example.com"],
  "commands": [
    {
      "id": "greet",
      "name": "Greet",
      "description": "Say hello"
    }
  ],
  "configSchema": {
    "message": {
      "type": "string",
      "default": "Hello!",
      "description": "Greeting message"
    }
  }
}
```

### main.js Example

```javascript
// Plugin entry, export command handler functions
module.exports = {
  async greet(ctx) {
    const message = await ctx.config.get('message');
    await ctx.pet.say(message);
  }
};
```

### Available SDK APIs

```javascript
// Pet operations
await ctx.pet.say(text);
await ctx.pet.playAction(actionId);
await ctx.pet.setEvent(event);

// Config read/write
const value = await ctx.config.get(key);
await ctx.config.set(key, value);

// Private storage (requires storage permission)
const data = await ctx.storage.get(key);
await ctx.storage.set(key, value);
await ctx.storage.remove(key);
await ctx.storage.clear();

// AI chat (requires ai:chat permission)
const reply = await ctx.ai.chat(conversationId, userMessage);

// Network requests (requires network permission + allowlist)
const response = await ctx.network.fetch(url, options);
```

### Plugin Development Guide

1. Create plugin directory: `<userData>/plugins/<plugin-id>/`
2. Write `plugin.json` and `main.js`
3. Enable plugin in Control Center → Plugins tab
4. Run commands to test

For more details, see [plugin-sandbox-evaluation.md](./docs/plugin-sandbox-evaluation.md)

---

## 🏗️ Architecture Overview

### Process Model

```
┌───────────────────────────────────────────────┐
│                  Main Process                 │
│  main.js assembles all services               │
│                                               │
│  ┌──────────────────────────────────────┐     │
│  │  Service Layer (19 services)         │     │
│  │  EventBus → SettingsService          │     │
│  │       ↓                              │     │
│  │  ActionService → PetService          │     │
│  │       ↓           ↓          ↓       │     │
│  │  AiService    PluginService  LocalHttp│    │
│  └──────────────────────────────────────┘     │
└──────────────┬────────────────────────────────┘
               │ IPC (contextBridge)
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────┐
│ Pet Window       │ │ Control Center   │
│ (renderer.js)    │ │ (React + Vite)   │
└──────────────────┘ └──────────────────┘
```

### Service Layer

- **event-bus.js** - In-process pub/sub event bus
- **settings-service.js** - Settings read/write + preview + change notifications
- **pet-service.js** - Single source of truth for pet state (say/playAction/setEvent)
- **action-service.js** - Action config reading, wraps pet pack
- **pet-pack-service.js** - Pet pack list, check, import, enable, delete
- **ai-service.js** - Provider-agnostic AI chat
- **behavior-orchestrator-service.js** - Structured AI behavior rules
- **plugin-service.js** - Plugin discovery, enable, command execution, isolated runner
- **plugin-install-service.js** - Plugin package inspect, install, update, uninstall
- **catalog-service.js** - Ecosystem catalog loading, download, hash verification
- **ecosystem-policy.js** - Blocklist policy
- **local-http-service.js** - Loopback HTTP API
- **mcp-transport-service.js** - MCP JSON-RPC bridge
- **about-service.js** - Version info, update check
- Other services...

---

## 🧪 Testing

The project uses **Node native test runner** for service/release coverage with **236 tests all passing**, plus a **Playwright Control Center UI regression baseline** with 8 UI tests.

```bash
npm test                     # Run Node tests
npm run test:control-center  # Run Control Center UI regression tests
npm run check:syntax         # Syntax check
npm run build:control-center # Control Center build verification
```

Test Coverage:
- ✅ Full service/release coverage (32 test files)
- ✅ Control Center shell / tab / Pet / About smoke coverage, Pet / AI / Service saved configuration flows, Catalog install/update flows, and Service MCP session management (8 Playwright tests)
- ✅ Pet pack schema / loader / importer
- ✅ Plugin manifest / runner / SDK
- ✅ AI service / behavior orchestrator
- ✅ HTTP API / MCP transport
- ✅ Catalog service / ecosystem policy
- ✅ Malicious input tests (path traversal, oversized body, invalid schema)

---

## 🤝 Contributing

Contributions of code, plugins, pet packs, or documentation are welcome!

### Development Workflow

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Submit a Pull Request

### Code Standards

- Write tests using Node native test runner
- Service layer must have unit tests
- Follow existing code style
- Run `npm test`, `npm run test:control-center`, and `npm run check:syntax` before committing UI or shared behavior changes

### Plugin Submissions

1. Add plugin entry in `catalog/openpet-catalog.json`
2. Provide plugin source code or download link
3. Submit PR explaining plugin functionality and permissions

---

## 🗺️ Roadmap

### v1.0.1-rc.1 (Current) ✅

- ✅ Product/repository rename to OpenPet
- ✅ Legacy `appData/ibot` user data compatibility
- ✅ OpenPet MCP/API/plugin naming with legacy aliases
- ✅ RC validation and release notes
- ✅ Control Center Playwright UI regression baseline

### v1.0 ✅

- ✅ Control Center modularization
- ✅ Pet pack management
- ✅ Plugin ecosystem productization
- ✅ AI behavior orchestration
- ✅ MCP transport productization
- ✅ macOS distribution & release pipeline
- ✅ Ecosystem catalog operations

### v1.1 (Planned)

- ⚡ Windows signed-artifact verification and smoke testing
- ⚡ Broader Control Center automation for manual plugin package install review
- ⚡ More example plugins (weather, pomodoro, RSS)
- ⚡ Plugin development tutorial videos
- ⚡ User feedback collection & iteration

### v2.0 (Future)

- ⚡ Remote marketplace backend
- ⚡ User rating/review system
- ⚡ Stronger plugin sandbox (SES / utilityProcess)
- ⚡ Multi-pet simultaneous display
- ⚡ Pet-to-pet interactions

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for details

---

## 🙏 Acknowledgments

Thanks to all contributors and community members for their support!

---

## 📧 Contact

- **GitHub Issues**: [https://github.com/dengyie/OpenPet/issues](https://github.com/dengyie/OpenPet/issues)
- **Author**: OpenPet contributors

---

<div align="center">

**⭐ If you like this project, please give us a Star! ⭐**

Made with ❤️ by the OpenPet team

</div>
