/**
 * 筑巢 / Nesting · 文字结构蜂（会徽风笔画轮廓 · 原句填充 · 群蜂）
 * ------------------------------------------------------------
 * 一段语言 → 一只可辨识、可追溯的蜂。视野拉远后，画面里出现其他语言的蜂：
 * 每只蜂的颜色来自它那句话的语气，位置与出现时间由确定性布局给出。
 *
 * 造型规则（2026-09-11 会徽参考图定基调，2026-09-12 修出蜜蜂解剖结构）：
 *   - 蜂体是侧视的头、胸、腹三段椭圆，段间留出腰部缺口；腹部带 4 条语气色相的横纹；
 *   - 翅膀是半透明膜翅（近侧前后两片 + 远侧一片），带脉络、随翅频扇动；
 *   - 头部有侧视复眼与两根弯触角，胸下有三对腿；
 *   - 蜂的轮廓由「短笔画」沿头胸腹三段排布组成，笔画种类按该句字符顺序取用并循环铺满；
 *   - 笔画用短粗线段（或点/钩/弧）画出，方向沿轮廓切线，整体疏朗如会徽；
 *   - 蜂体内部填充的是那句话本身（按蜂体宽度折行，裁剪在轮廓内）；
 *   - 上色、翅频、腹部长短、姿态由该只蜂的 beeSpec 驱动。
 *
 * 笔画来源：常用字按内置「字 → 笔画类型」表（粗略参考该字最显眼的笔画，非字形拆解）；
 * 表外字按字符码确定性回退到 8 种笔画之一。
 *
 * 时间结构：0–1.6s 整句停留 → 1.6–8s 逐字飞入 → 13s 成形，同时视野开始拉远，
 * 其他蜂按 SWARM_VIEW 的节奏陆续出现（每只出现时由外部触发它的声音）。
 */
(function () {
  'use strict';

  // 8 种笔画图元（沿轮廓方向画短粗线段/点/弧/钩）。代号见 STROKES。
  const STROKE_CODES = ['h', 's', 'p', 'd', 't', 'j', 'g', 'c'];

  /**
   * 笔画图元字典。
   *  kind: line = 沿一个方向画短粗线段；
   *        dot  = 一个点；
   *        hook = 竖+末尾小钩；
   *        bend = 横+末尾折角；
   *        arc  = 一段弧。
   *  (dx, dy) 是线段/钩的「主方向」，渲染时会以轮廓切线角 + 此相对角合成；
   *  lengthRatio 是相对默认长度的倍数。
   */
  const STROKES = {
    h: { kind: 'line', dx: 1,  dy: 0,    lengthRatio: 1.0 },  // 横
    s: { kind: 'line', dx: 0,  dy: 1,    lengthRatio: 1.0 },  // 竖
    p: { kind: 'line', dx: 0.7, dy: -0.7, lengthRatio: 0.95 }, // 撇
    d: { kind: 'dot' },                                          // 点
    t: { kind: 'line', dx: -0.7, dy: 0.7,  lengthRatio: 0.95 },  // 提
    j: { kind: 'hook', dx: 0, dy: 1,       lengthRatio: 1.0 },   // 竖钩
    g: { kind: 'bend', dx: 1, dy: 0,       lengthRatio: 1.0 },   // 横折
    c: { kind: 'arc' },                                          // 弧
  };

  /**
   * 字符 → 笔画类型。粗略对应该字最显眼的一笔，不是字形拆解；
   * 演示句与常用字均已覆盖。
   */
  const CHAR_STROKE = {
    '你': 'p', '们': 'p', '他': 'p', '什': 'p', '作': 'p', '住': 'p', '体': 'p',
    '可': 'g', '以': 'p', '慢': 'h', '了': 'd', '及': 'j', '要': 'g', '并': 'h', '共': 'h',
    '说': 'd', '话': 'd', '记': 'd', '请': 'd', '谁': 'd', '该': 'd',
    '快': 'h', '怕': 'h', '情': 'h', '想': 'h', '感': 'h', '忘': 'h', '意': 'h', '心': 'h',
    '给': 'g', '红': 'g', '累': 'g', '别': 'j', '到': 'j', '刚': 'j',
    '添': 'd', '没': 'd', '泪': 'd', '水': 's', '海': 's', '活': 's',
    '烦': 'h', '点': 'd', '火': 'h', '然': 'h',
    '不': 'h', '上': 'h', '下': 'h', '天': 'h', '大': 'h', '头': 'h', '今': 'p', '人': 'p',
    '来': 's', '本': 's', '木': 's', '相': 's', '样': 's', '极': 's',
    '很': 't', '得': 't', '往': 't', '气': 'd', '好': 'h', '妈': 'h', '姐': 'h', '女': 'h',
    '我': 'j', '时': 'h', '是': 'h', '明': 'h', '日': 'h', '间': 'g', '问': 'g', '门': 'g',
    '都': 'j', '那': 'j', '部': 'j', '有': 'c', '朋': 'c', '服': 'c', '的': 'c', '白': 'c',
    '在': 's', '地': 's', '土': 's', '这': 't', '过': 't', '道': 't', '还': 't', '走': 't',
    '就': 'j', '会': 'p', '能': 'c', '做': 'p', '为': 'd', '去': 'h', '中': 's', '小': 'h',
    '少': 'h', '多': 'h', '家': 'c', '安': 'c', '定': 'c', '友': 'c', '又': 'c', '父': 'c',
    '老': 'c', '师': 'g', '同': 'g', '学': 'c', '子': 'c', '生': 'p', '工': 'h', '事': 'h',
    '觉': 'c', '见': 'c', '知': 'd', '看': 'c', '眼': 'c', '目': 'h', '听': 'd', '哭': 'h',
    '麻': 'c', '面': 'c', '手': 's', '脚': 'c', '笑': 'h', '竹': 's', '爱': 'c', '花': 'g',
    '草': 'g', '菜': 'g', '药': 'g', '钱': 'g', '银': 'g', '铁': 'g', '饭': 'g', '饿': 'g',
    '狗': 'j', '猫': 'j', '蜂': 'c', '蜜': 'c', '鸟': 'h', '鱼': 'h', '马': 'h', '车': 'h',
    '路': 'j', '跑': 'j', '身': 'p', '雨': 'd', '雪': 'd', '风': 'h', '食': 'g',
  };

  const BEND = { curl: -1, level: 0, open: 1 };
  const OUTLINE_STEP = 24;

  class BeeModule {
    constructor(params, config, sourceText = '', spec = null) {
      this.params = params || {};
      this.config = config;
      const fromParams = (params && (params.beeSpec || params.bee)) || null;
      this.spec = Object.assign({}, config.NEUTRAL_BEE, fromParams || {}, spec || {});
      this.sourceText = this._pickSourceText(sourceText);
      this.characters = Array.from(this.sourceText)
        .filter(char => /\S/u.test(char))
        .slice(0, config.BEE.maxCharacters);
      if (this.characters.length === 0) this.characters = Array.from('一句话');
      this.segments = this.characters.map((char, index) => this._measure(char, index));
      this.strokes = this.characters.map(char => this._strokeFor(char));
      this.others = this._buildOthers(params);
      this.reset();
    }

    /** 其他语言的蜂：颜色与形状各自由自己的 beeSpec 决定，位置由确定性布局给出。 */
    _buildOthers(params) {
      const list = (params && Array.isArray(params.bees)) ? params.bees : [];
      const layout = this.config.SWARM_VIEW;
      const mine = this.sourceText;
      return list
        .filter(entry => entry && typeof entry.transcript === 'string' && entry.transcript.trim() && entry.transcript.trim() !== mine)
        .map((entry, k) => {
          const view = this.config.SWARM_VIEW;
          const angle = k * 2.399963;
          const radius = view.baseRadius + k * view.radiusStep;
          const text = entry.transcript.trim();
          const spec = Object.assign({}, this.config.NEUTRAL_BEE, entry.beeSpec || entry.bee || {},
                                     { decoded: Boolean(entry.decoded), caption: '' });
          const characters = Array.from(text).filter(char => /\S/u.test(char))
            .slice(0, this.config.BEE.maxCharacters);
          const segments = characters.map((char, index) => this._measure(char, index));
          return {
            text, spec, characters, segments,
            strokes: characters.map(char => this._strokeFor(char)),
            appearAt: typeof entry.appearAt === 'number'
              ? entry.appearAt : layout.firstAppearAt + k * layout.appearGap,
            world: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.72,
                     scale: view.minScale + ((k % 3) * (view.maxScale - view.minScale)) / 2,
                     rotation: Math.sin(angle) * 0.12 },
            growth: 0,
            flight: 1,
          };
        });
    }

    /** 字符 → 笔画。表内是该字最显眼的笔画；表外按字符码确定性回退（不是字形拆解）。 */
    _strokeFor(char) {
      const code = CHAR_STROKE[char];
      if (code && STROKES[code]) return { code, kind: STROKES[code].kind, exact: true, from: char };
      const charCode = char.codePointAt(0) || 0;
      const fallback = STROKE_CODES[(charCode * 2654435761 >>> 0) % STROKE_CODES.length];
      return { code: fallback, kind: STROKES[fallback].kind, exact: false, from: char };
    }

    _pickSourceText(sourceText) {
      if (typeof sourceText === 'string' && sourceText.trim()) return sourceText.trim();
      if (typeof this.params.sourceText === 'string' && this.params.sourceText.trim()) {
        return this.params.sourceText.trim();
      }
      const events = this.params.input?.events;
      if (Array.isArray(events)) {
        const text = events.map(event => event?.utterance || '').filter(Boolean).join(' ');
        if (text.trim()) return text.trim();
      }
      return '有些话会留下';
    }

    _measure(char, index) {
      const code = char.codePointAt(0) || 0;
      const hash = (code * 2654435761 + index * 1013904223) >>> 0;
      return {
        char, index,
        width: 0.78 + ((hash >>> 5) % 23) / 100,
        height: 0.72 + ((hash >>> 12) % 25) / 100,
        lift: (((hash >>> 19) % 21) - 10) / 100,
        hue: 34 + ((hash >>> 24) % 28),
        phase: (hash % 628) / 100,
      };
    }

    reset() {
      this.animTime = 0;
      this.currentTime = 0;
      this.phase = 'idle';
      this.growth = 0;
      this.visibleCount = 0;
      this.flight = 0;
      this.x = this.config.DESIGN_WIDTH / 2;
      this.y = this.config.DESIGN_HEIGHT / 2;
      for (const other of this.others) other.growth = 0;
    }

    /** 已出现的「别的蜂」只数与最早的出现时间，供外部触发声音等用途。 */
    bornOthers(time = this.currentTime) {
      return this.others.filter(other => time >= other.appearAt);
    }

    update(dt, phase, phaseProgress, totalTime) {
      this.animTime += Math.max(0, Number(dt) || 0);
      this.currentTime = Math.max(0, Number(totalTime) || 0);
      this.phase = phase || 'idle';
      this.growth = this._growthAt(this.currentTime);
      this.visibleCount = Math.min(
        this.segments.length,
        Math.max(0, Math.ceil(this.segments.length * this.growth))
      );

      const decompose = this.config.DECOMPOSE;
      this.flight = Math.max(0, Math.min(1,
        (this.currentTime - decompose.sentenceUntil) /
        (decompose.flyUntil - decompose.sentenceUntil)));

      const birth = this.config.SWARM_VIEW.birthSeconds;
      for (const other of this.others) {
        other.growth = Math.max(0, Math.min(1, (this.currentTime - other.appearAt) / birth));
      }

      const { DESIGN_WIDTH, DESIGN_HEIGHT } = this.config;
      const centerX = DESIGN_WIDTH / 2;
      const centerY = DESIGN_HEIGHT * 0.46;
      const entry = this.config.smoothstep(Math.max(0, Math.min(1, (this.currentTime - 1) / 6)));
      const drift = Math.sin(this.animTime * 0.7) * 14;
      const targetX = centerX + drift;
      const targetY = centerY + Math.sin(this.animTime * 0.45) * 9;
      this.x = centerX + (targetX - centerX) * entry;
      this.y = DESIGN_HEIGHT * 0.92 + (targetY - DESIGN_HEIGHT * 0.92) * entry;
      if (this.hive && this.hive.ready) {
        const camera = this.config.CAMERA;
        const zoom = this.config.smoothstep(Math.max(0, Math.min(1,
          (this.currentTime - camera.holdUntil) / (camera.zoomOutUntil - camera.holdUntil))));
        const scale = camera.startScale + (camera.endScale - camera.startScale) * zoom;
        const center = DESIGN_HEIGHT / 2;
        this.y += (center + (this.hive.heart.y - center) / scale - this.y) * this.hive.progress(this.currentTime);
      }
    }

    _growthAt(time) {
      const { sentenceUntil, flyUntil } = this.config.DECOMPOSE;
      const holdUntil = this.config.CAMERA.holdUntil;
      if (time < sentenceUntil) return 0.02;
      if (time < flyUntil) return 0.05 + 0.70 * ((time - sentenceUntil) / (flyUntil - sentenceUntil));
      if (time < holdUntil) return 0.75 + 0.25 * ((time - flyUntil) / (holdUntil - flyUntil));
      return 1;
    }

    _flightProgress(i, count) {
      const stagger = this.config.DECOMPOSE.stagger;
      const start = (i / Math.max(1, count)) * stagger;
      return Math.max(0, Math.min(1, (this.flight - start) / (1 - stagger)));
    }

    _sentencePos(i, count) {
      const advance = Math.min(46, (this.config.DESIGN_WIDTH * 0.62) / Math.max(1, count));
      const total = advance * count;
      return { x: -total / 2 + advance * (i + 0.5), y: -this._layout().length * 0.62 };
    }

    /** 蜂体几何：头、胸、腹三段，段间留出腰部缺口。 */
    _layoutFor(segments, spec) {
      const count = segments.length;
      const length = (this.config.BEE.baseBodyWidth + Math.min(count, 18) * this.config.BEE.segmentWidth)
        * spec.bodyScale;
      return {
        count, length,
        abdomen: { cx: -length * 0.21, rx: Math.min(0.27 * spec.spacing, 0.28) * length, ry: length * 0.235 },
        thorax: { cx: length * 0.19, r: length * 0.105 },
        head: { cx: length * 0.415, r: length * 0.085 },
      };
    }

    _layout() {
      return this._layoutFor(this.segments, this.spec);
    }

    /** 姿态造成的弯曲：curl 尾部下沉、open 尾部上翘，越靠尾越明显。 */
    _bendOffset(x, layout, spec) {
      const bend = BEND[spec.posture] ?? 0;
      if (!bend) return 0;
      const span = layout.abdomen.rx * 2;
      const u = Math.max(0, Math.min(1, (x - (layout.abdomen.cx - layout.abdomen.rx)) / span));
      return -bend * Math.pow(1 - u, 2) * layout.length * 0.06;
    }

    /** 内部文字折行：按蜂体宽度切成若干行，逐字给出落点。 */
    _fillLayoutFor(layout, segments, centerY = 0, spec = this.spec) {
      const width = layout.abdomen.rx * 1.55;
      const size = Math.max(16, Math.min(30, width / 7));
      const perLine = Math.max(3, Math.floor(width / size));
      const lines = [];
      for (let i = 0; i < segments.length; i += perLine) {
        lines.push(segments.slice(i, i + perLine));
      }
      const lineHeight = size * 1.25;
      const places = [];
      lines.forEach((line, row) => {
        const y = centerY + (row - (lines.length - 1) / 2) * lineHeight;
        line.forEach((segment, col) => {
          const x = layout.abdomen.cx + (col - (line.length - 1) / 2) * size;
          places[segment.index] = { x, y: y + this._bendOffset(x, layout, spec), size };
        });
      });
      return places;
    }

    _fillLayout(layout, centerY = 0) {
      return this._fillLayoutFor(layout, this.segments, centerY);
    }

    /** 单元当前位置：整句位置 → 腹部落点 */
    _unitPlace(i, count, bodyWidth, spacing, bodyHeight, bodyTop) {
      const from = this._sentencePos(i, count);
      const layout = this._layout();
      const to = this._fillLayout(layout, bodyTop || 0)[i] || { x: 0, y: 0 };
      const p = this.config.smoothstep(this._flightProgress(i, count));
      return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
    }

    _drawSentenceLayer(ctx, count, bodyHeight) {
      if (this.flight >= 1) return;
      const advance = Math.min(46, (this.config.DESIGN_WIDTH * 0.62) / Math.max(1, count));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < count; i += 1) {
        const remaining = 1 - this.config.smoothstep(this._flightProgress(i, count));
        if (remaining <= 0.01) continue;
        const at = this._sentencePos(i, count);
        ctx.globalAlpha = remaining * 0.9;
        ctx.fillStyle = this.config.hsl(this.config.COLORS.groupA, 0.85);
        ctx.font = Math.min(46, advance * 0.86) + 'px serif';
        ctx.fillText(this.segments[i].char, at.x, at.y);
      }
      ctx.restore();
    }

    _drawSeed(ctx) {
      const warm = { h: this.spec.hue, s: this.config.COLORS.groupA.s, l: this.config.COLORS.groupA.l };
      ctx.fillStyle = this.config.hsl(warm, 0.6);
      ctx.shadowColor = this.config.hsl(warm, 0.75);
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + this.growth * 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    /** 沿蜂形轮廓取点：每个点会放一个笔画。只取头胸腹三段身体；翅膀与触角由 _paintBee 直接画。 */
    _outlinePointsFor(layout, wingSpread, beat, settled) {
      const points = [];
      const pushEllipse = (cx, cy, rx, ry, rotation) => {
        const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
        const n = Math.max(5, Math.round(perimeter / OUTLINE_STEP));
        for (let i = 0; i < n; i += 1) {
          const t = (i / n) * Math.PI * 2;
          const cos = Math.cos(t), sin = Math.sin(t);
          points.push({ x: cx + cos * rx, y: cy + sin * ry,
                        angle: Math.atan2(cos * ry, -sin * rx) + (rotation || 0) });
        }
      };
      const { abdomen, thorax, head } = layout;
      pushEllipse(abdomen.cx, 0, abdomen.rx, abdomen.ry, 0);
      pushEllipse(thorax.cx, 0, thorax.r, thorax.r, 0);
      pushEllipse(head.cx, -head.r * 0.1, head.r, head.r * 0.92, 0);
      return points;
    }

    _outlinePoints(layout, beat, wingSpread) {
      return this._outlinePointsFor(layout, wingSpread, beat, this.currentTime >= this.config.CAMERA.holdUntil);
    }

    /** 画一只蜂：内部填充 + 笔画轮廓 + 尾针。state 可以是主蜂或「别的蜂」。 */
    _paintBee(ctx, state, alpha) {
      const { COLORS } = this.config;
      const spec = state.spec;
      const hue = spec.hue;
      const layout = state.layout;
      const segments = state.segments;
      const count = segments.length;
      const beat = Math.sin(this.animTime * spec.wingbeatHz * Math.PI * 2 + (state.phaseOffset || 0));
      const wingSpread = spec.posture === 'open' ? 1.25 : 1;

      // 膜翅在身体后面：半透明、带脉络，随 beat 扇动
      this._paintWings(ctx, layout, spec, beat, wingSpread, alpha, state.growth);

      // 身体：头胸腹三段暗底，段间留腰
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(layout.abdomen.cx, 0, layout.abdomen.rx, layout.abdomen.ry, 0, 0, Math.PI * 2);
      ctx.ellipse(layout.thorax.cx, 0, layout.thorax.r, layout.thorax.r, 0, 0, Math.PI * 2);
      ctx.ellipse(layout.head.cx, -layout.head.r * 0.1, layout.head.r, layout.head.r * 0.92, 0, 0, Math.PI * 2);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = this.config.hsl({ h: hue - 8, s: 40, l: 9 }, 0.85);
      ctx.fill();
      ctx.restore();

      // 腹部横纹：语气色相的横带，裁在腹部里，随身体弯曲
      this._paintAbdomenStripes(ctx, layout, spec, alpha, state.growth);

      // 内部：裁剪三段身体，填入那句话
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(layout.abdomen.cx, 0, layout.abdomen.rx, layout.abdomen.ry, 0, 0, Math.PI * 2);
      ctx.ellipse(layout.thorax.cx, 0, layout.thorax.r, layout.thorax.r, 0, 0, Math.PI * 2);
      ctx.ellipse(layout.head.cx, -layout.head.r * 0.1, layout.head.r, layout.head.r * 0.92, 0, 0, Math.PI * 2);
      ctx.clip();
      const places = state.fillPlaces;
      for (let i = 0; i < count; i += 1) {
        const segment = segments[i];
        const start = i / Math.max(1, count);
        const segmentGrowth = Math.max(0, Math.min(1, (state.growth - start * 0.45) / 0.55));
        const flown = state.flight >= 1 ? 1 : this._flightProgress(i, count);
        const shown = Math.max(segmentGrowth, flown);
        if (shown <= 0.01) continue;
        const eased = this.config.smoothstep(shown);
        const base = places[i] || { x: 0, y: 0, size: 22 };
        let at = base;
        if (state.flight < 1) {
          const from = this._sentencePos(i, count);
          const p = this.config.smoothstep(flown);
          at = { x: from.x + (base.x - from.x) * p, y: from.y + (base.y - from.y) * p, size: base.size };
        }
        ctx.globalAlpha = alpha * (0.15 + eased * 0.75);
        ctx.fillStyle = this.config.hsl({ h: hue + (segment.hue - 38) * 0.35, s: 82, l: 74 }, 0.9);
        ctx.font = (at.size || base.size) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(segment.char, at.x, at.y);
      }
      ctx.restore();

      // 轮廓：会徽风短笔画
      const points = state.points;
      ctx.save();
      for (let i = 0; i < points.length; i += 1) {
        const slot = i / points.length;
        const show = Math.max(0, Math.min(1, (state.growth - slot * 0.55) / 0.45));
        if (show <= 0.01) continue;
        const point = points[i];
        const stroke = state.strokes[i % state.strokes.length];
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(point.angle);
        ctx.globalAlpha = alpha * (0.25 + show * 0.75);
        ctx.strokeStyle = stroke.exact
          ? this.config.hsl({ h: hue, s: 72, l: 62 }, 0.95)
          : this.config.hsl({ h: hue + 16, s: 52, l: 52 }, 0.8);
        this._drawStroke(ctx, stroke, show);
        ctx.restore();
      }
      ctx.restore();

      // 头：复眼 + 弯触角；胸下：三对腿
      this._paintHeadDetails(ctx, layout, spec, alpha, state.growth);
      this._paintLegs(ctx, layout, spec, alpha, state.growth);

      // 尾针
      ctx.save();
      const tipY = (BEND[spec.posture] ?? 0) * layout.length * 0.06;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = this.config.hsl({ h: hue - 12, s: 40, l: 26 }, 1);
      ctx.beginPath();
      ctx.moveTo(layout.abdomen.cx - layout.abdomen.rx * 0.94, tipY - 5);
      ctx.lineTo(layout.abdomen.cx - layout.abdomen.rx * 1.14, tipY);
      ctx.lineTo(layout.abdomen.cx - layout.abdomen.rx * 0.94, tipY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /** 膜翅：半透明椭圆 + 脉络，根在胸背，随 beat 扇动。 */
    _paintWings(ctx, layout, spec, beat, wingSpread, alpha, growth) {
      const show = this.config.smoothstep(Math.max(0, Math.min(1, ((growth == null ? 1 : growth) - 0.45) / 0.4)));
      if (show <= 0.01) return;
      const { thorax, length } = layout;
      const rootX = thorax.cx, rootY = -thorax.r * 0.85;
      const wings = [
        { len: 0.34, wid: 0.088, ang: -2.5, flap: 0.14, tint: 0.10, edge: 0.26 },
        { len: 0.46, wid: 0.115, ang: -1.95, flap: 0.22, tint: 0.18, edge: 0.42 },
        { len: 0.33, wid: 0.095, ang: -1.6, flap: 0.18, tint: 0.14, edge: 0.32 },
      ];
      ctx.save();
      ctx.lineCap = 'round';
      for (const wing of wings) {
        const ang = wing.ang + beat * wing.flap;
        const len = length * wing.len * wingSpread;
        const wid = length * wing.wid;
        const cx = rootX + Math.cos(ang) * len * 0.5;
        const cy = rootY + Math.sin(ang) * len * 0.5;
        ctx.globalAlpha = alpha * show;
        ctx.fillStyle = this.config.hsl({ h: spec.hue + 25, s: 25, l: 85 }, wing.tint);
        ctx.strokeStyle = this.config.hsl({ h: spec.hue + 20, s: 30, l: 80 }, wing.edge);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, len * 0.5, wid * 0.5, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = alpha * show * 0.8;
        ctx.strokeStyle = this.config.hsl({ h: spec.hue + 20, s: 30, l: 78 }, wing.edge * 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rootX, rootY);
        ctx.lineTo(rootX + Math.cos(ang) * len * 0.86, rootY + Math.sin(ang) * len * 0.86);
        ctx.moveTo(rootX + Math.cos(ang) * len * 0.4, rootY + Math.sin(ang) * len * 0.4);
        ctx.lineTo(rootX + Math.cos(ang + 0.16) * len * 0.62, rootY + Math.sin(ang + 0.16) * len * 0.62);
        ctx.stroke();
      }
      ctx.restore();
    }

    /** 腹部横纹：4 条横向带，颜色取自语气色相，带形随身体弯曲。 */
    _paintAbdomenStripes(ctx, layout, spec, alpha, growth) {
      const show = this.config.smoothstep(Math.max(0, Math.min(1, ((growth == null ? 1 : growth) - 0.2) / 0.5)));
      if (show <= 0.01) return;
      const { abdomen } = layout;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(abdomen.cx, 0, abdomen.rx, abdomen.ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = this.config.hsl({ h: spec.hue, s: 68, l: 46 }, 1);
      const steps = 8;
      for (const u of [-0.55, -0.18, 0.18, 0.55]) {
        const half = abdomen.rx * 0.10;
        const bx = abdomen.cx + u * abdomen.rx;
        ctx.globalAlpha = alpha * show * 0.42;
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const x = bx - half + (2 * half * i) / steps;
          const v = Math.max(0, 1 - Math.pow((x - abdomen.cx) / abdomen.rx, 2));
          const y = -abdomen.ry * Math.sqrt(v) + this._bendOffset(x, layout, spec);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = steps; i >= 0; i -= 1) {
          const x = bx - half + (2 * half * i) / steps;
          const v = Math.max(0, 1 - Math.pow((x - abdomen.cx) / abdomen.rx, 2));
          ctx.lineTo(x, abdomen.ry * Math.sqrt(v) + this._bendOffset(x, layout, spec));
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    /** 头部：侧视复眼 + 高光，头顶两根肘状弯触角。 */
    _paintHeadDetails(ctx, layout, spec, alpha, growth) {
      const show = this.config.smoothstep(Math.max(0, Math.min(1, ((growth == null ? 1 : growth) - 0.6) / 0.35)));
      if (show <= 0.01) return;
      const { head } = layout;
      const dark = this.config.hsl({ h: spec.hue - 10, s: 30, l: 8 }, 1);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.config.hsl({ h: spec.hue - 10, s: 35, l: 16 }, 1);
      ctx.lineWidth = Math.max(1.6, head.r * 0.09);
      ctx.globalAlpha = alpha * show * 0.9;
      const antennae = [
        { sx: 0.55, sy: -0.55, cx: 1.3, cy: -1.45, ex: 1.85, ey: -1.2 },
        { sx: 0.35, sy: -0.75, cx: 0.95, cy: -1.8, ex: 1.5, ey: -1.7 },
      ];
      for (const a of antennae) {
        ctx.beginPath();
        ctx.moveTo(head.cx + head.r * a.sx, head.r * a.sy);
        ctx.quadraticCurveTo(head.cx + head.r * a.cx, head.r * a.cy,
                             head.cx + head.r * a.ex, head.r * a.ey);
        ctx.stroke();
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(head.cx + head.r * a.ex, head.r * a.ey, head.r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha * show;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(head.cx + head.r * 0.2, -head.r * 0.15, head.r * 0.36, head.r * 0.44, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.config.hsl({ h: spec.hue + 20, s: 40, l: 88 }, 1);
      ctx.globalAlpha = alpha * show * 0.55;
      ctx.beginPath();
      ctx.arc(head.cx + head.r * 0.28, -head.r * 0.3, head.r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /** 胸下三对双节腿：近侧清晰，远侧更淡更短。 */
    _paintLegs(ctx, layout, spec, alpha, growth) {
      const show = this.config.smoothstep(Math.max(0, Math.min(1, ((growth == null ? 1 : growth) - 0.5) / 0.4)));
      if (show <= 0.01) return;
      const { thorax } = layout;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.config.hsl({ h: spec.hue - 10, s: 35, l: 14 }, 1);
      ctx.lineWidth = Math.max(1.6, thorax.r * 0.085);
      for (const side of [1, 0.55]) {
        ctx.globalAlpha = alpha * show * 0.6 * side;
        for (const dxr of [-0.5, 0.05, 0.55]) {
          const x = thorax.cx + thorax.r * dxr;
          const drop = thorax.r * (side === 1 ? 1 : 0.8);
          ctx.beginPath();
          ctx.moveTo(x, thorax.r * 0.7);
          ctx.lineTo(x - thorax.r * 0.3, thorax.r * 0.7 + drop * 0.75);
          ctx.lineTo(x - thorax.r * 0.05, thorax.r * 0.7 + drop * 1.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /**
     * 画一个会徽风笔画单元。位置和角度由调用方负责（translate/rotate 已就位）。
     * show: 0..1 的生长程度。
     */
    _drawStroke(ctx, stroke, show) {
      const def = STROKES[stroke.code];
      if (!def) return;
      const eased = this.config.smoothstep(show);
      const baseLen = 16 * def.lengthRatio * (0.6 + eased * 0.4);
      const baseWidth = 3.5 * (0.6 + eased * 0.6);
      ctx.lineWidth = baseWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const angle = Math.atan2(def.dy, def.dx);
      const cx = Math.cos(angle), cy = Math.sin(angle);
      if (def.kind === 'line') {
        ctx.beginPath();
        ctx.moveTo(-cx * baseLen / 2, -cy * baseLen / 2);
        ctx.lineTo(cx * baseLen / 2, cy * baseLen / 2);
        ctx.stroke();
      } else if (def.kind === 'dot') {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(0, 0, baseWidth * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.kind === 'hook') {
        // 竖 + 末钩
        ctx.beginPath();
        ctx.moveTo(0, -baseLen / 2);
        ctx.lineTo(0, baseLen / 2);
        ctx.lineTo(cx * baseLen * 0.35, baseLen / 2 + cy * baseLen * 0.35);
        ctx.stroke();
      } else if (def.kind === 'bend') {
        // 横 + 末折
        ctx.beginPath();
        ctx.moveTo(-cx * baseLen / 2, -cy * baseLen / 2);
        ctx.lineTo(cx * baseLen / 2, cy * baseLen / 2);
        ctx.lineTo(cx * baseLen / 2 + cy * baseLen * 0.45,
                   cy * baseLen / 2 - cx * baseLen * 0.45);
        ctx.stroke();
      } else if (def.kind === 'arc') {
        ctx.beginPath();
        ctx.arc(0, 0, baseLen * 0.45, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }

    draw(ctx) {
      const { COLORS, DECOMPOSE } = this.config;
      const alpha = this.growth <= 0.02 ? 0.25 : Math.min(1, 0.3 + this.growth * 0.75);
      const layout = this._layout();

      ctx.save();
      ctx.translate(this.x, this.y);

      // 0–2.5s：整句停留 + 微光
      if (this.currentTime < DECOMPOSE.sentenceUntil) {
        ctx.globalAlpha = alpha;
        this._drawSeed(ctx);
        this._drawSentenceLayer(ctx, this.segments.length, layout.length);
        ctx.restore();
        return;
      }
      ctx.globalAlpha = alpha;
      this._drawSentenceLayer(ctx, this.segments.length, layout.length);

      if (this.growth < 0.08 && this.flight <= 0) {
        this._drawSeed(ctx);
        ctx.restore();
        return;
      }

      // 先画「别的蜂」（在背景层），再画正在生长的这只
      const birthAlpha = Math.min(1, this.growth * 4);
      for (const other of this.others) {
        if (other.growth <= 0.01) continue;
        const otherLayout = this._layoutFor(other.segments, other.spec);
        const state = {
          segments: other.segments, strokes: other.strokes, spec: other.spec,
          layout: otherLayout, growth: other.growth, flight: 1,
          fillPlaces: this._fillLayoutFor(otherLayout, other.segments, 0, other.spec),
          points: this._outlinePointsFor(otherLayout, other.spec.posture === 'open' ? 1.25 : 1,
                                        Math.sin(this.animTime * other.spec.wingbeatHz * Math.PI * 2), true),
          phaseOffset: 1.3,
        };
        ctx.save();
        let px = other.world.x, py = other.world.y;
        if (this.hive) {
          const target = this.hive.target(this.others.indexOf(other), this.others.length);
          if (target) {
            const camera = this.config.CAMERA;
            const zoom = this.config.smoothstep(Math.max(0, Math.min(1,
              (this.currentTime - camera.holdUntil) / (camera.zoomOutUntil - camera.holdUntil))));
            const scale = camera.startScale + (camera.endScale - camera.startScale) * zoom;
            const cx = this.config.DESIGN_WIDTH / 2, cy = this.config.DESIGN_HEIGHT / 2;
            const blend = this.hive.progress(this.currentTime);
            px += (cx + (target.x - cx) / scale - this.x - px) * blend;
            py += (cy + (target.y - cy) / scale - this.y - py) * blend;
          }
        }
        ctx.translate(px, py);
        ctx.rotate(other.world.rotation);
        ctx.scale(other.world.scale * (0.9 + other.growth * 0.1), other.world.scale * (0.9 + other.growth * 0.1));
        this._paintBee(ctx, state, alpha * birthAlpha * this.config.smoothstep(other.growth));
        ctx.restore();
      }

      const state = {
        segments: this.segments, strokes: this.strokes, spec: this.spec, layout,
        growth: this.growth, flight: this.flight,
        fillPlaces: this._fillLayout(layout),
        points: this._outlinePoints(layout, Math.sin(this.animTime * this.spec.wingbeatHz * Math.PI * 2),
                                   this.spec.posture === 'open' ? 1.25 : 1),
        phaseOffset: 0,
      };
      this._paintBee(ctx, state, alpha);

      // 来源与解码状态：视野拉远后字号随之变小，所以只在近景显示
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = this.config.hsl({ h: this.spec.hue, s: COLORS.groupA.s, l: COLORS.groupA.l }, 0.85);
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const source = this.sourceText.length > 30 ? this.sourceText.slice(0, 30) + '…' : this.sourceText;
      ctx.fillText(source, 0, layout.length * 0.56);
      const caption = this.spec.caption || (this.spec.decoded ? '' : '未解码 · 语气与含义未接入模型');
      if (caption) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.font = '17px sans-serif';
        ctx.fillStyle = this.spec.decoded ? this.config.hsl(COLORS.groupB, 0.95) : 'rgba(214, 196, 150, 0.95)';
        ctx.fillText(caption, 0, layout.length * 0.56 + 28);
      }
      ctx.restore();

      ctx.restore();
    }
  }

  window.BeeModule = BeeModule;
})();
