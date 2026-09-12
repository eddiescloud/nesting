# 项目上下文

更新：2026-09-11。

## 项目与用户

《筑巢 / Nesting》面向线下装置观众，由用户与 Scott 讨论创作。核心目标是采集观众说话的录音，自动解码语气与含义，让文字结构生长出一只由该段语言构成的蜜蜂，并观察它与其他蜂如何形成筑巢关系。不是心理诊断工具。用户已安排多个 AI 分工：交互 AI 负责交互、状态与整合（已交付）；视觉 AI 先交付单只文字结构蜂 MVP，旧人形/蜂群/交织沉积作为脚手架保留；声音 AI 负责 score 与音频（已交付参考渲染）。

## 已确认事实

- 采用蜂群作为话语隐喻；用户明确把繁殖机制改为融合、交织及新的存留物。
- 用户补充的核心机制是“录音 → 语气与含义解码 → 文字结构生长为一只蜜蜂”；每一只蜂必须能追溯到刚刚发生的一段语言。
- 工作根目录：/Users/jass/Desktop/筑巢-Nesting。
- 模型接口按用户决定留空，等待后续接入。
- 已有设计稿、JSON schema、手工示例、Python 离线校验与预留传输代码。9/8 复核 12 项测试及 demo 通过。
- 已新增可运行网页交互与文字分镜；视觉入口（web/visual/）现先运行“文字结构蜂”离线 MVP：一段 sourceText 按字符顺序生成一只可辨识、可追溯的蜂，支持独立运行与 iframe 宿主协议。人形、蜂群运动、交织与沉积仍保留为旧脚手架，暂不代表参赛主视觉。声音已完成：离线 score 时间线（09-声音设计/）+ 浏览器运行时（web/audio/）。Scott/其他 AI 的外部工程未检查。

## 当前技术栈与架构

Python 3 标准库；原生 HTML/CSS/ES modules；Markdown；JSON。当前脚手架由 nesting.py 读取两段事件输入 → 校验 → demo 读取固定示例 / validate 校验外部候选 / live 预留模型调用 → 输出带来源标识的结果包装。视觉 MVP 已实现 sourceText → 单蜂的确定性映射；目标链路仍需要补上录音采集、语音识别、语气/含义解码和最终蜂结构规格，这些不能被现有 energy/dispersion/turbulence/trace 四个通用参数替代。交互本机服务复用校验器载入三份人工预设。网页用 session.mjs 控制 60 秒时间线；bridge.mjs 预留同源视觉 iframe 和声音 ES module，协议见 INTEGRATION_CONTRACT。2026-09-11 起 visualUrl 与 audioModuleUrl 均已设置为同源入口，界面显示作品预览（分镜仅在视觉不可用时回退显示）。

预留 live 使用消息格式 HTTP 请求和子进程控制总等待；返回后本地校验，格式失败最多再试一次。没有真实服务验证。测试通过模拟响应验证代码行为。

## 核心模块

04-AI转译/output.schema.json：输出约定；系统提示词.md：艺术转译边界；07-技术验证/nesting.py：输入、输出校验及命令入口；test_nesting.py：离线测试。
web/interaction/：交互界面、状态管理、60 秒时间线、iframe 视觉桥接、本地预览服务器；协议见 docs/INTEGRATION_CONTRACT.md。
web/visual/ + 08-视觉原型/：文字结构蜂 MVP（HTML5 Canvas + 原生 JS，零依赖）；旧人形、蜂群运动、交织与沉积模块保留作过渡脚手架。统一模块接口 constructor/update/draw/reset；支持独立运行与宿主 postMessage 协议。
09-声音设计/：音画同步时间线（score）的单一事实来源：score.schema.json、build_score.py（从 output 按固定公式确定性推导，复用 07 校验器）、render_score.py（标准库参考 WAV）、test_score.py（19 项测试）；时间结构与 02 分镜一致（0–8 静置 / 8–20 第一组 / 20–32 第二组 / 32–47 交织 / 47–57 沉积 / 57–60 存留），deposit-XX 事件逐条对应沉积节拍（取整 half-up，与视觉一致），master_gain 归一到 0.8 总音量上限。映射与上限已经用户确认冻结（2026-09-08）。
web/audio/：声音运行时 ES module（WebAudio），实现 INTEGRATION_CONTRACT 的 createAudio() 接口；宿主 frame 时钟驱动、默认静音、防暂停爆音；12 项无头测试与离线 score 参数交叉校验。参数映射公式以 build_score.py 为准。占位音色已升级：失谐铺底、限带噪声颗粒、下滑脉冲、柔起泛音、主链低通。
docs/INTERFACES.md：统一运行环境、数据流与各 AI 文件所有权约定。目录编号：08-视觉原型（视觉设计文档）、09-声音设计（声音模块）。

## 当前假设与未验证事项

工作方案曾设为两句关联话、约 60 秒展示、纤维薄层沉积；这些仍是待确认的展示方案，不是核心机制。核心机制以“录音经解码后，文字结构生长为一只蜂”为准。每段录音对应一只蜂、语句切分、蜂的结构映射、是否进入人体、设备和分工仍待确认。真实语义效果、接口兼容性、性能、赛事规则均未验证。旧日期不能作为进度证据。项目管理入口以 docs 为准，编号文件保留详细设计依据。

## 本轮验证

交互：39 项自动测试通过，内置浏览器验证完整 60 秒分镜、重播、暂停、输入检查及清空。桌面/手机布局已检查。具体证据范围见 INTERACTION_QA.md，不等于真实视觉、声音或模型验收。启动：python3 web/interaction/server.py --port 8765。
视觉：文字结构蜂 MVP 新增 7 项确定性结构测试；旧视觉回归 50 项无头测试仍通过（模块初始化、参数映射、3600 帧模拟、六阶段推进、交织沉积触发、重置、宿主 postMessage 协议、跨语言取整一致性）。所有 JS 文件通过 node --check 语法检查。demo.json 通过 output.schema.json 校验。2026-09-11 已在无头 Chrome 实测单蜂从种子生长至稳定，暂停冻结、退出重置、无应用异常；仍未在展示设备与现场性能条件下验证。命令：node 08-视觉原型/test_bee.js 与 `node 08-视觉原型/test_headless.js`。
声音：离线 19 项测试通过（cd 09-声音设计 && python3 -m unittest -v test_score.py）；运行时 12 项无头测试通过（node --test web/audio/tests/audio.test.mjs），层参数与 09-声音设计/score.example-手工占位.json 一致。参考 WAV 60 秒、峰值 0.482（master_gain 0.7920）。占位音色已升级（失谐铺底/限带噪声颗粒/下滑脉冲/柔起泛音）；未在真实浏览器/设备验证声音（含 iOS AudioContext 策略）。
2026-09-11 契约修复：`score.schema.json` 的 `events.maxItems` 40→54（消除 weave=1.0/settle=1.0 时 build_score 报数组长度错误）；结对数/沉积数与四位小数舍入统一为 half-up（新增 `build_score.round_half_up`，并将 `build_score.r4` 改为 half-up、`config.roundHalfUp`、`audio.mjs` 本地 `roundHalfUp`），消除 Python 银行家舍入与 JS Math.round 在 .5 边界的分歧。均已加回归测试并记入 DECISIONS。
2026-09-11 三方联调（交互+视觉+声音同时运行）：`web/interaction/config.js` 的 `audioModuleUrl` 设为 `/web/audio/audio.mjs`；无头 Chrome 实测 15 项断言全过——声音按钮随模块接入出现、点击后 AudioContext `running`、播放中持续调度声源且主增益 > 0、暂停立即静音且画面时间冻结（无自走时钟）、继续后接续、退出后静音复位回 00:00，无 404/未捕获异常/console.error。仍未在真实展示设备（含 iOS AudioContext 策略）与现场条件下验证。


## 2026-09-11 最新视觉补充（蜂巢取代人体贴图）
演示后段改为「聚成蜂巢」：新增 js/hive.js——程序化水滴形六边形巢脾，23–40 秒蜂影落进巢房、落定后点亮描边并在房内填入来自现场语句的字（主蜂原句从巢心开始），31–42 秒整面巢脾淡影渐显；主蜂向巢心、别的蜂向巢房过渡。body-texture.js 与 CC0 人体 SVG 降为脚手架、入口不再加载（加入一天后退役，决策见 DECISIONS）。历史「主入口停用人体」表述仍适用于人形脚手架。
