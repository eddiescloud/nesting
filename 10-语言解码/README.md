# 10-语言解码 · 转写文本 → 一只由文字结构组成的蜂

更新：2026-09-11。

## 这一层做什么

把一句话的**转写文本**解码成两样东西：

1. **语义**：语气、含义方向、分量、关键词，以及把原句切成 1–12 段的部位分角色（head / wing / thorax / abdomen / stinger）；
2. **蜂体规格**：由语义按固定公式**确定性派生**出来的参数（翅膀频率、体节张力、间距、色相、姿态、整体大小）。

模型只负责语义；蜂体参数永远由 `derive_bee.py` 算，所以同一段解码结果必然长出同一只蜂，并且每个数值都能追到"哪条规则算的"。这是本模块最重要的约定。

```
录音（ASR 未接入） → transcript → 模型解码语义 → 确定性派生蜂体规格 → 视觉生长
                                        ↘ trace（逐项对应表）
```

## 契约

| 文件 | 作用 |
|---|---|
| `decode.schema.json` | 模型输出契约（语义字段，不含像素数值） |
| `解码提示词.md` | 发给模型的系统提示词；`\n---\n` 后为实际内容，与 04-AI转译 同一约定 |
| `derive_bee.py` | 校验 + 确定性派生 + 对应表 trace + 命令行入口 |
| `examples/decode.example-手工占位.json` | **人工占位**解码结果，未调用模型 |
| `examples/decode.example-手工占位.bee.json` | 由上一行派生出的蜂体规格（可复算） |
| `映射表.md` | 由上两行自动生成的逐项对应表，**不要手改** |
| `test_decode.py` | 校验、词表、派生范围、可追溯性、模型通道与失败重试 |

## 派生公式（首轮起点，可调整；调整后须同步视觉与文档）

| 来源 | 目标 | 规则 |
|---|---|---|
| tone.intensity | bee.wingbeatHz | 1.6 + 1.8 × 强度 |
| tone.intensity + meaning.weight | bee.tension | 0.5 × 强度 + 0.5 × 分量 |
| tone.pace | bee.spacing | 0.7 + 0.6 × (1 − 节奏) |
| meaning.direction + tone.intensity | bee.hue | 38 + 方向偏移（向内 −8 / 向外 +14 / 中性 0）+ (强度 − 0.5) × 8 |
| meaning.direction | bee.posture | 向内 curl / 向外 open / 中性 level |
| meaning.weight | bee.bodyScale | 0.85 + 0.30 × 分量 |
| segments 的 role 分布 | 单元归属 | 每个非空白字符一个单元，按原句顺序，上限 32 |

## 命令

```sh
# 占位示例：校验 + 派生 + 打印（不调用模型）
cd 10-语言解码 && python3 derive_bee.py demo

# 把某次解码的逐项对应表导出成证据（--md 可与任意模式一起用）
NESTING_API_KEY=sk-... python3 derive_bee.py live --transcript "你不要给别人添麻烦。"   --source-label "现场录音转写" --md 证据.md --save 结果.json

# 由已有解码结果派生（跳过模型）
python3 derive_bee.py derive --input examples/decode.example-手工占位.json

# 校验一份外部解码结果（只查结构，不查语义真伪）
python3 derive_bee.py validate --candidate path/to/decode.json

# 调用真实模型（DeepSeek，OpenAI 兼容）；密钥只从环境变量读，不落盘
NESTING_API_KEY=sk-... python3 derive_bee.py live --transcript "你不要给别人添麻烦。"

# 全量测试
python3 -m unittest test_decode.py
```

环境变量：`NESTING_API_KEY`（必需）、`NESTING_MODEL`（默认 `deepseek-flash`）、`NESTING_ENDPOINT`（默认 `https://api.deepseek.com/chat/completions`）。

## 边界与诚实性

- **未配置密钥时不编造语气。** 服务端走 `derive_undecoded()`：只按字符拆单元，蜂体用中性默认值，并带 `notice` 与 `decoded: false`；画面必须显示"未解码"，不得让中性值冒充模型判断。
- **不做心理诊断。** 提示词禁止输出人格、疾病、恢复时间等结论；`tone.evidence` 只能引用可观察的语言特征。
- **证据文件如实写明来源。** 顶部一行由 `provenance_note()` 生成，分四种情况：人工占位示例（未调用模型）／由某个模型实时解码（注明是否重试）／导入的解码结果（来源与语义未验证）／来源未标注（不得当作模型结果使用）。有测试锁这四种措辞，禁止把模型结果标成占位、或反过来。
- **密钥不落盘、不回显、不进日志。** 传输复用 07-技术验证/nesting.py 的加固通道：子进程隔离、总超时 8 秒、禁止重定向、响应限长；失败最多重试一次。
- **转写不在这里做。** 语音识别尚未接入，`--transcript` 由调用方提供；录音采集见 `web/interaction/voice.mjs`。

## 重新生成映射表

映射表由 `derive_bee.py` 的**同一实现**生成，不要手改。改了派生公式却没重新生成，`test_mapping_table_is_not_stale` 会直接失败——这条守卫已实测有效（把翅膀频率公式从 1.6 改成 1.7，测试立刻报错）。

```sh
python3 10-语言解码/derive_bee.py demo --md 10-语言解码/映射表.md
```
