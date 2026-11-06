# OpenPet 视频动作资产主开发线路

> 更新时间：2026-11-04
> 状态：调研完成，V0 代码基础完成；Mango API Grok 视频适配器已接入并有 fake-provider 回归；真实视频生成与三动作 A/B 待 VPS/GPU 条件
> 范围：Creator Studio 的动作视频生成、时序抠图、稳定化和精灵图导出
> 约束：个人开源项目；不依赖付费签名；不在用户工作机做真实验收；真实模型验证在 VPS 或独立 GPU 环境完成

## 1. 决策摘要

OpenPet 当前的动作生产是图片 Provider 生成一张动作网格，再由代码切格。这个方案可以生成“看起来像动作帧”的图片，但没有时间状态，无法稳定解决相邻帧连续性、跨动作身份一致性和小尺寸动作可读性。

本计划把动作生产切换为：

```text
canonical identity
    -> 动作语义与固定 motion driver
    -> image-to-video / reference-to-video
    -> 首帧提示的目标跟踪
    -> Alpha / 色键 / 边缘修复
    -> 全局比例、根锚点和脚底线稳定化
    -> 抽帧、循环闭合、调色和精灵图打包
    -> 现有 Creator QA 与 visual gate
```

主线路选择：

1. **首选生成后端：One-to-All Animation 1.3B**。它有角色参考图、姿态驱动和卡通数据方向，硬件门槛相对可控，适合先在 VPS/GPU 环境跑通。
2. **高质量可选后端：Wan-Animate-2**。它的身份保持和视频质量更有上限，但官方默认配置面向多张 A800，不能作为广州 Backend 的默认依赖。
3. **研究候选：SCAIL、SteadyDancer**。先做离线对比，不进入第一版默认路径。
4. **轻量回退：MusePose 或现有图片网格路径**。当视频 Provider 不可用时保留，不能把回退结果伪装成视频质量通过。
5. **确定性最终兜底：Pose Animator 类 2D rig**。如果生成模型在长期运行中仍然漂移，canonical 角色可以转成可绑定资产，由 rig 驱动生成动作。

抠图主线路选择：

- 首帧用 **SAM 2** 取得角色 mask，并在视频中传播；SAM 2 代码仓库是 Apache-2.0。
- 对纯色背景使用本地色键作为辅助，不把绿幕当作唯一真相。
- 透明边缘使用本地 Alpha 修复和 despill；必要时才接入独立的 matting 后端。
- 不把 GPL-3.0 的 RVM 或 video2spritesheet 代码直接编进 Electron 主包。若未来采用，必须以独立 CLI/服务和许可证清单隔离。

## 2. 现状与根因

当前 Provider 契约只有 `character-image`、`action-keyframe` 和 `action-frame-sheet` 三类任务。动作提示词要求 Provider 一次性生成完整网格，OpenPet 后续只切格和 QA：

- [provider-image-task.js](../../../examples/plugins/creator-studio/lib/provider-image-task.js)
- [openpet-prompt-builder.js](../../../examples/plugins/creator-studio/lib/openpet-prompt-builder.js)

具体限制包括：

- 一张图片中同时完成角色身份、动作时序、网格布局、透明背景和边界留白；
- Provider 没有跨帧记忆；
- 每个格子不是由真实视频轨迹产生；
- 代码只能发现比例漂移和动作不可读，无法从坏网格中恢复连续运动。

最近一次 final-package 失败包含 `actionDistinctness`、`crossAction`、`style`、`overall` 低于阈值，以及 `style-drift`、`action-unreadable`。这说明主要问题是动作连续性和跨动作一致性，而不是单纯的导入或切图错误。

现有最终质量门仍然保留：

- identity：88
- actionDistinctness：85
- crossAction：88
- smallScale：80
- style：85
- overall：88

视频线路必须改善这些真实指标，不能只增加视频文件或降低阈值。

## 3. 调研结果与候选排名

以下排名按 OpenPet 的实际约束排序：非人形/卡通适配度、身份保持、姿态控制、短循环生成、可离线部署、许可证风险和 GPU 成本。GitHub star 是调研时页面显示的近似值，只用于判断生态热度，不代表质量证明。模型权重、数据和第三方依赖始终以各自的 model card 和 LICENSE 为准。

### 3.1 视频生成候选

| 项目 | 调研证据 | OpenPet 适配度 | 结论 |
| --- | --- | --- | --- |
| [One-to-All Animation](https://github.com/ssj9596/One-to-All-Animation) | CVPR 2026；约 500 stars；仓库 Apache-2.0；1.3B/14B；参考图加动作/姿态视频；README 提到 1.3B 可在 16GB T4 运行短视频 | 高 | 第一版主试验后端。它明确覆盖 cartoon 数据和 alignment-free reference，适合宠物角色；先用 1.3B，不把 14B 作为常驻服务。 |
| [Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) | 官方仓库约 359 stars；Apache-2.0；14B；参考图加 driving video；支持 Base 和 Distillation；README 默认 720P 配置面向 8×A800，480P 已在 2×A800 测试 | 高上限、低常驻适配 | 作为高质量离线后端和对照组。不能直接假设广州 VPS 能承担完整模型；先做独立 GPU runner。 |
| [SCAIL](https://github.com/zai-org/SCAIL) | 官方仓库 Apache-2.0；强调 3D-consistent pose representation、角色动画和姿态控制；项目较新，生态和硬件实测信息仍需补齐 | 中高，待验证 | 作为第二批候选。必须先完成非人形宠物 fixture 和许可证/权重检查。 |
| [MusePose](https://github.com/TMElyralab/MusePose) | 约 2.7k stars；仓库 MIT；参考图加 OpenPose/DWPose 驱动；基于 AnimateAnyone 生态 | 中高 | 轻量成熟回退。人形训练偏置明显，适合做基准和无视频模型时的备用后端。 |
| [SteadyDancer](https://github.com/MCG-NJU/SteadyDancer) | 约数百 stars；Apache-2.0；强调 first-frame preservation 和时空稳定；14B 级别 | 中高 | 质量对照和离线高质量生成，不作为第一版默认后端。 |
| [AnimateAnyone](https://github.com/HumanAIGC/AnimateAnyone) | 约 14k stars 的经典项目影响力；参考图加 pose video；生态成熟但较旧 | 中 | 只保留为历史基线。不要把旧模型结果当作主线路质量上限。 |
| [Pose Animator](https://github.com/yemount/pose-animator) | 约 8.8k stars；Apache-2.0；SVG/骨骼驱动；天然透明；不是生成式视频模型 | 很高的确定性 | 作为长期稳定兜底。它解决的是身份一致性和循环可靠性，不是从文字直接生成角色。 |

### 3.2 抠图和精灵图候选

| 项目 | 调研证据 | 许可证/风险 | 结论 |
| --- | --- | --- | --- |
| [SAM 2](https://github.com/facebookresearch/sam2) | 约 20k stars；视频目标分割；首帧点/框/掩码后用 streaming memory 传播 | 代码 Apache-2.0；模型条款单独确认 | 作为主跟踪层。输出 mask，不直接等于柔性 Alpha。 |
| [Robust Video Matting](https://github.com/PeterL1n/RobustVideoMatting) | 约 9.6k stars；有时序记忆；支持 PyTorch、ONNX、TF.js、CoreML | 仓库 GPL-3.0；主要面向人像，卡通宠物要实测 | 不直接嵌入 Electron。可作为隔离 runner 对照。 |
| [video2spritesheet](https://github.com/bensanmorris/video2spritesheet) | RVM 加两阶段处理；包含 RGBA、全局 bounds、foot position、抽帧、量化和 sheet | GPL-3.0；直接复用会扩大分发合规范围 | 作为实现参考，不直接复制代码。 |
| [FrameKit](https://github.com/joepUI/framekit-web) | MIT；浏览器本地；视频转精灵图、色键、抽帧、PNG/APNG/WebP/Spine 导出 | 低集成风险；主要是色键与工具链，不是时序 matting | 借鉴其本地处理和导出接口，适合 Control Center 的后处理体验。 |
| [SpriteKit](https://github.com/PizzaLater/SpriteKit) | MIT；纯浏览器工具；固色背景视频、取色、抽帧、透明 PNG sheet | 低；功能简单，时序保证有限 | 作为最小色键路径和人工调试参考。 |
| [FrameRonin](https://github.com/systemchester/FrameRonin) | 页面显示约 960 stars；视频转序列帧、色键、编辑、sprite sheet、后端 rembg 可选 | 许可证需要单独核对；部分模型依赖不应直接打包 | 作为产品交互和批处理设计参考。 |
| [SAM2Matting](https://github.com/FudanCVL/SAM2Matting) | SAM2 跟踪加真实 Alpha matting，适配复杂边缘和非人形目标 | 研究项目，代码/权重/数据许可证需分别确认 | 第二批高质量 matting 对照，不进第一版核心依赖。 |
| [VideoMaMa](https://github.com/cvlab-kaist/VideoMaMa) | mask-guided video matting，强调长视频时序一致性 | 计算重，仓库和权重存在非商业/研究限制风险 | 研究对照，不进入 OpenPet 默认分发。 |

## 4. 主线路设计

### 4.1 输入和产物

每个动作生成都绑定一个 immutable canonical identity：

```text
runId
canonicalSha256
actionId
motionPresetId
motionDriverSha256
videoProvider
videoModel
videoConfigHash
```

动作源不再只有一张 grid 图片，而是以下资产：

```text
inputs/
  canonical/identity.png
  motion-drivers/<actionId>.mp4
  motion-drivers/<actionId>.json
outputs/
  raw/<actionId>.mp4
  masks/<actionId>.mp4
  alpha/<actionId>/0001.png ...
  normalized/<actionId>/0001.png ...
  sprites/<actionId>.png
  metadata/<actionId>.json
```

原始视频、mask、Alpha 帧、稳定化帧和最终 sheet 都必须保留，便于复盘 Provider 漂移、抠图错误和锚点错误。

### 4.2 新 Provider 任务契约

新增 `action-video-v1`，不复用 `action-frame-sheet` 的隐含语义：

```json
{
  "schemaVersion": 1,
  "taskType": "action-video",
  "actionId": "waving",
  "motionPresetId": "waving-four-phase-v1",
  "reference": {
    "sha256": "<canonical hash>",
    "role": "canonical-identity"
  },
  "motionDriver": {
    "sha256": "<driver hash>",
    "fps": 12,
    "frameCount": 12,
    "loop": true
  },
  "canvas": { "width": 512, "height": 512 },
  "fps": 12,
  "durationMs": 1000,
  "background": {
    "mode": "solid",
    "color": "#12ff4d",
    "purpose": "matting-assist"
  },
  "camera": "locked",
  "output": "video"
}
```

契约规则：

- 只允许一个 canonical reference；
- motion driver 必须来自代码注册的动作预设或已审计的本地视频；
- `camera=locked` 是质量门条件，不是普通提示词建议；
- 绿底/白底只代表背景辅助策略，不代表已有 Alpha；
- Provider 返回视频地址后必须立即复制到 run-owned storage 并计算 hash；
- Provider、模型名、请求参数和重试次数写入脱敏诊断；密钥仍只在 Host/Backend。

### 4.3 Motion driver

第一版不让视频模型只靠自然语言自由发挥。每个官方动作使用固定低分辨率 motion driver：

- `idle`：小幅呼吸、耳朵或尾巴轻动，根节点不平移；
- `waving`：肩部锁定，手臂完成明确四相位，回到中性姿态；
- `jumping`：下蹲、离地、最高点、落地、恢复中性；
- `running-right`：根节点水平移动，脚部周期清晰；
- `running-left`：由 accepted running-right 程序化镜像，不独立生成；
- `failed`、`waiting`、`running`、`review`：先定义视觉可识别的局部动作，避免只用情绪词。

motion driver 生成方式按优先级：

1. 代码内固定 pose/骨架序列；
2. 经过审查的短视频模板；
3. 手工导入并 hash 绑定的用户驱动视频。

不能把未审查的任意网络视频直接作为生产动作源。

### 4.4 背景策略

默认使用“纯色辅助背景 + 时序分割”，而不是默认承诺透明视频。

- 纯绿色不是固定答案；背景色应避开 canonical 角色主色；
- 白底不作为默认，因为会吞掉白色毛发和高光；
- 生成后先检查背景是否稳定、是否有渐变和阴影；
- 色键只能处理背景，不能替代角色跟踪；
- despill 只修改靠近 Alpha 边缘的色彩通道，不扩大删除范围；
- 角色自身包含背景色时，必须依靠 SAM2 mask 或人工修正。

### 4.5 跟踪、Alpha 和稳定化

处理顺序固定为：

1. 解码并检查视频帧率、尺寸、时间戳和首尾可读性；
2. 首帧使用 canonical 位置提示 SAM2；
3. 在整段视频传播 mask，检测 mask 丢失、跳变和多连通域；
4. 用纯色 key 作为辅助清理，保留软边；
5. 对 Alpha 做轻量时序去闪和 despill；
6. 计算每帧包围盒、质心、根点、占用率和脚底线；
7. 以整段视频的全局 bounds 和 root anchor 统一裁切、缩放和定位；
8. 只在稳定化之后抽取官方帧；
9. 生成 sheet、预览 GIF、JSON sidecar 和质量证据。

每帧单独自动裁切是禁止项，因为它会产生角色上下跳动。必须保存固定画布坐标和 anchor。

## 5. 质量门扩展

现有 `canonical` 和 `final-package` 质量门继续使用。视频线路新增生成前和处理中间门，不能跳过。

### 5.1 视频技术门

- 视频可解码，帧数和 FPS 与任务契约一致；
- 所有帧尺寸一致，时间戳单调；
- 角色 mask 在每帧存在，丢失帧比例为 0；
- mask 最大连通域稳定，没有突然出现第二个主体；
- 角色没有越过安全画布边界；
- 背景没有大面积运动或文字水印；
- 输出视频和每个中间资产均有 sha256。

### 5.2 时序门

记录以下指标，不用主观日志替代：

- `rootAnchorStd`：根锚点在动作类型允许范围内的波动；
- `bodyScaleCv`：主体尺度变异系数；
- `alphaFlicker`：相邻 Alpha 帧差异和边缘闪烁；
- `maskDropoutRate`：目标跟踪丢失比例；
- `loopSeamDistance`：首尾姿态和轮廓差异；
- `backgroundMotionScore`：背景非主体变化；
- `uniqueMotionFrameCount`：避免所有帧被 Provider 复制成静止图。

这些指标先作为诊断和 repair reason，不在没有 fixture 基线前硬编码新阈值。三动作 A/B 完成后，根据数据确定动作类型专属阈值。

### 5.3 视觉门

现有最终阈值不降低：

- `actionDistinctness >= 85`
- `crossAction >= 88`
- `style >= 85`
- `overall >= 88`

首个视频分支验收必须满足：

- `idle`、`waving`、`jumping` 都有可导入动作；
- 不出现 `action-unreadable`；
- 不出现 `style-drift`；
- 不出现 `board-unreadable` 或全零 `cannot-evaluate`；
- `running-left` 仅来自 `running-right` 的确定性镜像；
- 任何视频失败都保留原视频和中间证据，不自动复制 idle 伪装成功。

## 6. OpenPet 代码落点

第一版按现有分层落地，避免把视频逻辑塞进 Electron renderer：

### Host / Backend

- Provider capability 增加 `video-generation`，与 `image-generation` 分开；
- Backend 负责任务、文件存储、队列、状态、超时、取消和重试；
- 任何 API key 仍只在 Host/Backend，不能进入 renderer 或普通插件；
- 远程 GPU runner 只返回短期 artifact handle，Backend 复制到 run-owned storage。

### Creator Studio

- `provider-image-task.js` 保持图片契约；新增 `provider-video-task.js`；
- 新增 `motion-driver-registry.js`，注册动作、帧数、loop 和允许的根节点运动；
- 新增 `video-artifact-contract.js`，校验视频、mask、Alpha 和 sidecar；
- 新增 `video-frame-extractor.js`，只做固定 FPS 和固定帧数抽取；
- 新增 `video-matte-pipeline.js`，隔离 SAM2、色键和 Alpha 修复；
- 新增 `video-stabilizer.js`，负责 bounds、root、scale 和 baseline；
- 复用 `full-pet-row-qa.js`、`full-pet-row-stable-slots.js`、`full-pet-atlas-composer.js` 做最终行和 atlas QA；
- `creator-workflow-service.js` 只编排，不直接处理视频像素。

### 兼容策略

- 旧图片网格路径保留为明确的 `legacy-image-sheet` fallback；
- fallback 结果必须在 run 中标明 backend 和 pipeline；
- 不允许把 fallback 结果与视频结果混在一个 quality claim 中；
- 只有视频分支和图片分支都通过同一最终质量门时，才可进入统一导入流程。

## 7. 分阶段实施计划

### V0：契约和 fixture（先做）

- 定义 `action-video-v1`、motion driver、视频 artifact 和 sidecar；
- 增加纯色背景、白色角色、透明边缘、遮挡和循环接缝 fixture；
- 在不调用真实模型的情况下跑通：视频读取 → 抽帧 → 固定 bounds → sheet；
- 记录当前图片链路和新后处理链路的基线。

完成条件：Node 测试可在无 GPU、无 Provider、无 Electron 的环境运行。

### V1：One-to-All 1.3B 离线适配器

- 在独立 GPU runner 上固定环境、模型、精度和输出分辨率；
- 接入一个 canonical reference 和三个 motion driver；
- 产出原视频、帧、mask、Alpha 和 sidecar；
- 不接入默认 Creator UI，只生成可审查 run evidence。

Mango API 的 OpenAI-compatible Grok video provider 已作为独立 Provider 路径落地：运行时从 `/v1/models` 发现 `grok-imagine-video`、`grok-imagine-video-1.5` 和 `grok-imagine-video-1.5-preview`，通过 `/v1/videos` 提交、`/v1/videos/:id` 轮询，并从 `/v1/videos/:id/content` 复制到 run-owned storage。该路径不把 API key 写入代码、renderer、sidecar 或错误详情，也不把 HTTP 200 视为视觉质量通过。

完成条件：同一输入可重复生成并保留完整 provenance；失败能被取消和重试，不阻塞桌面 Host。

### V2：三动作 A/B

- 对 `idle`、`waving`、`jumping` 比较旧图片网格和视频路线；
- 使用相同 canonical、相同最终尺寸和现有视觉质量门；
- 对比 `crossFrame`、`actionDistinctness`、`crossAction`、`style`、`loopSeamDistance`、`alphaFlicker`；
- 只有在三动作都达到准入标准后才扩大动作集合。

完成条件：无 `action-unreadable`、无 `style-drift`，三动作都可导入。

### V3：Creator Studio 集成

- [x] 将 Mango API 视频配置透传到 Creator Host，并在有效 Grok 视频模型和视频 key 存在时路由动作候选到视频链路。
- [x] 将视频候选适配到现有质量门、候选持久化和 checkpoint 复用契约；保留图片网格 fallback。
- 增加 provider capability 和视频任务路由；
- 增加进度、取消、重试、artifact 预览和失败证据；
- 让 Creator 只选择动作计划，代码展开 motion driver；
- 复用现有人工审批、导入和激活边界。

完成条件：真实视频 run 可在广州 Backend 或独立 runner 完成，桌面只负责控制和审查。

### V4：质量优化和高质量后端

- 接入 Wan-Animate-2 Distillation 做高质量对照；
- 对比 SCAIL、SteadyDancer；
- 评估 SAM2Matting 或独立 matting runner；
- 根据真实数据确定动作类型专属阈值；
- 评估 Pose Animator 作为确定性动作兜底。

完成条件：至少一种主后端和一种确定性回退都能通过同一套审查和导入协议。

## 8. 测试策略

### 单元测试

- motion driver 的帧数、相位顺序、loop 和根节点策略；
- 视频任务字段、禁止字段和 hash 绑定；
- FPS 抽取和时间戳排序；
- mask 连通域、Alpha 范围、despill 边界；
- 固定 bounds、root anchor、baseline 和镜像；
- sidecar 与真实帧数量、尺寸、sha256 一致；
- 取消、超时、重试和部分产物恢复。

### 集成测试

- fake video Provider 返回有效视频、空视频、损坏视频、错误 FPS 和超时；
- fake SAM2 返回丢失 mask、跳变 mask、第二主体和正常 mask；
- 同一 canonical 生成三动作时，跨动作绑定不能丢失；
- running-left 只能从 running-right 派生；
- 远程 runner 中断后，Backend 不重复导入旧 artifact；
- Provider key 不进入 renderer、插件普通日志或 sidecar。

### 真实验证

- 只在广州 VPS/独立 GPU runner 执行；
- 不在用户工作机启动 Electron 做验收；
- 先执行三动作 A/B，再扩大到完整动作集；
- 保存模型版本、配置 hash、输入 hash、输出 hash、耗时、显存和失败码；
- 真实视觉通过必须有 review board 和非零 evaluator 分数，不能用 HTTP 200 或视频存在替代。

## 9. 许可证与分发原则

- Apache-2.0、MIT 代码可以作为候选，但模型权重和数据集许可证必须独立记录；
- GPL-3.0 的 RVM/video2spritesheet 不直接进入 Electron 主包；
- MatAnyone、VideoMaMa、SAM2Matting 等研究项目如果存在非商业或权重限制，只能作为隔离实验依赖；
- 生成的宠物素材权利和第三方模型权重许可是两件事，不能用“个人开源”替代许可证审计；
- 每个可选后端都必须有 `MODEL_LICENSE.md` 或机器可读的依赖许可记录后才能进入发布构建。

## 10. 暂不做的事情

- 不先做训练新视频模型；
- 不把绿幕当作透明 Alpha；
- 不把白底作为默认背景；
- 不在没有 A/B 数据时删除旧图片路径；
- 不把 14B 模型作为广州 Backend 常驻服务；
- 不在 renderer 内运行 Python/PyTorch；
- 不通过降低现有质量阈值解决视频失败；
- 不用人工挑图绕过动作时序、身份和透明度 QA。

## 11. 首个实现任务清单

- [x] 新增 `action-video-v1` 任务和 artifact contract。
- [x] 注册 `idle`、`waving`、`jumping` 三个 motion driver。
- [x] 增加本地 fixture 视频和无模型后处理测试。
- [x] 实现固定 FPS、固定 bounds、root anchor 和 sidecar。
- [x] 实现色键辅助、Alpha 边缘修复和 despill。
- [x] 实现隔离的 GPU runner 请求/响应协议、并发请求合并、幂等重试与取消边界；One-to-All 1.3B 推理 adapter 仍需在独立 GPU runner 实装。
- [x] 接入 Mango API Grok 视频模型的 Creator 候选路由和可复用 sprite artifact 适配。
- [ ] 完成三动作 A/B，并归档质量门结果。
- [x] 接入 Creator Studio UI 和远程 Backend 的视频配置及候选路由；真实全动作质量验收仍未完成。
- [ ] 记录模型、权重、依赖和输出资产许可证。

## 12. 调研来源

- [Wan-Animate-2 官方仓库](https://github.com/Wan-Video/Wan-Animate-2)
- [One-to-All Animation 官方仓库](https://github.com/ssj9596/One-to-All-Animation)
- [SCAIL 官方仓库](https://github.com/zai-org/SCAIL)
- [MusePose 官方仓库](https://github.com/TMElyralab/MusePose)
- [SteadyDancer 官方仓库](https://github.com/MCG-NJU/SteadyDancer)
- [AnimateAnyone 官方仓库](https://github.com/HumanAIGC/AnimateAnyone)
- [Pose Animator 官方仓库](https://github.com/yemount/pose-animator)
- [SAM 2 官方仓库](https://github.com/facebookresearch/sam2)
- [Robust Video Matting 官方仓库](https://github.com/PeterL1n/RobustVideoMatting)
- [video2spritesheet](https://github.com/bensanmorris/video2spritesheet)
- [FrameKit](https://github.com/joepUI/framekit-web)
- [SpriteKit](https://github.com/PizzaLater/SpriteKit)
- [FrameRonin](https://github.com/systemchester/FrameRonin)
- [SAM2Matting](https://github.com/FudanCVL/SAM2Matting)
- [VideoMaMa](https://github.com/cvlab-kaist/VideoMaMa)

本计划的项目热度、硬件和许可证信息来自 2026-11-02 的 Grok Search 检索与官方仓库页面。热度会变化，模型权重和第三方依赖条款必须在实现和发布前重新核对。

## 13. 生产图生视频修复范围（2026-11-06）

用户后续提供了 Mango API Grok 视频模型，当前交付路线使用该 API；One-to-All GPU 推理仍是调研候选，不是本次 API 接入的部署前提。真实 Creator 验收须完成九个配置动作，不能只用三动作或单视频技术 smoke 替代。

上游审计确认，旧请求的 `image_url` 被 Mango 通用任务 DTO 丢弃。OpenPet `2eb6f725` 改用原生 `image: {url: dataURL}`，Mango `e2e64b981` 在现有 Sora 插件登记 Grok host video protocol，两个修复均已部署。Mikan 的真实 Console 任务已记录 `input_image_count=1`，但返回额度/provision key 429。当时 Grok Web 的路由校验和 adapter 均拒绝图输入；后续首帧修复和上线结果见 13.3。

[公开 transport 源码](https://github.com/Lee-SiHyeon/web-api-playbook/blob/901c9c619e85594bec365f7c599ec495ae4c6c68/service-packs/grok/src/grok-media-video-transport.mjs) 明确区分 `mediaGenInput.textToVideo` 与 `mediaGenInput.imageToVideo`。后者包含 `prompt`、`aspectRatio`、`duration`、`resolutionName`、`skipAudio`、`mode` 和单个 `inputAssets`；`useFirstFrame` 为可选布尔字段。源码只提供捕获请求的证据，不能据此宣称任意分辨率/时长或生产账号已经验证。

最小实施路径：

1. 在隔离工作区新增失败回归，覆盖 Web 首帧请求被当前路由和 adapter 拒绝；保留多参考图拒绝，避免声明未经验证的能力。
2. 复用现有图片校验、同账号出口租约与 `/http/upload-file-v2/direct` 上传能力；以上传响应的 `fileMetadataId` 构造 `imageToVideo.inputAssets`。缺少该标识、上传失败或取消时必须停止，不能降级为无图文本视频。
3. 只改变首帧生成路径；保持文本视频、Console/Build、多参考图校验、凭据隔离和现有视频下载生命周期。
4. 在服务器用 Mikan canonical-2 验证真实首帧任务、视频下载、抽帧/Alpha/时序 QA，再从正式 Creator recovery API 完成全部动作与最终包评估。记录参考图 hash、上游图数、Provider、输出 hash 和最终非零评分；不得使用质量 override。

用户已确认保留 Grok 主工作区网络迁移改动，并授权独立修复。Web 首帧实现已提交至自有 fork `dengyie/grok2api` 的 `main`（`6c5c165e`）；全量 Go 测试、首帧 race 和含迁移代码的集成测试通过。生产构建保留既有六份网络源文件，十一份主工作区文件的 SHA-256 均未变化。

### 13.3 真实首帧验证与后处理修复（2026-11-06）

- tebi 影子实例复用同一配置密钥，使用独立 SQLite 快照与媒体目录。真实 Mikan 首帧任务 `video_Kt9ZnnCzfMOvAKaWPxmOOZAq` 为 `grok_web`、输入图数 1、`completed`；下载 934,896 bytes，SHA-256 `f10b02a1ce11b4ff3df413016abc7986d82d7e98395e9d17e0a6a597cf017b21`。切换生产前保留二进制、配置和一致性数据库快照，切换后 `/healthz` 200。
- 正式 Creator idle 恢复进入视频与抠图阶段，发现稳定化使用角色 bbox 计算目标宽高，却对完整源画布执行 resize，造成角色细条失真。新增真实像素回归：20×30 角色在 80×60 画布上移动时，旧输出变为 15×41；修复为先裁剪 `placement.source` 再等比例归一化。
- 原始透明 canonical 直接进入视频模型，使首帧底色与后续绿幕不同，并且上游可能沿用首帧正方形尺寸。Provider 输入改为独立落盘的 1280×720 不透明绿幕首帧，保留 canonical 原图；派生输入记录自己的 hash，身份质量仍对照原 canonical。
- 像素回归进一步确认稳定化把跳跃各帧固定到相同底部，消除了起跳位移；默认归一化到 80% 高度（102px）也不匹配既有 runtime profile 的 92px。处理器现在以全序列中位角色高度和 profile 确定共同 scale，并按源画布比例保留 action-relative-root 位移；溢出仍拒绝，禁止偷偷缩小角色。rawTrajectory 来自源帧 root/canvas，不使用处理后基线冒充原始轨迹。
- 视频 processorVersion 升至 4，防止复用旧归一化 checkpoint。最终 Creator 九动作和 final-package 仍需在该修复部署后重跑，不能把单视频通过写成完整成品通过。
- PR #106 已合入 main `d07bdf8f` 并部署广州；正式 idle 恢复完成三份技术合格的视频与 Vision 评估（74/84/84），仍因真实视觉阈值保持 recovery-required。发现视频 repair 提示词只消费技术失败码，忽略帧间、风格、小尺寸与动作可读性反馈；后续修复针对这些已发生的失败项给出明确纠正，并约束 idle 保持参考肢体姿势。完整证据见 [线上恢复记录](../../release-evidence/remote-backend/2026-11-06-video-normalization-recovery.md)。
- PR #107 已部署为 main `6f943445`，main CI 全绿；四份新 idle 视频仍因视觉评分 68/69/69/64 未通过。进一步确认评估请求缺少动作 ID 与 frame plan，模型无法按 idle/挥手/跑步的真实语义评估可读性；补齐动作上下文并拒绝缺失上下文的动作请求。生成器还误读不存在的平铺参数，现改为消费计划的 `motionParameters`，与评估共用同一 registry 展开结果。新参数回归 red→green，专项 120/120；同一线上板真实复评 idle 可读性 18→86，但仍保留小尺寸与帧间质量失败。接下来以适合小尺寸的原创卡通角色验证九动作及最终包，不能放宽质量门或反复重评直到碰到 pass。

- PR #108/#109 已合入 main `dfdf7b10` 并部署广州 ready/resident；动作评估上下文与嵌套运动参数已修复，image/video processorVersion 2/5 阻止复用旧评估。VPS core2325/1skip、UI81/81、专项127/127及PR CI/两平台构建通过。原创简洁卡通Pip已通过真实参考图生成、canonical四候选评估及身份接受，九动作Job正在执行，完整包仍待最终验证。
- Pip动作Job最终仍在idle阻断：两份不同板的整体85/80、小尺寸92/90、动作可读性78/57，实际帧图有挥翅和喙形变化。新增失败回归确认视频提示词把用户整段九动作描述再次注入当前idle，且禁止肢体运动只列爪/手。后续修复删除视频动作提示词中的原始形象叙述与自由文本动作别名，以真实首帧像素和registry driver分别作为身份与动作来源；idle registry明确只允许胸部呼吸和眨眼，保持翅膀、其他肢体和嘴/喙不变。image/video版本3/6失效旧语义结果，专项128/128；等待部署和真实恢复，不宣称全链路通过。

- 2026-11-06：PR #110 已部署广州 main `120fdda2`，main CI `42133580893` success。Pip retry `aa229e1d` 的四候选整体84/53/79/77，最佳跨帧78，仍未通过。对比原始解码与归一化帧证明峰值身体452×518→530×489的变形来自原始视频。后续将idle统一为身体静止的一次眨眼，更新生成/评估与动静部位契约，image/video版本4/7；质量阈值不变，先单次隔离真实验证。另补idle/非idle重试状态回归，修复生成中遗留recovery-required/98%进度并保留旧失败证据。九动作与最终包仍待真实通过。

- 隔离真实idle：仅新增1次视频（SHA `2957decc147d3cb89dc791f11406d5bd403067cc8b065ad9cd80e9244c1fcda8`）。眨眼跨帧92，但旧板因先128px再放大512px风格79；像素/调用边界回归确认评估前丢失细节。修复保留512px归一化帧并持久化hash，评估板同时展示全部实际128px成品预览，坐标/角色传给评估器，阈值不变。同一视频新证据板一次评估通过：整体90、风格88、小尺寸95；旧板与失败评估均保留，专项122通过。正式广州九动作与最终包仍待验证。
