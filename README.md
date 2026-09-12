# 筑巢 / Nesting

将说话录音解码为语气、含义与文字结构，再让文字生长出蜜蜂并与其他蜂形成筑巢关系的交互艺术项目。当前已跑通离线“文字结构蜂”最小可行原型：一段 sourceText 按字符顺序生成一只可辨识、可追溯的蜂；真实录音、语气与含义解码按用户决定暂缓接入。人形与粒子蜂群仍保留为旧脚手架，不是当前参赛主入口。

## 当前状态

2026-09-11 更新：**可演示版本已就绪**——双击 `演示.command` 打开演示入口，点演示句即可看到「整句 → 拆字 → 飞入成蜂」，离线、不需密钥、不需麦克风；演示脚本见 `docs/DEMO.md`。作品主线落地为「录音 → 解码语气与含义 → 文字结构生长出一只蜂」。新增 `10-语言解码/`（语言模型接口，已接 DeepSeek，密钥只走环境变量）、录音采集与「说一句话」入口、视觉拆解阶段；全量 186 项测试通过，交互 + 视觉 + 声音三方联调已跑通。此前 2026-09-08：交互模块完成。项目目标、架构和状态见 docs/PROJECT_CONTEXT.md；后续迭代见 docs/DEVELOPMENT_PLAN.md 与 docs/TODO.md；接手先读 AGENTS.md 和 docs/HANDOFF.md。

## 文件导航

- 01–03：概念、分镜、蜂群规则工作稿。
- 04-AI转译：提示词、输出 schema、人工输入输出样例。
- 05：详细验收案例；开发优先级以 docs/TODO.md 为准。
- 06-共创证据：真实创作取舍记录。
- 07-技术验证：Python 代码、测试与操作说明。
- 08-视觉原型：视觉模块设计文档与无头测试（运行时代码在 web/visual/）。
- 09-声音设计：音画同步时间线（score）约定、确定性推导与参考音频；参数映射的单一事实来源。
- web/interaction：交互界面、状态管理、本地预览服务器。
- web/visual：文字结构蜂与蜂巢（巢由语言筑成）运行时代码（HTML5 Canvas）；人形/人体贴图/蜂群/交织沉积为停用的过渡脚手架。
- web/audio：声音运行时（WebAudio ES module，宿主时钟驱动，实现 INTEGRATION_CONTRACT 接口）。
- 10-语言解码：转写文本 → 语气/含义/分段部位（模型）+ 蜂体规格（确定性派生 + 逐项对应表）。
- docs/INTERFACES.md：统一运行环境、数据流与各 AI 文件所有权。
- docs/DEMO.md：演示脚本（怎么演、红线、出问题怎么办）。
- docs/VERIFICATION_STATUS.md：验证状态总表（哪些验过、哪些没验）。

## 运行与测试

**演示**：双击「演示.command」，浏览器自动打开演示入口（`?demo=1`）。

完整交互预览：双击「启动交互预览.command」，或在项目根运行 `python3 web/interaction/server.py --port 8765` 后打开 http://127.0.0.1:8765/。

交互模块代码在 web/interaction；其他 AI 请先看 docs/INTEGRATION_CONTRACT.md 和 web/interaction/OWNERSHIP.md。

原有离线校验仍可在项目根目录运行：

```sh
python3 07-技术验证/nesting.py demo
(cd 07-技术验证 && python3 -m unittest -v test_nesting.py)
python3 10-语言解码/derive_bee.py demo
(cd 10-语言解码 && python3 -m unittest -v test_decode.py)
```

也可双击“检查占位数据.command”。无需安装依赖；无 build 步骤、无独立 lint 配置。模型模式不启用。

视觉动画原型可独立运行：用浏览器打开 `web/visual/index.html`，点击开始播放 60 秒文字结构蜂。或运行 MVP 测试：`node 08-视觉原型/test_bee.js`，旧脚手架回归测试：`node 08-视觉原型/test_headless.js`（50 项）。视觉模块通过 iframe + postMessage 协议与交互模块对接，协议见 docs/INTEGRATION_CONTRACT.md。

声音模块（声音 AI）：

```sh
# 由 output 推导音画同步时间线 score（--input 可选核对事件 ID 顺序）
# --source-label 须与已落盘示例一致（"demo-手工占位"）才能复算出逐字节相同的结果；
# --save 为独占创建，目标已存在时会拒绝覆盖，需先删除或改用其它文件名。
python3 09-声音设计/build_score.py --output 04-AI转译/output.example-手工占位.json \
  --source-label "demo-手工占位" \
  --save 09-声音设计/score.example-手工占位.json

# 渲染 60 秒参考 WAV（占位音色升级版；--seconds N 快速试听）
python3 09-声音设计/render_score.py --save 09-声音设计/renders/reference-demo.wav

# 离线测试（19 项）与运行时测试（12 项）
(cd 09-声音设计 && python3 -m unittest -v test_score.py)
node --test web/audio/tests/audio.test.mjs
```

浏览器声音由 web/audio/audio.mjs 提供，交互模块的 audioModuleUrl 已于 2026-09-11 启用（默认静音，需观众点击「开启声音」）。

语言模型（DeepSeek，OpenAI 兼容）由 `10-语言解码/derive_bee.py` 调用，密钥只从环境变量读取，不写进仓库：

```sh
NESTING_API_KEY=sk-... python3 web/interaction/server.py --port 8765   # 网页解码走真实模型
NESTING_API_KEY=sk-... python3 10-语言解码/derive_bee.py live --transcript "你不要给别人添麻烦。"
```

未设置密钥时，解码只做文字结构拆分，界面与数据都会标注「未解码」，不会用中性默认值冒充模型判断。语音识别（ASR）尚未接入，转写目前由人填写。

本目录已建立独立 Git 仓库；GitHub 远端为公开仓库 `eddiescloud/nesting`。任何人可查看；提交代码仍需仓库权限，建议同事通过分支与 Pull Request 协作。完整测试命令见 web/interaction/README.md。
