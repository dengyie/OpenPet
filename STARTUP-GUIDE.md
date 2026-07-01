# OpenPet 最高效启动指南

## 🚀 快速启动（最推荐）

### 方式一：一键启动（最快）
```bash
npm start
```
**耗时**: ~3 秒（冷启动）, ~1 秒（热启动）  
**说明**: 自动构建 Control Center + 启动 Electron

---

## 📋 启动方式对比

| 启动方式 | 命令 | 耗时 | 适用场景 |
|---------|------|------|---------|
| **一键启动** | `npm start` | 3s / 1s | ✅ 日常使用（最推荐） |
| **开发模式** | `npm run dev:control-center` | 5s | 前端开发（热重载） |
| **完整打包** | `npm run pack` | ~60s | 发布前验证 |
| **测试验证** | `npm test` | ~1.2s | CI/开发验证 |

---

## 🔧 开发工作流

### 场景1：日常使用/演示
```bash
npm start
```
- ✅ 最快启动方式
- ✅ Control Center 自动增量构建
- ✅ 宠物窗口 + 控制面板同时启动

### 场景2：前端开发（Control Center 开发）
```bash
# Terminal 1: 启动 Vite 开发服务器
npm run dev:control-center

# Terminal 2: 启动 Electron（指向开发服务器）
npm start
```
- ✅ Control Center 热重载
- ✅ 实时预览修改
- ⚠️ 需要两个终端

### 场景3：后端开发（Service 层开发）
```bash
# 修改 src/main/services/ 后
npm start  # 重启应用
```
- ⚠️ 后端修改需要重启
- ✅ 启动快（1秒热启动）

### 场景4：测试驱动开发
```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- tests/services/plugin-service.test.js
```
- ✅ 秒级运行全量 Node 原生测试
- ✅ Service 层高覆盖

---

## ⚡ 性能优化建议

### 已优化项 ✅
1. **Control Center 增量构建**: 仅在源码变化时重建
2. **Vite 构建速度**: 70-94ms（极快）
3. **Service 层懒加载**: 按需初始化
4. **热启动优化**: Control Center 已构建时仅 1 秒

### 可选优化（如需要）
1. **跳过 Control Center 构建**（开发时）:
   ```bash
   # 如果 dist/control-center/ 已存在且无变化
   electron .
   ```
   **耗时**: < 1 秒

2. **禁用原生依赖重建**（打包时）:
   ```bash
   # 如果原生依赖无变化
   electron-builder --dir --config.electronRebuild=false
   ```

---

## 🎯 最高效启动流程总结

### 冷启动（首次启动）
```bash
npm start
```
**流程**:
1. Control Center 构建（70-94ms）
2. Electron 主进程启动（~500ms）
3. 服务层初始化（services, ~1.5s）
4. 宠物窗口渲染（~500ms）
5. Control Center 窗口就绪（~500ms）

**总耗时**: ~3 秒

### 热启动（Control Center 已构建）
```bash
npm start
```
**流程**:
1. 跳过 Control Center 构建（0ms）
2. Electron 主进程启动（~500ms）
3. 服务层初始化（~500ms，有缓存）

**总耗时**: ~1 秒 ✅

---

## 📊 启动性能基准

| 指标 | 值 | 说明 |
|------|-----|------|
| **冷启动时间** | ~3s | 包含 Control Center 构建 |
| **热启动时间** | ~1s | Control Center 已构建 |
| **Control Center 构建** | 70-94ms | Vite 构建极快 |
| **Service 层初始化** | ~1.5s | service 依次初始化 |
| **内存占用** | < 200MB | 启动后稳定占用 |
| **进程数** | 5 个 | Main + Renderer + GPU + Plugin + Helper |

---

## 🔍 故障排查

### 问题1：启动失败
```bash
# 清理缓存重试
rm -rf dist/control-center node_modules/.vite
npm start
```

### 问题2：Control Center 构建慢
```bash
# 检查是否有语法错误
npm run check:syntax

# 清理 Vite 缓存
rm -rf node_modules/.vite
```

### 问题3：端口占用
```bash
# 检查占用端口的进程
lsof -i :5173  # Vite dev server
lsof -i :3000  # Local HTTP API（如果启用）

# 杀死占用进程
kill -9 <PID>
```

---

## 🎉 推荐工作流

### 日常开发（最推荐）
```bash
# 1. 修改代码
# 2. 一键启动
npm start

# 3. 测试验证
npm test
```

### 发布前验证
```bash
# 1. 语法检查
npm run check:syntax

# 2. 运行测试
npm test

# 3. 完整打包
npm run pack

# 4. 验证打包产物
open release/mac-arm64/OpenPet.app
```

---

**结论**: `npm start` 是 99% 场景下的最佳选择，启动快（1-3秒）、流程简单、自动化程度高 ✅
