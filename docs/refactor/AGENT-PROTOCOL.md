# 交接协议 · 各方怎么通过 GitHub 对接

> 这篇是**流程约定**,不是设计文档。设计看 01–07,执行看 00、08–14。
> 谁该读:所有参与这个重构的 agent,以及派活的人。

## 0. 为什么需要这一篇

参与这个重构的有三方:

| 角色 | 什么时候在线 | 往哪里写 |
| --- | --- | --- |
| 文档侧 | 只有被人叫醒时 | `docs/refactor/**`、issue、PR 评论 |
| 实现侧(可能同时好几个) | 被派活时 | 代码、PR |
| 真机侧 | 被派活时 | spike 实测结论 |

三方**永远不会同时在线**,也没有任何一方能主动通知另一方。GitHub 是唯一的共享介质。所以这篇只解决一件事:**让每一方留下的东西,下一方不用问人就能接上。**

📌 一句话原则:**任何需要口头补充才能理解的交付,都算没交付。**

## 1. 谁往哪里写

| 方向 | 载体 | 规则 |
| --- | --- | --- |
| 派单:文档侧 → 实现侧 | GitHub Issue,一张卡一个 | issue 正文只放目标一句话 + 卡的链接,**不复制卡的内容**。卡永远只有一份,在 `10`–`13` 篇里 |
| 交付:实现侧 → 文档侧 | Pull Request | base 指向 `refactor/frontend-backend-split`,描述末尾必须带回执块(§2) |
| 提问 / 发现文档写错了 | 回执块的 `doc-bugs`、`questions` 字段;PR 还没开就开一个带 `doc-bug` 标签的 issue | ⚠️ 实现侧**不要直接改 `docs/refactor/**`**,理由见 §4 |
| 实测结论:真机侧 → 所有人 | `07-spike.md` §7 结果表 | 那张表是唯一权威。只写在 PR 评论里等于没写 |
| 状态快照 | `BOARD.md`(首次同步时生成) | 由文档侧每次同步后重写。**issue 才是真相**,这个文件只是给人看的快照 |

## 2. 回执块

每个 PR 的描述**最后一段**必须是这个块,原样复制后改内容:

```
<!-- HANDBACK v1
card: T03
branch: refactor/t03-settings
gates:
  check:node: pass
  test:backend: pass
  check:api-contract: pass
assertions: 6/6
doc-bugs:
  - where: 10-tasks-m1.md / T03 / 验收断言 3
    what: 这里引用的常量名和 09 篇 §2 对不上
decisions:
  - 卡里没规定缓存什么时候失效,选了写操作后立即失效,理由:最保守
questions:
  - 无
-->
```

规则:

1. 它是 HTML 注释,GitHub 渲染时不显示 —— 不打扰人类审阅,但接口读到的是原文。
2. 字段一个都不能少。没有内容就填 `无`。**空着和填 `无` 是两回事**:空着说明你忘了,填 `无` 说明你确认过。
3. `gates` 三条只能填 `pass` / `fail` / `skipped:<原因>`。`check:api-contract` 打印的两条 `todo` 不算 `fail`。
4. `assertions` 填「满足数/总数」,分母以卡上「验收断言」的条数为准。没满足的在 PR 正文里逐条说明。
5. `decisions` 记录**卡里没写、你自己定的**每一个决定。这一栏填「无」而代码里又有自由发挥,是这套流程里最难查的问题。

💡 为什么要机器可读:文档侧一次同步要看十几个 PR。有这个块,一次读取就能拿到全部状态;没有,就得逐个读正文去猜。

## 3. 文档侧的固定巡检流程

不管是定时触发还是被人叫醒,每次同步都跑同一套,顺序固定:

1. 列出 `refactor/frontend-backend-split` 上的开放 PR。
2. 逐个抽回执块。缺块的,在 PR 下贴一条「缺回执块」并附 §2 模板,本轮不再处理它。
3. 三条门禁全 `pass` 且 `assertions` 分子等于分母 → 在 PR 留言「文档侧无异议」,给对应 issue 打 `ready-to-merge`。⚠️ **合并动作永远留给人。**
4. 汇总所有 `doc-bugs` → 一次性改文档 → 一个提交 → 在每个提出问题的 PR 下回一条「已修,见 <commit>」。
5. 回答 `questions`。凡是会改变接口、依赖、目录结构的,不在评论里拍板 —— 升级成 ADR 补进 `README.md` §四,再回复。
6. 更新 `09-repo-state.md`:§1 目录树、§3 还不存在的文件、§4 缺口表。
7. 重写 `BOARD.md`。
8. 给人一段摘要:能合的是哪些、堵在哪、改了哪些文档。

## 4. 为什么不让实现侧改文档

三个理由,按严重程度排:

1. **并行会分叉。** 同时四个 agent 在跑,四个都改了 `09-repo-state.md`,合出来的版本谁都没验证过。
2. **文档是门禁的输入。** `scripts/check-api-contract.mjs` 会解析 `03-api-contract.md` 的章节标题和表格结构。改坏格式,门禁会以看不懂的方式变红 —— 硬要求见 `08-agent-guide.md` §5。
3. **改文档的人要看全局。** 一处措辞改动经常牵动三四篇。这件事需要一个能一次读完整套文档的角色来做。

所以:发现错了就报,别顺手改。**报错的成本必须足够低**,这正是 §2 那个块存在的理由。

## 5. 唤醒:能做到什么,做不到什么

| 想要的 | 行不行 | 说明 |
| --- | --- | --- |
| PR 一开,文档侧自动去看 | ❌ | GitHub 连接只提供工具调用,不提供事件回调。仓库里发生任何事都不会惊动文档侧 |
| 每天固定时间自动巡检一遍 | ✅ | 需要一个挂了定时触发的常驻 agent,见 §6 |
| 人说一句「同步」,立刻巡检 | ✅ | 现在就能用,流程同 §3 |

⚠️ 别把这条理解成「稍后会自动处理」。**没有常驻 agent 的情况下,PR 挂在那里不会有人来看** —— 必须有人喊一声。

## 6. 常驻同步 agent(可选)

要去掉「喊一声」这一步,就建一个每日触发的 agent:

- 连接:GitHub,需要仓库读写 + issue 读写
- 触发:每天固定时间一次
- 指令:§3 那八步,一字不改

它和被人叫醒的文档侧跑的是同一套流程,所以两种模式可以混用,不会打架。

## 7. 派活的人要给的最小权限

| 角色 | 令牌权限 |
| --- | --- |
| 实现侧 agent | Repository access = Only select repositories;Contents 读写、Pull requests 读写、Issues 读写 |
| 真机侧 agent | 同上 |
| 常驻同步 agent | 同上 |

⚠️ 细粒度令牌里的「Public repositories」那一项是**只读**的,勾它等于没给写权限。这个坑踩过一次。

## 8. 附:派单用的 prompt

以下两段有意和 `08-agent-guide.md` 重复。agent 漏读文档是常态,重要约束多说一遍成本很低。

### 8.1 实现侧

用的时候只改**卡号**和**分支名**两处。

```
你要在 GitHub 仓库 dengyie/OpenPet 上完成一张开发任务卡:T03。

【第一步 先读,读完再动手】
1. https://github.com/dengyie/OpenPet/pull/6 的正文(入口说明)
2. docs/refactor/00-START-HERE.md
3. docs/refactor/08-agent-guide.md —— 编码约定、错误怎么抛、测试模板、提交规范,硬约束
4. docs/refactor/09-repo-state.md —— 哪些文件已存在、精确导出签名、还剩哪些缺口
5. 你这张卡 T03,在 docs/refactor/10-tasks-m1.md 里

以上文件全在分支 refactor/frontend-backend-split 上,main 分支没有。

【第二步 开分支】
git fetch origin
git checkout refactor/frontend-backend-split
git checkout -b refactor/t03-settings

【第三步 实现】
只做卡上「建哪个文件」列出的文件。卡上给了「精确导出签名」,照抄:不改名、不改参数顺序、不额外导出。
卡上「依赖与阻塞」一栏写了前置条件,先确认满足。

【第四步 门禁,后三条全绿才能提 PR】
npm install            # 首次会大幅改写 lockfile,是预期的,不要回滚
npm run check:node
npm run test:backend
npm run check:api-contract

check:api-contract 会打印两条 todo,那是已知未实现的检查项,不算红。

【第五步 提 PR】
base 选 refactor/frontend-backend-split,不是 main。
PR 描述里把卡上「验收断言」逐条抄下来,标明每条是否满足、怎么验证的。
最后一段附上 docs/refactor/AGENT-PROTOCOL.md §2 的回执块,字段一个都不能少。

【六条硬规矩】
1. 不要发明名字。数据库列名以 services/backend/store/migrations/001_init.sql 为准;
   事件名、错误码、Job kind 从 packages/contracts 导入;
   Job 状态串从 services/backend/jobs/state-machine.js 导入。
   这三处是唯一真相。卡里没出现的标识符,不要自己造。
2. 不要重做技术选型。17 条 ADR 已全部关闭(README.md 第四节)。
   原生 node:http、node:sqlite、zod、npm workspaces、TanStack Query 都是定论。
   不要换库,不要加依赖 —— 卡上明确要求安装的除外。
3. 不要把契约信息抄第二份。需要错误码表、事件表、路由表就 import,不要重写一遍常量。
4. 缩进用 Tab,唯一例外是 packages/contracts/** 用 2 空格。
   services/backend/** 是 ESM;tests/** 和仓库根是 CJS,测试里用 await import()。
5. 不要修改 docs/refactor/ 下的任何文件。发现文档写错了,写进回执块的 doc-bugs 字段。
6. 不要跑 spike/ 目录下的六个实验,也不要 npm run pack。那部分需要真机,已单独交接。

【信息不够时】
不要猜。在 PR 描述里用 ❓ 标出这个决策点,选最保守的实现继续,
并把这个决定写进回执块的 decisions 字段。

环境:Node ≥ 22.12.0。
```

### 8.2 真机侧

```
你要在一台装了 Node ≥22.12.0、能跑 Electron 的真机上,执行一组验证实验并把结论写回仓库。

【读】
1. https://github.com/dengyie/OpenPet/pull/6 的正文
2. docs/refactor/14-handoff.md —— 你的唯一执行清单,E1 到 E10,编号就是执行顺序
3. 需要背景再看 docs/refactor/07-spike.md

分支:refactor/frontend-backend-split

【规矩】
1. 命令一律以 14 篇为准,不要从别处复制。特别是 ELECTRON_RUN_AS_NODE=1 这个前缀:
   E3、E5、E7、E8 必须带,E4 必须不带。
   E8 尤其关键 —— 漏了前缀会跑进 Electron 主进程,得到和真实情况相反的结论,
   进而误导别人删掉 ADR-010 的密钥注入逻辑。
2. 每张卡都有「期望输出」和「判定」两栏,照着逐条对,不要凭感觉判断成败。
3. 实测结果只填一处:docs/refactor/07-spike.md §7 的结果表,那是唯一权威。
   只写在 PR 评论里等于没记录。
4. 每张卡都写了「不绿怎么办」,按那个走,不要自己改设计。
5. E 卡的产出是证据(命令输出 + 结论),不是功能代码。
6. E7 预期会红一条(4 条断言过 3 条),那是已知问题,不是环境坏了。
```

## 9. 变更记录

| 版本 | 变更 |
| --- | --- |
| v1.0 | 首次建立。定义回执块 v1、巡检八步、唤醒边界 |
