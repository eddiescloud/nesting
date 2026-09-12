/** Existing CC0 human artwork; placement and reveal share the host clock.
 *  2026-09-11 起降为脚手架：蜂巢模块（js/hive.js，「巢由语言筑成」）取代人体贴图，
 *  入口（index.html）不再加载本文件；与 humanoid.js 一样仅作历史脚手架保留。 */
(function () {
  const assetURL = new URL('../assets/human-front.svg', document.currentScript.src).href;
  let shared;
  class BodyTextureModule {
    static load() {
      if (!shared) shared = new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => { console.warn('人体贴图加载失败，保留文字蜂画面'); resolve(null); };
        image.src = assetURL;
      });
      return shared;
    }
    constructor(params, config, image) {
      this.config = config;
      this.image = image;
      this.rect = { x: 225, y: 220, width: 630, height: 1356 };
      this.targets = [];
      if (image) {
        const mask = document.createElement('canvas');
        mask.width = 112; mask.height = 241;
        const ctx = mask.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, mask.width, mask.height);
        const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
        // Sample the actual asset, rather than inventing body geometry.
        for (let y = 8; y < 234; y += 4) {
          const row = [];
          for (let x = 0; x < 112; x++) if (pixels[(y * 112 + x) * 4 + 3] > 128) row.push(x);
          if (row.length) this.targets.push({ y: y / 241, xs: row.map(x => x / 112) });
        }
      }
      this.reset();
    }
    reset() { this.time = 0; this.stamp = null; }
    update(dt, phase, progress, time) { this.time = time; }
    progress(time = this.time) { return this.config.smoothstep(Math.max(0, Math.min(1, (time - 24) / 16))); }
    target(index, count) {
      if (!this.targets.length) return null;
      const row = this.targets[Math.round((index + 0.5) / Math.max(1, count) * (this.targets.length - 1))];
      const x = row.xs[Math.round((index % 2 ? 0.72 : 0.28) * (row.xs.length - 1))];
      return { x: this.rect.x + x * this.rect.width, y: this.rect.y + row.y * this.rect.height };
    }
    draw(ctx) {
      if (!this.image) return;
      const reveal = this.config.smoothstep(Math.max(0, Math.min(1, (this.time - 31) / 11)));
      // Repeated imprints of the same source bee, not newly decoded utterances.
      if (this.time >= 23 && this.bee && this.targets.length) {
        if (!this.stamp) {
          const b = this.bee, layout = b._layout();
          this.stamp = document.createElement('canvas');
          this.stamp.width = 180; this.stamp.height = 180;
          const c = this.stamp.getContext('2d');
          c.translate(90, 100); c.scale(125 / layout.length, 125 / layout.length);
          b._paintBee(c, { segments: b.segments, radicals: b.radicals, strokes: b.strokes, spec: b.spec,
            layout, growth: 1, flight: 1, fillPlaces: b._fillLayout(layout),
            points: b._outlinePoints(layout, 0.7, 1), phaseOffset: 0 }, 1);
        }
        const count = 72;
        for (let i = 0; i < count; i++) {
          const row = this.targets[Math.round((i + 0.5) / count * (this.targets.length - 1))];
          const edge = i % 2 ? 0.88 : 0.12;
          const tx = this.rect.x + row.xs[Math.round(edge * (row.xs.length - 1))] * this.rect.width;
          const ty = this.rect.y + row.y * this.rect.height;
          const p = this.config.smoothstep(Math.max(0, Math.min(1, (this.time - 23 - i / count * 5) / 10)));
          const angle = i * 2.399963;
          const ox = 540 + Math.cos(angle) * 440, oy = 920 + Math.sin(angle) * 690;
          const x = ox + (tx - ox) * p, y = oy + (ty - oy) * p;
          ctx.save(); ctx.globalAlpha = p * 0.58;
          ctx.drawImage(this.stamp, x - 35, y - 35, 70, 70); ctx.restore();
        }
      }
      if (!reveal) return;
      ctx.save();
      ctx.globalAlpha = reveal * 0.09;
      ctx.drawImage(this.image, this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      ctx.restore();
    }
  }
  window.BodyTextureModule = BodyTextureModule;
})();
