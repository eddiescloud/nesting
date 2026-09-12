# 交互模块

负责三种入口（走进一个故事 / 写下两句话 / 说一句话）、输入格式检查、60 秒统一时间线、暂停/继续、重播、退出清空、全屏与独立模块生命周期。视觉入口为文字结构蜂（`web/visual/` iframe），声音为 `web/audio/audio.mjs`（默认静音）。

「说一句话」入口：`voice.mjs` 采集麦克风录音（只在本机回放，不落盘、不上传），停止录音立刻归还音轨；转写（ASR）未接入，需观众自己把话写进输入框；文字再经 `POST /api/decode` 解码后生长为一只蜂。密钥只从环境变量 `NESTING_API_KEY` 读取，服务端不落盘、不回显。

## 启动

项目根目录运行 `python3 web/interaction/server.py --port 8765`，打开 http://127.0.0.1:8765/。也可双击根目录“启动交互预览.command”，自动选空闲端口并打开浏览器。关闭启动终端或按 Ctrl+C 停止服务。

只绑定本机地址，无安装依赖和 build。Python 3（本机验证 3.9.6），浏览器支持 ES modules；Node.js 仅用于测试（本机验证 26.7.0）。

## 接视觉 / 声音

遵循 `docs/INTEGRATION_CONTRACT.md`。在 config.js 填写同源入口：视觉 URL、声音 ES module URL。默认均 null，不请求未就绪的模块。视觉用 iframe，宿主提供每秒约 30 次绝对时间 frame，不要另起播放时钟。

本地服务默认只发布 web/interaction、web/visual、web/audio 下的静态文件；若使用其他目录，整合负责人需要同步修改发布范围。不得发布整个桌面或凭证文件。

## 模块结构

- app.js：界面与事件协调。
- voice.mjs：麦克风采集与隐私生命周期（`VoiceRecorder`）、解码请求（`decodeTranscript`）、解码结果 → 视觉规格（`beeSpecFrom`）。
- session.mjs：独立状态与时间线；退出删除 session 与参数引用。
- bridge.mjs：视觉消息与声音生命周期；拒绝其他来源及过期会话。
- server.py：静态页面、预设读取、输入检查；直接复用 07-技术验证/nesting.py。
- presets.json：新增两份人工故事，原始故事仍直接读取 04-AI转译 的文件。

个人输入只发送到本机内存检查；不记录日志、不写文件、不发送模型。退出、切换回故事、清空或离开页面都会清理表单。它不能生成个人视觉结果。

## 测试

项目根目录执行：

```sh
node --test web/interaction/tests/session.test.mjs
python3 -m unittest discover -s web/interaction/tests -p 'test_*.py' -v
(cd 07-技术验证 && python3 -m unittest -v test_nesting.py)
```

17 项状态/桥接测试 + 6 项录音/解码测试 + 9 项跨模块集成测试 + 15 项本机服务测试 + 12 项既有校验测试通过。浏览器测试记录见 docs/INTERACTION_QA.md。

```sh
node --test web/interaction/tests/voice.test.mjs
node --test web/interaction/tests/integration.test.mjs
```
