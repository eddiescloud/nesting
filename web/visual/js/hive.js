/**
 * 筑巢 / Nesting · 蜂巢（巢由语言筑成）
 * ------------------------------------------------------------
 * 2026-09-11 起取代人体贴图（body-texture.js 降为脚手架，入口不再加载）。
 *
 * 演示后段（19–34 秒）：
 *   - 19–31s：主蜂的同源影像（印记，不代表新的语言输入）从四野飞来，落进巢房；
 *   - 蜂影落定后，该巢房的六边形短描边点亮，房内填入一个来自现场语句的字——
 *     主蜂原句的字先从巢心开始，其他蜂的字随巢房向外循环取用；
 *   - 25–34s：整面巢脾的淡影渐渐可见（取代旧人体贴图的 9% 淡入）。
 *
 * 巢脾为程序化生成的平顶六边形巢房，水滴形悬垂轮廓（顶部窄、中部宽、底部收窄），
 * 全部确定性推导，无外部素材。绘制与过渡共用宿主时钟；reset 清空缓存印记。
 */
(function () {
  'use strict';

  /* ---- 巢脾区域与巢房几何（竖屏 1080×1920） ---- */
  const RECT = { x: 225, y: 220, width: 630, height: 1356 };
  const HEX_R = 44;            // 巢房半径（中心到顶点）
  const HEART_Y = 0.42;        // 巢心在巢脾高度上的比例（主蜂最终悬停处）

  /* ---- 时间（秒），随 2026-09-12 节奏压缩（用户反馈整体太慢） ---- */
  const FLY_START = 19;        // 蜂影从四野出发
  const FLY_STAGGER = 4;       // 印记出发先后错落总宽
  const FLY_SECONDS = 8;       // 单个印记飞行时长（落定 = FLY_START + FLY_SECONDS 起）
  const WALL_SECONDS = 1.3;    // 落定后巢房点亮的过渡
  const REVEAL_START = 25;     // 整面巢脾淡影
  const REVEAL_SECONDS = 9;
  const BLEND_START = 20;      // 主蜂与别的蜂向巢位过渡（progress 供 bee.js 使用）
  const BLEND_SECONDS = 13;

  const STAMP_COUNT = 72;      // 蜂影数量（同一来源的重复印记）
  const HIVE_COLOR = { h: 42, s: 64, l: 62 };   // 蜜色描边
  const CHAR_COLOR = { h: 44, s: 46, l: 80 };   // 房内字色

  class HiveModule {
    constructor(params, config) {
      this.config = config;
      this.rect = RECT;
      const cx = RECT.x + RECT.width / 2;
      this.heart = { x: cx, y: RECT.y + RECT.height * HEART_Y };
      this.cells = this._buildCells();
      this.ready = true; // 无外部素材：构造即可用（旧人体贴图以 image 判空）
      this.reset();
    }

    reset() { this.time = 0; this.stamp = null; }

    update(dt, phase, progress, time) { this.time = time; }

    /** 主蜂 / 别的蜂向巢位过渡的进度（20 → 33 秒）。 */
    progress(time = this.time) {
      return this.config.smoothstep(Math.max(0, Math.min(1, (time - BLEND_START) / BLEND_SECONDS)));
    }

    /** 别的蜂的巢位：巢房已按离巢心距离排序，按序号均匀取用。 */
    target(index, count) {
      if (!this.cells.length) return null;
      const cell = this.cells[Math.round((index + 0.5) / Math.max(1, count) * (this.cells.length - 1))];
      return { x: cell.x, y: cell.y };
    }

    /** 水滴形悬垂巢：平顶六边形按列排布，列宽随高度按 sin 轮廓收放；从巢心向外排序。 */
    _buildCells() {
      const r = HEX_R;
      const h = Math.sqrt(3) * r;              // 平顶六边形的高度（上下平边）
      const colStep = 1.5 * r;
      const { x: rx, y: ry, width: rw, height: rh } = this.rect;
      const cx = rx + rw / 2;
      const cols = Math.floor((rw - 2 * r) / colStep) + 1;
      const rows = Math.floor((rh - h) / h) + 1;
      const cells = [];
      for (let i = 0; i < cols; i += 1) {
        const x = cx + (i - (cols - 1) / 2) * colStep;
        const yOff = (i % 2) * (h / 2);
        for (let k = 0; k < rows; k += 1) {
          const y = ry + h / 2 + k * h + yOff;
          if (y + h / 2 > ry + rh) continue;
          const yn = (y - ry) / rh;
          const half = Math.sin(Math.PI * Math.pow(yn, 0.9)) * (rw / 2 - r * 0.6);
          if (half <= r || Math.abs(x - cx) > half) continue;
          cells.push({ x, y });
        }
      }
      for (const cell of cells) cell.d = Math.hypot(cell.x - this.heart.x, cell.y - this.heart.y);
      cells.sort((a, b) => a.d - b.d);
      return cells;
    }

    /** 房内字池：主蜂原句在前，其他蜂的句子随后；全部来自现场语句，可逐格追溯。 */
    _charPool() {
      const bee = this.bee;
      if (!bee) return [];
      const pool = bee.segments.map(segment => segment.char);
      for (const other of bee.others || []) {
        for (const segment of other.segments) pool.push(segment.char);
      }
      return pool;
    }

    /** 平顶六边形描边：六条边各留缺口，短粗线段、圆角端头——与蜂的会徽风笔画同一语言。 */
    _strokeHex(ctx, x, y, r) {
      const GAP = 0.14; // 每条边两端各留 14% 缺口
      for (let k = 0; k < 6; k += 1) {
        const a1 = k * Math.PI / 3;
        const a2 = (k + 1) * Math.PI / 3;
        const x1 = x + Math.cos(a1) * r, y1 = y + Math.sin(a1) * r;
        const x2 = x + Math.cos(a2) * r, y2 = y + Math.sin(a2) * r;
        ctx.moveTo(x1 + (x2 - x1) * GAP, y1 + (y2 - y1) * GAP);
        ctx.lineTo(x1 + (x2 - x1) * (1 - GAP), y1 + (y2 - y1) * (1 - GAP));
      }
    }

    /** 蜂影落定时刻：第 i 只落在 27 + 先后错落 秒。 */
    _landTime(i, count) { return FLY_START + FLY_SECONDS + (i / Math.max(1, count)) * FLY_STAGGER; }

    draw(ctx) {
      const t = this.time;
      if (t < FLY_START) return;
      const smooth = v => this.config.smoothstep(Math.max(0, Math.min(1, v)));
      const reveal = smooth((t - REVEAL_START) / REVEAL_SECONDS);
      const count = Math.min(STAMP_COUNT, this.cells.length);
      if (!count) return;
      const pool = this._charPool();
      const charSize = Math.sqrt(3) * HEX_R * 0.34;

      // 整面巢脾的淡影（25–34s 渐显）：未点亮的巢房也以低透明度浮现
      if (reveal > 0) {
        ctx.save();
        ctx.strokeStyle = this.config.hsl(HIVE_COLOR, 0.55);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.globalAlpha = reveal * 0.12;
        ctx.beginPath();
        for (const cell of this.cells) this._strokeHex(ctx, cell.x, cell.y, HEX_R);
        ctx.stroke();
        ctx.restore();
      }

      // 蜂影：从环上出发落进巢房（同一来源的重复印记，不是新的语言输入）
      if (this.bee) {
        if (!this.stamp) {
          const b = this.bee;
          const layout = b._layout();
          this.stamp = document.createElement('canvas');
          this.stamp.width = 180; this.stamp.height = 180;
          const c = this.stamp.getContext('2d');
          c.translate(90, 100); c.scale(125 / layout.length, 125 / layout.length);
          b._paintBee(c, { segments: b.segments, strokes: b.strokes, spec: b.spec,
            layout, growth: 1, flight: 1, fillPlaces: b._fillLayout(layout),
            points: b._outlinePoints(layout, 0.7, 1), phaseOffset: 0 }, 1);
        }
        for (let i = 0; i < count; i += 1) {
          const p = smooth((t - FLY_START - (i / count) * FLY_STAGGER) / FLY_SECONDS);
          if (p <= 0) continue;
          const cell = this.cells[i];
          const lit = smooth((t - this._landTime(i, count)) / WALL_SECONDS);
          const angle = i * 2.399963; // 黄金角
          const ox = 540 + Math.cos(angle) * 440;
          const oy = 920 + Math.sin(angle) * 690;
          const x = ox + (cell.x - ox) * p;
          const y = oy + (cell.y - oy) * p;
          ctx.save();
          ctx.globalAlpha = p * (0.58 - 0.3 * lit); // 落定后蜂影伏在巢房上，让出房内字
          ctx.drawImage(this.stamp, x - 35, y - 35, 70, 70);
          ctx.restore();
        }
      }

      // 点亮的巢房：蜂影落定后六边形增亮，房内填入一个来自现场语句的字
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i += 1) {
        const lit = smooth((t - this._landTime(i, count)) / WALL_SECONDS);
        if (lit <= 0) continue;
        const cell = this.cells[i];
        ctx.strokeStyle = this.config.hsl(HIVE_COLOR, 0.9);
        ctx.lineWidth = 5;
        ctx.globalAlpha = lit * 0.5;
        ctx.beginPath();
        this._strokeHex(ctx, cell.x, cell.y, HEX_R);
        ctx.stroke();
        if (pool.length) {
          ctx.globalAlpha = lit * 0.6;
          ctx.fillStyle = this.config.hsl(CHAR_COLOR, 1);
          ctx.font = charSize + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pool[i % pool.length], cell.x, cell.y);
        }
      }
      ctx.restore();
    }
  }

  window.HiveModule = HiveModule;
})();
