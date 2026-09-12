# 模块对接协议 · v0.1

2026-09-08：交互负责人先建立的实现约定。若视觉/声音已有接口，先提交适配建议，保留原实现，不互相覆盖。

## 文件归属

- 交互与整合：`web/interaction/`、`启动交互预览.command`、本文件、交互测试与交接记录。
- 视觉负责人：建议 `web/visual/`，不得修改交互状态管理；目录不同可由配置指定入口。
- 声音负责人：建议 `web/audio/`，不得另起播放时钟。
- `04-AI转译/output.schema.json` 为既有输出结构；本轮不更改。
- 共享 docs 修改前重新读取，保留他人的追加内容。模型接入已于 2026-09-11 恢复：DeepSeek 只做语言解码，密钥只走环境变量 `NESTING_API_KEY`；转写（ASR）仍未接入。

## 宿主时钟与生命周期

交互使用原生 ES Modules，通过 iframe 接视觉（兼容不同图形引擎），音频使用独立 ES module。统一时间线总长 60 秒：opening 0–8、first 8–20、second 20–32、weave 32–47、settle 47–57、remain 57–60。

视觉入口同源。URL 由 `web/interaction/config.js` 指定；默认 null，不请求不存在的页面。交互页面收到正确 origin、iframe source、协议版本的 ready 后才启动对接。

消息基本形状：`{ channel: "nesting", version: "0.1", type, sessionId, payload }`。

宿主发：
- `hello`：询问是否 ready，可在 iframe load 时收到。
- `load`：新 sessionId；payload 为 `{ output, sourceText?, beeSpec?, source, duration: 60, reducedMotion }`。output 仍为既有 schema 的对象（现为脚手架）；`sourceText` 是可选的离线转写来源，仅用于让视觉原型证明“文字结构生蜂”，不包含 context/feeling。此时准备好但不开始运动。
- `frame`：payload 为 `{ time, phase, playing }`；宿主提供秒数。暂停后不得继续自走，须支持从时间恢复场景。
- `reset`：清空全部粒子、轨迹、引用及本轮数据；之后 frame 不得复活旧数据。

视觉发：
- `ready`：支持协议且可接收 load/frame/reset（回应 hello，或初始化后发送）。
- `error`：带当前 sessionId；payload.message 为简短错误文字。

无视觉时交互显示“分镜预览”：只呈现故事与当前阶段，不冒充蜂群动画。模块缺失、加载失败仍能退出重置。

## 声音 ES module（可选）

配置 audioModuleUrl 为同源模块地址。导出 `createAudio()`，返回对象：
- `unlock()`：用户点击“开启声音”时同步调用；可返回 Promise，用来恢复 AudioContext。
- `load({ output, duration, source })`：载入手工参数。
- `frame({ time, phase, playing })`：跟随宿主，不自建第二个全局时钟。
- `setMuted(boolean)`：控制静音。
- `reset()`：停止声音并清空本轮状态。
- `dispose()`：释放资源。

默认静音；未配置时不出现无效开关。输出事件和字段由声音模块自行映射，但不得将人工参数标为真实 AI 结果。

> 2026-09-08 声音负责人补充：接口已按本协议实现于 `web/audio/audio.mjs`（含 12 项无头测试）。层参数公式与 `09-声音设计/build_score.py` 保持同一来源，deposit 事件即 47–57 秒的逐对沉积节拍，可与视觉的沉积粒子逐条对应。待交互负责人设置 `audioModuleUrl: '/web/audio/audio.mjs'` 联调。
>
> 2026-09-11 补充：结对数与沉积数的取整统一为 half-up（`.5` 进位），三处实现须同步（`build_score.round_half_up`、`web/visual/js/config.js`、`web/audio/audio.mjs`）；禁止使用 Python 内置 `round()`。`score.schema.json` 的 `events.maxItems = 54` 对应最坏情况（weave=1.0 / settle=1.0）。

## 语言解码与 beeSpec（2026-09-11 新增）

转写文本先经 `10-语言解码/` 解码：模型给语义，`derive_bee.py` 按固定公式派生出蜂体规格。
交互层把结果作为 `load` 的可选字段 `beeSpec` 传给视觉：

```
beeSpec = { wingbeatHz, tension, spacing, hue, posture, bodyScale,
            bodyWidth, bodyHeight, segmentCount,
            decoded: boolean,   // false = 未接入模型，画面必须标注“未解码”
            caption: string,    // 例如“语气：压抑 · 方向：向内”或“未解码 · 语气与含义未接入模型”
            decode: object|null } // 模型的原始判断（见下），未接入模型时为 null
```

- 缺省 `beeSpec` 时视觉使用中性默认值，并把 `decoded` 视为 false，画面上必须出现未解码标注。
- `sourceText` 与 `beeSpec` 都是可选字段，旧调用方不传也能正常播放（向后兼容）。
- 视觉不得自行编造语气或含义；它只消费 `beeSpec` 并如实标注来源。

### `decode` 字段（2026-09-12 新增）

`beeSpec.decode` 是解码层对这句声音的**原始判断**，与 `10-语言解码/examples/decode.*.json` 同构：

```
decode = {
  tone:    { label, intensity, pace, evidence },
  meaning: { gist, direction, weight, keywords[] },
  segments:[ { text, role, weight } ],   // role ∈ head|wing|thorax|abdomen|stinger
  uncertainty: string
}
```

视觉的「理解过程」层（`web/visual/js/reading.js`）只消费这一个字段，把它逐层画出来：

- `decode` 为 `null`（未接入模型）时，**只画「未解码」**，不画任何语气词、含义或不确
  定性文本，绝不把中性默认值显示成模型判断。
- 视觉不修改、不补全 `decode` 的内容；缺某层（例如没有 `tone`）就跳过该层，不猜一个补上。
- 分段层用几何标记表示 `role`（圆=头、波=翅、方=胸、条=腹、三角=尾针），
  观众靠这一层看懂后面蜂为什么长成那样。

## 群蜂与每只蜂的声音（2026-09-11 新增）

`load` 的可选字段 `bees` 描述"画面里还有哪些语言的蜂"：

@@
bees = [ { transcript, beeSpec, decoded, tone, appearAt } ]
@@

- 主蜂（正在生长的那只）由 `sourceText` 与顶层 `beeSpec` 决定；`bees` 里与主蜂同一句的条目不重复出现。
- `appearAt` 是这只蜂出现的时间（秒）；不填则按视觉的 `SWARM_VIEW` 默认节奏。**出现时间以载荷为准**：交互层据此触发这只蜂的声音，视觉据此让它出现在画面里，两边读同一个值。
- 视野缩放由视觉的 `config.CAMERA` 决定（17 秒前近景、17–34 秒拉远），只作用于蜂这一层；声纹是背景，始终铺满画面。

蜂的声音是独立模块 `web/audio/bee-voice.mjs`（`createBeeVoice()` → `unlock/play/setMuted/stopAll/dispose`）。
语气 → 音色是**艺术映射**：和缓的语气用协和音程与慢起音，尖锐的语气掺入不协和音程与噪声。它不评价说话人，也不做心理判断；未解码时取中性。

## 转写（ASR）接入点（2026-09-11 新增，尚未接入）

DeepSeek 不提供语音识别接口，ASR 方案未定。在此之前录音**不离开页面**：

- `GET /api/transcribe`：能力探测，返回 `{ available: false, notice, accepts }`。客户端据此提示观众自己写文字。
- `POST /api/transcribe`：当前一律 `501`，服务端不读取、不保存、不转发音频。
- 客户端 `voice.mjs::transcribeCapability()` 在探测失败时也按「不可用」处理，**绝不猜测可用**。

将来接入时（本地 whisper / 云 ASR / 浏览器识别）必须同步三处：服务端实现转发并把 `available` 改为真实能力、客户端在录音结束后调用它填入输入框、界面隐私说明改成与真实数据流向一致（若音频会离开本机，必须显式告知观众）。

## 必须满足

快速重复开始只能有一个 session；退出、换故事、页面隐藏时暂停或清理；完成时声音停止，画面保留到重播/退出。重播生成新 session。

个人输入只驻留当前表单，不持久化；退出清空。录音（`voice.mjs`）同样只在本机内存中，停止录音立即归还音轨，退出释放回放地址。

模型未配置时：只能验证输入格式，或走 `derive_undecoded()` 的「未解码」路径；不得把中性默认值显示成模型判断。模型已配置时，送往模型的是**转写文本**，不是音频；界面必须说明这一点。
