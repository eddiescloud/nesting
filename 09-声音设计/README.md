# 声音设计与音画同步

更新：2026-09-08。本模块把符合 `04-AI转译/output.schema.json` 的转译输出，按固定公式推导为 60 秒音画同步时间线（score），并提供标准库参考渲染。不调用模型；占位来源不得冒充真实 AI 结果。

## 设计原则

1. **声音不直接解释文本**：声音只消费已校验的 output 参数（energy / weave / settle），语义解释完全留在 AI 转译层。
2. **视觉与声音共用同一时间事实**：`score.phases` 即 02-体验与分镜的六段结构，视觉场景切换与声音层包络都必须由它驱动，禁止两边各自硬编码时间。
3. **静音时叙事仍成立**（03 约定）：所有关键节拍同时以 events.cue 输出，供视觉端无声使用。
4. **音色是占位（已升级一轮）**：标准库合成核验时间线可听——铺底用失谐双正弦+八度泛音（缓慢拍频），纹理颗粒用限带噪声×载波（ring mod，更接近蜂群嗡鸣），交织脉冲带下滑（水滴感），沉积泛音柔起并轻微下坠。音色、空间化、现场音量仍由 Scott 调整；时间线公式与增益上限不随音色变化。

## 参数映射（首轮起点，现场可调）

| score 元素 | 来源参数 | 公式 | 听感 |
|---|---|---|---|
| bed（drone 层） | 无（常量铺底） | 55 Hz 基音，慢速呼吸式起伏，gain 0.15 | 低频安静铺底，对应"外表平静" |
| swarm-a（texture 层） | `events[0].energy` | 疏密 = 2 + 14 × energy 粒/秒；音区 220 Hz | energy 高则细碎声密集 |
| swarm-b（texture 层） | `events[1].energy` | 同上；音区 330 Hz | 与 A 音区区分，来源可辨 |
| weave-pulse（pulse 层） | `interaction.weave` | 速率 = 0.5 + 1.5 × weave 次/秒；440 Hz | 交织越强脉冲越密 |
| settle-bloom（bloom 事件） | `interaction.weave` × `interaction.settle` | 沉积数 = round(round(48×weave) × settle)，取整 half-up；47–57 s 内均匀分布；275 Hz 泛音列 | 每次薄层沉积一次柔和泛音 |
| master_gain | 全部持续层 | 并发峰值向下归一到 0.8 总音量上限（03 约定） | 播放端不得再放大超过 1.0 峰值 |

## 音画同步节拍（events.cue）

| t（秒） | cue | 画面（02 分镜） | 声音行为 |
|---|---|---|---|
| 0 | showcase-start | 平静人形出现 | 仅铺底 |
| 8 | swarm-a-enter | 第一组蜂群进入 | texture-a 淡入 |
| 20 | swarm-b-enter | 第二组进入 | texture-b 淡入 |
| 32 | weave-start | 轨迹交叉、逐渐成为纤维 | 脉冲层进入，两组纹理继续 |
| 47 | settle-start | 自由飞行减少，薄层保留 | texture 自相位起线性衰减 |
| 47–57 | deposit-01…N | 结对轨迹逐对转薄层 | 每对沉积一次泛音（deposit 事件与视觉逐条对应） |
| 57 | residual-start | 留下画面与问题 | 纹理归零，铺底淡出 |

## 文件清单与所有权

| 文件 | 职责 | 修改权限 |
|---|---|---|
| `score.schema.json` | score 结构约定 | 声音模块负责人 |
| `build_score.py` | output → score 确定性推导与校验 | 声音模块负责人 |
| `render_score.py` | score → 参考 WAV（标准库合成） | 声音模块负责人 |
| `test_score.py` | 19 项离线测试 | 声音模块负责人 |
| `score.example-手工占位.json` | 由手工占位 output 推导的示例（非真实 AI） | 只应由脚本重新生成 |
| `renders/` | 参考音频输出目录 | 消费端只读 |

**浏览器运行时适配器**：`web/audio/audio.mjs`（声音 AI 所有）实现 `docs/INTEGRATION_CONTRACT.md` 的 `createAudio()` 接口，宿主 frame 时钟驱动、默认静音、防暂停爆音；音色与本目录参考渲染对齐（失谐铺底、主链低通 4 kHz、下滑脉冲），层参数公式与 `build_score.py` 一致，并有 12 项无头测试交叉校验（`node --test web/audio/tests/audio.test.mjs`）。本目录是参数映射的单一事实来源。

**取整约定**：结对数、沉积数与四位小数舍入一律 half-up（`.5` 进位），由 `build_score.round_half_up` 与 `build_score.r4` 实现；视觉 `web/visual/js/config.js` 的 `roundHalfUp` 与运行时 `web/audio/audio.mjs` 的同名函数（及 `r4`）必须与此一致，禁止使用 Python 内置 `round()` / `round(value, 4)`（银行家舍入）。`score.schema.json` 的 `events.maxItems = 54` 对应最坏情况（6 个 cue + 48 个 deposit，即 weave=1.0 / settle=1.0）。

视觉 AI 只读 `score.json` 与 `output.json`，不改本模块文件；跨模块需求写入 `docs/TODO.md` 或 `docs/DECISIONS.md`。接口约定详见 `docs/INTERFACES.md`。

## 运行

项目根目录执行：

```sh
# 由任意符合 schema 的 output 推导 score（--input 可选，核对事件 ID 与顺序）
# --source-label 与已落盘示例一致（"demo-手工占位"）时结果逐字节相同；--save 为独占创建，不覆盖已有文件。
python3 09-声音设计/build_score.py --output 04-AI转译/output.example-手工占位.json \
  --source-label "demo-手工占位" \
  --save 09-声音设计/score.example-手工占位.json

# 渲染参考 WAV（60 秒单声道 22050 Hz；--seconds N 可快速试听前 N 秒）
python3 09-声音设计/render_score.py --save 09-声音设计/renders/reference-demo.wav

(cd 09-声音设计 && python3 -m unittest -v test_score.py)
```

## 已知限制

- 合成仍为占位音色（失谐铺底 / 限带噪声颗粒 / 下滑脉冲 / 柔起泛音），未做混响与空间化；最终音色由 Scott 决定。
- 峰值 0.482（master_gain 0.7920）余量充足，现场音量由播放设备与 Scott 决定。
- 渲染耗时数秒（纯 Python 逐样本合成）；正式播放使用 web/audio 的 WebAudio 实时合成消费同一映射，而非预渲染 WAV。
- 未验证：多扬声器空间化、实际设备音量、与视觉渲染的逐帧对齐误差。
