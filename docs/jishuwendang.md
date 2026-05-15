# 桌面小猫 — 技术文档

> Electron 桌面宠物应用，一只透明背景的猫咪站在你的桌面上。

---

## 1. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^28.1.0 | 桌面窗口框架 |
| sharp | ^0.34.5 | 精灵图合成（开发时） |
| HTML / CSS / JS | — | 渲染层 UI 与动画 |

---

## 2. 项目结构

```
my-electron-app/
├── main.js                  # Electron 主进程
├── preload.js               # 预加载脚本（contextBridge）
├── renderer.js              # 宠物窗口渲染逻辑
├── index.html               # 宠物窗口 HTML
├── settings.html            # 设置面板 HTML
├── settings-preload.js      # 设置面板预加载脚本
├── settings-renderer.js     # 设置面板渲染逻辑
├── scripts/
│   └── generate-sprites.js  # 精灵图生成脚本
├── cat_anime/
│   ├── flames/              # 原始帧图片（按动作分文件夹）
│   │   ├── bai_no_bg/       # 待机动作（16 帧）
│   │   ├── eat_no_bg/       # 喂食动作（16 帧）
│   │   ├── bai/             # （原始无透明底版本）
│   │   ├── eat/             # （原始无透明底版本）
│   │   └── frames_smart/    # （实验性帧）
│   ├── sprites/             # 生成的精灵图 PNG
│   │   ├── bai_no_bg.png
│   │   └── eat_no_bg.png
│   └── animations.json      # 动作配置（自动生成）
├── raw_photo/               # 原始猫咪照片素材
├── transparent_cats/        # 抠图后素材
├── removeBg/                # 去背景相关资源
├── split.py / split2.py     # 帧切分脚本
└── package.json
```

---

## 3. 架构设计

### 3.1 进程模型

```
┌──────────────────────────────────────────────┐
│                  Main Process                │
│  main.js                                     │
│  ┌────────────┐  ┌────────────────────────┐  │
│  │ Window Mgmt │  │ IPC Handlers           │  │
│  │ - petWindow │  │ pet:get-animations     │  │
│  │ - settings  │  │ pet:move-by            │  │
│  │   Window    │  │ pet:set-position       │  │
│  │ - scale     │  │ settings:get/save      │  │
│  └────────────┘  │ settings:preview-scale  │  │
│                   │ pet:quit               │  │
│  ┌────────────┐  └────────────────────────┘  │
│  │ Settings   │                               │
│  │ Persistence│  ┌────────────────────────┐  │
│  │ (JSON)     │  │ Screen Boundary Clamp  │  │
│  └────────────┘  └────────────────────────┘  │
└──────────────┬───────────────────────────────┘
               │ contextBridge
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────┐
│ Renderer Process │ │ Settings Renderer│
│ (宠物窗口)        │ │ (设置面板)        │
│                  │ │                  │
│ renderer.js      │ │ settings-        │
│ index.html       │ │ renderer.js      │
│ preload.js       │ │ settings.html    │
│                  │ │ settings-        │
│                  │ │ preload.js       │
└──────────────────┘ └──────────────────┘
```

### 3.2 数据流

```
frames/ 文件夹                     animations.json
    │                                   │
    └── generate-sprites.js ────────────┘
              │                              ┌──────────────┐
              ▼                              │              │
        sprites/ PNG                  main.js 读取配置       │
              │                              │              │
              └────────── IPC ───────────────┘              │
                           │                                │
                           ▼                                │
                    renderer.js                             │
                    ┌─ setAction(id)                        │
                    │   └─ 设置 background-image +          │
                    │      background-position 动画          │
                    │                                      │
                    ├─ tickWalk() ──► pet:move-by ──► 主进程 │
                    │   每 40ms          (IPC)       clamp   │
                    │                                      │
                    ├─ 拖拽 ──► pet:set-position ──► 主进程  │
                    │                                      │
                    └─ 设置变更 ◄── settings:changed ── 主进程│
```

---

## 4. 核心模块详解

### 4.1 主进程 `main.js`

**窗口管理：**
- 创建无边框、透明、置顶、不显示在任务栏的 `BrowserWindow`
- 基础尺寸 300×300px，缩放时同步调整窗口尺寸
- 初始位置：主屏幕右下角
- 设置窗口默认定位在宠物窗口右侧

**单实例锁：**
```js
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit() }
```
确保同一时间只有一个桌面宠物在运行，新实例触发 `second-instance` 事件后退出。

**屏幕边界限制 `clampToWorkArea`：**
拖拽和散步时，窗口坐标被限制在当前屏幕工作区内，并返回是否撞到边界（`hitX`/`hitY`）。

**设置持久化：**
保存在 `app.getPath('userData')/settings.json`，包含 scale、walkSpeed、walkDuration、bubbleDuration、autoStart。每次保存同时更新 macOS 登录项。

**IPC 通道一览：**

| 通道 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `pet:get-animations` | 渲染→主 | invoke | 返回 animations.json 内容 |
| `pet:get-bounds` | 渲染→主 | invoke | 返回窗口位置/尺寸 |
| `pet:get-movement-state` | 渲染→主 | invoke | 返回是否贴近左右边界 |
| `pet:set-position` | 渲染→主 | send | 拖拽时设置窗口位置 |
| `pet:move-by` | 渲染→主 | invoke | 散步增量移动 |
| `pet:quit` | 渲染→主 | send | 退出应用 |
| `settings:open` | 渲染→主 | send | 打开设置窗口 |
| `settings:get` | 设置→主 | invoke | 读取当前设置 |
| `settings:save` | 设置→主 | invoke | 保存设置 |
| `settings:preview-scale` | 设置→主 | send | 实时预览缩放 |
| `settings:close` | 设置→主 | send | 关闭设置窗口 |
| `settings:changed` | 主→渲染 | send | 推送设置变更 |

### 4.2 预加载脚本 `preload.js`

通过 `contextBridge.exposeInMainWorld` 暴露安全的 `window.petAPI` 接口。渲染进程只能调用这些方法，无法直接访问 Node.js API 或文件系统。

### 4.3 宠物渲染进程 `renderer.js`

**状态管理：**
所有动画、散步、拖拽状态集中在 `state` 对象中，通过定时器驱动更新。

**精灵图动画：**
- 使用 CSS `background-image` + `background-position-x` 偏移实现逐帧播放
- `setAction(action)` 切换动作时，根据帧宽计算 `background-size: auto 100%` 确保垂直填充
- 帧显示最大尺寸 260×260px，超出按比例缩放

**散步系统：**
```js
tickWalk() 每 40ms 调用一次
  └─ petAPI.moveBy({ x: direction * speed, y: 0 })
       └─ 主进程 clampToWorkArea 后返回 hitX
            └─ hitX == true → turnWalk() 掉头
```
额外特性：
- 1.2% 概率随机掉头，避免机械感
- 自动停止定时器（默认 15 秒），到期切回待机动作
- 启动时检测靠边方向，朝屏幕内侧走

**拖拽系统：**
- `pointerdown` 记录鼠标相对窗口的偏移
- `pointermove` 持续更新窗口位置
- `pointerup` 判断位移 --> moved == false 视为点击，触发 `clickAction`

**右键菜单：**
由 `renderMenu(actions)` 根据 animations.json 动态生成，包含动作按钮 + 分隔线 + 散步/设置/退出。

### 4.4 设置面板

独立的 BrowserWindow（280×390px），无边框、置顶。包含：
- 宠物大小（滑块 50%-150%，实时预览）
- 散步速度（慢/中/快 = 1/2/3 px/frame）
- 散步时长（10s/15s/30s/60s）
- 气泡显示时长（短/中/长 = 800/1300/2000ms）
- 开机自启开关

### 4.5 精灵图生成 `scripts/generate-sprites.js`

**输入：** `cat_anime/flames/<action>/` 下的帧图片

**处理流程：**
1. 按数字排序帧文件
2. 读取所有帧的尺寸 → 取最大宽高作为统一 cell 尺寸
3. 对每帧做居中填充（透明背景），合成水平精灵条
4. 输出到 `cat_anime/sprites/<action>.png`
5. 自动生成 `animations.json`：
   - `id`：文件夹名
   - `label`：文件夹名转中文标签（或按映射表）
   - `loop`：根据文件夹名智能判断（含 bai/stand/walk/loop → true）
   - `frameMs`：eat 类 85ms，其余 95ms
   - 同时自动选择 defaultAction（优先 idle/bai）和 clickAction（优先 eat）

**运行：**
```bash
npm run generate-sprites
```

---

## 5. 关键设计决策

| 决策 | 原因 |
|------|------|
| 精灵图而非逐帧图片替换 | 避免频繁触发图片解码，background-position 偏移性能更好 |
| CSS transform 翻转而非 `scale` | 保持 transform 单一来源，减少透明窗口绘制异常 |
| 拖拽与散步的并发锁 (`walkMoving`) | 防止 IPC 移动请求堆积 |
| 主进程做边界限制而非渲染进程 | 保证窗口不会因时序问题越界 |
| 设置保存在 `userData` | 应用卸载重装后仍保留，不受项目目录影响 |
| `contextIsolation: true` | 安全最佳实践，防止渲染进程直接访问 Node API |

---

## 6. 添加新动作指南

1. 在 `cat_anime/flames/` 下新建文件夹，例如 `sleep/`
2. 放入按顺序命名的帧图片：`01_no_bg.png` ~ `NN_no_bg.png`
3. 运行 `npm run generate-sprites`
4. 重启应用，新动作会自动出现在右键菜单中

无需修改任何代码。

---

## 7. 启动

```bash
npm start        # 启动应用
npm run generate-sprites  # 重新生成精灵图（添加新动作后）
```
