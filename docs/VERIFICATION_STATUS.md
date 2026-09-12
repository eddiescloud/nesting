# 验证状态矩阵

更新：2026-09-11。本表只记录**跑过什么、用什么跑的**，不代表现场达标。任何一项在真实设备、真实语音、真实模型上重跑之前，都不得声称通过。

图例：✅ 已实测 · ⚠️ 部分验证 · ❌ 未验证 / 未接入

## 一、已实测

| 能力 | 状态 | 证据 | 复现命令 |
|---|---|---|---|
| 输入与输出结构校验 | ✅ | 12 项测试 + demo | `(cd 07-技术验证 && python3 -m unittest test_nesting.py)` |
| 解码契约：词表、边界、确定性、可追溯性 | ✅ | 36 项测试（含 6 项 live 传输） | `(cd 10-语言解码 && python3 -m unittest test_decode.py)` |
| 语义 → 蜂体规格派生 | ✅ | 同 36 项；同一 decode 两次派生逐字段相同 | `python3 10-语言解码/derive_bee.py demo` |
| 逐项对应表可复算 | ✅ | `映射表.md` 由 `derive_bee.py --md` 生成，非手写；有防漂移守卫（实测改公式即失败）；同一输入两次导出逐字节相同 | `python3 10-语言解码/derive_bee.py demo --md 10-语言解码/映射表.md` |
| 证据来源不被冒充 | ✅ | 证据顶部按模式写明来源（占位/模型实时解码/导入未验证/未标注）；live 路径实测输出「由 mock-ok 实时解码，一次通过」；有 4 项测试锁措辞 | `(cd 10-语言解码 && python3 -m unittest test_decode.py)` |
| live 传输通道（合规/重试/500/超时/无密钥） | ✅ | 本地模拟 OpenAI 兼容上游 + 真实子进程传输 | 同上（`LiveTransportChecks`） |
| 语气词表越界拦截 | ✅ | 模拟上游返回结构合法但标签越界：重试一次后仍越界即判失败，绝不让越界值到达蜂体 | 同上 |
| 录音采集与隐私生命周期 | ✅ | 12 项测试；停止即归还音轨、退出释放回放地址 | `node --test web/interaction/tests/voice.test.mjs` |
| **离线演示通路** | ✅ | 双击 `演示.command` → `?demo=1` → 点演示句跑完整流程；无头 Chrome 实测点「急促」hue=49、点「压抑」hue=33，画布标注「人工占位示例（未调用模型）」，证据面板 10–11 行，零异常零 404 | `zsh 演示.command 8795` 后打开 `/api/demo` |
| 转写能力探测如实报告 | ✅ | 服务端 19 项测试 + 浏览器实测说明文字 | `python3 -m unittest discover -s web/interaction/tests -p 'test_*.py'` |
| 拆解阶段（整句 → 逐字飞入 → 蜂体） | ✅ | 37 项蜂测试 + 浏览器劫持画布文字实测 | `node 08-视觉原型/test_bee.js` |
| 语气/含义驱动形态 | ✅ | 单元测试（姿态/间距/规格）+ 浏览器实测「语气：压抑」画上画布 | `node --test web/interaction/tests/integration.test.mjs` |
| 声纹背景（铺满画面） | ✅ | 由真实 score 驱动、不重复实现声音公式；包络与 `web/audio/audio.mjs` 逐值一致（最大偏差 0）；无 score 时不画波形；无头 Chrome 实测顶部区域亮点 2122 → 5952 | `node 08-视觉原型/test_waveform.js` |
| 绘制顺序（声纹先于蜂） | ✅ | 守卫测试锁定 waveform→bee；此前 `timeline.draw` 有 bee 就 return，声纹根本没画出来 | 同上 |
| 视野拉远与群蜂 | ✅ | 17 秒前近景、17–34 秒拉到 0.44；别的蜂按载荷的 appearAt 出现；无头 Chrome 实测蜂的成像高度 307 → 147，三只蜂仍在画面里 | `node 08-视觉原型/test_bee.js` |
| 每只蜂自己的声音 | ✅ | 语气 → 音色（协和/不协和、起音快慢、噪声）；无头 Chrome 实测两只别的蜂出现时共新建 12 个振荡器 | `node --test web/audio/tests/bee-voice.test.mjs` |
| 蜂 = 偏旁轮廓 + 原句填充 | ✅ | 无头 Chrome 实测画布上出现该句的真实偏旁 亻口人忄讠 与原句字符；表内字取真实偏旁，表外字确定性回退 | `node 08-视觉原型/test_bee.js` |
| 未解码时强制标注 | ✅ | 画面必须出现「未解码」；live 时不得出现 | `node 08-视觉原型/test_bee.js` |
| 可追溯证据可见 | ✅ | 解码后界面出现证据面板（10 行对应规则），默认折叠，退出清空；纯 span 拼接会糊，已用分隔符 | `node --test web/interaction/tests/voice.test.mjs` |
| 视觉脚手架回归 | ✅ | 50 项无头 + 31 项协议集成 | `node 08-视觉原型/test_headless.js` |
| 声音离线与运行时 | ✅ | 19 项离线 + 12 项运行时 | `(cd 09-声音设计 && python3 -m unittest test_score.py)` |
| 三方联调（交互+视觉+声音） | ✅ | 无头 Chrome 15 项断言：加载/播放/暂停静音/退出复位 | 见 HANDOFF Commands |
| 舞台与宿主时钟 | ✅ | 无头 Chrome：暂停后画面像素级冻结、退出回 00:00 | 见 HANDOFF Commands |
| 独立视觉原型可用 | ✅ | 无头 Chrome：三阶段 + 暂停冻结 + 零 HTTP 报错 | 打开 `web/visual/index.html` |

**全量：263 项测试通过**（2026-09-11 19:32 本机实测；跨模块协议 31 项另计，计入则为 294）。

分项：07 校验=12、语言解码=36、声音设计=19、交互服务器=19、session=17、voice=12、交互集成=9、audio=12、蜂声音 bee-voice=8、文字结构蜂=49、声纹=20、视觉脚手架=50。

> ⚠️ **计数会变，不要写死。** 这个数字随任一模块增删测试而变动，且本项目存在多人/多 AI 并发编辑。任何人改动计数前必须先跑一遍复算，改完把本节、HANDOFF 顶部、TODO 顶部三处一起同步——只改一处等于制造新的矛盾。
>
> 19:32 复核实录：本次会话内 `test_bee.js` 由 37 → 49、`test_waveform.js` 由 17 → 20，并新增 `web/audio/tests/bee-voice.test.mjs` 8 项。也就是说，十多分钟前写下的 240 已经作废。更早的分项还漏记了「声纹」且「文字结构蜂」写 22，总数 240 属于巧合对上，已一并更正。

复算（项目根执行，只统计不改动代码）：

```sh
(cd 07-技术验证 && python3 -m unittest test_nesting.py 2>&1 | grep -E '^Ran') ;\
(cd 10-语言解码 && python3 -m unittest test_decode.py 2>&1 | grep -E '^Ran') ;\
(cd 09-声音设计 && python3 -m unittest test_score.py 2>&1 | grep -E '^Ran') ;\
(python3 -m unittest discover -s web/interaction/tests -p 'test_*.py' 2>&1 | grep -E '^Ran') ;\
for f in web/interaction/tests/session.test.mjs web/interaction/tests/voice.test.mjs \
         web/interaction/tests/integration.test.mjs web/audio/tests/audio.test.mjs \
         web/audio/tests/bee-voice.test.mjs ; do node --test $f 2>&1 | grep -E '^# pass' ; done ;\
node 08-视觉原型/test_bee.js 2>&1 | tail -1 ;\
node 08-视觉原型/test_waveform.js 2>&1 | tail -1 ;\
node 08-视觉原型/test_headless.js 2>&1 | grep -E '通过 [0-9]+ 项' ;\
node 08-视觉原型/test_integration.js 2>&1 | grep -E '[0-9]+ 项通过'
```

## 二、未验证 / 未接入

| 能力 | 状态 | 缺什么 | 风险 |
|---|---|---|---|
| **真实 DeepSeek 调用** | ❌ | 本机没有 `NESTING_API_KEY` | 返回结构、延迟分布未知；词表越界**会被拦截并重试**（已测），但真实模型的实际越界率仍未知 |
| **语音识别（ASR）** | ❌ | 方案未定（本地 whisper / 云 ASR / 浏览器识别） | 录音与转写断开，观众说完要自己打字——展厅里体验会断 |
| 真实语音下的映射合理性 | ❌ | 需要一段真实录音 | 现在的映射只在人工占位与模拟上游上验证过 |
| 真实展示设备与现场性能 | ❌ | 需要现场设备 | 无头浏览器 ≠ 展示机 |
| iOS / 移动端声音策略 | ❌ | 需要真机 | AudioContext 策略未验 |
| 连续 5 轮稳定性 | ❌ | 需要现场 | 长时间运行的内存与音轨泄漏未测 |
| 多蜂筑巢关系 | ❌ | 设计未冻结 | 目前只有单蜂 |
| 赛事规则与提交要求 | ❌ | 主办方原始规则 | 不得宣称达标 |

## 三、怎么读这张表

- 「✅」只说明**在这个仓库、这台机器、这些命令下跑过并通过**。
- 「⚠️ 部分验证」表示主路径验过、边界没验（本表当前没有 ⚠️ 项，属于巧合，不代表以后不会出现）。
- 任何把 ❌ 写成 ✅ 的行为（包括用占位结果冒充模型结果）都违反 AGENTS.md。
