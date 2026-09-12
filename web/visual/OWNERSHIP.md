# 视觉模块归属

本目录由人形 / 蜂群运动 / 交织与沉积动画模块 AI 维护。

## 负责内容

- 文字结构蜂（`js/bee.js`）：整句 → 逐字拆解飞入 → 蜂体，形态由 `beeSpec` 驱动
- 人形轮廓与内部空间（`js/humanoid.js`，2026-09-11 起降为脚手架，入口不再加载）
- 两组蜂群粒子运动、进入与轨迹（`js/swarm.js`）
- 交织结对连线与薄层沉积（`js/weave.js`）
- 60 秒时间线编排（`js/timeline.js`）
- 共享配置与参数映射（`js/config.js`）
- 宿主通信适配（`js/host-adapter.js`，实现 docs/INTEGRATION_CONTRACT.md v0.1）
- 主入口与画布（`js/main.js`、`index.html`、`css/style.css`）

## 与其他模块的边界

- 不修改 `web/interaction/`（交互与状态管理由交互 AI 负责）。
- 不修改 `web/audio/`（声音由声音 AI 负责）。
- 不修改 `04-AI转译/output.schema.json`（既有输出结构，本轮不更改）。
- 共享 `docs/` 修改前重新读取，保留他人追加内容。
- 通过 `docs/INTEGRATION_CONTRACT.md` 的 postMessage 协议与交互宿主通信，不直接调用交互模块内部代码。
- `load` 的 `beeSpec` 字段由 `10-语言解码/` 派生：本目录只消费它并如实标注来源，**不得自行编造语气或含义**；`beeSpec.decoded === false` 时画面必须显示「未解码」。

## 集成方式

- 交互宿主通过 iframe 加载本目录 `index.html`。
- 交互模块 `web/interaction/config.js` 的 `visualUrl` 应设为 `'/web/visual/index.html'`（由交互负责人在模块就绪后设置）。
- 独立打开 `index.html` 时进入本地时钟模式，显示开始/暂停/重播控件。

## 设计文档

模块设计、参数映射、已知限制见 `08-视觉原型/README.md`。
