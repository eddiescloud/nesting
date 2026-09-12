# 重要决策

## 2026-09-12 / GitHub 仓库改为公开

Decision:
按用户要求，将 `eddiescloud/nesting` 从 private 改为 public，方便同事直接查看与复用项目。

Reason:
Private 仓库在未逐个邀请时其他人无法查看；用户明确选择先公开。

Alternatives:
逐个邀请协作者并保持 private；未采用，因为用户选择公开。

Impact:
任何人均可查看已推送的完整代码、文档、示例素材和提交历史；写入权限仍需单独授予。今后提交前必须继续检查密钥与私人观众数据。

## 2026-09-12 / 项目独立 Git 仓库与私有协作

Decision:
按用户要求将 `筑巢-Nesting` 建为独立 Git 仓库，并发布到 GitHub private 仓库；只跟踪项目内容，忽略本地密钥、缓存和 AI 工具记忆。

Reason:
让同事能在同一代码历史上协作，同时避免桌面父仓库把无关文件带入提交。

Alternatives:
继续使用桌面父仓库（边界过宽）；复制一份项目另建仓库（容易产生双真源）。均不采用。

Impact:
后续在项目目录内提交和推送；协作者需获得 private 仓库权限。任何真实观众录音与密钥都不得进入 Git 历史。

## 2026-09-12 / 演示节奏整体压缩（只动视觉常量，不动 TIMELINE 契约）

Decision:
用户反馈「节奏可以更快点」。压缩全部视觉层时间常量：`config.DECOMPOSE` 整句 2.5→1.6s、飞入 10→8s；`config.CAMERA` 近景 17→13s、拉远完成 34→27s；`config.SWARM_VIEW` 首只别的蜂 20→15s、间隔 4→3s、出现过渡 3→2.4s；`config.RIPPLE.firstAt` 12.5→10.5s（对齐新成形时间：8s 达 75%、13s 完全成形）；`hive.js` 蜂影 23→19s 出发、飞行 10→8s、巢脾淡影 31→25s 起 11→9s、向巢位过渡 24→20s 起 16→13s。交互侧 `app.js` 演示数据的 `appearAt` 从 20+4k 改为 15+3k（bee.js 对 entry.appearAt 优先于 SWARM_VIEW 默认值，不改则演示仍按旧节奏）。

Reason:
用户连续两轮反馈节奏太慢（DECOMPOSE 已是第二轮压缩）。TIMELINE 阶段边界（0–8/8–20/20–32/32–47/47–57/57–60）与音频 score.phases 有守卫测试锁定，不能动；因此只压缩阶段内部的视觉常量。

Alternatives:
压缩 TIMELINE 阶段边界本身——被否决：与声音模块的相位表契约（test_score.py::test_phase_table_consistent_across_modules）冲突，需声音侧协同才能动。

Impact:
蜂体成形从约 17s 提前到 13s；别的蜂在 15/18s 出现（原 20/24s）；巢脾一幕从 23–42s 提前到 19–34s。全量 8 套测试（bee 56 / hive 23 / ripple 25 / waveform 20 / body-texture 12 / headless 50 / integration 31 / reading 41）随新断言值更新后全过；无头 Chrome 实测 4/12/17/26/34s 截图见 deliverables/节奏压缩-20260912/。本轮顺带修复一个存量 bug：宿主模式下 `payload.bees` 未合并进 BeeModule 参数（onHostLoad 只传 output），导致演示里「别的蜂」从未出现；修复后巢房字池才真正包含其他语句的字。app.js 为交互侧文件，此处仅改演示数据常量一行，已在 HANDOFF 记录原因。

## 2026-09-11 / 演示后段由「聚成人体」改为「聚成蜂巢：巢由语言筑成」

Decision:
演示 23–42 秒的收束画面由「蜂影聚成人体轮廓 + CC0 人体贴图淡入」改为「蜂影落进程序化六边形巢房，落定后点亮巢房、房内填入来自现场语句的字」。蜂巢为水滴形悬垂巢脾，全部确定性推导，无外部素材；人体贴图模块（body-texture.js + human-front.svg）降为脚手架，入口不再加载，与人形/蜂群/交织沉积同等待遇。

Reason:
用户要求把「组成人体」改为「组成蜂巢」并希望更艺术。蜂巢本就是《筑巢》的归宿意象——人形从方向复核起就是脚手架；「巢由语言筑成」（每格巢房一个来自现场语句的字、主蜂原句从巢心开始）同时保留并强化了可追溯原则。用户从候选方向中选择了「巢由语言筑成」。

Alternatives:
极简几何巢（纯六边形渐变不填字）、语言巢加光影氛围（呼吸光晕与涟漪）、只换形状的最小替换。用户选择了填字方案，光影氛围未采纳。

Impact:
新增 web/visual/js/hive.js（HiveModule：progress/target/ready 接口与旧模块对齐）；bee.js 两处插值改接 hive（主蜂向巢心、别的蜂向巢房）；timeline.js 绘制顺序为 waveform → hive → bee；main.js 与 index.html 改接 hive.js。body-texture.js 与 assets/ 保留但不再加载；其测试保留 12 项（绘制顺序契约移到 08-视觉原型/test_hive.js，23 项）。节奏不变（23–40s 聚拢、31–42s 显现），声音层不受影响。无头 Chrome 实测 26/35/44s 截图见 deliverables/蜂巢改造-20260911/。

## 2026-09-05 / 隐去繁殖，转为交织与存留（历史决定于本日整理）

Decision:
用户明确要求蜂群融合、交织，产生新的存留物，隐去繁殖过程。

Reason:
用户反馈，沟通对象认为繁殖过程奇怪。

Alternatives:
早期方案曾有繁殖和代际遗留；最终形态为结或薄层等仍属讨论。

Impact:
叙事、动画、AI 参数不应再围绕繁殖与代际生成设计。

## 2026-09-05 / 暂缓真实模型接入

Decision:
按用户指示，接口先留空，日后再接。保留离线工具和已有预留实现。

Reason:
用户明确要求稍后再接入。

Alternatives:
立即选供应商并运行真实调用；本阶段未采用。

Impact:
以人工示例推进视觉原型；真实语义、延迟和服务验收延期。不能将离线演示计为真实 AI 完成。

## 2026-09-08 / 以项目文件保存状态与交接

Decision:
采用用户指定的 AGENTS、README、PROJECT_CONTEXT、DECISIONS、TODO、HANDOFF 作为恢复入口，保留编号设计文件。

Reason:
支持无聊天历史的新会话继续工作，避免重复实现和决策遗失。

Alternatives:
仅靠聊天或散落的编号说明恢复状态；不再作为唯一方式。

Impact:
每轮先恢复再执行，结束时更新计划和交接。Git 边界目前仍在桌面父目录，本轮不改变。

## 2026-09-08 / 动画原型技术栈：HTML5 Canvas + 原生 JS

Decision:
离线视觉动画原型采用 HTML5 Canvas + 原生 JavaScript（ES6），零依赖、零构建。运行时代码位于 `web/visual/`（供交互模块 iframe 加载），模块设计文档与无头测试位于 `08-视觉原型/`。

Reason:
项目原则是"无额外安装依赖"；Canvas 2D 对 96 粒子 + 轨迹 + 连线网格性能充足；可直接消费 `output.schema.json` 的 JSON 参数；任何现代浏览器打开 `index.html` 即可运行。交互模块通过 iframe + postMessage 协议（INTEGRATION_CONTRACT v0.1）对接，视觉模块同时支持独立运行与宿主时钟模式。Scott 若有偏好环境（TouchDesigner/Unity/p5.js 等），参数映射与时间线逻辑可迁移，模块接口保持稳定。

Alternatives:
Python + Pygame（需额外依赖）、p5.js（需 CDN 或本地库）、Processing（需 Java 运行时）。均不满足零依赖原则或不如 Canvas 直接。

Impact:
动画模块统一接口为 `constructor(params, config) / update(dt, phase, phaseProgress, totalTime) / draw(ctx) / reset()`。新增视觉模块须遵循此接口。`config.js` 为唯一共享配置文件，变更需同步所有模块。交互模块 `web/interaction/config.js` 的 `visualUrl` 需在联调时设为 `'/web/visual/index.html'`。

## 2026-09-08 / 声音与音画同步以确定性时间线（score）为统一接口

Decision:
新增 09-声音设计：声音不直接从文本生成，而是由符合 output.schema 的转译输出按 02 分镜与 03 规则的固定公式推导 score.json（phases + layers + events）；视觉与声音共用 phases 作为唯一时间事实。参考音频用 Python 标准库渲染，仅核验时间线可听。运行环境与模块职责固化在 docs/INTERFACES.md。

Reason:
视觉技术栈未定且模型接入暂缓；score 让声音先行完成且与未来任何视觉栈解耦；标准库约束下可离线测试、可复算审计。

Alternatives:
在视觉引擎内直接实现声音（与栈耦合，换栈即重写，未采用）；引入 WebAudio/第三方合成库作为规范（违反 AGENTS.md 标准库约束，未采用）。

Impact:
08 只读消费 output 参数并 import 07 校验器，不修改 04/07；音色为占位，最终音色与现场音量由 Scott 调整；视觉栈确认后按 INTERFACES.md 只读消费 score。参数映射数值为首轮起点，未经现场核验。

## 2026-09-08 / 编号重排：08-视觉原型、09-声音设计（用户确认）

Decision:
消除目录编号冲突：`08-动画原型` 更名 `08-视觉原型`，`08-声音设计` 更名 `09-声音设计`；全部引用（docs、代码注释、测试路径）已同步替换为 0 处残留。

Reason:
两个模块曾共用 08 编号，路径引用易混淆；用户确认换一套命名。

Alternatives:
仅保留其一不动（冲突仍在）；改为英文目录名（改动面更大，未采用）。

Impact:
外部若有旧引用需按新路径更新；编号文件（00–07）不变。后续新增模块从 10 起编号。

## 2026-09-08 / 音色补充：占位合成升级（公式与上限不变）

Decision:
声音合成从纯正弦升级：铺底为失谐双正弦（0.4 Hz 拍频）+ 八度泛音；纹理颗粒为限带噪声×载波（ring mod + 1.2 kHz 低通）；交织脉冲带下滑（440→约345 Hz）；沉积泛音 40 ms 柔起并轻微下坠；运行时主链加 4 kHz 低通。时间线公式、层增益与 0.8 总音量上限不变（用户已确认冻结）。

Reason:
纯正弦颗粒偏"数字感"，不像蜂群；用户同意先补充占位音色，最终音色仍归 Scott。

Alternatives:
等 Scott 定稿后再改（先保证时间线正确即可，未采用——用户要求先补充）；引入卷积混响（超出标准库与现场必要范围，未采用）。

Impact:
参考 WAV 峰值 0.595→0.482，余量更足；web/audio 与离线渲染音色对齐；09 声音测试与 web/audio 9 项测试保持通过。

## 非冻结事项

两句输入、薄层沉积、视觉引擎、Scott 分工及具体排期均为当前工作方案或待确认项，不记为已确认重大决定。

## 2026-09-11 / 以“录音解码后由文字结构生长蜜蜂”为核心机制

Decision:
按用户最新说明，作品的主因果链以“采集说话录音 → 自动识别语气与含义 → 从文字结构生长出一只蜜蜂”为准。每只蜂都必须能追溯到刚刚发生的一段语言；蜂群、筑巢和后续存留应从多只语言来源明确的蜂发展出来。

Reason:
现有“人工文字/固定参数 → 抽象粒子蜂群”可以证明模块能运行，却无法表达文字如何成为蜂。若继续围绕通用情绪参数、预设故事和粒子数量扩展，项目会偏离用户想表达的语言生成形体机制。

Alternatives:
暂不把固定的 energy、dispersion、turbulence、trace 参数链当作最终作品逻辑；它们可保留为过渡适配层。模型接入仍按用户决定暂缓，原型可用录音转写样本和确定性离线解码特征验证结构映射。

Impact:
输入层需要支持录音与转写，解码层需要区分语气、含义和文字结构，输出协议需要增加可生成单只蜜蜂的结构规格，视觉需要从点粒子转向可辨识且可追溯的蜂形生成，声音需要与语言/蜂的生成事件同步。现有时钟、重置和模块桥接可复用。每段录音是否只生成一只蜂、句子切分、具体映射和人体/巢的关系仍待确认。

## 2026-09-08 / 交互层独立实现，统一控制播放

Decision:
交互模块使用原生网页与 Python 标准库本地服务，代码放在 web/interaction。复用既有 Python 校验器；视觉以同源 iframe 接收绝对时间，声音以可选 ES module 接入。两项入口默认留空。

Reason:
用户已让多个 AI 分工并要求先完成本模块。其他模块仍在开发；明确归属和单一播放时钟可避免覆盖代码、重复计时及退出后继续运行。

Alternatives:
立即统一到某个图形框架，或把所有模块写入一个脚本。当前没有对方代码依据，不采用；对方已有接口时可写适配层，不推翻其实现。

Impact:
新增本机交互预览、分镜占位与 INTEGRATION_CONTRACT。图形引擎不受此决定限制。协议是本轮交互侧约定，对方成品尚未联调；不得宣布最终整合完成。

## 2026-09-11 / 取整语义统一为 half-up，score 事件上限对齐最坏情况

Decision:
1. 结对数与沉积数的取整统一为 half-up（`.5` 一律进位），落地为三处等价实现：`build_score.round_half_up`、`web/visual/js/config.js` 的 `roundHalfUp`（导出）、`web/audio/audio.mjs` 的本地 `roundHalfUp`。禁止使用 Python 内置 `round()`。
2. 四位小数舍入 `build_score.r4` 同样改为 half-up（`floor(x*1e4+0.5)/1e4`），与 `audio.mjs` 的 `Math.round(x*1e4)/1e4` 完全同解。原实现用 `round(value, 4)`，行内注释却称「与 audio.mjs 一致」，实际不一致。
3. `09-声音设计/score.schema.json` 的 `events.maxItems` 由 40 提高到 54，即最坏情况 6 个 cue + 48 个 deposit。

Reason:
1. Python 内置 `round` 是银行家舍入（round-half-to-even），JS `Math.round` 是四舍五入。当 48×weave 恰为 .5（例如 weave=0.46875 → 22.5）时两端结对数相差 1，而 deposit 事件逐条对应视觉沉积粒子，会造成音画沉积节拍失配。实测 8 个 weave 取值（0.09375 / 0.21875 / … / 0.96875）会触发。
2. 同一根因存在于四位小数舍入：`round(value, 4)` 与 `Math.round(x*1e4)/1e4` 在第五位恰为 5 时结果不同，会让 grain_rate / 事件时刻等字段跨端漂移。原注释声称二者一致，属错误陈述。
3. 原上限 40 低于输出参数域的实际上界。`weave=1.0, settle=1.0` 是 `output.schema.json` 允许的合法输入，会生成 54 条事件，导致 `build_score.py` 直接失败「未完成：数组长度错误」（实测二分工位：settle=1.0 时 weave ≥ 0.71875 即触发）。即文档声明的 0–1 参数域并未被声音管线完整支持。

Alternatives:
- 让 Python 端改用 `decimal` 或把 weave 量化到离散档位：改动面更大，且会改变已冻结的参数映射语义，未采用。
- 压低 `events` 上限之外的选择——在生成阶段截断 deposit 数量：会让声音与视觉的沉积数刻意不一致，违背「deposit 逐条对应沉积粒子」的约定，未采用。
- 统一到银行家舍入（改 JS 端）：JS 无内置银行家舍入，需手写实现且不符合直觉，未采用。

Impact:
- 派生计数的取整在所有参数取值下跨端一致；`weave/settle` 可取全域 0–1。
- 参数映射数值本身未变（demo 参数下仍为 38 结对 / 25 沉积），本次只改取整语义与数组上限。改 `r4` 后 demo score 与已落盘示例逐字段一致，已复核。
- 新增回归测试：声音离线 +4、视觉无头 +8、audio +2，锁定 half-up 语义、.5 边界、`r4` 跨语言一致与满参数过 schema。
- 维护约束：取整实现今后须三处同步（Python / visual config.js / audio.mjs），事件上限变更须与 `build_score.py` 的最坏情况一并核算。已在 HANDOFF「Important Context」记录。
- 参考 WAV 与 `score.example-手工占位.json` 无需重新生成（demo 参数不受影响），已复核。

## 2026-09-11 / 参赛 MVP 先验收单只文字结构蜂

Decision:
视觉参赛 MVP 暂停使用人形、双群粒子、交织与沉积作为主入口，改为先运行一段 sourceText 生成一只可辨识且可追溯的蜜蜂。旧模块保留作回退脚手架；录音、语气/含义解码与多蜂筑巢留到单蜂链路成立后再接入。

Reason:
用户明确作品的核心因果链是“录音 → 自动识别语气与含义 → 文字结构生长为一只蜜蜂”。原先的人形与抽象粒子把注意力带向通用情绪动画，无法证明刚刚说出的文字如何成为蜂的结构。先做单蜂可以用最小画面验证作品主机制，并复用已经稳定的时钟、重置和 iframe 桥接。

Alternatives:
继续扩展人形内部变化和双群筑巢；或先接真实模型再做视觉。前者会继续放大表达偏移，后者受用户暂缓模型接入的决定阻塞，均未采用。

Impact:
`web/visual/index.html` 的实际入口加载 `bee.js`；`sourceText` 作为可选协议字段传入，文字单元按顺序生成蜂体并保留来源索引。完整筑巢关系、人体关系、最终美术造型及录音/解码接口仍未冻结。单蜂 MVP 的 7 项测试与全量 128 项回归已通过，浏览器已观看完整 60 秒。

## 2026-09-11 / 恢复模型接入：DeepSeek 只做语言解码，蜂体参数一律本地派生

Decision:
1. 撤销此前的「模型接入暂缓」。用户决定接入 DeepSeek（OpenAI 兼容接口），默认模型 `deepseek-flash`。
2. 分工固定：**模型只输出语义**（语气 label/intensity/pace/evidence、含义 gist/direction/weight/keywords、1–12 段的分段与部位角色）；**蜂体参数一律由 `10-语言解码/derive_bee.py` 的确定性公式派生**，并输出逐项 trace 作为可追溯证据。模型不直接给像素数值。
3. 密钥只从环境变量 `NESTING_API_KEY` 读取（端点 `NESTING_ENDPOINT`、模型 `NESTING_MODEL` 可选），绝不写入仓库、日志、前端或交接文档。
4. 未配置密钥时，服务端与 CLI 走 `derive_undecoded()`：只按字符拆单元、蜂体取中性默认值，并携带 `decoded:false` 与 notice；画面必须显示「未解码」。
5. 语音识别（ASR）不在 DeepSeek 能力范围内（官方能力表只有 Chat / JSON 输出 / Tool Calls / Vision / 长上下文，无 audio 接口；本机实测端点可达，未授权时返回 HTTP 401）。转写仍是未接入的可替换槽位：录音采集先落地，转写由调用方提供并明确标注。

Reason:
用户明确作品主线是「录音 → 解码语气与含义 → 文字结构生长出一只蜜蜂」。语气与含义确实需要语言模型；而蜂体形态若也交给模型直接生成，就无法复算、无法审计、也无法证明「这只蜂由刚刚那句话长成」。把语义交给模型、几何交给公式，既满足主线，又保住了项目一贯的确定性推导与可追溯要求。

Alternatives:
- 继续暂缓模型：主线的核心环节无法验证，未采用。
- 让模型直接输出蜂体像素参数：不可复算，跨次结果漂移，无法做对应表，未采用。
- 用浏览器 Web Speech API 做转写：零安装、中文可用，但仅 Chrome、必须联网、音频会送往第三方服务器，展厅隐私风险高；用户选择先做采集 + 可替换槽位，未采用。
- 本地 whisper：离线且隐私最好，但破坏「Python 标准库、零额外依赖」约束并需下载模型，未采用。

Impact:
- 新增编号模块 `10-语言解码/`：`decode.schema.json`（模型输出契约）、`解码提示词.md`、`derive_bee.py`（校验 + 派生 + trace + CLI）、占位示例、自动生成的 `映射表.md`、24 项测试。
- `web/interaction/server.py` 新增 `POST /api/decode`：配置了密钥走真实模型，未配置则诚实降级；密钥只存在服务端进程内。
- 视觉协议 `load` 新增可选字段 `beeSpec`（`bee` 派生结果 + `decoded` + `caption`）；`bee.js` 依此驱动「整句 → 拆解飞入 → 蜂体」并把「未解码」标注画在画面上。
- 录音采集新增 `web/interaction/voice.mjs`（6 项测试）：停止录音立即归还音轨，退出释放回放地址，不落盘、不上传。
- 全量测试由 128 项增至 186 项。真实模型效果、延迟、并发与现场噪声下的识别质量仍未验证。

## 2026-09-11 / 真实模型首次跑通：四项实测缺陷与修法

Decision:
用用户提供的密钥首次跑通真实 DeepSeek 调用后，按实测结果改四件事：
1. **默认模型 `deepseek-flash` → `deepseek-chat`。** 前者是推理模型，实测同一请求 **21.4 秒**（返回 reasoning_content），8 秒预算内必然超时；后者实测 **1.45 秒**，返回 `model: deepseek-flash`（同一模型的非推理路径），解码质量更好（同一句话判「克制」而非「平稳」）。
2. **新增 `prune_to_schema()`：按 schema 递归剥离未声明字段。** 实测模型会给 `meaning.weight_note` 一类说明性字段，触发 `additionalProperties:false` 直接判格式失败，白耗一次重试。只删多余键，不补缺字段、不改取值；剥离后仍缺字段或越界照旧失败，并在结果里如实记录 `pruned_fields`。
3. **总等待预算 8 秒 → 15 秒（`MODEL_WAIT_SECONDS`）。** 十句采样平均 2.78 秒、偶发 4–6 秒；两次尝试共享预算，第一次一慢第二次必死，实测失败率约三成。放宽后无占位兜底，只是多等几秒。
4. **色相与姿态改由语气标签主导。** 原 `hue = 38 + 方向偏移(±14) + (强度−0.5)×8`，十种语气实测挤在 50–55 度；`posture` 只看 direction 而模型几乎恒判 outward，八句里七句 open。改为 `TONE_HUE`（十种语气各自基准色相，暖色主调内拉开，唯一冷色 205 留给「疏离」）与 `TONE_POSTURE`（收拢语气 curl／外放语气 open，其余按方向与强度兜底）。
5. 顺带修正 `07-技术验证/nesting.py` 超时文案里硬编码的「8 秒」（该处 timeout 由调用方传入，写死数字会误导）。

Reason:
现场演示效果被判定不可接受。经无头 Chrome 实测，问题不在表现层而在链路：演示入口因僵尸进程静默失效、真实模型从未跑过、且即使跑通，模型的判断也没有变成看得见的差异（三句话长出三只几乎一样的蜂），作品「这句话长成了这只蜂」的主张在视觉上不成立。

Alternatives:
- 保留 `deepseek-flash` 并加大超时到 25 秒：现场让观众干等 20 秒以上，且推理模型的 reasoning 输出对解码任务没有收益，未采用。
- 把 schema 改成 `additionalProperties: true` 容忍多余字段：等于放弃输出契约，未采用。
- 直接删掉 posture 只看 direction 的逻辑、改为纯随机或纯美术指定：会切断「语气 → 姿态」的可追溯链，与项目一贯的确定性派生原则冲突，未采用。
- 色相改到色相环全跨度（如 0–360 分散）：视觉上会把作品从暖调打散成彩色，与既有美术语言冲突，未采用；改为暖色区间内分散 + 单一冷色副色。

Impact:
- 真实链路可用：`POST /api/decode` 实测端到端跑通，界面明示「由 deepseek-chat 实时解码（语气与含义为模型判断，可被否定）」；三张对比图落盘 `deliverables/真实模型对比-20260911/`。
- 色相区分度实测跨度由 26 度增至 32 度且分布更散；姿态分布由 7 open / 1 curl 变为 5 curl / 1 open / 1 level。
- `10-语言解码/映射表.md` 已按新公式重新生成（防漂移守卫先失败后通过）；`test_direction_changes_hue_and_posture` 按新契约拆为「方向只做微调」与「语气主导色相与姿态」两条。
- 全量测试 265 项通过。
- 仍未验证：并发调用、现场噪声、真实语音输入下的解码质量；ASR 依旧未接入。

## 2026-09-11 / 单蜂轮廓由偏旁改为会徽风短笔画

Decision:
用户给出参考图（极简人形剪影图章式：短笔画/虚线勾勒轮廓、中间竖排汉字、左右两侧小人形对称分布、大量留白），确认改造单蜂轮廓。原有「偏旁部首字形」改为「短笔画单元」：每个字符 → 一个笔画代号（h 横 / s 竖 / p 撇 / d 点 / t 提 / j 竖钩 / g 横折 / c 弧），按原句字符顺序沿蜂形轮廓排布；笔画由路径 API 画短粗线段/弧/点/钩/折，方向沿轮廓切线，整体疏朗如会徽。蜂体内部仍按原句折行填字，保留「由文字组成」的可追溯证据。

Reason:
偏旁部首是完整汉字部件，形状复杂、视觉密度高，与用户给的「会徽/图章」风格差距大；用户明确要把 demo 的蜜蜂风格换成图中那种简笔虚线。会徽风轮廓让蜂看起来更像「图章/纹样」而不是「装饰性生物插画」，与项目的话语言隐喻更贴合。笔画单元仍然按原句字符顺序生成，且内部继续填原句，可追溯性不变。

Alternatives:
- 完全替换为人形剪影（违背「单蜂 MVP」主线与 AGENTS.md「人形降为脚手架」约束，未采用）。
- 保留偏旁部首，仅改字体/字号（不改变风格，与用户参考图差距过大，未采用）。
- 沿用 outline 不改（视觉与参考图不一致，未采用）。

Impact:
- `web/visual/js/bee.js`：
  - `RADICALS` / `CHAR_RADICAL` / `_radicalFor` / `this.radicals` / `state.radicals` 全部替换为 `STROKES` / `CHAR_STROKE` / `_strokeFor` / `this.strokes` / `state.strokes`。
  - `CHAR_STROKE` 覆盖演示句与常用字；表外字按字符码从 `STROKE_CODES`（8 种）确定性回退，仍是形状来源而非字形拆解。
  - 新增 `_drawStroke(ctx, stroke, show)`：根据 `kind`（line/dot/hook/bend/arc）调用 `beginPath/moveTo/lineTo/arc/stroke/fill` 画短粗笔画。
  - 轮廓绘制从 `fillText(radical.glyph)` 改为 `stroke`/`fill` 路径调用；表内字用主色，表外字用偏冷色，与原偏旁方案对齐（保留视觉区分「真实笔画」与「回退笔画」）。
- `08-视觉原型/test_bee.js`：`recordingCtx()` 扩展为同时记录 `texts[]`（fillText 文字）与 `marks[]`（stroke/beginPath/moveTo/lineTo/arc/fill）；新增 7 项笔画断言：笔画代号非空、kind 合法、5 种 kind 全在画布上出现、多句（演示句 + 长句 + 表外字）画笔画不抛错。test_bee 由 49 → 56 项。
- `08-视觉原型/README.md`：新增「轮廓规则」一节说明 5 种 kind、可追溯性、风格来源（用户参考图）。
- 全量测试 271 → 293 项全过（bee 49→56、headless 50、waveform 20、integration 31、session 17、voice 12、int-server 9、audio 12、python07 12、python09 19、python10 36、python-int 19）。无回归。
- 未触动：蜂的内部填字、节奏、相机、波形、人形与蜂群旧脚手架、声音与模型解码、人体贴图。



## 2026-09-11 / 保留文字蜂表现，加入现成人体贴图与衔接

Decision:
用户确认把人体贴图加到当前文字蜂背景里，保留现有表现形式，并衔接蜂群组成人体。采用 Sebastian Wallroth 的 CC0 正面人体 SVG，原文件不改；以低透明度叠入。沿用现有蜂形生成影像副本，聚拢到素材采样出的轮廓位置；副本仍对应同一来源语言，不新增解码记录或触发额外声音。

Reason:
用户认可现有效果，明确要求人体使用贴图、不再自行绘制；避免切换画面时突跳。

Alternatives:
重启旧椭圆人体模块、改掉整个文字蜂视觉；均未采用。

Impact:
新增 body-texture.js 与 assets 素材/出处，接入 main/timeline，bee 的主蜂与其他蜂位置平滑过渡；不改变音频映射与模型接口。23–40 秒影像聚拢，31–42 秒贴图淡入，使用宿主时间，暂停与重播一致。

## 2026-09-11 / 语言传播涟漪：说出口的话离开身体，再也收不回来

Decision:
新增 `web/visual/js/ripple.js`（独立视觉模块）+ `config.RIPPLE` 参数。蜂体成形后（12.5s 起，每隔 2.4s 一圈，共 4 圈）从蜂的位置向外推出同心波纹，扩散到画面边缘之外消失。波面由沿切线的短笔画（线段 / 点 / 弧）组成，呼应蜂体的会徽风笔画轮廓。

派生关系（可追溯到语义，不靠人工调参）：
- 波速 = `baseSpeed + speedRange × (wingbeatHz − 1.6) / 1.8`；`wingbeatHz = 1.6 + 1.8 × 语气强度` → **说得越激动，语言传得越快**
- 波强度 = `0.45 + 0.55 × tension`；`tension = 0.5 × 语气强度 + 0.5 × 分量` → **分量越重，波越粗、越持久**
- 波色沿用该句的 `hue`

无状态：波的半径只由「当前时间 − 发出时刻」算出，不保存中间状态。

Reason:
用户明确「不是想给别人一种理念，而是希望大家能够从这个角度意识到语言的重要性」。涟漪把「说出口的话离开身体」变成可见的物理事实——观众看见语言离开说话者、传向远处、最终消散，不需要任何文字说明。这比加文案或改变蜂形更贴合"让语言自己被看见"。

用户从四个候选（涟漪扩散 / 蜂群传染 / 越传越失真 / 汇入巢里）中选了「涟漪扩散」，并选「先做视觉可见的」，所以本轮只做视觉层，不动声音与解码。

Alternatives:
- 蜂群传染（一只蜂触动其他蜂）：会与并发方正在做的 `hive.js`（23–42 秒蜂影落巢房）在时间上重叠，且需要蜂间通信协议，改动面更大；未采用。
- 越传越失真（远处的波更模糊）：可作为涟漪的后续增强，本轮先做基础的扩散与消散。
- 汇入巢里：与 `hive.js` 的巢房沉积概念重复，未采用。
- 直接改 `bee.js` 加波纹：并发方 19:32、23:32 两次改动 `bee.js`，为避免互相覆盖，改为新增独立模块；未采用。

Impact:
- 新增 `web/visual/js/ripple.js`（`RippleModule`，接口与 bee/hive/waveform 一致：constructor/update/draw/reset）。
- `config.js` 新增 `RIPPLE` 常量并导出；`index.html` 加载 `ripple.js`；`main.js` 的 `initModules` 创建模块；`timeline.draw` 图层顺序改为 `waveform → hive → ripple → bee`（涟漪在蜂之下，波心被蜂挡住，只见向外推的环）。
- 新增 `08-视觉原型/test_ripple.js` 23 项：触发时机、扩散、到边缘消失、波速由 wingbeatHz 派生、强度由 tension 派生、色相沿用、倒退收回、重播清空、确定性、同时可见波数上限、画布确有绘制调用、未触发时零绘制、完整 60 秒 1801 帧无异常。
- 全量 362 项通过（Node 275 + Python 87），无回归。
- 未触动：`bee.js` / `hive.js` / `waveform.js` / 声音 / 解码 / 交互。

## 2026-09-12 / AI 的理解过程：把机器怎么听懂这句话画出来

Decision:
新增 `web/visual/js/reading.js`（独立视觉模块）+ `config.READING` 参数。2.5–11.6 秒在画面上部依次展开四层：**语气**（10 个候选词横排，扫描针扫过后停在选中的那个，附强度 / 节奏条与「凭什么」依据）→ **含义**（概括 + 方向箭头 + 分量条 + 关键词）→ **分段**（原句逐段 + 部位几何标记 + 分量条）→ **不确定**（这次解码不能确定什么）。13.2 秒后整层淡出。

画的是**过程，不是结论**：分段层用几何标记（圆=头、波=翅、方=胸、条=腹、三角=尾针）标出每段长到蜂的哪个部位，观众正是靠这一层看懂后面蜂为什么长成那样。

Reason:
用户要求「加一个新模块，把 AI 如何听懂我们说话声音这件事做出来，有点人机交互的感觉」，并选定「可视化理解过程」+「画布上的视觉层」（而非 UI 面板）。接续上一轮「让语言自己的结构被看见」的方向：不写任何解释性文案，只把机器对这句声音的判断过程摊开给观众看——包括它自己不确定的地方。

Concerns:
- 显示的每一个字都来自 `beeSpec.decode`（解码层的真实判断），不是装饰性文案。**未接入模型时只写「未解码 / 语气与含义未接入模型，没有判断可显示」**，一个语气词、一句含义都不画，绝不把占位数据冒充成模型判断。
- `reading.js` 的 `TONE_LABELS` 必须与 `10-语言解码/derive_bee.py` 的 `TONE_LABELS` 逐字一致，否则扫描针会停在画面上没有的词上。改一处须同步另一处。
- 为此 `web/interaction/voice.mjs::beeSpecFrom()` 不再丢弃模型的原始判断，改为在返回值上附带 `decode`（未接入模型时为 `null`）。`voice.test.mjs` 14 项均通过（断言是字段级的，不受影响）。

Alternatives:
- 做成 UI 侧边面板：用户明确选了「画布上的视觉层」，未采用。
- 只画结果（一个语气词 + 一句概括）：失去「过程感」，与「人机交互」诉求不符；未采用。
- 写进 `bee.js`：并发方仍在改 `bee.js`，为避免互相覆盖，改为新增独立模块；未采用。

Impact:
- 新增 `web/visual/js/reading.js`（`ReadingModule`，接口与 bee/ripple/hive/waveform 一致：constructor/update/draw/reset）。
- `config.js` 新增 `READING` 常量并导出；`index.html` 加载 `reading.js`；`main.js` 的 `initModules` 创建模块；`timeline.draw` 图层顺序改为 `waveform → hive → ripple → reading → bee`（理解过程占画面上部 y≈208–430，与蜂不重叠）。
- `web/interaction/voice.mjs::beeSpecFrom()` 返回值新增 `decode` 字段；`docs/INTEGRATION_CONTRACT.md` 同步该字段。
- 新增 `08-视觉原型/test_reading.js` 41 项：四层依次展开、画布上确实是解码层的判断、语气扫描 10 词、部位标记几何形、淡出、未解码不编造、无状态（倒退收回）、确定性、完整 60 秒 1801 帧、图层顺序。
- 全量 405 项通过，无回归。
- 未触动：`bee.js` / `hive.js` / `ripple.js` / `waveform.js` / 声音 / 解码。
