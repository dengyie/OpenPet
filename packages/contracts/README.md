# @openpet/contracts

前后端**唯一**契约源。见 [`docs/refactor/03-api-contract.md`](../../docs/refactor/03-api-contract.md)。

## 为什么存在

分离后同一份语义会出现在四个地方:后端运行时校验、前端 TS 类型、MSW mock、以及文档。
ADR-016 的结论是用 zod 一次写完,其余三处派生:

- 后端:`schema.parse()` 直接当入参校验中间件
- 前端:`z.infer<typeof schema>` 派生类型,**生产构建不打包 zod**(仅 dev 校验)
- mock:同一份 schema 喂给 MSW handler,取代 181 KB 的 `demo-control-center-api.ts`
- 文档:`npm run check:api-contract` 反向校验文档没写漏

## 目录

| 文件 | 内容 | 对应文档 |
| --- | --- | --- |
| `src/envelope.ts` | 统一响应信封、错误码、HTTP 映射、请求头、排队上限 | 03 §1、§2 |
| `src/jobs.ts` | 17 个 Job kind、6 个状态、重试次数 | 03 §6、04 §2 |
| `src/events.ts` | 8 个 SSE topic、21 个事件名、心跳与背压参数 | 03 §5 |
| `src/bridge.ts` | 反向通道 `v:1` 信封与消息白名单 | 03 §7、ADR-011 |
| `src/settings.ts` | `PATCH /settings` 的 `ifVersion` 乐观锁 | 03 §4.2 |

## 硬约束

1. **枚举顺序与文档表格保持一致。** `check:api-contract` 逐字对账,改一边必须改另一边。
2. **不得出现第二份可编辑的类型定义。** ADR-012:M0 把 `src/shared/openpet-contracts.ts` 搬为 `legacy.ts`,原路径降为薄壳 re-export,M5 删除。
3. **`apiVersion` 是字符串 `"v1"`。** 07 篇 spike 里写的数字 `1` 只是一次性探针,不作数。
4. 本包不引任何除 `zod` 之外的运行时依赖。

## 门禁

```bash
node scripts/check-api-contract.mjs
```

现在就能跑,不依赖尚未存在的路由注册表。它对账六项:事件名、事件归属 topic、topic 清单、
Job kind、Job 状态、错误码;并重算 03 §3 通道表的行内与总计算术。

M1 起再补两项硬检查:实际注册的路由 vs 契约路由表、`src/shared/ipc-channels.ts` 的通道盘点数。
