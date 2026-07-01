# OpenPet 项目总结

> ⚠️ 本文件的历史数字（171 测试 / 19 services / 95 分 / v1.0.1-rc.1）定格于 2026-06-13，
> **已严重过期**，仅保留作为早期产品化阶段的历史记录。
>
> **当前状态请以单一可信源为准：[`docs/project-status-review.md`](docs/project-status-review.md)**
> （更新到 v1.0.1-rc.3）与 [`CHANGELOG.md`](CHANGELOG.md)。

## 当前真实基线（2026-07-01 核验）

| 指标 | 旧文档值（过期） | 实际值 |
|------|------------------|--------|
| 项目版本 | v1.0.1-rc.1 | **v1.0.1-rc.3** |
| 测试数 | 171 | **1320**（`npm test` 全绿） |
| service 文件 | 19 | **44**（`src/main/services/`） |
| 综合评分 | 95/100 | 已废弃，不再用单一分数衡量 |

核验命令：
```bash
npm test                              # → 1320 pass / 0 fail
find src/main/services -name '*.js' | wc -l   # → 44
node -p "require('./package.json').version"   # → 1.0.1-rc.3
```

## 2026-07-01 安全与正确性修复

针对一次深度 review 暴露的 P0/P1 缺陷，本轮完成 4 个阶段修复（详见 `docs/reviews/` 与 git 历史）：

### 插件执行信任边界（P0）
- **VM 沙箱逃逸修复**：`local-plugin-runner` 不再把 host Promise 透传进沙箱，
  `__openpetDispatch` 作为 `compileFunction` 参数而非全局，插件只能拿到 sandbox-realm
  Promise + `codeGeneration.strings:false` 双封堵。回归测试覆盖 4 种逃逸手法。
- **entries 原生执行门禁**：`entries.commands/services/setup` 默认禁用，需逐插件显式授权
  （`setNativeExecutionApproved` + IPC 全链路）。撤销时停掉运行中的原生进程。
  - Manual-required：entries 原生进程的 OS 级沙箱（macOS seatbelt / Linux bwrap）待实现。
- **签名文案诚实化**：`hash-verified` label 从“Signature hash metadata verified”改为
  “File integrity checked (not a trusted source)”，明确区分完整性校验与来源可信。

### 运行时正确性（P0/P1）
- **触发器规则契约修复**：`trigger-rule-runtime-service` 在边界展平 `ruleSpec`
  （`schedule.intervalMs` / `event.name` / `state.predicate`）为 runtime 读取的顶层字段，
  正式创建的 random/event/state 规则不再静默失效。新增跨 action-service→runtime 集成测试。
- **settings.ai 并发写竞态修复**：`settings-service` 新增原子 `update(updater)`，
  `persistConversations` 与 `behavior-orchestrator.saveConfig` 改用之，消除 async 间隙
  陈旧快照覆盖（丢对话历史/行为决策）。
- **EventBus listener 隔离**：`emit` 对每个 listener 包 try/catch，单个抛错不中断后续。

### 密钥与资源加固（P1）
- **API key safeStorage 加密**：`secret-service` 用 Electron `safeStorage` 加密落盘，
  旧明文读取时自动迁移；无 keyring 环境降级明文（文件仍 0o600）。
- **DNS rebinding SSRF 防护**：`plugin-network-client` 解析后校验 IP 不在私有/loopback/
  link-local/CGNAT/multicast/metadata 段，`resolveAddress` 可注入供测试。
- **窗口导航锁**：`applyNavigationLock` 拒绝远程 `will-navigate`、deny 所有 `window.open`、
  prevent webview attach；pet 与 Control Center 窗口均加锁。
- **memories 总量上限**：`MAX_ACTIVE_MEMORIES=200`，超限按 importance+confidence+recency
  降级为 `superseded`（不删除，保留审计）。
- Backlog：store 全量异步写（破坏深拷贝+同步落盘契约，降级；memory 上限已间接缓解增长主因）。

### 文档与死代码（P1）
- 本文件与 `TEST-REPORT.md` 改造为指向单一可信源的薄壳。
- 删除 `ai-talk-service` 中已被 `selectRelevantMemories`/`scoreMemoryContext` 取代的
  死代码（`rankMemoryContext` / `scoreMemoryRelevance` / `tokenizeForMemoryRelevance`
  及其专属常量与 helper）。

## 架构与可信源

- 装配层 `src/main/bootstrap/` 无循环依赖，IPC 注册完整（详见 `docs/HANDOFF.md`）。
- 历史实现细节见 `docs/phases/`，review 发现见 `docs/reviews/`。
- 发布状态以 `docs/project-status-review.md` 为准：macOS 为主，Windows 仍 not release-ready。
