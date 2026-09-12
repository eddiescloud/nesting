# Current Status

## GitHub 协作基线（2026-09-12）

### Completed / Changed
用户明确要求发布到私有 GitHub。项目目录已建立独立 Git 仓库，远端为 `eddiescloud/nesting`（已通过 GitHub API 验证 `private: true`）。`.gitignore` 排除 `.env*`、私钥文件、Python 缓存、编辑器临时文件及 `.workbuddy*` 隐藏记忆目录；提交前以文件名扫描并做常见密钥特征检查，未发现命中。更新 AGENTS、README、DECISIONS、TODO 以明确 Git 边界与协作约束。

### Current State / Known Issues
本轮未改业务代码；之前全量 405 项测试曾通过，本轮尚未重新执行。当前项目仍有 ASR 未接入、现场设备未验证及部分旧文档状态过期的问题。Private 仓库不会自动赋予同事权限；邀请需用户提供 GitHub 用户名并单独操作。不要向仓库提交真实观众录音或密钥。

### Next Step / Important Context
发布后核对远端提交和本地工作树；同事协作优先走分支与 PR。只在 `/Users/jass/Desktop/筑巢-Nesting` 内执行 Git 命令，不碰桌面父仓库。后续优先完成 ASR 与现场设备验证。

### Commands
`git status`、`git log -1 --oneline`、`git remote -v`；运行：`python3 web/interaction/server.py --port 8765`。完整测试命令见 `docs/VERIFICATION_STATUS.md`。

---

## 节奏压缩 + 宿主模式别的蜂修复（2026-09-12，本轮最新）

### Completed / Changed
用户反馈「节奏可以更快点」。TIMELINE 阶段边界与音频 score.phases 有守卫测试锁定，不动；只压缩视觉层常量：

- `config.js`：DECOMPOSE 1.6/8（原 2.5/10）；CAMERA holdUntil 13、zoomOutUntil 27（原 17/34）；SWARM_VIEW 15/3/2.4（原 20/4/3）；RIPPLE.firstAt 10.5（原 12.5，对齐新成形时间）。
- `hive.js`：FLY 19 出发/飞 8s/错落 4s（原 23/10/5）；REVEAL 25 起 9s（原 31/11）；BLEND 20 起 13s（原 24/16）。
- `bee.js`：文件头时间注释同步（`_growthAt` 上轮已改读 config，无硬编码）。
- **`web/interaction/app.js:178`（交互侧文件，仅改演示常量一行）**：演示数据 `appearAt` 20+4k → 15+3k。bee.js 对 `entry.appearAt` 优先于 SWARM_VIEW 默认值，不改这里演示仍按旧节奏。改动原因已记 DECISIONS。
- **修复存量 bug**：宿主模式下 `payload.bees` 从未传进 BeeModule（`onHostLoad` 只把 `payload.output` 当 params，bees 在 payload 顶层被丢弃）→ 演示里「别的蜂」从未出现，巢房字池也只有主句。现 `main.js::onHostLoad` 把 `payload.bees` 合并进 BeeModule 参数。修复后 17s 起可见别的蜂，巢房字池含全部三条演示语句。
- 测试同步：`test_bee.js`（整句断言 t=2→1.2；中途采样 t=6→3.5；别的蜂 19/21/30→14/16/19）、`test_hive.js`（progress 断言 23/24/40/32→19/20/33/26.5）、`test_waveform.js`（提示文案）。

### Current State
全量 8 套测试全过（bee 56 / hive 23 / ripple 25 / waveform 20 / body-texture 12 / headless 50 / integration 31 / reading 41）。无头 Chrome 实测 4/12/17/26/34s 截图 + 像素级验证（别的蜂区域亮像素 8→1108→196）见 `deliverables/节奏压缩-20260912/`，零异常。并发方「AI 的理解过程」（reading.js）已接线且与本轮共存：图层 waveform → hive → ripple → reading → bee。

### Known Issues
- 并发编辑仍在进行：本轮改 config.js/bee.js/hive.js/main.js 期间多次遇到「读取状态失效」，全部重读后落笔；最终比对确认双方改动（我的节奏+bees 修复、并发方的 reading）都在。
- `08-视觉原型/README.md` 的涟漪章节仍写 firstAt=12.5s（实际 10.5s）、test_ripple 写 23 项（实际 25 项）——并发方的文档，已留待其自己更新或下轮顺手改。
- READING 时间窗（2.5–11.6s）与旧 DECOMPOSE 同时期设计；新节奏下 1.6s 就开始拆解，读解带 2.5s 才出现——视觉上不冲突（读解带在画面上部），但若觉得「拆解先于理解展示」观感奇怪，可把 READING 窗前移。

### Next Step / Important Context
- 想再快/再慢：只改 config.js 的 DECOMPOSE/CAMERA/SWARM_VIEW/RIPPLE 与 hive.js 顶部常量；TIMELINE 不能动（音频契约）。
- 阶段名文案（main.js `phaseNames`）已与新节奏对齐，无需改。
- 演示服务器（用户进程，端口 8765）一直在跑当前代码，刷新即见新节奏。

### Commands
`node 08-视觉原型/test_bee.js` 等 8 套（见上）；截图脚本 `deliverables/节奏压缩-20260912/nesting-pace-final.mjs`（无头 Chrome 9223 + 服务器 8765）。

---

## AI 的理解过程（2026-09-12）

### Completed / Changed
用户要求「加一个新模块，把 AI 如何听懂我们说话声音这件事做出来，有点人机交互的感觉」，并选定「可视化理解过程」+「画布上的视觉层」（非 UI 面板）。

新增 `web/visual/js/reading.js`（`ReadingModule`）+ `config.READING`。2.5–11.6 秒在画面**上部**依次展开四层，13.2 秒后淡出：

1. **语气**（2.5–5.2s）：10 个语气词横排，扫描针逐个扫过后停在 AI 选中的那个，下方跟强度 / 节奏刻度条，再下一行小字写「凭什么」这么判断（解码层给的证据）。
2. **含义**（5.2–7.6s）：一句话概括 + 力的方向箭头（向内收 / 向外放 / 平）+ 分量条 + 关键词。
3. **分段**（7.6–10.0s）：原句逐段 + **部位几何标记**（圆=头、波=翅、方=胸、条=腹、三角=尾针）+ 分量条。观众靠这一层看懂后面蜂为什么长成那样。
4. **不确定**（10.0–11.6s）：这次解码**不能**确定什么。

画的是**过程不是结论**，且每一个字都来自 `beeSpec.decode`（解码层真实判断），不是装饰文案。

### Changed
- `web/interaction/voice.mjs::beeSpecFrom()` 原先丢弃模型的原始判断，现改为在返回值上附带 `decode`（未接入模型时为 `null`）。`voice.test.mjs` 14 项仍全过（断言是字段级的）。
- `index.html` 加载 `reading.js`；`main.js::initModules` 创建模块；`timeline.draw` 图层顺序改为 `waveform → hive → ripple → reading → bee`（读解带占 y≈208–430，与蜂不重叠）。
- 新增 `08-视觉原型/test_reading.js` 41 项。

### Current State
四层按固定时间窗依次展开，未接入模型时只写「未解码 / 语气与含义未接入模型，没有判断可显示」，一个语气词、一句含义都不画。无状态（暂停冻结、倒退收回、重播清空），与涟漪同一套约定。

### Known Issues
- `reading.js` 的 `TONE_LABELS` 必须与 `10-语言解码/derive_bee.py` 的 `TONE_LABELS` **逐字一致**，否则扫描针会停在画面上没有的词上。改一处须同步另一处。
- 理解过程目前是纯视觉，未与声音联动；若要让「扫描针扫过」配一声 tick，需另开一轮并协同声音模块。
- 读解带的字号/行距按 1080×1920 竖屏调的；若最终展示比例变化（见 TODO 里的画面改造 P0），`config.READING` 的 `bandTop`/`rowGap`/字号需重调。
- 并发编辑风险仍在：本轮只做「独立模块 + 三处单行插入」，未整块替换任何共享文件。

### Next Step / Important Context
- 调读解带：改 `config.READING`（`toneFrom`…`doubtTo` 时间窗、`scanSeconds` 扫描快慢、`bandTop`/`rowGap` 位置、三组字号）。
- 想改候选语气词：改 `reading.js` 顶部 `TONE_LABELS`，**同时同步** `derive_bee.py`。
- 未确认的后续候选（已记 TODO）：越传越失真 / 蜂群传染 / 每字一圈小波。

### Commands
`node 08-视觉原型/test_reading.js`（41 项）；`node 08-视觉原型/test_bee.js`（56 项）；`node 08-视觉原型/test_ripple.js`（25 项）；`node 08-视觉原型/test_hive.js`（23 项）；`node 08-视觉原型/test_waveform.js`（20 项）；`node 08-视觉原型/test_headless.js`（50 项）。运行：`python3 web/interaction/server.py --port 8765`。

---

## 语言传播涟漪（2026-09-11）

### Completed / Changed
用户认可会徽风笔画轮廓后，要求「深耕算法模块」；并明确创作立场：**不是想给别人一种理念，而是希望大家能够从这个角度意识到语言的重要性**。据此提出四个候选方向，用户选「涟漪扩散」+「先做视觉可见的」。

新增**语言传播涟漪**：一句话说出口 → 从蜂体向外推出同心波纹 → 扩散到画面边缘消失。说出口的话离开身体，再也收不回来。

- 新增 `web/visual/js/ripple.js`（`RippleModule`，独立模块）+ `config.RIPPLE` 参数。
- 派生可追溯到语义：波速 = `baseSpeed + speedRange × (wingbeatHz − 1.6) / 1.8`（wingbeatHz 由语气强度派生 → **说得越激动传得越快**，实测 165 → 300 px/s）；波强度 = `0.45 + 0.55 × tension`（→ **分量越重波越粗越久**，0.51 → 0.95）；波色沿用该句 hue。
- 波面由沿切线的短笔画（线段/点/弧）组成，呼应会徽风笔画轮廓；越远越淡越细越稀疏，像语言散开了。
- **无状态**：半径只由「当前时间 − 发出时刻」算出 → 暂停冻结、倒退收回、重播清空，永远跟着宿主时间。
- 图层：`waveform → hive → ripple → bee`，涟漪在蜂之下，波心被蜂挡住，只见向外推的环。
- 新增 `08-视觉原型/test_ripple.js` 23 项。全量 362 项通过（Node 275 + Python 87），无回归。

### Current State
蜂体成形（12.5s）起每隔 2.4s 推出一圈，共 4 圈，扩散到 1180px（画面边缘之外）消失。波速与粗细随语气/分量变化；同一句话在同一时刻永远得到同一组波。

### Known Issues
- **并发覆盖风险（本轮实际遇到一次）**：本轮改 `main.js` 加 `RippleModule` 后，一度 grep 不到，怀疑被并发方「蜂巢改造」轮覆盖；复查确认仍在（是 bash 默认 BRE 把 `|` 当字面量导致的误报）。**本项目验证代码是否还在，一律用 `grep -E`，不要用 `grep "a|b"`。**
- 上一轮会徽风笔画改动（`STROKES`/`CHAR_STROKE`/`_strokeFor`/`_drawStroke`）已复查完好，未被并发方的 `hive.js` 改动覆盖。
- 涟漪目前只在视觉层，声音未联动（用户选「先做视觉可见的」）。若要让波与 `bee-voice.mjs` / 声纹同步，需另开一轮。
- 波心固定在蜂的稳定位置（`config.RIPPLE.originYRatio`），不随蜂的微小飘动漂移——这是刻意的（说出口的话不跟着说话的人），不是缺陷。
- 真实模型、ASR、现场设备情况沿用既有记录。

### Next Step / Important Context
- 想调波的感觉直接改 `config.RIPPLE`：`firstAt`/`gap`/`count`（节奏）、`baseSpeed`/`speedRange`（传多快）、`maxRadius`（传多远消失）、`strokeGap`/`strokeLen`（波面疏密）。
- 后续候选（用户未确认，已记 TODO）：越传越失真 / 蜂群传染 / 每字一圈小波。
- 演示：`演示.command` 或 `python3 web/interaction/server.py --port 8765`；涟漪在 12.5s 之后可见，注意看蜂体周围向外推的环。

### Commands
`node 08-视觉原型/test_ripple.js`（23 项）；`node 08-视觉原型/test_bee.js`（56 项）；`node 08-视觉原型/test_hive.js`（23 项）；`node 08-视觉原型/test_waveform.js`（20 项）；`node 08-视觉原型/test_headless.js`（50 项）。运行：`python3 web/interaction/server.py --port 8765`。无 build/lint 配置。

---

## 蜂巢改造（2026-09-11；取代人体贴图）

### Completed / Changed
用户要求「演示 demo 后面的组成人体改为组成蜂巢、更艺术」，并在候选方向中选定「巢由语言筑成」。改动只限 `web/visual/` 与 `08-视觉原型/`：
- 新增 `js/hive.js`（HiveModule）：程序化水滴形六边形巢脾（平顶六边形按列排布，sin 轮廓收放，从巢心向外排序，全部确定性、无外部素材）。23–38 秒蜂影（主蜂同源印记，72 个）从黄金角环形落进巢房；落定后巢房六边形短描边点亮（会徽风缺口边），房内填入一个来自现场语句的字——主蜂原句在前、其他蜂的句子随后循环取用；31–42 秒整面巢脾淡影渐显。节奏与旧人体贴图一致（progress 24→40s）。
- `bee.js` 两处插值改接 hive：主蜂向 `hive.heart`（巢心）、别的蜂向 `hive.target`（巢房）；就绪判断由 `.image` 改为 `.ready`。
- `timeline.js` 绘制顺序 waveform → hive → bee；`main.js` 移除贴图异步加载；`index.html` 脚本标签换为 hive.js。
- 人体贴图降为脚手架：`body-texture.js` + `assets/human-front.svg` + ATTRIBUTION.md 保留但入口不再加载（加入一天后退役，同人形待遇）。
- 测试：新增 `08-视觉原型/test_hive.js` 23 项（梨形布局、确定性、巢位、房内字可追溯、暂停/回退/重播、绘制顺序、无蜂绘制）；`test_body_texture.js` 保持 12 项（绘制顺序断言移交 hive 测试）。

### Current State
蜂 56 + 蜂巢 23 + 人体贴图 12 + 声纹 20 + 无头 50 + 交互/服务器/声音各套件全过（计数勿写死，以 VERIFICATION_STATUS 复算为准）。无头 Chrome 实测演示句「急促」：26s 蜂影飞入、35s 巢心点亮、44s 巢脾成形，零异常；截图在 `deliverables/蜂巢改造-20260911/`。演示流程注意：点演示句后还需点「开始这段体验」才启动（交互层现有两步）。

### Known Issues
- 8765 端口有用户服务器进程在跑（PID 14216，运行当前代码，勿动）；重启预览前先查端口占用。
- 内置浏览器页面 hidden 时宿主时钟冻结（rAF 不走），实测请用可见浏览器或 headless CDP（脚本 `deliverables/蜂巢改造-20260911/nesting-hive-shot.mjs`，需先以 9223 端口起无头 Chrome）。
- 巢脾轮廓为梨形几何，最终视觉语言仍待 Scott 确认；房内字大小/密度可按观感在 hive.js 顶部常量调。
- 真实模型、ASR、现场设备情况沿用既有记录。

### Next Step / Important Context
- 用户如对巢形有偏好（更尖的垂巢、更密的巢房、房内字更显/更隐），改 `hive.js` 顶部 RECT/HEX_R/时间常量即可，不影响其他模块。
- 本轮未动 `web/interaction/`、`web/audio/`；并发编辑警告条仍有效，动这三处前先确认。

### Commands
`node 08-视觉原型/test_hive.js`（23 项）；`node 08-视觉原型/test_body_texture.js`（12 项）；`node 08-视觉原型/test_bee.js`（56 项）；`node 08-视觉原型/test_waveform.js`（20 项）；`node 08-视觉原型/test_headless.js`（50 项）。运行：`python3 web/interaction/server.py --port 8765`。

---

## 轮廓换装（2026-09-11；与并发方「笔画化」计划合并落地）

### Completed / Changed
用户给的参考图（极简人形剪影图章式）要求把 demo 的蜜蜂风格换成会徽风。本轮独立完成「偏旁轮廓 → 会徽风短笔画」改造，并发现并发方已经在 `web/visual/js/bee.js` 注释与文档中预告同方向改动但尚未落地实现——本轮直接落地版本作为合并结果。

具体改动（仅 `web/visual/js/bee.js` + `08-视觉原型/test_bee.js`）：
- 删除 `RADICALS` / `CHAR_RADICAL` / `_radicalFor` / `this.radicals` / `state.radicals`。
- 新增 `STROKES` / `CHAR_STROKE` / `STROKE_CODES` / `_strokeFor` / `this.strokes` / `state.strokes` / `_drawStroke`。
- 笔画代号：h 横 / s 竖 / p 撇 / d 点 / t 提 / j 竖钩 / g 横折 / c 弧（8 种 / 5 种 `kind`）。
- 字符 → 笔画：内置表覆盖演示句与常用字；表外字按字符码确定性回退，仍非字形拆解。
- 轮廓绘制从 `fillText(radical.glyph)` 改为 `stroke` / `fill` 路径调用，方向沿轮廓切线，整体疏朗如会徽/图章。
- `test_bee.js` 的 `recordingCtx` 拆成 `texts[]` + `marks[]`，新增 7 项笔画断言（笔画代号非空、5 种 kind 全覆盖、多句不抛错）；49 → 56 项。

### Current State
蜂体单元仍按原句字符顺序生成；笔画按该字符对应代号取用并循环铺满轮廓；内部仍按原句折行填字，「由文字组成」的可追溯证据保留。蜂测试 56 项全过；人体贴图（12 项）+ 蜂声音（8 项）保持通过；全量测试 293 项通过（Bee 56 + Headless 50 + Waveform 20 + BodyTexture 12 + Integration 31 + Session 17 + Voice 12 + Audio 12 + BeeVoice 8 + IntServer 9 + Python07 12 + Python09 19 + Python10 36 + PythonInt 19）。

### Known Issues
- **轮廓换装并发风险已解决**：本轮与并发方「笔画化」计划是同一方向，并发方在文档层已先声明 strokes 字段、本轮在实现层落地。后续如并发方提交不同实现版本（不同代号表、不同 kind 集合），需要再协调。
- 蜂体具体造型与「会徽/图章」参考图的契合度仍以观众最终观感为准；本轮实现优先满足「整体疏朗、短笔画、可追溯」三要素。
- 真实模型、ASR、现场设备情况沿用既有记录。

### Next Step / Important Context
- 用户如对本轮笔画选择有偏好（如想突出某种笔画、想换「点」为「圈」），可直接在 `CHAR_STROKE` 表里改，不影响其他模块。
- 「人体贴图衔接」轮仍为最新视觉层进展；轮廓换装不影响其图层顺序与人体过渡时间线。

### Commands
`node 08-视觉原型/test_bee.js`（56 项）；`node 08-视觉原型/test_body_texture.js`（12 项）；`node 08-视觉原型/test_waveform.js`（20 项）；`node 08-视觉原型/test_headless.js`（50 项）；`node --test web/audio/tests/bee-voice.test.mjs`（8 项）；`node --test web/interaction/tests/integration.test.mjs`（9 项）。运行：`python3 web/interaction/server.py --port 8765`。无 build/lint 配置。

---

## 人体贴图衔接（2026-09-11）

### Completed / Changed
用户认可现有表现，要求加入现成人体贴图并做好蜂群聚成人体的衔接。新增 body-texture.js、assets/human-front.svg 与出处文件；main/index 加载素材，timeline 在声纹后、文字蜂前绘制，bee 的位置随宿主时间向人体内部过渡。人体采用 CC0 原图，不再自行绘制。

### Current State
23–40 秒现有文字蜂的同源影像聚成人体轮廓，31–42 秒淡入 9% 透明度贴图，保留拉远、文字与声纹。影像副本不代表新的语言输入、不重复触发声音。浏览器已看到完整衔接，素材无报错。

### Known Issues
并发任务正在把蜂形从偏旁改成笔画；本轮已给贴图影像传入 strokes 兼容字段，不覆盖其实现。最终蜂形测试需等对方同步完成后复测。真实模型、ASR 与现场设备情况沿用既有记录。

### Next Step / Important Context
先运行下列针对性测试，再用 ?demo=1 点演示句，看 24–42 秒与暂停/重播。人体过渡使用同一宿主时钟，旧椭圆人体不启用。保留并发者在 bee/config/app 中的改动。

### Commands
`node 08-视觉原型/test_body_texture.js`（12 项）；`node 08-视觉原型/test_bee.js`；`node 08-视觉原型/test_waveform.js`；`node --test web/interaction/tests/integration.test.mjs`。运行：`python3 web/interaction/server.py --port 8765`。无 build/lint 配置。


更新：2026-09-11 19:32（最新为造型简化轮，另有并发进行中的「蜂声音」模块；全量 **263** 项测试通过，计入跨模块协议 31 项则为 294。**计数会变、且存在并发编辑，勿写死**——以 `docs/VERIFICATION_STATUS.md` 的复算命令为准。本轮同步了三处过期计数并补齐了 HANDOFF 缺失的两轮记录）。

> ⚠️ **本轮检测到并发编辑**：19:28–19:32 期间 `web/visual/js/{config,timeline,bee}.js`、`web/interaction/{config,app}.js` 被改动，并新增 `web/audio/bee-voice.mjs` + 8 项测试，同时产出 `deliverables/演示诊断-20260911/*.png`。改动方身份未确认。**在确认对方是谁、负责哪块之前，不要动 `web/visual/js/`、`web/audio/`、`web/interaction/` 下的代码**，只做文档同步，否则容易互相覆盖。

## MVP 状态（当前优先读取）

### Completed

- **2026-09-11 造型简化轮（最新一轮，用户反馈「波形放背景 / 偏旁组轮廓 / 内填原句」）**：
  - 声纹由一条带改为**铺满整幅画面**（24 条横向流动曲线，静态底噪 alpha 0.14、随响度增到 0.48），颗粒与沉积圆环同步放大。
  - 修掉一个假验证：`timeline.draw()` 里「有 bee 就 return」导致声纹从未被绘制，上一轮测到的「冷色像素」其实是蜂翅膀。已修绘制顺序并加守卫测试锁定 `waveform → bee`。
  - 蜂改为**偏旁部首轮廓 + 原句填充**：偏旁按原句字符顺序取用并循环，内部裁剪填入刚说的那句话；内置「字 → 偏旁」表覆盖演示句与常用字，表外字按字符码确定性回退（文档写明那不是真正的字形拆解）。蜂测试 23 → 37 项、声纹 14 → 17 项。
- **2026-09-11 视觉改造轮（用户反馈「蜜蜂太丑 / 节奏太慢 / 停顿无聊」）**：
  - 造型：腹部改为一个字符一节的明暗腹节带，新增胸节绒毛、复眼与高光、两对翅（含翅脉）、三对足、尾针、柔光。`spec.spacing` 改为拉伸腹部长度。
  - 节奏：整句停留 5 → 2.5 秒，拆字飞入 5–20 → 2.5–10 秒，蜂体约 15 秒成形（原来 20 秒才开始成形）。
  - 声纹：新增 `web/visual/js/waveform.js`，由 `09-声音设计/build_score.py` 推导的真实 score 驱动，**不重复实现声音公式**；服务端新增 `GET /api/score?id=`，交互层随 load 下发 `payload.score`。
- **2026-09-11 模型接入轮**：
  - `10-语言解码/`：模型只输出语义（语气/含义/分段部位），蜂体参数由 `derive_bee.py` 确定性派生并输出逐项 trace；`映射表.md` 由 `--md` 生成并有防漂移守卫。36 项测试通过（含 6 项 live 传输）。
  - `POST /api/decode`：配置了 `NESTING_API_KEY` 就走 DeepSeek（`deepseek-flash`，OpenAI 兼容，复用 07 加固传输：子进程隔离、8 秒总超时、禁重定向、失败重试一次）；没配置就走 `derive_undecoded()`，只拆文字结构、蜂体取中性值、界面标注「未解码」。密钥只存在服务端进程内。
  - `web/interaction/voice.mjs`：麦克风采集与隐私生命周期，停止录音立刻归还音轨、退出释放回放地址；交互页新增「说一句话」入口。12 项测试。
  - 视觉拆解阶段：0–5 秒整句停留 → 5–20 秒逐字飞入 → 蜂体成形；`beeSpec` 驱动翅膀频率、体节张力、间距、色相、姿态与大小。蜂测试 7 → 22 项。
  - 修复 `main.js` 中「未加载 bee.js 就回退旧脚手架」的死分支（该分支必然抛错）；交互集成测试拆成真实入口协议与脚手架模块直连两部分。
  - 无头 Chrome 实测：录音（假麦克风）→ 停止 → 回放地址就绪 → 解码 → 画面亮像素 4620 → 42548 → 退出后转写与回放地址全部清空，零异常。
  - 可追溯证据：映射表由 `derive_bee.py --md` 生成并有防漂移守卫（实测改公式即失败）；界面新增证据面板，解码后逐行显示「来源 → 结果 · 规则」，退出清空。
- `web/visual/` 新增 `BeeModule`：sourceText 按字符顺序生成蜂体单元、翅膀、头部与触角，并保留来源文字索引。
- `web/visual/index.html` 主入口已停用人形、双群粒子、交织沉积，实际只显示单蜂；旧模块仍作回退脚手架。
- `web/interaction` 将预设文字合并为 `sourceText` 传入视觉，沿用 60 秒宿主时钟、暂停、重播、退出与 iframe 协议。
- 新增 `08-视觉原型/test_bee.js`，7 项通过；全量回归 128 项、跨模块集成 8/8 通过。无头 Chrome 已观看完整 60 秒：种子出现、蜂体生长、结构线收束并留存。

### Current State

**视觉（2026-09-11，两轮用户反馈）**：节奏压缩为 整句 2.5s → 拆解至 10s → 约 15s 成形（原 5s/20s）。声纹改为**铺满整幅画面**的流动背景（24 条横向曲线 + 颗粒 + 沉积圆环），由 `09-声音设计/build_score.py` 的真实 score 驱动、静音也显示。蜂改为**偏旁部首轮廓 + 原句填充**：轮廓由偏旁沿蜂形排布组成（偏旁按原句字符顺序取用并循环），内部裁剪填入刚说的那句话；上色/翅频/腹部长短/姿态仍由 beeSpec 驱动。`timeline.draw` 曾经「有 bee 就 return」导致声纹从未被绘制，已修并加守卫测试。
**群蜂与蜂声（2026-09-11，用户描述下一段结构）**：视野在 17–34 秒由 1 拉到 0.44，画面里依次出现其他语言的蜂（每只蜂有自己的原句、偏旁轮廓、语气色相与出现时间，按黄金角确定性布点）；每只蜂出生时发一声：语气和缓 → 协和音程 + 慢起音，语气尖锐 → 不协和音程 + 硬起音 + 噪声（`web/audio/bee-voice.mjs`，音高由该只蜂的色相决定）。语气映射是艺术选择，不评价说话人。实测蜂的成像高度 307 → 147、两只别的蜂出现时共新建 12 个振荡器。

**演示已就绪（2026-09-11 演示轮）**：双击 `演示.command` → `?demo=1` → 点演示句（压抑 / 平稳 / 急促）→ 完整走「整句 → 拆字 → 飞入成蜂」，离线、无需密钥与麦克风。素材是人工占位，画面与状态栏都标注「未调用模型」。演示脚本见 `docs/DEMO.md`。

**验证状态总表见 `docs/VERIFICATION_STATUS.md`**（已实测 / 未验证分列，含复现命令）。写交接或对 Scott 说明时以那张表为准，不要凭印象。

本机预览：`http://127.0.0.1:8765/`。三个入口：走进一个故事 / 写下两句话 / 说一句话。视觉与声音均已接入，声音默认静音。

模型状态（2026-09-11 晚更新）：**真实 DeepSeek 调用已跑通**。默认模型由 `deepseek-flash` 改为 `deepseek-chat`（前者为推理模型，实测 21.4 秒必然超时；后者 1.45 秒，同一模型非推理路径）。总等待预算 8 → 15 秒。新增按 schema 剥离多余字段，避免模型多给 `weight_note` 一类键时白耗重试。密钥仍只从 `NESTING_API_KEY` 读取，不落盘、不进日志、不回显；本机运行服务器时用环境变量前缀传入即可。

色相与姿态已改由语气标签主导（详见 DECISIONS「真实模型首次跑通」）：实测十种语气原先挤在 50–55 度、姿态八成是 open，三句话长出三只几乎一样的蜂；现在色相在暖色区间内分散、唯一冷色留给「疏离」，姿态按语气收放。对比图见 `deliverables/真实模型对比-20260911/`。

**演示入口运维注意**：8765 端口曾被一个运行旧代码的僵尸服务器进程占用，导致 `演示.command` 打开的页面 `GET /api/demo` 返回 404、演示句按钮整排消失，画面只剩黑底加一个小黄点。重启预览前先确认端口无占用（`lsof -nP -iTCP:8765 -sTCP:LISTEN`），被占用时先结束旧进程，否则改的代码不会生效。

已实测的两条路径：
1. 「未配置密钥 → 未解码降级」：网页实测通过（只拆文字结构、蜂体中性、画面标注未解码）。
2. 「配置密钥 → live 通道」：用本地模拟的 OpenAI 兼容上游跑真实传输子进程，五种情形全部符合预期——合规返回（attempts=1、0.18 秒、派生与 trace 完整）、坏 JSON 后重试（attempts=2）、上游 500（判失败且不回显响应体与密钥）、上游拖延 12 秒（8.3 秒内被总超时切断）、无密钥（发请求前就拒绝）。网页端到端也跑通：模型解码出的「语气：压抑 · 方向：inward」确实画在蜂体下方，逐字单元与来源原句同时在画布上。

3. 独立视觉原型（Scott 会直接打开的那个页面）：浏览器实测拆解三阶段（整句 → 逐字飞入 → 蜂体）、暂停冻结、如实标注「未解码」，零 HTTP 报错（顺带补齐 favicon，消除 404）。

仍未验证的是**真实服务本身**：DeepSeek 的实际返回结构、延迟分布、10 个语气标签词表的越界率。

转写（ASR）仍未落地：DeepSeek 没有 audio 接口，`/api/decode` 收到的是文本，录音只在本机回放。

### Known Issues

- 蜂的结构映射（字 → 单元格；语气/含义 → 翅膀/体节/间距/色相/姿态）已由确定性公式与 trace 固化，但**未在真实语音与真实模型输出上验证过**；换一段真实录音可能暴露提示词或词表问题。
- **真实 DeepSeek 调用未验证**：无密钥。传输通道本身已被 6 项常驻测试覆盖（`10-语言解码/test_decode.py::LiveTransportChecks`，用本地模拟上游跑真实子进程）：合规返回、坏 JSON 重试、**语气词越界拦截**、上游 500、密钥不外泄。真实服务的返回结构、延迟分布与真实越界率仍是未知数——越界即判失败并重试，最多两次。
- **ASR 缺失是主线上的空洞**：录音与转写目前是断开的——观众说完话仍要自己把话写进输入框。展厅里这一步会显著影响体验。
- 最终视觉语言、完整筑巢关系、现场设备与赛事要求未验证。
- Git 根仍在桌面父目录，禁止 `git add -A`；独立仓库边界需用户决定。

### Next Step

1. 用户提供 `NESTING_API_KEY` 后跑一次真实解码（`python3 10-语言解码/derive_bee.py live --transcript ...`），记录耗时、重试次数、返回是否合规，并核对与人工占位结果的差异。
2. 决定 ASR 路线（本地 whisper / 云 ASR / 浏览器语音识别），把录音与转写接起来——这是主线上目前最大的缺口。
3. 用一段真实录音走完整链路，验证提示词词表与派生公式在真实语言上是否站得住；必要时调整映射数值并同步映射表。
4. 与 Scott 确认单蜂的最终视觉语言、声音与「巢」的关系，再谈现场验收。

### Important Context

不要把旧 `energy/dispersion/turbulence/trace` 参数或离线预设当成最终作品机制；它们仅用于兼容脚手架。每只蜂必须能追溯到刚刚发生的一段语言。修改视觉入口时保留 `sourceText`、宿主时钟与 reset 生命周期。

### Commands

```sh
python3 web/interaction/server.py --port 8765
node 08-视觉原型/test_bee.js
node 08-视觉原型/test_headless.js
```

旧交接记录如下，保留用于追溯此前联调与契约修复。

## Completed
- 概念、分镜、蜂群规则、AI 提示词、输出 schema、人工示例与 Python 离线校验（12 项测试通过）。
- 交互模块完成：三个离线故事、文字检查、60 秒分镜、暂停/重播、退出清空和可选全屏。39 项自动测试通过，桌面/手机浏览器操作验证完成。
- 视觉模块（web/visual/ + 08-视觉原型/）：HTML5 Canvas 单蜂 MVP，60 秒六阶段闭环；旧蜂群脚手架回归测试 50 项通过，支持独立运行与 iframe 宿主协议。
- 声音模块：
  - 09-声音设计/：score.schema.json、build_score.py、render_score.py、test_score.py（19 项通过）；示例 score 与参考 WAV 已落盘。
  - web/audio/audio.mjs：createAudio()（unlock/load/frame/setMuted/reset/dispose），宿主时钟驱动，默认静音，12 项无头测试通过。
  - docs/INTERFACES.md：统一运行环境、数据流与各 AI 文件所有权。
- **跨模块联调修复（2026-09-09）**：
  - 修复交互集成测试 3 处路径错误（目录重排后未同步）。
  - 修复视觉模块 4 个 bug：hostAdapter timeline 引用未更新、沉积粒子淡入淡出冲突、缺少 externalClock 模式（hosted 不自走时钟）、缺少 source/sessionId 安全校验。
  - 修复声音模块 3 个 bug：沉积数公式多除 2（对齐 03 规则与视觉）、frame() 不支持 playing 暂停参数、spawn 函数用场景时间调度音频（应立即调度）。
  - 重新生成 score.example-手工占位.json（25 个 deposit，对齐新公式）。
  - 更新声音设计测试与 audio 测试期望值。
- **契约缺陷修复（2026-09-11）**：
  - P1-1：`score.schema.json` 的 `events.maxItems` 由 40 提高到 54，消除「合法 output（weave=1.0/settle=1.0）导致 build_score.py 报数组长度错误」缺陷。
  - P1-2：新增 `round_half_up`（Python）/ `roundHalfUp`（JS，config.js 与 audio.mjs 各一份），统一结对数与沉积数取整语义，消除 Python 银行家舍入与 JS Math.round 在 .5 边界的分歧；同根因的 `build_score.r4`（四位小数）也改为 half-up，与 audio.mjs 的 `r4` 同解。
  - 新增回归测试：声音离线 +4、视觉无头 +8、audio +2，全部锁定上述行为。
  - 新增项目级 `.gitignore`（`__pycache__/`、`*.py[cod]`、`.DS_Store` 等）。
- **交互收尾轮（2026-09-11，本轮）**：
  - `web/interaction/config.js` 的 `audioModuleUrl` 由 `null` 改为 `'/web/audio/audio.mjs'`，三方联调（交互 + 视觉 + 声音同时运行）跑通。
  - 无头 Chrome + CDP 实测 15 项断言全过：声音按钮随模块接入出现；点击后 AudioContext 创建且 `running`；播放中持续调度振荡器、主增益 > 0；暂停立即静音（主增益归 0）且画面时间冻结；继续后接续；退出后静音、按钮复位、回到 00:00；无 404/未捕获异常/console.error。
  - 顺带修正过期计数：本文件 Completed 段的「18 项」「11 项」与 PROJECT_CONTEXT 的「11 项」→ 19 / 12（Current State 段原已为 19/12，两段自相矛盾）。

## Changed
- 声音 AI 新增：09-声音设计/、web/audio/、docs/INTERFACES.md；INTEGRATION_CONTRACT 声音节追加实现说明；TODO/HANDOFF/PROJECT_CONTEXT/README 同步（合并他人内容）。
- 用户确认后执行：目录重排（08-动画原型→08-视觉原型、08-声音设计→09-声音设计），全部引用同步替换；声音映射与 0.8 总音量上限冻结；占位音色升级。
- 交互 AI 新增：web/interaction、启动交互预览.command、INTEGRATION_CONTRACT 与 INTERACTION_QA。
- **2026-09-09 联调修复轮**：
  - 视觉模块：main.js（hostAdapter timeline 引用同步 + externalClock 模式）、swarm.js（沉积粒子淡出修复）、timeline.js（externalClock + sync()）、host-adapter.js（source/sessionId 安全校验 + frame 后 sync）。
  - 声音模块：build_score.py（沉积公式去掉 //2，对齐 03 规则）、audio.mjs（frame 支持 playing 暂停 + spawn 函数立即调度）、score.example-手工占位.json（重新生成，25 deposit）、test_score.py（公式期望值更新）、audio.test.mjs（deposit 测试时间点更新）。
  - 交互模块：integration.test.mjs（3 处路径错误修复）。
- 无 04-AI转译/ 或 07-技术验证/ 业务代码改动。
- **2026-09-11 契约修复轮**：
  - 声音设计：score.schema.json（`events.maxItems` 40→54）、build_score.py（新增 `round_half_up`，结对数/沉积数改用它；同根因的 `r4` 也改为 half-up）、test_score.py（+5 项：half-up 语义、.5 边界、`r4` 跨语言一致、满参数过 schema、相位表一致性守卫）。
  - 视觉：web/visual/js/config.js（新增并导出 `roundHalfUp`，`trailPointsFor` 改用它）、web/visual/js/weave.js（结对数/沉积数改用 `config.roundHalfUp`）；`08-视觉原型/js/` 同名副本当时已同步，本轮清理轮随重复副本一并删除。
  - 声音运行时：web/audio/audio.mjs（新增本地 `roundHalfUp`，buildLayers 改用它）、tests/audio.test.mjs（+3 项）。
  - 视觉测试：08-视觉原型/test_headless.js 新增「测试 7：跨语言取整一致性」+8 项断言，并把期望值计算改用 `config.roundHalfUp`。
  - 新增项目级 `.gitignore`。
  - docs：新增 DECISIONS 一条；TODO 追加本轮发现；HANDOFF 修正测试计数口径（原「122 项」重复计入了已含在 39 项内的交互服务器 10 项）。
  - 未改动 04-AI转译/ 与 07-技术验证/ 的任何业务代码。
- **2026-09-11 清理轮（用户确认后）**：
  - 删除 `08-动画原型/`（残留目录，仅含重复的 test_integration.js）。
  - 删除 `08-视觉原型/{js,css,index.html,params}` 重复副本（与 `web/visual/` 逐字节相同、全项目零引用、两个测试都从 `../web/visual` 加载）。该目录现仅含 `README.md`、`test_headless.js`、`test_integration.js`。
  - 死代码清理：删除 `web/audio/audio.mjs` 中未被引用的 `PHASES` 常量（改为注释：相位边界由各层 start/end 表达并被跨端测试覆盖）、删除 `web/visual/js/swarm.js` 中被同名变量遮蔽的 `groupEntered`。
  - 相位表守卫：`test_score.py::test_phase_table_consistent_across_modules` 逐项比对 `build_score.PHASES` 与 `session.mjs`、`config.js` 的边界（当前 6/6/6 一致）；audio 新增 `cue 事件时刻与 score.phases 边界一致`，锁定 `audio.mjs` 内硬编码的 0/8/20/32/47/57。
  - 删除前备份：`/tmp/nesting-cleanup-backup-20260911`（14 个文件）。删除后全量 128 项测试仍全过。
  - **判断更正**：`swarm.getActiveCount()` 实为 `08-视觉原型/test_headless.js` 所调用，非死代码；`config.lerp()` 无调用方但属共享 config 的工具 API（与 `clamp`/`mixHSL`/`smoothstep` 同级），保留。此前 HANDOFF/TODO 的相关描述已修正。

## Current State
- 声音设计已双端落地：离线（Python 推导 score + 参考 WAV）与在线（WebAudio 运行时，frame 驱动）。音画同步唯一时间事实为 score.phases（与 02 分镜、视觉 TIMELINE 一致）：0–8 静置 / 8–20 第一组 / 20–32 第二组 / 32–47 交织 / 47–57 沉积 / 57–60 存留；deposit-XX 事件逐条对应沉积节拍。
- 声音映射（已经用户确认冻结，2026-09-09 修正沉积公式）：纹理密度 = 2+14×energy 粒/秒；脉冲速率 = 0.5+1.5×weave；沉积次数 = round(round(48×weave) × settle)（对齐 03 规则与视觉模块，demo 参数下为 25）；master_gain 将持续层并发峰值归一到 0.8 上限。
- **取整约定（2026-09-11 新增）**：结对数、沉积数与四位小数舍入一律 half-up（`.5` 进位）。实现须同步：`build_score.round_half_up` / `build_score.r4`、`web/visual/js/config.js` 的 `roundHalfUp`、`web/audio/audio.mjs` 的本地 `roundHalfUp` / `r4`。禁止改回 Python 内置 `round()` 或 `round(value, 4)`（银行家舍入），否则 48×weave 恰为 .5 或小数第五位为 5 时两端数值漂移。
- 本机交互网页可运行；config.js 的 visualUrl 已设为 '/web/visual/index.html'，visual↔interaction 双向 postMessage 联调通过。**audioModuleUrl 已于 2026-09-11 设为 '/web/audio/audio.mjs'，三方联调（交互+视觉+声音）跑通**：加载、播放、暂停静音、继续、退出静音复位端到端实测通过。
- **舞台状态（2026-09-11 实测确认，非缺陷）**：视觉就绪后舞台恒显示「作品预览」，`#storyboard` 分镜只在视觉不可用时回退显示；首次进入、播放中与退出后的舞台状态一致（`.stage.connected` 保留，阶段读数为「等待开始 / 00:00」）。不要为此再加「退出后恢复分镜」的改动。
- **全量测试状态（2026-09-11）**：Python 校验 12/12、声音设计 19/19、视觉无头 50/50、交互 session 17/17、声音 audio 12/12、跨模块集成 8/8、交互服务器 10/10，合计 **128 项全过**（交互 39 项 = session 17 + 服务器 10 + Python 校验 12，勿重复相加）。另 `08-视觉原型/test_integration.js` 31 项独立通过（未计入合计）。
- 视觉单蜂仍为程序化占位；声音音色为占位升级版（失谐铺底/限带噪声颗粒/下滑脉冲/柔起泛音），最终音色归 Scott；文字与参数均为手工占位，未调用真实模型。

## Known Issues
- 编号已重排（08-视觉原型、09-声音设计）；外部如有旧路径引用需按新名更新。
- 现场五轮运行、声音真实设备验证（iOS AudioContext 策略等）、展示设备性能与模型效果未验证；无头测试与无头浏览器实测都不等于现场达标。三方联调本身已于 2026-09-11 在无头 Chrome 跑通。
- 真实 AI 接入、语义/延迟验收、赛事规则均未验证；占位结果不得冒充真实 AI。
- Git 根在桌面父目录，独立边界未整理；Scott 外部工程状态未知。**已加 `__pycache__` 等 .gitignore，但桌面仍为仓库根，禁止 `git add -A`。**
- **相位表 3 份副本、3 套命名**：`build_score.py`（calm/swarm-a/…）、`session.mjs`（opening/first/…）、`web/visual/js/config.js`（idle/enter_a/…）。INTERFACES.md 声明的「score.phases 为唯一时间事实」尚未在代码层落地。已加守卫测试（`test_score.py::test_phase_table_consistent_across_modules`），漂移会失败；但改分镜仍需同步 3 处。真正收敛为单一来源需让浏览器端从 JSON 异步读取，会改动同步加载的共享 config，须单独设计。
- `08-视觉原型/test_integration.js`（31 项）与 `web/interaction/tests/integration.test.mjs`（8 项）职责重叠，均验证同一 postMessage 协议；去重或明确分工待定。
- `config.lerp()` 目前无调用方，但属共享 config 的工具 API，刻意保留。
- `09-声音设计/renders/reference-demo.wav` 为 2.6 MB 二进制；若纳入版本控制需评估是否改由脚本生成、不入库。

## Next Step
- ~~交互负责人设置 audioModuleUrl 并三方联调~~（2026-09-11 已完成）。下一步：在真实展示设备上跑完整 60 秒与连续 5 轮，核对声音设备策略与全屏适配。
- Scott 调整最终音色与现场音量（映射与 0.8 上限已冻结）。
- 三组可辨别人工参数：每组经 build_score.py 生成 score，视觉+声音成对验收。
- 实机检查画面与声音、全屏适配、连续 5 轮稳定性，继续观众测试与录制备份。
- 整理项目独立 Git 边界（当前根为桌面父目录，勿对整桌面提交）；此项需用户决策，不由 AI 单方变更。
- 评估相位表收敛方案（浏览器端如何同步取得单一来源）与两个 integration 测试的分工。

## Important Context
- 占位资料全部人工编写；个人文本不生成视觉、不持久化。
- 用户让各 AI 各写其模块，不要覆盖他人目录；参数映射公式以 09-声音设计/build_score.py 为单一事实来源，web/audio 只做运行时适配。
- **沉积数公式（2026-09-09 修正，2026-09-11 明确取整）**：round(round(48×weave) × settle)，取整为 half-up，与 03-蜂群与融合规则.md 和视觉模块一致。旧公式 round(48×weave)/2 × settle 已废弃。
- **取整与事件上限（2026-09-11 锁定）**：取整一律 half-up（见上文「取整约定」）；`score.schema.json` 的 `events.maxItems = 54` 对应最坏情况（6 cue + 48 deposit）。改动任一处须同步 `build_score.py` / `config.js` / `weave.js` / `audio.mjs` / `score.schema.json` 五处并跑全量测试。
- 模块间通过 INTEGRATION_CONTRACT 协议通信；修改共享 docs 前重新读取，保留他人追加内容。
- 用户让模型先留空，不发起调用；离线结果不可冒充真实 AI。

## Commands
项目根执行：
```sh
# 校验与声音离线
python3 07-技术验证/nesting.py demo
(cd 07-技术验证 && python3 -m unittest -v test_nesting.py)
# 注意：web/visual/params/demo.json 在方向变更后多了 sourceText 字段，
# build_score.py 严格校验字段，直接从它推导会报「对象存在缺失或多余字段」；
# 请用 04-AI转译 的输出作为输入。
python3 09-声音设计/build_score.py --output 04-AI转译/output.example-手工占位.json --source-label "demo-手工占位" --save 09-声音设计/score.example-手工占位.json
python3 09-声音设计/build_score.py --output 04-AI转译/output.example-手工占位.json --source-label "demo-手工占位" --save web/visual/params/score.demo.json
python3 09-声音设计/render_score.py --save 09-声音设计/renders/reference-demo.wav
(cd 09-声音设计 && python3 -m unittest -v test_score.py)

# 声音运行时 / 视觉 / 交互测试
node --test web/audio/tests/audio.test.mjs
node 08-视觉原型/test_headless.js
node --test web/interaction/tests/session.test.mjs
node --test web/interaction/tests/integration.test.mjs
python3 -m unittest discover -s web/interaction/tests -p 'test_*.py' -v

# 交互预览服务器
python3 web/interaction/server.py --port 8765 --open
```
无 build / lint 配置，无需安装依赖。


## 2026-09-11 方向复核补充

（历史记录）用户反馈项目可能跑偏；当时的风险是原话退场、人形与蜂群抽象占位。随后用户确认移除人形并先验收单蜂 MVP，当前状态以文件顶部的“## MVP 状态”为准。

## 2026-09-11 用户核心方向补充

用户明确作品主线是“录音 → 自动识别语气与含义 → 文字结构生长一只蜜蜂”。单蜂 MVP 已完成第一步验证；人工文字、通用参数和点粒子仅可作为脚手架，不能代表最终机制。下一步用可追溯录音/转写样本验收映射，再决定多蜂筑巢、人体关系、完整时长与输入界面。模型接入仍暂缓。
