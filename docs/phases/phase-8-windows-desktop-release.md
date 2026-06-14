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

### Phase 8.5b：Windows 冒烟报告 CI 产物

目标：让每次 Windows release job 自动生成一份结构化 pending 冒烟报告，记录本次构建产物、版本、runner 与 Authenticode 状态，作为后续真实 Windows 验证补证据的起点。

交付：

- 新增 `scripts/create-windows-smoke-report.js`，从 `release/` 目录生成 `windows-smoke-report.json`。
- 新增 `npm run create-windows-smoke-report`。
- Windows release workflow 在上传用户安装资产前生成并校验 pending 报告。
- Windows release workflow 将 `release/windows-smoke-report.json` 作为 GitHub Actions artifact 上传，不混入公开 Release 用户下载资产。
- 新增 `tests/release/create-windows-smoke-report.test.js`，覆盖 Windows artifact 选择、Authenticode 状态解析、pending 报告结构校验、非 Windows 本机保护和缺失产物错误。

验收：

- 生成脚本默认要求在 Windows 上运行；本地结构测试可显式使用 `--allow-non-windows`。
- 生成报告只能作为 `--allow-pending` 结构证据，不证明 install / launch / 透明窗口 / plugin runner 已通过。
- 报告必须包含 `.exe`、`.zip`、`latest.yml`，并记录 blockmap 与文件大小。
- Windows runner 上如果能执行 `Get-AuthenticodeSignature`，报告记录 Authenticode 状态与原始证据。
- 本阶段不声称真实 Windows smoke validation 已完成。

### Phase 8.5c：Windows 冒烟报告填写工具

目标：让真实 Windows 验证人员可以用命令逐项补充环境、产物和 smoke check 证据，减少手改 JSON 出错或误把 pending 报告当成 ready 报告的风险。

交付：

- 新增 `scripts/update-windows-smoke-report.js`，支持列出 required checks、更新环境信息、更新 artifact metadata、逐项填写 status/evidence/notes。
- 新增 `npm run update-windows-smoke-report`。
- 支持 `--validate-ready` 用默认 readiness 规则校验所有 required checks 必须 pass。
- 支持 `--validate-ready --require-signed` 额外要求 Authenticode signed official readiness。
- 新增 `tests/release/update-windows-smoke-report.test.js`，覆盖参数边界、字段白名单、evidence file、pending/ready/signed 验证路径。

验收：

- 默认更新后只做结构校验并允许 pending，方便真实 Windows 验证过程中逐步补证据。
- `--validate-ready` 不能通过仍有 pending/blocked/fail 的报告。
- `--require-signed` 必须与 `--validate-ready` 搭配使用，不能单独制造 signed-ready 口径。
- 本阶段不声称真实 Windows smoke validation 已完成。

### Phase 8.5d：Windows 冒烟验证 Runbook 产物

目标：让每次 Windows release job 不只上传 pending smoke report，还随附一份基于同一 required check 矩阵生成的操作 runbook，指导验证人员在真实 Windows 环境逐项补证据。

计划：

- 新增 `scripts/create-windows-smoke-runbook.js`，从 pending/进行中的 Windows smoke report 生成 Markdown runbook。
- 新增 `npm run create-windows-smoke-runbook`。
- Windows release workflow 在生成并校验 pending report 后生成 `release/windows-smoke-runbook.md`。
- Windows smoke evidence artifact 同时上传 JSON report 与 Markdown runbook。
- 新增测试覆盖参数解析、结构校验保护、required check 覆盖和文件写入。

验收：

- runbook 必须复用 `REQUIRED_CHECKS`，不能维护另一套检查项。
- runbook 只能作为操作指南，不能声明 Windows smoke validation 已通过。
- 无效或缺项 report 不能生成 runbook。
- 真实 Windows release-ready 仍必须由填写后的 JSON report 通过 validator 证明。

### Phase 8.5e：Windows 冒烟证据采集脚手架

目标：让 Windows smoke evidence artifact 不只包含 pending report 和人工 runbook，还包含一个可在真实 Windows 验证机器上运行的 PowerShell collector，用来采集环境、签名、进程和安装注册表快照，降低人工证据采集漏项风险。

计划：

- 新增 `scripts/create-windows-smoke-collector.js`，从结构有效的 Windows smoke report 生成 `windows-smoke-collector.ps1`。
- 新增 `npm run create-windows-smoke-collector`。
- Windows release workflow 在生成 runbook 后生成 `release/windows-smoke-collector.ps1`。
- Windows smoke evidence artifact 同时上传 JSON report、Markdown runbook 和 PowerShell collector。
- runbook 增加 collector 使用提示，但继续强调 collector 不会把任何 smoke check 标成 pass。
- 新增测试覆盖参数解析、required check 清单同步、无效 report 拒绝、collector 输出边界和文件写入。

验收：

- collector 必须复用 `REQUIRED_CHECKS` 和 runbook evidence guidance，不能维护另一套检查项。
- collector 只能采集证据文件，不能声明 Windows smoke validation 已通过，不能生成 `--status pass` 命令。
- 无效或缺项 report 不能生成 collector。
- 真实 Windows release-ready 仍必须由填写后的 JSON report 通过 validator 证明。

### Phase 8.5f：Windows 冒烟证据包校验

目标：让真实 Windows 验证机器上由 collector 生成的 `windows-smoke-evidence/` 目录可以被本地工具校验完整性、哈希和签名证据边界，避免后续把缺文件、空文件或 unsigned evidence 当成可审计证据包。

计划：

- 新增 `scripts/validate-windows-smoke-evidence-bundle.js`，校验 collector evidence directory。
- 新增 `npm run validate-windows-smoke-evidence-bundle`。
- 校验必需文件：`environment.txt`、`authenticode.txt`、`process.txt`、`install-registry.txt`、`manual-checks.md`、`update-report-commands.md`。
- 为每个证据文件输出 size 与 SHA-256，便于报告或 issue 中引用稳定证据摘要。
- 校验 `manual-checks.md` 覆盖全部 `REQUIRED_CHECKS`，并拒绝 `update-report-commands.md` 中出现自动 `--status pass` 命令。
- 支持 `--report <report.json>`，用 `allowPending` 语义校验配套 report 的结构。
- 支持 `--require-signed`，要求 `authenticode.txt` 中存在 `Status : Valid` 证据。
- 新增测试覆盖参数解析、缺失/空文件、manual check 覆盖、自动 pass 拒绝、签名门禁、配套 pending report 与 manifest hash。

验收：

- unsigned evidence bundle 默认只能结构通过并给出签名 warning，不能证明 official readiness。
- `--require-signed` 必须看到 Authenticode `Status : Valid`，否则失败。
- paired report 可以保持 pending；bundle validation 不会声称 runtime smoke 已通过。
- 真实 Windows release-ready 仍必须由填写后的 JSON report 通过 validator 证明。

### Phase 8.5g：Windows 冒烟证据汇总归档

目标：把 collector 输出的证据目录、配套 smoke report、文件哈希、签名状态、检查项状态和 readiness validator 结果汇总成可审阅的 Markdown/JSON 摘要，方便 release issue、PR 或审阅文档引用，而不把 pending/unsigned evidence 误写成 Windows release-ready。

计划：

- 新增 `scripts/create-windows-smoke-evidence-summary.js`，复用 evidence bundle validator 与 smoke report validator。
- 新增 `npm run create-windows-smoke-evidence-summary`。
- 支持默认 Markdown 输出，也支持 `--json` 结构化输出。
- 支持 `--report <report.json>` 汇总配套 report 的平台、架构、产物、签名、检查项状态和 readiness flags。
- 支持 `--require-signed`，沿用 signed evidence gate，不绕过 Authenticode 要求。
- release checklist 增加 collector 运行后的 summary 归档命令；summary 不在 Windows release job 中自动生成，因为真实 evidence directory 只会在验证机器运行 collector 后出现。
- 新增测试覆盖参数解析、pending summary、Markdown 渲染、signed gate、all-pass signed ready 摘要和文件写入。

验收：

- pending 或 unsigned evidence summary 必须明确显示 `Windows release-ready: no`。
- summary 可以显示文件 size/SHA-256、paired report 检查项分布、structural/readiness validation flags。
- `--require-signed` 必须继续失败于缺少 `Status : Valid` 或 report signed metadata 的情况。
- summary 不生成 `--status pass` 命令，不修改 smoke report，不替代真实 Windows 验证。

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
- 使用 `npm run update-windows-smoke-report` 逐项填写真实证据。
- 运行 `npm run validate-windows-smoke-evidence-bundle -- windows-smoke-evidence --report docs/release-evidence/<report>.json` 校验证据包完整性。
- 运行 `npm run create-windows-smoke-evidence-summary -- windows-smoke-evidence --report docs/release-evidence/<report>.json --output docs/release-evidence/<report>-summary.md` 归档证据摘要。
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

## 7. Phase 8.5b 实施记录

本阶段把 Phase 8.5a 的“报告格式和门禁”接入 Windows release job 的实际产物链路。它解决的是“每次 Windows 构建都有一份结构化证据起点”，不是“Windows 已经 smoke 通过”。报告里的 runtime checks 仍保持 `pending`，必须由真实 Windows clean-machine 或 CI-backed manual 验证补 evidence 后，才能用默认 validator 模式证明 release readiness。

实现决策：

- `createWindowsSmokeReport()` 复用 `validate-windows-smoke-report.js` 的 `REQUIRED_CHECKS`，避免生成脚本和验证脚本的检查项漂移。
- 脚本默认只允许 `process.platform === 'win32'`，防止 macOS/Linux 本地误生成看似真实的 Windows runner 报告；单元测试和文档结构检查可以显式传 `--allow-non-windows`。
- 产物识别要求 `.exe` installer、Windows `.zip` 和 `latest.yml` 同时存在；`.blockmap` 和文件大小作为补充 artifact metadata 写入报告。
- Windows 上通过 PowerShell `Get-AuthenticodeSignature -LiteralPath <installer>` 采集签名状态。只有 `Status : Valid` 才把 `artifact.signed` 标为 `true`。
- release workflow 在 publish 前运行 `npm run create-windows-smoke-report -- --output release/windows-smoke-report.json`，再用 `npm run validate-windows-smoke-report -- release/windows-smoke-report.json --allow-pending` 校验结构。
- `windows-smoke-report.json` 只上传为 Actions artifact，避免普通用户在 GitHub Release 下载区把 pending 报告误解成安装资产。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- 生成的 pending 报告不能证明 install、launch、透明窗口、拖拽边界、Control Center、plugin runner、pet pack import、本地 HTTP/MCP 或 API key isolation 已通过。
- 签名状态采集需要 Windows runner 实跑后才有真实证据；本地 macOS 只能验证脚本结构和非 Windows 保护路径。
- SmartScreen reputation 仍是外部信任问题，不能由报告生成脚本单独证明。

验证：

- `node --check scripts/create-windows-smoke-report.js` 通过。
- `node --test tests/release/create-windows-smoke-report.test.js` 通过，5/5。
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 186/186。

## 8. Phase 8.5c 实施记录

本阶段继续服务于真实 Windows smoke validation，但仍不执行或伪造真实 Windows 运行结果。它把 Phase 8.5b 生成的 pending report 变成可持续填写、可重复校验的操作对象：验证人员可以在 Windows clean VM 或手动验证环境中逐项补齐 evidence，然后用同一套 validator 判断是否足以支撑 Windows support claim。

实现决策：

- `update-windows-smoke-report.js` 复用 `validate-windows-smoke-report.js` 的 `REQUIRED_CHECKS` 和 `validateReport()`，避免填写工具与 readiness 门禁漂移。
- `--list-checks` 只列出检查项并退出，不会顺手改写报告。
- `--set-env` 和 `--set-artifact` 使用白名单字段，避免把临时笔记、macOS 产物或无约束对象塞进 release evidence schema。
- `artifact.signed` 只接受 boolean-like 值，并归一化为 JSON boolean。
- `--evidence-file` 支持从 PowerShell transcript、日志摘录或人工记录文件中读取证据，写入前会 trim 外层空白。
- 默认验证等同 `allowPending: true`，只证明报告结构仍有效；`--validate-ready` 才要求全部 required checks 通过。
- `--require-signed` 必须搭配 `--validate-ready`，避免单独运行时制造“签名已验证但 smoke 未完成”的模糊状态。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- 该工具只能帮助记录证据，不能替代真实安装、启动、透明窗口、插件 runner、pet pack、Local HTTP/MCP 和 API key isolation 验证。
- 官方稳定版仍需要真实 signed artifact 与 `Get-AuthenticodeSignature` 的 `Status : Valid` 证据。
- SmartScreen reputation 仍是外部信任问题，不能由本地填写工具证明。

验证：

- `node --check scripts/update-windows-smoke-report.js` 通过。
- `node --check tests/release/update-windows-smoke-report.test.js` 通过。
- `node --test tests/release/update-windows-smoke-report.test.js` 通过，10/10。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 196/196。

## 9. Phase 8.5d 实施记录

本阶段继续推进真实 Windows smoke validation 的可执行性，但仍不执行或伪造真实 Windows 验证结果。它把 Windows release job 的 evidence artifact 从单一 pending JSON 扩展为“pending JSON + 操作 runbook”：验证人员下载 artifact 后，可以直接按 runbook 的 required check 表、填写命令和 readiness 命令逐项补证据。

实现决策：

- `create-windows-smoke-runbook.js` 复用 `validate-windows-smoke-report.js` 的 `REQUIRED_CHECKS` 和 `validateReport()`，生成前先确认 report 在 `--allow-pending` 语义下结构有效。
- runbook 中的 13 个检查项与 validator 完全同源，每项包含要证明的行为、证据建议和对应的 `npm run update-windows-smoke-report` 填写命令。
- runbook 明确区分 prerelease smoke readiness 与 official signed readiness，列出普通 validator 和 `--require-signed` validator 命令。
- release workflow 在 `release/windows-smoke-report.json` 通过 `--allow-pending` 校验后生成 `release/windows-smoke-runbook.md`。
- Actions artifact 名称调整为 `openpet-windows-smoke-evidence-<tag>`，同时包含 report 与 runbook，避免验证人员只拿到结构化 JSON 却缺少执行说明。
- runbook 不作为公开 GitHub Release 用户下载资产上传，只作为 Actions artifact 附在 release job 上。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- runbook 可以降低人工漏项风险，但不能替代真实安装、启动、透明窗口、插件 runner、pet pack、Local HTTP/MCP、API key isolation 和卸载验证。
- 官方稳定版仍需要真实 signed artifact 与 `Get-AuthenticodeSignature` 的 `Status : Valid` 证据。
- SmartScreen reputation 仍是外部信任问题，不能由 runbook 或本地脚本证明。

验证：

- `node --check scripts/create-windows-smoke-runbook.js` 通过。
- `node --check tests/release/create-windows-smoke-runbook.test.js` 通过。
- `node --test tests/release/create-windows-smoke-runbook.test.js` 通过，6/6。
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'` 通过。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 202/202。

## 10. Phase 8.5e 实施记录

本阶段继续把 Windows smoke validation 往真实执行环境靠近，但仍不执行或伪造真实 Windows 验证结果。它把 release job 的 smoke evidence artifact 扩展为“pending JSON + 操作 runbook + PowerShell evidence collector”：验证人员下载 artifact 后，可以先在 Windows 验证机器上运行 collector，生成环境、Authenticode、进程、安装注册表和人工检查清单文件，再把这些证据摘录进 JSON report。

实现决策：

- `create-windows-smoke-collector.js` 复用 `validate-windows-smoke-report.js` 的 `REQUIRED_CHECKS` 和 `validateReport()`，生成前先确认 report 在 `--allow-pending` 语义下结构有效。
- collector 嵌入的 `manual-checks.md` 来自同一 required check 矩阵，并复用 `create-windows-smoke-runbook.js` 的 evidence guidance，避免三套验证口径漂移。
- collector 默认把证据写入 `windows-smoke-evidence/`，包括 `environment.txt`、`authenticode.txt`、`process.txt`、`install-registry.txt`、`manual-checks.md` 和 `update-report-commands.md`。
- collector 会尝试从 report 的 `artifact.installer` 推导 installer path，并运行 `Get-AuthenticodeSignature`；如果找不到 installer，只记录缺失提示，不把签名或 smoke 状态伪造成通过。
- collector 生成的 update command notes 只包含环境和签名证据字段更新、结构校验命令，不生成任何 `--status pass` 命令。
- release workflow 在 runbook 后生成 `release/windows-smoke-collector.ps1`，并把它和 pending report、runbook 一起上传到 `openpet-windows-smoke-evidence-<tag>` artifact。
- runbook 新增 “Optional Evidence Collector” 小节，提示验证人员可以先运行 collector，但它不会把任何 smoke check 标成 pass。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- collector 能采集环境和系统快照，但透明窗口、拖拽、Control Center、插件 runner、pet pack、Local HTTP/MCP、API key isolation 和卸载仍需要人工或自动化真实操作证据。
- 官方稳定版仍需要真实 signed artifact 与 `Get-AuthenticodeSignature` 的 `Status : Valid` 证据。
- SmartScreen reputation 仍是外部信任问题，不能由 collector 或本地脚本证明。

验证：

- `node --check scripts/create-windows-smoke-collector.js` 通过。
- `node --check tests/release/create-windows-smoke-collector.test.js` 通过。
- `node --check scripts/create-windows-smoke-runbook.js` 通过。
- `node --check tests/release/create-windows-smoke-runbook.test.js` 通过。
- `node --test tests/release/create-windows-smoke-runbook.test.js tests/release/create-windows-smoke-collector.test.js` 通过，14/14。
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'` 通过。
- `find tests -name '*.test.js' | wc -l` 输出 29。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 210/210。

## 11. Phase 8.5f 实施记录

本阶段继续服务于真实 Windows smoke validation 的证据治理，但仍不执行或伪造真实 Windows 验证结果。它补齐的是 collector 运行之后的本地校验层：验证人员可以先确认 `windows-smoke-evidence/` 是否包含完整、非空、可哈希追踪的证据文件，再把证据摘录到 smoke report 中。

实现决策：

- `validate-windows-smoke-evidence-bundle.js` 固定校验 collector 产出的 6 个必需文件：`environment.txt`、`authenticode.txt`、`process.txt`、`install-registry.txt`、`manual-checks.md` 和 `update-report-commands.md`。
- 校验结果为每个文件生成 `bytes` 与 `sha256`，方便在 release issue、PR 或 versioned report 中引用不可变证据摘要。
- `manual-checks.md` 必须包含全部 `REQUIRED_CHECKS` id，避免验证清单和 JSON validator 漂移。
- `update-report-commands.md` 中如果出现 `--status pass` 会失败，继续维持“collector/证据包不自动制造通过状态”的边界。
- 默认未签名或 `NotSigned` evidence bundle 可以结构通过，但会警告它不能证明 signed official readiness。
- `--require-signed` 要求 `authenticode.txt` 出现独立的 `Status : Valid` 行；没有该证据时失败。
- `--report <report.json>` 会用 `allowPending` 语义校验配套 Windows smoke report，因此可以验证进行中的报告结构，但不会把 pending checks 视为 runtime smoke 通过。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- evidence bundle validator 只能证明证据目录完整和签名文本边界，不能替代真实安装、启动、透明窗口、插件 runner、pet pack、Local HTTP/MCP、API key isolation 和卸载验证。
- 官方稳定版仍需要真实 signed artifact 与填写完成的 JSON smoke report 同时通过 `--require-signed` readiness 校验。
- SmartScreen reputation 仍是外部信任问题，不能由 evidence bundle validator 证明。

验证：

- `node --check scripts/validate-windows-smoke-evidence-bundle.js` 通过。
- `node --check tests/release/validate-windows-smoke-evidence-bundle.test.js` 通过。
- `node --test tests/release/validate-windows-smoke-evidence-bundle.test.js` 通过，9/9。
- `find tests -name '*.test.js' | wc -l` 输出 30。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 219/219。
- `git diff --check` 通过。

## 12. Phase 8.5g 实施记录

本阶段继续完善 Windows smoke validation 的证据治理，但仍不执行或伪造真实 Windows 验证结果。它补齐的是 evidence bundle 校验之后的审阅层：验证人员或发布负责人可以把 collector 目录、配套 report、文件哈希、签名状态、检查项分布和 readiness flags 汇总成 Markdown/JSON，作为 release issue 或 review doc 的稳定引用。

实现决策：

- `create-windows-smoke-evidence-summary.js` 复用 `validate-windows-smoke-evidence-bundle.js` 与 `validate-windows-smoke-report.js`，不维护另一套 evidence 或 readiness 规则。
- 默认输出 Markdown，适合粘贴进 release issue、PR 或审阅文档；`--json` 用于自动化消费。
- summary 记录 evidence directory、必需文件数量、每个文件的 `bytes` 与 `sha256`、Authenticode evidence 是否 `Valid`。
- 配套 `--report` 时，summary 记录 report path、platform、arch、artifact version/installer/zip/latestYml/signed/authenticodeStatus、检查项状态分布，以及 structural/readiness validator flags。
- `--require-signed` 直接传给 evidence bundle validator 和 report validator；缺少 `Status : Valid` 或 signed metadata 时 summary 失败。
- `releaseReady` 只有在 evidence bundle 通过且 paired report readiness validation 通过时才为 true；pending report 会明确显示 `Windows release-ready: no`。
- summary 作为真实 Windows 验证后的归档工具使用，不在 release job 中自动生成；原因是 CI 只生成 collector 文件，真正的 `windows-smoke-evidence/` 目录需要在 clean Windows 验证机器运行 collector 后才存在。

剩余风险：

- 仓库仍未包含真实 Windows clean-machine smoke report。
- summary 只能让证据更容易审阅和归档，不能替代真实安装、启动、透明窗口、插件 runner、pet pack、Local HTTP/MCP、API key isolation 和卸载验证。
- 官方稳定版仍需要真实 signed artifact、`Get-AuthenticodeSignature Status : Valid` 证据，以及填写完成的 JSON smoke report 通过 `--require-signed` readiness 校验。
- SmartScreen reputation 仍是外部信任问题，不能由 summary 证明。

验证：

- `node --check scripts/create-windows-smoke-evidence-summary.js` 通过。
- `node --check tests/release/create-windows-smoke-evidence-summary.test.js` 通过。
- `node --test tests/release/create-windows-smoke-evidence-summary.test.js` 通过，7/7。
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'` 通过。
- `find tests -name '*.test.js' | wc -l` 输出 31。
- `npm run check:syntax` 通过。
- `npm test` 通过，当前为 226/226。
- `git diff --check` 通过。
