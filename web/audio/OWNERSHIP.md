# web/audio/ 所有权

- 负责方：声音 AI（Claw，2026-09-08）。
- `audio.mjs`：实现 docs/INTEGRATION_CONTRACT.md v0.1 的声音 ES module（createAudio：unlock/load/frame/setMuted/reset/dispose）；宿主时钟驱动，不自建时钟。
- `tests/audio.test.mjs`：12 项无头测试（node --test）。
- 参数映射公式以 `09-声音设计/build_score.py` 为单一事实来源；本目录只是浏览器运行时适配，修改公式须先改 build_score 并同步离线 score 与测试。
- **取整约定**：本文件内的 `roundHalfUp`（half-up，`.5` 进位）必须与 `build_score.round_half_up` 和 `web/visual/js/config.js` 的 `roundHalfUp` 保持一致；禁止改回 Python 内置 `round()` 或换用其它舍入方式，否则沉积节拍会与视觉失配。
- 音色为正弦占位；最终音色与现场音量由 Scott 调整。
- 接入：由交互负责人在 `web/interaction/config.js` 设置 `audioModuleUrl: '/web/audio/audio.mjs'` 后联调；本目录不修改交互与视觉代码。
- 2026-09-11 新增 `bee-voice.mjs`：每只蜂出生时的一声。语气 → 音色（和缓用协和音程与慢起音，尖锐掺不协和音程与噪声），由 `config.beeVoiceModuleUrl` 加载。与 `audio.mjs` 分工：那边是整条时间线的环境声（score 驱动），这边是单只蜂的一声；两者互不干扰，各自有测试。语气映射是艺术选择，不评价说话人。
