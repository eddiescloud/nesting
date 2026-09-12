// Integration owners set these only after their modules are ready.
export const config = Object.freeze({
  visualUrl: '/web/visual/index.html', // 视觉模块已就绪（50 项无头测试通过），2026-09-08 启用
  audioModuleUrl: '/web/audio/audio.mjs', // 2026-09-11 启用；声音模块 12 项无头测试通过，三方联调已跑通
  beeVoiceModuleUrl: '/web/audio/bee-voice.mjs', // 每只蜂出生时的一声；语气 → 音色（和缓 ↔ 尖锐）
  duration: 60,
});
