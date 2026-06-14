# Phase 8 开发文档：Windows 桌面分发落地

> 阶段目标：在不破坏现有 macOS release baseline 的前提下，按 `docs/desktop-release-design.md` 逐步补齐 Windows 桌面分发能力。  
> 范围约束：本阶段只考虑 macOS + Windows 桌面端；移动端不进入设计；Linux 延后。

## 1. 分阶段计划

### Phase 8.1：Windows 打包配置与资源

目标：让仓库具备明确、可复现的 Windows electron-builder 配置。

交付：

- 新增 `build/icon.ico`，作为 Windows installer / taskbar 图标。
- 新增 `scripts/generate-icons.js`，从 `build/icon.png` 生成多尺寸 ICO，避免不可追溯的二进制资源。
- 新增 `npm run generate-icons`。
- 在 `package.json build.win` 中定义 Windows `nsis` + `zip` targets，首版只启用 `x64`。
- 在 `package.json build.nsis` 中定义安装器交互、快捷方式和卸载数据保留策略。

验收：

- `npm run generate-icons` 可重复生成 `build/icon.ico`。
- `node --check scripts/generate-icons.js` 通过。
- `npm run check:syntax` 通过，证明新增脚本和现有 JS 语法均可解析。
- Windows installer 仍需在 Windows runner 中验证；macOS 本机只验证配置与非 Windows 代码路径不回退。

### Phase 8.2：Release Workflow 双平台化

目标：把 release workflow 从 macOS-only 扩展成 macOS + Windows。

交付：

- PR 路径使用 macOS + Windows matrix，分别执行 test、syntax 和 unsigned pack。
- tag / manual release 路径拆成 `release-macos` 与 `release-windows` 两个 job。
- Windows job 上传 `.exe`、`.zip`、`.blockmap`、`latest.yml`。
- macOS job 继续上传 `.dmg`、`.zip`、`.blockmap`、`latest-mac.yml`。
- `package.json build.artifactName` 统一使用 `${productName}-${version}-${os}-${arch}.${ext}`，避免 macOS ZIP 和 Windows ZIP 重名。

验收：

- `.github/workflows/release.yml` 可被 YAML parser 解析。
- macOS 本机 `npx electron-builder --win --x64 --dir --publish never` 仍可生成 Windows unpacked 包。
- `npm run pack` 仍可生成 macOS 目录包。
- `npm run check:syntax` 和 `npm test` 通过。

### Phase 8.3：About 更新资产平台筛选与发布清单

目标：让 About 更新检查在同一个 GitHub Release 中只展示当前桌面平台可安装资产，并把发布文档口径从“Windows 仅规划”更新为“构建/CI 基线已落地，签名和冒烟仍待完成”。

交付：

- `AboutService` 支持注入 `platform` / `arch`，便于测试 macOS 与 Windows 更新资产选择。
- macOS 只展示 `.dmg` 与 macOS `.zip`，不展示 Windows `.exe` 或 Windows `.zip`。
- Windows 只展示 `.exe` 与 Windows `.zip`，不展示 macOS `.dmg` 或 macOS `.zip`。
- `.blockmap`、`latest.yml`、`latest-mac.yml` 不作为用户可安装资产展示。
- release checklist 补充平台资产验收项。

验收：

- `npm run check:syntax` 通过。
- `npm test` 通过。

### Phase 8.4：Windows 签名策略与发布清单

目标：文档化 Windows 官方签名策略，并给 unsigned prerelease 明确边界。

交付：

- 在 release checklist 中补 Windows 证书来源、CI secret 名称和 unsigned artifact 标签策略。
- 官方 release 要求 signed；开发/RC 可 unsigned，但不能声称可规避 SmartScreen。
- release workflow 对稳定 Windows tag 强制要求 signing secrets。
- unsigned Windows prerelease artifact 自动加 `unsigned` 文件名标记，并同步更新 `latest.yml`。

验收：

- `node --check scripts/prepare-windows-release-assets.js` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过。

### Phase 8.5a：Windows 冒烟证据门禁

目标：在真实 Windows 机器验证前，先把 Windows 冒烟报告格式、必填检查项和签名证据门禁固化为可测试脚本，避免后续用零散文字或截图口头声明 release-ready。

交付：

- 新增 `scripts/validate-windows-smoke-report.js`，校验 Windows 冒烟报告 JSON。
- 新增 `docs/release-evidence/windows-smoke-report.template.json`，作为真实 Windows 验证时复制填写的模板。
- 新增 `npm run validate-windows-smoke-report`。
- 新增 `tests/release/windows-smoke-report.test.js`，覆盖 pending 模板、缺失检查、通过但无证据、unsigned prerelease、signed official readiness 等路径。
- 修正 `.gitignore` 的 `release/` 忽略规则为根目录 `/release/`，避免误忽略 `tests/release/`。

验收：

- 模板只能在 `--allow-pending` 下证明结构有效。
- 默认模式要求所有必填 Windows 冒烟项均为 `pass` 且包含证据。
- `--require-signed` 额外要求 `artifact.signed === true`、Authenticode 状态为 `Valid`，并填写签名验证证据。
- 本阶段不声称真实 Windows smoke validation 已完成。

### Phase 8.5：Windows 冒烟验证

目标：Windows 支持声明前完成真实运行验证。

计划：

- 复制 `docs/release-evidence/windows-smoke-report.template.json` 为版本化报告，并在真实 Windows 环境中填写证据。
- 验证安装、启动、卸载。
- 验证透明宠物窗口、拖拽、边界、always-on-top、taskbar 行为。
- 验证 Control Center 全 tab。
- 验证 plugin runner、pet-pack import、sprite/native dependency。
- 验证 Local HTTP/MCP 默认关闭、loopback only、token-gated。
- 验证 API key 不暴露给 renderer 或普通插件。
- 对 RC/beta/alpha 报告运行 `npm run validate-windows-smoke-report -- docs/release-evidence/<report>.json`。
- 对官方稳定版报告额外运行 `npm run validate-windows-smoke-report -- docs/release-evidence/<report>.json --require-signed`。

## 2. Phase 8.1 实施记录

本阶段新增 Windows 打包配置，但不声称 Windows release-ready。原因是 NSIS installer、SmartScreen、Windows path 行为和透明窗口都必须在 Windows 环境中验证。

实现决策：

- `build/icon.png` 继续作为图标源。
- `build/icon.ico` 包含 `256`、`128`、`64`、`48`、`32`、`16` 六个尺寸，内部使用 PNG 编码。
- `build.win.target` 使用 `nsis` + `zip`，首版只生成 `x64`。
- `build.nsis.deleteAppDataOnUninstall` 设为 `false`，避免卸载误删用户数据，与升级兼容策略一致。

剩余风险：

- macOS 本机不能证明 NSIS installer 可用。
- Windows 代码签名尚未配置。
- `.github/workflows/release.yml` 仍是 macOS-only，需要 Phase 8.2 处理。
- About/update 仍需后续验证平台 artifact 展示。

## 3. Phase 8.2 实施记录

本阶段把 CI/release 从 macOS-only 推进到双平台产物，但 Windows 仍默认 unsigned。这样可以先建立可下载、可审查的 Windows artifact，再在后续阶段补代码签名与真实机器冒烟。

实现决策：

- PR workflow 改为 matrix：`macos-latest` 执行 `npm run pack`，`windows-latest` 执行 `electron-builder --win --x64 --dir --publish never`。
- release workflow 拆为 `release-macos` 与 `release-windows`，降低签名条件互相影响的风险。
- macOS release 保留 Apple signing / notarization secret 检查，缺少 secrets 时继续生成 unsigned macOS prerelease artifact。
- Windows release 使用 unsigned build，并显式关闭 code signing auto discovery。
- artifact 命名增加 `${os}-${arch}`，避免双平台 ZIP 与 blockmap 混淆。

剩余风险：

- Windows release job 需要 GitHub Actions 实跑验证。
- Windows 代码签名和 SmartScreen reputation 尚未解决。
- About/update asset 展示在 Phase 8.2 时仍只做通用 install asset 摘要，已在 Phase 8.3 改为按当前平台筛选。
- 真实 Windows 安装、卸载、透明窗口与 plugin runner 冒烟仍未完成。

## 4. Phase 8.3 实施记录

本阶段补齐 About/update 与双平台 release artifact 的连接点。GitHub Release 会同时包含 macOS 和 Windows 资产；用户在 About 页检查更新时，不应看到另一个平台的安装包，也不应把 `.blockmap` 或 update feed YAML 当成可下载安装包。

实现决策：

- `createAboutService()` 新增可注入的 `platform` / `arch`，生产环境默认继续使用 `process.platform` / `process.arch`，测试可以稳定模拟 `darwin` 和 `win32`。
- asset 过滤先排除 `.blockmap`、`latest.yml`、`latest-mac.yml`。
- asset 名称包含 `darwin` / `mac` / `macos` 时视为 macOS 资产，包含 `win` / `win32` / `windows` 时视为 Windows 资产。
- macOS 接受 `.dmg` 和当前平台 `.zip`；Windows 接受 `.exe` 和当前平台 `.zip`。
- 没有平台 token 的 legacy `.zip` 仍按当前平台保留，避免旧单平台 release 的 zip 被完全隐藏；但当前 `artifactName` 已带 `${os}-${arch}`，双平台 release 不会依赖这个兼容路径。

当时剩余风险：

- Phase 8.3 时 Windows 签名策略仍未落地；已在 Phase 8.4 补为 release workflow 护栏，但官方 Windows release 仍不能声称 SmartScreen trust。
- Windows release job 仍需要 GitHub Actions 实跑证据。
- 真实 Windows 安装、卸载、透明窗口与 plugin runner 冒烟仍未完成。

验证：

- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 172/172。

## 5. Phase 8.4 实施记录

本阶段把 Windows 签名策略从文档风险推进为 release workflow 的显式护栏。目标不是伪造“Windows 已可发布”，而是防止稳定版 tag 在缺少代码签名证书时产出看起来像正式版的 Windows 安装包，同时允许 RC/beta/alpha 继续生成可测试的 unsigned artifact。

实现决策：

- Windows 官方签名使用 electron-builder Authenticode 路径，CI secret 名称固定为 `WINDOWS_CSC_LINK` 与 `WINDOWS_CSC_KEY_PASSWORD`。
- `release-windows` job 会解析 tag：`vX.Y.Z` 视为稳定版，`vX.Y.Z-rc.N` / `beta` / `alpha` 视为 prerelease。
- 稳定版 Windows tag 缺少任一签名 secret 时 workflow 直接失败，不再上传 unsigned 正式资产。
- prerelease 缺签名时仍可构建，但会运行 `npm run prepare-windows-release-assets`，把 `.exe`、`.zip`、`.blockmap` 文件名加上 `unsigned`，并同步更新 `latest.yml` 中的文件引用。
- 新增 `scripts/prepare-windows-release-assets.js`，将 unsigned asset 命名逻辑做成可测试脚本，避免在 YAML 中堆叠易碎 shell rename。
- 新增 `tests/services/windows-release-assets.test.js`，覆盖 unsigned 文件名插入、`latest.yml` 引用更新、冲突文件保护。

剩余风险：

- 仓库尚未配置真实 Windows 签名证书 secret，也尚未产出可验证的 signed Windows artifact。
- SmartScreen reputation 仍取决于证书信誉和发布后的安装反馈，不能仅靠签名策略保证。
- 真实 Windows 安装、卸载、透明窗口与 plugin runner 冒烟仍未完成。

验证：

- `node --check scripts/prepare-windows-release-assets.js` 通过。
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 175/175。

## 6. Phase 8.5a 实施记录

本阶段没有执行真实 Windows 安装验证，而是补齐未来执行真实验证时必须提交的结构化证据门禁。这样后续在 Windows clean VM、实体机或 CI-backed manual 环境里跑冒烟时，可以用同一份 JSON 报告和同一个脚本判断是否足以支撑 Windows support claim。

实现决策：

- `REQUIRED_CHECKS` 固定覆盖 install、launch、透明窗口、拖拽边界、Control Center tabs、pet actions、pet pack import、plugin runner、Local HTTP/MCP 默认关闭与 token-gated、API key isolation、About/update assets、uninstall。
- `validateReport()` 默认要求所有必填项 `pass`，且每个通过项必须有 evidence；`fail` / `blocked` 必须有 notes。
- `--allow-pending` 只用于模板或进行中的报告结构检查，不设置 release readiness。
- `--require-signed` 单独作为官方稳定 Windows release 的签名门槛，要求 Authenticode `Valid` 证据。
- unsigned prerelease smoke report 可以证明冒烟矩阵通过，但脚本会警告它不能证明 official release readiness。
- `.gitignore` 改为只忽略根目录 `/release/`，保留构建产物忽略语义，同时允许 `tests/release/` 入库。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- 仓库仍未包含 signed Windows artifact 与 `Get-AuthenticodeSignature` 证据。
- SmartScreen reputation 仍是外部信任问题，不能由本地校验脚本单独证明。

验证：

- `node --check scripts/validate-windows-smoke-report.js` 通过。
- `npm run validate-windows-smoke-report -- docs/release-evidence/windows-smoke-report.template.json --allow-pending` 通过，显示 `Checks: 0/13 passed` 且只声明结构有效。
- `node --test tests/release/windows-smoke-report.test.js` 通过，6/6。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 181/181。
