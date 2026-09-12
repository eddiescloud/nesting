# 08-视觉原型 · 文字结构蜂（MVP）

更新：2026-09-11。

> **运行时代码位置**：本目录只保存模块设计文档与无头测试（`test_headless.js`、`test_integration.js`）。
> 可运行的动画代码**唯一存在于 `web/visual/`**（供交互模块 iframe 加载，也可独立打开其 `index.html`）。
> 2026-09-11 已删除本目录下与 `web/visual/` 逐字节相同的 `js/`、`css/`、`index.html`、`params/` 副本，
> 以消除双份运行时代码的漂移风险；两个测试均从 `../web/visual` 加载，删除后 128 项测试仍全过。

## 这是什么

《筑巢 / Nesting》的离线视觉最小可行性原型。先用一段转写文字演示：
文字单元依次生长 → 形成一只可辨识的蜂 → 结构稳定并留存。人形和两组粒子蜂群暂时停用，旧模块仍保留作过渡脚手架。

当前文字为手工转写占位（`web/visual/params/demo.json`），未调用真实录音识别或模型。模型接入后，
将录音解码结果中的 `sourceText` 与蜂结构规格交给同一视觉入口；旧 `output` 参数仅作为兼容脚手架。

## 技术栈

**HTML5 Canvas + 原生 JavaScript（ES6），零依赖、零构建。**

选型理由：
- 与项目"无额外安装依赖"原则一致；任何现代浏览器双击 `web/visual/index.html` 即可运行。
- Canvas 2D 对 96 个粒子 + 轨迹 + 连线网格的性能充足，离线展示无压力。
- 可直接消费 `output.schema.json` 约定的 JSON 参数，无需中间层。
- Scott 若有偏好的视觉环境（TouchDesigner / Unity / p5.js 等），本模块的参数映射与时间线逻辑可直接迁移，模块接口保持稳定。

## 目录结构

```
08-视觉原型/                    # 仅设计文档与测试
├── README.md                   # 本文件
├── test_headless.js            # 50 项无头运行时验证（从 ../web/visual 加载）
├── test_bee.js                 # 56 项文字结构蜂（会徽风笔画轮廓 + 原句填充）
├── test_ripple.js              # 23 项语言传播涟漪（触发 / 扩散 / 消失 / 确定性）
├── test_hive.js                # 23 项蜂巢（巢房布局 / 印记落位 / 可追溯填字）
├── test_waveform.js            # 20 项声纹验证
├── test_body_texture.js        # 12 项人体贴图（已降为脚手架，入口不再加载）
└── test_integration.js         # 31 项宿主协议集成验证（从 ../web/visual 加载）

web/visual/                     # 运行时（唯一副本，交互模块 iframe 加载此目录）
├── index.html                  # 入口页面，按依赖顺序加载脚本
├── css/
│   └── style.css               # 页面布局与控件样式
├── js/
│   ├── config.js               # 共享配置、参数映射、工具函数
│   ├── bee.js                  # MVP：由转写文字结构生成一只蜂
│   ├── ripple.js               # 语言传播涟漪：说出口的话离开身体
│   ├── reading.js              # AI 的理解过程：语气 / 含义 / 分段 / 不确定，逐层展开
│   ├── hive.js                 # 蜂巢：23–42 秒蜂影落进巢房，巢由语言筑成
│   ├── waveform.js             # 声纹背景（由 09-声音设计 的 score 驱动）
│   ├── body-texture.js         # 旧脚手架：人体贴图（已被 hive.js 取代）
│   ├── humanoid.js             # 旧脚手架：人形（当前入口停用）
│   ├── swarm.js                # 旧脚手架：两组粒子蜂群（当前入口停用）
│   ├── weave.js                # 旧脚手架：交织与沉积（当前入口停用）
│   ├── timeline.js             # 时间线编排器：60 秒六阶段调度
│   ├── host-adapter.js         # 宿主通信适配（postMessage 协议 v0.1）
│   └── main.js                 # 主入口：画布、参数加载、动画循环、UI 控制
├── params/
│   └── demo.json               # 演示参数（手工占位）
└── OWNERSHIP.md                # 目录归属说明
```

## 模块接口（统一约定）

所有动画模块实现以下接口，由 `Timeline` 统一调度：

```javascript
class AnimationModule {
  constructor(params, config)        // params = output.schema.json 的 output 对象
  update(dt, phase, phaseProgress, totalTime)  // 每帧更新
  draw(ctx)                           // 绘制到 Canvas 2D 上下文
  reset()                             // 重置到初始状态（重播时调用）
}
```

`phase` 取值：`idle` | `enter_a` | `enter_b` | `weave` | `settle` | `hold`
`phaseProgress`：当前阶段内的进度 0–1。

### 模块间协作

- `SwarmModule` 暴露 `getParticlePos(groupIdx, pIdx)` 和 `freezeParticle(groupIdx, pIdx)`，
  供 `WeaveModule` 读取粒子位置并冻结已沉积粒子。
- `Timeline` 在存在 `bee` 模块时只绘制文字结构蜂；无 `bee` 时才回退到旧的 `humanoid → swarm → weave` 顺序。
- `config.js` 是唯一共享状态文件；各模块不直接互相修改内部数据，仅通过公开方法交互。

## 参数映射（与 03-蜂群与融合规则.md 对齐）

| output 字段 | 映射到 | 公式 |
|---|---|---|
| `events[i].energy` | 粒子速度 | `(12 + 60 × energy) × 高度缩放` 像素/秒 |
| `events[i].dispersion` | 群体半径 | `(20 + 100 × dispersion) × 高度缩放` 像素 |
| `events[i].turbulence` | 扰动幅度 | `(2 + 22 × turbulence) × 高度缩放` 像素 |
| `events[i].trace` | 轨迹透明度与长度 | 透明度 `0.12 + 0.48 × trace`；长度 4–40 点 |
| `interaction.weave` | 结对数量 | `round(48 × weave)` 对 |
| `interaction.settle` | 沉积数量 | `round(结对数 × settle)` 对 |

上表两处 `round` 一律为 half-up（`.5` 进位），由 `js/config.js` 的 `roundHalfUp` 实现，
并与 `09-声音设计/build_score.py` 的 `round_half_up` 保持同解；禁止改用 Python 内置 `round()`。
理由与边界案例见 `docs/DECISIONS.md`（2026-09-11）。

设计画布 1080×1920（9:16 竖屏），运行时按容器等比缩放。速度公式以 1080 高为基准，
实际乘 `DESIGN_HEIGHT / 1080`。

## 时间线（MVP 沿用宿主时钟，视觉语义已改为单蜂生长）

| 阶段 | 时间 | 发生什么 |
|---|---|---|
| idle | 0–8s | 文字种子等待 |
| enter_a | 8–20s | 转写字符按顺序聚成蜂体结构 |
| enter_b | 20–32s | 结构继续长出翅膀、头部和触角 |
| weave | 32–47s | 字符之间的关系线显现，蜂形变得可辨识 |
| settle | 47–57s | 文字单元收束为稳定的蜂结构 |
| hold | 57–60s | 蜂和来源文字静止留存 |

注：单蜂 MVP 的实际节奏由 `config.DECOMPOSE` 压缩为整句 2.5s + 拆解至 10s + 约 15s 成形。

## 轮廓规则（2026-09-11 更新：会徽风笔画轮廓）

蜂的轮廓由「短笔画」沿蜂形（头/胸/腹/两对翅/触角）排布组成，每个轮廓点的笔画种类按原句字符顺序取用并循环。笔画分 5 种 `kind`：

| 代号 | kind | 说明 |
|---|---|---|
| h | line | 横 |
| s | line | 竖 |
| p | line | 撇 |
| t | line | 提 |
| d | dot  | 点 |
| j | hook | 竖钩 |
| g | bend | 横折 |
| c | arc  | 弧 |

每个字符 → 一个笔画代号，按该字最显眼的笔画取自内置 `CHAR_STROKE` 表（演示句与常用字已覆盖）；表外字按字符码从 8 种代号确定性取一个（不是字形拆解，只是轮廓的形状来源）。笔画由 `_drawStroke` 用短粗线段（lineTo/arc/stroke）画出，方向沿轮廓切线。内部仍按原句折行填字，保留「由文字组成」的可追溯证据。

视觉风格参考自会徽/图章：大量留白、稀疏短笔画、文字成为图形的一部分。

## 语言传播涟漪（2026-09-11 新增）

一句话被说出 → 从蜂体向外推出同心波纹 → 扩散到画面边缘 → 消失。**说出口的话离开身体，再也收不回来。**

算法全部确定性，同一份输入在同一时刻永远得到同一组波。实现在 `web/visual/js/ripple.js`，参数在 `config.RIPPLE`：

| 参数 | 由什么决定 | 规则 |
|---|---|---|
| 波速 | `wingbeatHz` | `baseSpeed + speedRange × (wingbeatHz − 1.6) / 1.8`。`wingbeatHz` 又由语气强度派生（`1.6 + 1.8 × intensity`）→ **说得越激动，语言传得越快** |
| 波强度 | `tension` | `0.45 + 0.55 × tension`。`tension` 由语气强度与分量派生 → **分量越重，波越粗、越持久** |
| 波色 | `hue` | 沿用这句话的语气色相 |
| 触发 | `firstAt` / `gap` / `count` | 蜂体基本成形（10.5s）起每隔 2.4s 推出一圈，共 4 圈 |
| 消散 | `maxRadius` | 半径超过 1180px（画面边缘之外）即消失 |

波面由沿切线的短笔画组成（线段 / 点 / 弧），呼应蜂体的会徽风笔画轮廓；语言离开身体时笔画已被拆散，所以这里只取最简形态，不再对应具体的字。越往外越淡、越细、笔画越短，且笔画数量有上限——波传得越远笔画越稀疏，像是语言散开了。

**无状态**：波的半径只由「当前时间 − 发出时刻」算出，不保存中间状态。因此暂停会冻结、倒退会收回、重播会清空——波始终跟着宿主时间走，不会自己跑掉。这也让 60 秒逐帧绘制零异常。

图层顺序：`waveform（声纹）→ hive（巢）→ ripple（涟漪）→ bee（蜂）`。涟漪画在蜂**之下**，波心被蜂挡住，观众只看到向外推的环。

## AI 的理解过程（2026-09-12 新增）

观众说完一句话，画面**上部**依次展开四层分析——画的是**过程，不是结论**：

| 时间窗 | 层 | 画什么 |
|---|---|---|
| 2.5–5.2s | 语气 | 10 个语气词横排，扫描针逐个扫过，停在 AI 选中的那一个；下面跟上强度 / 节奏刻度条，再下面一行小字写「凭什么」这么判断（解码层给出的证据） |
| 5.2–7.6s | 含义 | 一句话概括 + 力的方向（向内收 / 向外放 / 平）+ 分量条 + 关键词 |
| 7.6–10.0s | 分段 | 原句被切成几段，每段后面跟一个**几何标记**表示它长到蜂的哪个部位（圆=头、波=翅、方=胸、条=腹、三角=尾针）和一根分量条 |
| 10.0–11.6s | 不确定 | 这次解码**不能**确定什么 |

13.2s 之后整层淡出，把画面还给蜂与涟漪。

**显示的都是解码层真实给出的判断**（`beeSpec.decode`），不是装饰性文案。参数在 `config.READING`。

**未接入模型时只写「未解码 / 语气与含义未接入模型，没有判断可显示」**，一个语气词、一句含义都不画——与项目红线一致，绝不把占位数据冒充成模型的判断。

**无状态**：每层的展开程度只由「当前时间 − 该层起点」算出，不保存中间状态。暂停冻结、倒退收回、重播清空，与涟漪同一套约定。

图层顺序：`waveform → hive → ripple → reading → bee`。理解过程占画面上部（y≈208–430），与蜂不重叠，所以排在蜂之前画不影响可读性。

### 语气词表必须与解码层逐字一致

`reading.js` 里的 `TONE_LABELS` 与 `10-语言解码/derive_bee.py` 的 `TONE_LABELS` 必须是同一份词表，改一处必须同步另一处，否则扫描针会停在一个画面上没有的词上。

## 运行方式

### 直接打开

用浏览器打开 **`web/visual/index.html`** 即可。点击"开始"播放，"重播"重置。
（本目录已不含运行时代码；详见文首说明。）

### 加载自定义参数

将符合 `output.schema.json` 的 JSON 文件放入 `web/visual/params/`，然后：

```
web/visual/index.html?params=my-story.json
```

若文件加载失败，自动回退到内置默认参数（与 `demo.json` 相同）。

### 从 nesting.py 输出接入

```sh
# 1. 生成参数（demo 模式或未来 live 模式）
python3 07-技术验证/nesting.py demo --save /tmp/result.json

# 2. 提取 output 字段，保存为 params 可用的 JSON
#    result.json 的结构是 { mode, notice, output: {...}, ... }
#    需要将 output 字段单独保存

# 3. 打开
#    web/visual/index.html?params=my-result.json
```

## 文件归属与协作约定

为避免多个 AI 同时修改时覆盖，运行时代码（`web/visual/`）文件归属如下：

| 文件（相对 `web/visual/`） | 负责模块 | 说明 |
|---|---|---|
| `js/config.js` | 共享 | 变更需同步所有模块；新增常量前先确认不冲突 |
| `js/humanoid.js` | 人形 | 仅修改人形绘制与内部空间定义 |
| `js/swarm.js` | 蜂群运动 | 仅修改粒子物理、进入、轨迹；公开接口不变 |
| `js/weave.js` | 交织与沉积 | 仅修改结对、连线、薄层网格逻辑 |
| `js/timeline.js` | 时间线 | 仅修改阶段调度；阶段名称与时间点变更需同步 config |
| `js/host-adapter.js` | 宿主通信 | 仅修改 postMessage 协议实现；协议变更需同步 docs/INTEGRATION_CONTRACT.md |
| `js/hive.js` | 蜂巢 | 巢脾布局、蜂影落定、房内字；2026-09-11 起取代人体贴图 |
| `js/body-texture.js` | 人体贴图（脚手架） | 入口不再加载，仅作历史脚手架保留 |
| `js/main.js` | 主入口 | 仅修改画布、参数加载、UI 控制 |
| `index.html` / `css/` | 页面 | 仅修改布局与样式 |
| `params/*.json` | 参数 | 新增文件即可，不修改已有 demo.json |

本目录（`08-视觉原型/`）只放设计文档与测试：`README.md`、`test_headless.js`、`test_integration.js`。

**规则：修改自己负责的文件前，先 `git status`（或手动确认）无他人未提交改动；
共享文件 `config.js` 的变更必须在本 README 或 `docs/DECISIONS.md` 记录原因。**

## 已知限制与待办

- [x] 人形暂时从 MVP 主入口移除，旧 `humanoid.js` 与人体约束仅作回退脚手架。
- [x] 人体贴图（`js/body-texture.js`）降为脚手架：演示后段改为聚成蜂巢（`js/hive.js`，巢由语言筑成），2026-09-11 起入口不再加载。
- [ ] 文字结构蜂仍为 Canvas 程序化原型，需用真实录音转写和 Scott 的最终视觉语言替换/深化。
- [x] 声音已由声音 AI 交付（`web/audio/audio.mjs` 运行时 + `09-声音设计/` 离线 score），
      但仍是占位音色；最终音色与现场音量归 Scott。
- [x] `web/interaction/config.js` 的 `audioModuleUrl` 已设为 `/web/audio/audio.mjs`，视听三方联调 2026-09-11 完成（无头 Chrome 实测通过）。
- [ ] 薄层网纹为直线交叉网格，纤维质感（弯曲、粗细变化）待迭代。
- [ ] 未在实际展示设备上验证性能与色彩；离线开发机测试通过即可。
- [ ] 模型接入后需验证 `nesting.py` 输出与本模块参数消费的端到端闭环。
- [ ] 全屏展示模式、连续 5 轮稳定性测试待做（见 docs/DEVELOPMENT_PLAN.md 阶段 4）。

## 验证

- 语法：所有 JS 文件通过 `node --check` 语法检查。
- 无头：`node 08-视觉原型/test_headless.js`（50 项，含跨语言取整一致性）。
- 蜂巢：`node 08-视觉原型/test_hive.js`（23 项，巢脾布局/确定性/房内字可追溯/宿主时钟/绘制顺序）。
- 涟漪：`node 08-视觉原型/test_ripple.js`（25 项，触发/扩散/消失/无状态/图层顺序）。
- 理解过程：`node 08-视觉原型/test_reading.js`（41 项，四层依次展开/画布上确实是解码层的判断/未解码不编造/无状态/确定性/图层顺序）。
- 协议：`node 08-视觉原型/test_integration.js`（31 项，VisualBridge ↔ HostAdapter）。
- 运行：浏览器打开 `web/visual/index.html`，点击开始，完整播放 60 秒无报错。
- 重播：点击重播，状态完全重置，无上次残留。
- 参数：修改 `web/visual/params/demo.json` 中 weave/settle/energy 等值，画面有可辨差异。
- 注意：无头测试不等于真实浏览器/展示设备的渲染效果与性能验收。
