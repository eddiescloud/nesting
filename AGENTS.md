# 项目工作规则

本项目持续开发。每轮开始依次读 AGENTS.md、README.md、docs/PROJECT_CONTEXT.md、docs/DECISIONS.md、docs/TODO.md、docs/HANDOFF.md。缺失时说明并按现有事实补最小版本。读取后先简述目标、架构、完成项、当前任务、问题和下一步，不立即大规模改代码。

收到具体任务先检查架构和现有实现，优先复用，作最小必要修改；测试失败先定位，不删功能或绕过校验。重要架构变化先说明原因，记录到 DECISIONS。区分已确认、假设、未验证，文件冲突先指出；HANDOFF 与代码或测试冲突时修正 HANDOFF。不要依赖聊天作为唯一上下文。

每轮结束更新 TODO 与 HANDOFF。用户说“交接 / 结束本轮 / 准备切账号 / 更新 handoff”时检查代码改动和重要决策，并写入简洁的 300–800 字交接。HANDOFF 使用 Current Status、Completed、Changed、Current State、Known Issues、Next Step、Important Context、Commands 结构。

## 特殊约束

- 模型接入（2026-09-11 用户决定恢复）：使用 DeepSeek（OpenAI 兼容，默认 `deepseek-flash`）。密钥只从环境变量 `NESTING_API_KEY` 读取，绝不写入仓库、日志、前端或交接文档，也不借用其他项目凭证。未配置密钥时只做文字结构拆分，界面与数据必须标注「未解码」，不得冒充模型结果。语音识别（ASR）DeepSeek 不提供，转写仍是未接入的可替换槽位。
- 明确机制（2026-09-11 用户补充，取代旧的「两段输入」表述）：录音 → 解码语气与含义 → 文字结构生长出一只蜜蜂；每只蜂必须能追溯到一段真实语言。人形、双群粒子与薄层沉积降为脚手架；最终视觉及 Scott 分工仍待确认。
- 占位示例必须标明人工数据；不得冒充模型结果或将任意输入解释为已处理。
- 不写入密钥或私人观众数据。参赛规则、真实模型效果、现场性能未核验时不得宣称通过。
- 修改仅限本项目。2026-09-12 起本目录为独立 Git 仓库；只在本目录执行 Git 命令，不对桌面父仓库执行 add / commit。远端已按用户要求改为 public；提交前检查暂存清单，不提交密钥、私人观众数据或 AI 工具记忆目录。公开仓库里的所有历史提交和素材均可被任何人查看。

## 代码与命令

Python 3 标准库，无额外安装依赖。保持输入校验与传输分离；输出字段变更同步 schema、示例、校验器、测试及文档。当前校验器仅适用于现有 schema 规则。

项目根目录执行：

```sh
python3 07-技术验证/nesting.py demo
(cd 07-技术验证 && python3 -m unittest -v test_nesting.py)
python3 10-语言解码/derive_bee.py demo
(cd 10-语言解码 && python3 -m unittest -v test_decode.py)
zsh -n 检查占位数据.command
```

网页启动：`python3 web/interaction/server.py --port 8765`。新增测试：`node --test web/interaction/tests/session.test.mjs`、`node --test web/interaction/tests/voice.test.mjs`、`python3 -m unittest discover -s web/interaction/tests -p 'test_*.py' -v`。无 build 或独立 lint 配置。demo 为 JSON 检查；网页当前入口为「文字结构蜂 + 录音采集」，转写（ASR）未接入。模型密钥只在环境变量里，别写进任何文件。模块归属和协议见 docs/INTEGRATION_CONTRACT.md，禁止覆盖他人的在写模块。
