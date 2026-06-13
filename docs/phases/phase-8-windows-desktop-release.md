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

### Phase 8.3：Windows 签名策略与发布清单

目标：文档化 Windows 官方签名策略，并给 unsigned prerelease 明确边界。

计划：

- 在 release checklist 中补 Windows 证书来源、CI secret 名称和 unsigned artifact 标签策略。
- 官方 release 要求 signed；开发/RC 可 unsigned，但不能声称可规避 SmartScreen。
- About/update 检查必须展示平台相关 asset，而不是假设 macOS DMG/ZIP。

### Phase 8.4：Windows 冒烟验证

目标：Windows 支持声明前完成真实运行验证。

计划：

- 验证安装、启动、卸载。
- 验证透明宠物窗口、拖拽、边界、always-on-top、taskbar 行为。
- 验证 Control Center 全 tab。
- 验证 plugin runner、pet-pack import、sprite/native dependency。
- 验证 Local HTTP/MCP 默认关闭、loopback only、token-gated。
- 验证 API key 不暴露给 renderer 或普通插件。

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
- About/update asset 展示目前仍只做通用 install asset 摘要，后续需要按当前平台筛选。
- 真实 Windows 安装、卸载、透明窗口与 plugin runner 冒烟仍未完成。
