# Phase 1 开发文档：Control Center 模块化

> 阶段目标：把 `src/control-center/src/main.jsx` 从单体 React 文件拆成可承载后续产品化体验的模块结构。  
> 范围约束：不改变 IPC、主进程 service、宠物窗口行为和现有 UI 功能。

## 1. 背景

当前 Control Center 已包含 Pet / Actions / AI / Plugins / Service / About 六个页面，但 `main.jsx` 约 1364 行，混合了：

- API mock 与默认数据
- clone/format/download helper
- 通用 UI 控件
- Pane 组件
- 所有页面状态与副作用
- tab shell 和 React root 挂载

后续 Phase 2/3/4/5 都会继续增加复杂管理界面。如果不先拆分，Pet pack 管理、插件安装 review、AI 规则编辑、MCP session 管理都会堆进同一个文件。

## 2. 本阶段交付

### 2.1 文件结构

目标结构：

```text
src/control-center/src/
├── App.jsx
├── api/control-center-api.js
├── components/
│   ├── SegmentedControl.jsx
│   └── Toggle.jsx
├── hooks/
│   ├── useActionsPane.js
│   ├── useAiPane.js
│   ├── usePetSettingsPane.js
│   ├── usePluginsPane.js
│   └── useServicePane.js
├── lib/
│   ├── defaults.js
│   ├── download.js
│   └── format.js
├── panes/
│   ├── AboutPane.jsx
│   ├── ActionsPane.jsx
│   ├── AiPane.jsx
│   ├── PetPane.jsx
│   ├── PluginsPane.jsx
│   └── ServicePane.jsx
├── constants.js
├── main.jsx
└── styles.css
```

### 2.2 行为保持

必须保持以下现有行为：

- Pet 页保存、还原、实时预览缩放。
- Actions 页选择并检查帧文件夹、重新检查、清除选择、导入、删除、保存默认/点击动作。
- AI 页配置保存、API Key 保存、连接测试、读取 `control-center` 会话、发送聊天、显示动作触发状态。
- Plugins 页启停、配置保存、命令运行、日志筛选、导出/清空、清理私有存储。
- Service 页启停、轮换令牌、日志刷新/导出/清空。
- About 页继续显示当前占位信息。

### 2.3 质量门槛修正

当前 `npm run check:syntax` 使用 `node --check file1 file2 ...`，Node 实际只检查第一个入口文件。此阶段顺手修正为：

- `npm run check:node`：逐个 `node --check` 主进程、preload、renderer、service、test 的 JS 文件。
- `npm run check:syntax`：执行 `check:node` 后再执行 `build:control-center`，由 Vite 覆盖 JSX/React 语法。

## 3. 非目标

- 不新增 Pet pack 管理功能。
- 不新增插件安装/市场功能。
- 不改 AI 编排逻辑。
- 不改 MCP 或 HTTP API。
- 不重做视觉设计。

## 4. 验收

- `src/control-center/src/main.jsx` 只负责挂载 React root。
- `src/control-center/src/App.jsx` 负责 shell/tab 组合，保持低复杂度。
- 每个 Pane 独立文件，ServicePane 移入 `panes/`。
- `npm run build:control-center` 通过。
- `npm run check:syntax` 通过，且会逐文件检查 Node JS。
- `npm test` 通过。
- 手动 smoke 清单：Pet save、Actions load、AI config load、Plugins list、Service status。

## 5. Production Code Quality Review 关注点

- 是否只是搬文件，还是真正拆出稳定边界。
- hooks 是否泄漏跨 pane 状态或引入 stale closure。
- mock API 与 preload API 是否仍保持同名契约。
- 新的 syntax check 是否真的覆盖多文件。
- 是否有路径/导入大小写问题影响 macOS 打包。
