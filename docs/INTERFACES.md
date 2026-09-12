# 统一运行环境与模块接口

更新：2026-09-08。目的：视觉技术栈未定期间，先固定数据流、运行环境和各模块职责，让视觉、声音、交互各 AI 并行工作而不互相覆盖。本轮由声音设计侧建立，视觉栈确认后如有变更记入 DECISIONS。

## 运行环境（统一约定）

- Python 3.9+，仅标准库；无第三方依赖、无 build/lint 配置（沿用 AGENTS.md）。
- 所有脚本在项目根目录运行；模块通过相对自身文件的路径定位项目根（参考 `07-技术验证/nesting.py` 的 ROOT 写法），不依赖当前工作目录。
- 单位约定：时间一律秒；坐标以 1080 高画布为基准像素、按画布高度缩放；所有转译参数 0–1。
- 展示时间线以"展示开始"为 t=0，总长 60 秒；输入与模型等待阶段不在该时间线内（等待上限 8 秒，由 07 负责）。
- 所有确定性脚本必须可复算：相同输入必得相同输出（当前 build_score、render_score 均满足并有测试覆盖）。

## 数据流（单向，不回写）

```
input.json（两段话）
  → [模型接入前：手工占位 output]（标注"手工占位"，不冒充真实 AI）
  → output.json        ← 04-AI转译/output.schema.json + 07 校验器
  → build_score.py     → score.json   ← 09-声音设计/score.schema.json
  → 视觉渲染 + 声音渲染（各自消费，互不依赖对方实现）
```

- 视觉与声音**共用 `score.phases` 的时间结构**（即 02 分镜六段）：这是音画同步的唯一事实来源。
- 任何端不得把 demo/占位输出冒充真实 AI 结果；`derived_from.output_sha256` 可复算验证 score 由哪份 output 推导。
- output 字段若变更，必须同步：schema、示例、07 校验器与测试、08 build_score 及其测试、本文档。

## 模块与文件所有权

| 模块 | 文件 | 状态 | 修改权限 |
|---|---|---|---|
| 概念/分镜/规则 | 00–03、05、06 编号文件 | 已有 | 团队确认后变更 |
| 转译约定 | `04-AI转译/*` | 已有 | 变更须同步 07、08、本文档 |
| 校验与传输 | `07-技术验证/nesting.py`、`test_nesting.py` | 已有，12 项测试通过 | 08 只读复用（import nesting），不修改 |
| 音画时间线 | `09-声音设计/build_score.py`、`score.schema.json`、`test_score.py` | 19 项测试通过 | 声音 AI；消费端只读 |
| 参考音频 | `09-声音设计/render_score.py`、`renders/`、`score.example-手工占位.json` | 本轮新增 | 音色占位，最终音色由 Scott 调整 |
| 声音运行时 | `web/audio/audio.mjs`、`tests/audio.test.mjs` | 12 项无头测试通过 | 声音 AI；实现 INTEGRATION_CONTRACT 的 createAudio() 接口 |
| 交互 | `web/interaction/` | 交互 AI 已完成 | 交互 AI；audioModuleUrl 已设为 `/web/audio/audio.mjs`，三方联调 2026-09-11 完成 |
| 语言解码 | `10-语言解码/`（decode.schema.json、解码提示词.md、derive_bee.py、test_decode.py） | 24 项测试通过（2026-09-11 新增） | 解码层；模型只给语义，蜂体参数由确定性公式派生 |
| 视觉 | `web/visual/` + `08-视觉原型/` | 视觉 AI 已完成 | 视觉 AI；只读 score/output/decode |
| 录音采集 | `web/interaction/voice.mjs`、`tests/voice.test.mjs` | 6 项测试通过（2026-09-11 新增） | 交互 AI；只在本机处理，退出即释放音轨与回放地址 |

协作规则：各 AI 只修改自己名下文件；发现他人文件问题写进 `docs/TODO.md` 或 `docs/DECISIONS.md`，不直接改；每轮结束按 AGENTS.md 更新 TODO 与 HANDOFF。

## score.json 消费约定（视觉 / 声音适配器）

- `phases`：6 个固定相位（calm 0–8 / swarm-a 8–20 / swarm-b 20–32 / weave 32–47 / settle 47–57 / residual 57–60），start/end 秒。视觉场景切换、声音层包络均按它驱动。
- `layers`：持续层定义。`kind`: drone（铺底）/ texture（蜂群纹理，`grain_rate` = 2 + 14 × energy 粒/秒）/ pulse（交织脉冲）/ bloom（沉积泛音，由 events 驱动）。`source_event` 指回 output 的事件 ID（`none` 表示无对应）。
- `events`：离散同步点。cue 事件名（showcase-start / swarm-a-enter / swarm-b-enter / weave-start / settle-start / residual-start / deposit-XX）为视觉与声音共同事件；`t` 为触发时刻；deposit 事件逐条对应"薄层沉积"节拍，视觉可按序对应沉积粒子。
- `master_gain`：持续层并发峰值到 0.8 总音量上限的归一系数（向下取整防溢出）；播放端整体增益不得使峰值超过 1.0。
- 蜂群视觉参数（速度、半径、扰动、残留透明度）仍按 03 的公式从 output 参数计算，与声音映射互相独立，仅共享 phases 时间轴。
- **派生计数（结对数、沉积数）与四位小数舍入的取整一律 half-up（`.5` 进位）**，是视觉与声音必须一致的硬约束。实现：`09-声音设计/build_score.py` 的 `round_half_up` 与 `r4`、`web/visual/js/config.js` 的 `roundHalfUp`、`web/audio/audio.mjs` 的本地 `roundHalfUp` 与 `r4`。**禁止使用 Python 内置 `round()` 或 `round(value, 4)`**（银行家舍入），否则 48×weave 恰为 .5（如 weave=0.46875 → 22.5）或四位小数第五位为 5 时两端数值漂移。修改任一处须两端同步。
- `events` 的容量上界由最坏情况决定：6 个 cue + `round(48×1)×1` = 54 个 deposit，故 `score.schema.json` 的 `events.maxItems = 54`。调整该上限前必须先核对 `output.schema.json` 允许的参数域。

## 视觉技术栈（已由视觉 AI 落地）

视觉采用 HTML5 Canvas + 原生 JS（零依赖），60 秒六阶段闭环与本文 phases 一致；协议对接见 `docs/INTEGRATION_CONTRACT.md`（iframe + postMessage，宿主时钟）。声音运行时为 WebAudio（`web/audio/audio.mjs`），由宿主 frame 驱动，不自建第二个时钟。候选期记录的 TouchDesigner / p5.js 方案未采用；编号冲突（`08-视觉原型` 与 `09-声音设计` 同号）待用户定夺是否重命名，当前以目录名而非编号区分。
