# OpenPet 测试报告

> ⚠️ 本文件曾定格于 2026-06-13（171 测试 / 95 分 / v1.0.1-rc.1），**已严重过期**。
> 静态快照的测试数字会随代码演进立即失真，因此不再在文档中硬编码测试数。
>
> **测试真相以实际运行为准**，见下方命令。状态快照见
> [`docs/project-status-review.md`](docs/project-status-review.md)。

## 如何验证测试（单一真相）

```bash
npm test                    # 全量 Node 原生测试
npm run test:core           # 核心运行时回归
npm run test:core:all       # 合并用户可见运行时改动前跑
npm run test:tools          # release / evidence / 脚手架 / 维护工具测试
npm run test:control-center # Control Center Playwright UI 基线
npm run check:syntax        # JS 语法 + Vite 构建校验
```

## 2026-07-01 核验结果

```
npm test → tests 1320 / pass 1320 / fail 0  (~12s)
```

分布（约数）：
- services 运行时测试：核心 service 全覆盖（pet/action/ai/ai-talk/plugin/catalog/
  local-http/mcp-transport/behavior-orchestrator/trigger-rule-runtime 等）
- main 装配与 IPC 测试
- release / scripts 工具测试（约 30%，测的是证据/报告生成器自身，非产品运行逻辑）

## 本轮新增安全回归测试

- 插件 VM 沙箱：`blocks escape via SDK-returned Promise constructor`（4 种逃逸手法）
- entries 门禁：`blocks native entries execution until explicitly approved`（未授权拦截/
  授权放行/撤销再拦 三态）
- SSRF：`blocks DNS-rebinding SSRF to private addresses`
- 密钥：`encrypts secrets at rest when safeStorage is available` +
  `migrates legacy plaintext entries on read`
- 窗口导航锁：`navigation lock blocks remote navigations but allows bundled file content` +
  `denies all window.open and webview attachment`
- 触发器契约：`runtime flattens ruleSpec fields from action-service persisted rules`
- 并发写：`settings service update applies atomically`（原子读改写）
- EventBus：listener 抛错隔离
- memory 上限：`caps active memories by demoting lowest-value entries`

## 边界测试（既有）

- 路径穿越 / 符号链接逃逸
- 超大 body（请求/响应/存储）
- 非法 schema / 恶意插件隔离
- 敏感信息脱敏（token / 本地路径）

## 已知限制

- 前端（Control Center）Playwright 基线存在但覆盖有限。
- Windows 分发：构建与证据工具存在，但在签名产物 + 真实 Windows smoke 归档前保持 not release-ready。
- 真机 / 公证 / 签名分发验证属 Manual-required，不在自动化测试范围内。
