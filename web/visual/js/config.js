/**
 * 筑巢 / Nesting · 动画原型共享配置
 * ------------------------------------------------------------
 * 所有动画模块共享的常量、颜色、物理参数与 output.schema.json 参数映射。
 * 变更此处会影响全部模块；模块自身的局部常量写在各自文件内。
 *
 * 设计画布：1080 × 1920（竖屏 9:16），运行时按容器等比缩放。
 * 速度公式以 1080 高画布为基准，实际按 DESIGN_HEIGHT / 1080 缩放。
 */

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;
const HEIGHT_SCALE = DESIGN_HEIGHT / 1080; // 速度/距离缩放因子

/* ---- 时间线（秒），与 02-体验与分镜.md 对齐 ---- */
const TIMELINE = {
  total: 60,
  phases: [
    { name: 'idle',     start: 0,  end: 8  },  // 平静人形等待
    { name: 'enter_a',  start: 8,  end: 20 },  // 第一组蜂群进入
    { name: 'enter_b',  start: 20, end: 32 },  // 第二组蜂群进入
    { name: 'weave',    start: 32, end: 47 },  // 两组交织
    { name: 'settle',   start: 47, end: 57 },  // 沉积薄层
    { name: 'hold',     start: 57, end: 60 },  // 静止存留
  ],
};

/* ---- 颜色 ---- */
const COLORS = {
  background: '#0a0a12',
  // 两组固定、亮度相近的色相；颜色用于识别来源，不编码好坏
  groupA: { h: 38,  s: 85, l: 62 },  // 暖琥珀
  groupB: { h: 182, s: 75, l: 60 },  // 冷青蓝
  humanoid: {
    fill: 'rgba(20, 22, 35, 0.85)',
    outline: 'rgba(120, 130, 170, 0.25)',
    glow: 'rgba(140, 150, 200, 0.08)',
  },
  weaveLine: { alpha: 0.55 },
  depositMesh: { alpha: 0.4 },
};

/* ---- 蜂群物理（与 03-蜂群与融合规则.md 对齐） ---- */
const SWARM = {
  particlesPerGroup: 48,
  // 速度 = 12 + 60 × energy 像素/秒（1080 高基准），运行时乘 HEIGHT_SCALE
  baseSpeed: 12,
  speedRange: 60,
  // 群体半径 = 20 + 100 × dispersion 像素
  baseRadius: 20,
  radiusRange: 100,
  // 扰动幅度 = 2 + 22 × turbulence 像素
  baseTurbulence: 2,
  turbulenceRange: 22,
  // 残留透明度 = 0.12 + 0.48 × trace
  baseTraceAlpha: 0.12,
  traceAlphaRange: 0.48,
  // 轨迹点数量（影响拖尾长度），与 trace 成比例
  minTrailPoints: 4,
  maxTrailPoints: 40,
  // 粒子大小
  particleSize: 3.2,
  particleGlow: 12,
};

/* ---- 交织与沉积 ---- */
const WEAVE = {
  // 连线在 weave 阶段内的淡入时长占比
  lineFadeInRatio: 0.4,
  // 沉积在 settle 阶段内的形成时长占比
  depositFormRatio: 0.5,
  // 未沉积连线淡出时长占比
  undepositedFadeRatio: 0.6,
  // 薄层网格连线宽度
  meshLineWidth: 1.2,
  // 结对连线宽度
  pairLineWidth: 1.6,
};

/* ---- 文字结构蜂（最小可行性原型） ---- */
const BEE = {
  // 一只蜂先消费一段转写文字；后续可由解码层改为 bee spec。
  maxCharacters: 32,
  baseBodyWidth: 250,
  baseBodyHeight: 190,
  segmentWidth: 7,
  wingWidth: 112,
  wingHeight: 58,
  headRadius: 38,
  wingbeatHz: 2.2,
};

/* ---- 人形内部区域（一组椭圆近似身体轮廓，粒子约束在此空间内） ---- */
const HUMANOID = {
  // 以画布中心为原点的身体椭圆定义 [cx_offset, cy_offset, rx, ry]
  // 头部
  head:   [0, -680, 105, 130],
  // 颈部
  neck:   [0, -530, 55, 70],
  // 上胸
  chest:  [0, -380, 200, 180],
  // 下腹
  abdomen:[0, -120, 175, 200],
  // 骨盆
  pelvis: [0, 80, 160, 120],
  // 左大腿
  thighL: [-85, 280, 80, 180],
  // 右大腿
  thighR: [85, 280, 80, 180],
  // 左小腿
  shinL:  [-85, 520, 65, 170],
  // 右小腿
  shinR:  [85, 520, 65, 170],
  // 左上臂
  armUL:  [-230, -340, 65, 140],
  // 右上臂
  armUR:  [230, -340, 65, 140],
  // 左前臂
  armLL:  [-250, -140, 55, 130],
  // 右前臂
  armLR:  [250, -140, 55, 130],
};

/* ---- 拆解阶段（整句 → 单元 → 蜂体）---- */
const DECOMPOSE = {
  sentenceUntil: 1.6, // 0–1.6s：整句停留，尚未拆开（最初 5s，用户两次反馈节奏太慢）
  flyUntil: 8,        // 1.6–8s：文字单元逐个飞入腹节带（最初 20s）
  stagger: 0.45,      // 每个单元延迟出发的比例（按文字顺序）
};

/* ---- 视野（拉远看到更多蜂）----
 * 13 秒前保持近距离看这一只；13–27 秒视野拉远，画面里出现其他语言的蜂。 */
const CAMERA = {
  holdUntil: 13,      // 这段时间是近景：只有正在生长的这只
  zoomOutUntil: 27,   // 之后拉到最远
  startScale: 1,
  endScale: 0.44,     // 拉太远会显得空：0.44 下三只蜂仍能占住画面
};

/* ---- 群蜂布局（每只蜂代表一段语言）---- */
const SWARM_VIEW = {
  baseRadius: 560,    // 第一只「别的蜂」离中心的距离（世界坐标）
  radiusStep: 210,    // 每多一只往外挪一点
  appearGap: 3,       // 相邻两只出现的间隔（秒）
  firstAppearAt: 15,  // 第一只「别的蜂」出现的时间
  birthSeconds: 2.4,  // 单只蜂出现的过渡时长
  minScale: 0.82,     // 别的蜂不能太小，否则拉远后看不见
  maxScale: 1.0,
};

/* ---- 蜂体规格默认值（与 10-语言解码/derive_bee.py 的派生字段一一对应）----
 * decoded=false 表示语气/含义未经模型解码，蜂体为中性默认值，界面必须标注。 */
const NEUTRAL_BEE = {
  wingbeatHz: 2.2,
  tension: 0.5,
  spacing: 1.0,
  hue: 38,
  posture: 'level',
  bodyScale: 1.0,
  decoded: false,
  caption: '',
};

/* ---- 语言传播涟漪（一句话说出口，离开身体，再也收不回来）----
 * 蜂体成形后，从蜂的位置向外推出同心波纹，扩散到画面边缘消失。
 * 波面上的短笔画呼应蜂体的会徽风笔画轮廓：语言离开身体时笔画已被拆散，
 * 所以这里只取最简形态（线段 / 点 / 弧），不再对应具体的字。
 *
 * 派生关系（可追溯）：
 *   波速   = baseSpeed + speedRange × (wingbeatHz − 1.6) / 1.8
 *            wingbeatHz 由语气强度派生（1.6 + 1.8 × intensity）
 *            → 说得越激动，语言传得越快
 *   波强度 = 0.45 + 0.55 × tension
 *            tension 由语气强度与分量派生（0.5 × intensity + 0.5 × weight）
 *            → 分量越重，波越粗、越持久
 */
const RIPPLE = {
  firstAt: 10.5,      // 第一圈发出的时间（蜂体基本成形：8s 达 75%，13s 完全成形）
  gap: 2.4,           // 相邻两圈的间隔（秒）
  count: 4,           // 一共几圈
  baseSpeed: 165,     // 扩散速度基准（像素/秒）
  speedRange: 135,    // 语气强度带来的速度增量（wingbeatHz 1.6→3.4 映射为 0→135）
  maxRadius: 1180,    // 扩散到这个半径即消失（到画面边缘之外）
  baseWidth: 4.6,     // 起始线宽
  strokeGap: 30,      // 圆周上每隔多少像素放一个短笔画（虚线感）
  strokeLen: 14,      // 短笔画长度
  minAlpha: 0.85,     // 起始不透明度
  originYRatio: 0.46, // 波心在画面高度上的比例（与蜂的稳定位置一致）
};

/* ---- AI 的理解过程（把「机器怎么听懂这句话」画出来）----
 * 观众说完一句话，画布上部依次展开四层分析：
 *   语气扫描 → 含义提取 → 分段归位 → 不确定性
 * 每一层都是解码层真实给出的判断，不是装饰；未接入模型时只显示
 * 「听到」与「未解码」，绝不编造语气与含义（与项目红线一致）。
 *
 * 无状态：每层的展开程度只由「当前时间 − 该层起始」算出，
 * 因此暂停会冻结、倒退会收回、重播会清空。
 */
const READING = {
  toneFrom: 2.5, toneTo: 5.2,        // 语气扫描：10 个语气词轮转后停在选中项
  meaningFrom: 5.2, meaningTo: 7.6,  // 含义提取：概括 / 方向 / 分量 / 关键词
  segmentFrom: 7.6, segmentTo: 10.0, // 分段归位：每段标出部位与分量
  doubtFrom: 10.0, doubtTo: 11.6,    // 不确定性：这次解码不能确定什么
  fadeOutAt: 13.2,                   // 之后整层淡出，把画面还给蜂与涟漪
  bandTop: 208,                      // 分析带顶部 y（蜂在 0.46 高度，互不遮挡）
  rowGap: 64,                        // 层与层之间的行距
  labelSize: 18,                     // 层名（听到 / 语气 / 含义 / 分段）
  bodySize: 23,                      // 正文（判断内容）
  noteSize: 15,                      // 小字（证据 / 不确定性）
  toneSize: 21,                      // 语气词
  scanSeconds: 1.8,                  // 扫描针扫完 10 个词所需时间
  barWidth: 210,                     // 强度 / 节奏 / 分量的刻度条宽度
  barHeight: 5,
};

/* ---- 工具函数 ---- */

/** 将 0-1 参数映射为实际速度（像素/秒，已按画布缩放） */
function speedFor(energy) {
  return (SWARM.baseSpeed + SWARM.speedRange * energy) * HEIGHT_SCALE;
}

/** 将 0-1 参数映射为群体半径（像素，已按画布缩放） */
function radiusFor(dispersion) {
  return (SWARM.baseRadius + SWARM.radiusRange * dispersion) * HEIGHT_SCALE;
}

/** 将 0-1 参数映射为扰动幅度（像素，已按画布缩放） */
function turbulenceFor(turbulence) {
  return (SWARM.baseTurbulence + SWARM.turbulenceRange * turbulence) * HEIGHT_SCALE;
}

/** 将 0-1 参数映射为残留透明度 */
function traceAlphaFor(trace) {
  return SWARM.baseTraceAlpha + SWARM.traceAlphaRange * trace;
}

/** 将 0-1 参数映射为轨迹点数量 */
function trailPointsFor(trace) {
  return roundHalfUp(
    SWARM.minTrailPoints + (SWARM.maxTrailPoints - SWARM.minTrailPoints) * trace
  );
}

/** HSL 颜色对象转 css 字符串 */
function hsl(c, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${a})`;
}

/** 混合两个 HSL 颜色（简单线性插值） */
function mixHSL(c1, c2, t) {
  return {
    h: c1.h + (c2.h - c1.h) * t,
    s: c1.s + (c2.s - c1.s) * t,
    l: c1.l + (c2.l - c1.l) * t,
  };
}

/** 限制值在 [min, max] */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * 与 Python 端 build_score.round_half_up 语义一致的取整：.5 一律进位（输入为非负数）。
 * 项目中所有跨语言共享的计数（结对数、沉积数）必须走本函数，
 * 不得使用 Math.round 以外的写法，也不得依赖 Python 内置 round（银行家舍入）。
 * 修改须同步 09-声音设计/build_score.py 与 web/audio/audio.mjs。
 */
function roundHalfUp(value) {
  return Math.floor(Number(value) + 0.5);
}

/** 线性插值 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 平滑插值（smoothstep） */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/** 判断点是否在人形内部任意椭圆中 */
function isInsideHumanoid(x, y) {
  const cx = DESIGN_WIDTH / 2;
  const cy = DESIGN_HEIGHT / 2;
  for (const key of Object.keys(HUMANOID)) {
    const [ox, oy, rx, ry] = HUMANOID[key];
    const dx = (x - (cx + ox)) / rx;
    const dy = (y - (cy + oy)) / ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

/** 将点推回人形内部（若在外部），返回修正后的坐标 */
function constrainToHumanoid(x, y) {
  if (isInsideHumanoid(x, y)) return { x, y };
  // 找到最近的椭圆中心，朝该方向推回
  const cx = DESIGN_WIDTH / 2;
  const cy = DESIGN_HEIGHT / 2;
  let bestDist = Infinity;
  let bestX = cx;
  let bestY = cy;
  for (const key of Object.keys(HUMANOID)) {
    const [ox, oy, rx, ry] = HUMANOID[key];
    const ex = cx + ox;
    const ey = cy + oy;
    const d = (x - ex) * (x - ex) + (y - ey) * (y - ey);
    if (d < bestDist) {
      bestDist = d;
      bestX = ex;
      bestY = ey;
    }
  }
  // 朝最近椭圆中心移动 10%
  return {
    x: x + (bestX - x) * 0.1,
    y: y + (bestY - y) * 0.1,
  };
}

/* ---- 模块导出（浏览器全局） ---- */
window.NestingConfig = {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  HEIGHT_SCALE,
  TIMELINE,
  COLORS,
  SWARM,
  WEAVE,
  BEE,
  DECOMPOSE,
  CAMERA,
  SWARM_VIEW,
  NEUTRAL_BEE,
  RIPPLE,
  READING,
  HUMANOID,
  speedFor,
  radiusFor,
  turbulenceFor,
  traceAlphaFor,
  trailPointsFor,
  hsl,
  mixHSL,
  clamp,
  roundHalfUp,
  lerp,
  smoothstep,
  isInsideHumanoid,
  constrainToHumanoid,
};
