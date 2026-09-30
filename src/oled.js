/* ===== Dot-matrix OLED renderer =====
   A logical grid of W×H dots. Each dot has a brightness (0..1) and a colour index.
   Text uses a hand-drawn 3×5 bitmap font (scalable ×n) and PixelMplus10 (a 10px bitmap face) for Japanese. */
const GLYPHS = (() => {
  const g = {
    'A':['.#.','#.#','###','#.#','#.#'], 'B':['##.','#.#','##.','#.#','##.'], 'C':['.##','#..','#..','#..','.##'],
    'D':['##.','#.#','#.#','#.#','##.'], 'E':['###','#..','##.','#..','###'], 'F':['###','#..','##.','#..','#..'],
    'G':['.##','#..','#.#','#.#','.##'], 'H':['#.#','#.#','###','#.#','#.#'], 'I':['###','.#.','.#.','.#.','###'],
    'J':['..#','..#','..#','#.#','.#.'], 'K':['#.#','#.#','##.','#.#','#.#'], 'L':['#..','#..','#..','#..','###'],
    'M':['#...#','##.##','#.#.#','#...#','#...#'], 'N':['#..#','##.#','#.##','#..#','#..#'], 'O':['.##.','#..#','#..#','#..#','.##.'],
    'P':['##.','#.#','##.','#..','#..'], 'Q':['.##.','#..#','#..#','#.##','.###'], 'R':['##.','#.#','##.','#.#','#.#'],
    'S':['.##','#..','.#.','..#','##.'], 'T':['###','.#.','.#.','.#.','.#.'], 'U':['#.#','#.#','#.#','#.#','###'],
    'V':['#...#','#...#','.#.#.','.#.#.','..#..'], 'W':['#...#','#...#','#.#.#','##.##','#...#'], 'X':['#.#','#.#','.#.','#.#','#.#'],
    'Y':['#.#','#.#','.#.','.#.','.#.'], 'Z':['###','..#','.#.','#..','###'],
    'a':['...','.##','#.#','#.#','.##'], 'b':['#..','##.','#.#','#.#','##.'], 'c':['...','.##','#..','#..','.##'],
    'd':['..#','.##','#.#','#.#','.##'], 'e':['...','.#.','###','#..','.##'], 'f':['.##','#..','##.','#..','#..'],
    'g':['...','.##','#.#','.##','##.'], 'h':['#..','##.','#.#','#.#','#.#'], 'i':['#','.','#','#','#'],
    'j':['..#','...','..#','#.#','.#.'], 'k':['#..','#.#','##.','##.','#.#'], 'l':['##','.#','.#','.#','.#'],
    'm':['.....','####.','#.#.#','#.#.#','#.#.#'], 'n':['...','##.','#.#','#.#','#.#'], 'o':['...','.#.','#.#','#.#','.#.'],
    'p':['...','##.','#.#','##.','#..'], 'q':['...','.##','#.#','.##','..#'], 'r':['..','.#','#.','#.','#.'],
    's':['...','.##','.#.','..#','##.'], 't':['.#.','###','.#.','.#.','..#'], 'u':['...','#.#','#.#','#.#','.##'],
    'v':['.....','#...#','#...#','.#.#.','..#..'], 'w':['.....','#...#','#.#.#','#.#.#','.#.#.'], 'x':['...','#.#','.#.','.#.','#.#'],
    'y':['...','#.#','#.#','.##','##.'], 'z':['...','###','.#.','#..','###'],
    '0':['###','#.#','#.#','#.#','###'], '1':['.#.','##.','.#.','.#.','###'], '2':['##.','..#','.#.','#..','###'],
    '3':['##.','..#','.#.','..#','##.'], '4':['#.#','#.#','###','..#','..#'], '5':['###','#..','##.','..#','##.'],
    '6':['.##','#..','###','#.#','###'], '7':['###','..#','.#.','.#.','.#.'], '8':['###','#.#','###','#.#','###'],
    '9':['###','#.#','###','..#','##.'],
    ' ':['..','..','..','..','..'], '.':['.','.','.','.','#'], ',':['.','.','.','#','#'], ':':['.','#','.','#','.'],
    '-':['...','...','###','...','...'], '+':['...','.#.','###','.#.','...'], '/':['..#','..#','.#.','#..','#..'],
    '(':['.#','#.','#.','#.','.#'], ')':['#.','.#','.#','.#','#.'], '♯':['#.#','###','#.#','###','#.#'],
    '#':['#.#','###','#.#','###','#.#'], '♭':['#..','#..','##.','#.#','##.'], '°':['###','#.#','###','...','...'],
    '%':['#.#','..#','.#.','#..','#.#'], '?':['##.','..#','.#.','...','.#.'], '!':['#','#','#','.','#'],
    '=':['...','###','...','###','...'], '×':['...','#.#','.#.','#.#','...'], '·':['.','.','#','.','.'],
    "'":['#','#','.','.','.'], '_':['...','...','...','...','###'], '&':['.#.','#.#','.#.','#.#','.##'],
    '→':['..#..','...#.','#####','...#.','..#..'], '←':['..#..','.#...','#####','.#...','..#..'],
    '↑':['..#..','.###.','#.#.#','..#..','..#..'], '↓':['..#..','..#..','#.#.#','.###.','..#..'],
    '↗':['.####','...##','..#.#','.#..#','#....'], '↘':['#....','.#..#','..#.#','...##','.####'],
    '↙':['....#','#..#.','#.#..','##...','####.'], '↖':['####.','##...','#.#..','#..#.','....#'],
    '▶':['#..','##.','###','##.','#..'], '◀':['..#','.##','###','.##','..#'],
    '▲':['.....','..#..','.###.','#####','.....'], '▼':['.....','#####','.###.','..#..','.....'],
    '●':['.....','.###.','#####','#####','.###.'], '■':['...','###','###','###','...'], '♩':['.#','.#','.#','##','##'],
    '⇄':['..#.','####','....','####','.#..'], '○':['...','.#.','#.#','.#.','...'], '|':['#','#','#','#','#'],
  };
  const out = {};
  for (const k in g) out[k] = { w: g[k][0].length, rows: g[k].map(r => [...r].map(c => c === '#')) };
  return out;
})();

const OLED = {
  W: 200, H: 120, pitch: 5, buf: null, col: null, cv: null, ctx: null, glow: null, gctx: null, small: null, sctx: null, img: null,
  palette: [[243, 238, 226], [255, 181, 71], [255, 90, 74], [140, 220, 200]],
  jpCache: new Map(), jpCanvas: null, fontReady: false,
  init(cv, glow, grid) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.glow = glow; this.gctx = glow.getContext('2d'); this.grid = grid;
    this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
    this.jpCanvas = document.createElement('canvas'); this.jpCanvas.width = 512; this.jpCanvas.height = 20;
    if (document.fonts && document.fonts.load) document.fonts.load('10px "PixelMplus10"').then(() => { this.fontReady = true; this.jpCache.clear(); }).catch(() => {});
    this.resize();
  },
  resize() {
    const box = this.cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const devW = Math.max(100, Math.floor(box.width * dpr)), devH = Math.max(60, Math.floor(box.height * dpr));
    const p = Math.max(2, Math.round(devW / 200));
    this.pitch = p; this.W = Math.floor(devW / p); this.H = Math.floor(devH / p);
    this.buf = new Float32Array(this.W * this.H); this.col = new Uint8Array(this.W * this.H);
    this.small.width = this.W; this.small.height = this.H; this.img = this.sctx.createImageData(this.W, this.H);
    const cssW = this.W * p / dpr, cssH = this.H * p / dpr;
    for (const c of [this.cv, this.glow, this.grid]) {
      c.width = this.W * p; c.height = this.H * p; c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
      c.style.left = ((box.width - cssW) / 2) + 'px'; c.style.top = ((box.height - cssH) / 2) + 'px';
    }
    // unlit dot matrix (static)
    const g = this.grid.getContext('2d'); g.clearRect(0, 0, this.grid.width, this.grid.height);
    g.fillStyle = 'rgba(160,175,168,0.055)';
    const gap = Math.max(1, Math.round(p * 0.22));
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) g.fillRect(x * p, y * p, p - gap, p - gap);
    // gap mask pattern (draws dark gutters over the upscaled image)
    const pc = document.createElement('canvas'); pc.width = p; pc.height = p; const px = pc.getContext('2d');
    px.fillStyle = '#000'; px.fillRect(p - gap, 0, gap, p); px.fillRect(0, p - gap, p, gap);
    this.gapPattern = this.ctx.createPattern(pc, 'repeat'); this.gap = gap;
    this.dirty = true;
  },
  clear() { this.buf.fill(0); this.col.fill(0); },
  px(x, y, b = 1, c = 0) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x;
    if (b < 0) { this.buf[i] = 0; return; }   // negative brightness erases (inverted text)
    if (b >= this.buf[i]) { this.buf[i] = b; this.col[i] = c; }
  },
  rect(x, y, w, h, b = 1, c = 0) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, b, c); },
  erase(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const X = (x + i) | 0, Y = (y + j) | 0; if (X >= 0 && Y >= 0 && X < this.W && Y < this.H) this.buf[Y * this.W + X] = 0; } },
  frame(x, y, w, h, b = 1, c = 0) { for (let i = 0; i < w; i++) { this.px(x + i, y, b, c); this.px(x + i, y + h - 1, b, c); } for (let j = 0; j < h; j++) { this.px(x, y + j, b, c); this.px(x + w - 1, y + j, b, c); } },
  hline(x, y, w, b = 1, c = 0, dash = 0) { for (let i = 0; i < w; i++) if (!dash || (i % dash) === 0) this.px(x + i, y, b, c); },
  line(x0, y0, x1, y1, b = 1, c = 0) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 2000; n++) { this.px(x0, y0, b, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  },
  disk(cx, cy, r, b = 1, c = 0, fill = true) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (fill ? d <= r * r + r * 0.6 : Math.abs(Math.sqrt(d) - r) < 0.55) this.px(cx + x, cy + y, b, c); } },
  isAscii(str) { for (const ch of str) if (!GLYPHS[ch]) return false; return true; },
  textW(str, s = 1) { let w = 0, n = 0; for (const ch of str) { const g = GLYPHS[ch]; if (!g) continue; w += g.w; n++; } return (w + Math.max(0, n - 1)) * s; },
  /* draw text; returns width. opts: s (scale), b, c, align ('l'|'c'|'r'), mask (fn to skip dots, for reveal animations) */
  text(str, x, y, o = {}) {
    str = String(str);
    if (!this.isAscii(str)) return this.jp(str, x, y - (o.jpShift || 0), o);
    const s = o.s || 1, b = o.b == null ? 1 : o.b, c = o.c || 0;
    const w = this.textW(str, s);
    if (o.align === 'c') x = Math.round(x - w / 2); else if (o.align === 'r') x = Math.round(x - w);
    let cx = x;
    for (const ch of str) {
      const g = GLYPHS[ch]; if (!g) continue;
      for (let r = 0; r < 5; r++) for (let k = 0; k < g.w; k++) if (g.rows[r][k]) {
        if (s === 1) { if (!o.mask || o.mask(cx + k, y + r)) this.px(cx + k, y + r, b, c); }
        else for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) { const X = cx + k * s + xx, Y = y + r * s + yy; if (!o.mask || o.mask(X, Y)) this.px(X, Y, b, c); }
      }
      cx += (g.w + 1) * s;
    }
    return w;
  },
  /* Japanese: PixelMplus10 is drawn on a 10px pixel grid, so rendering at exactly 10px and
     thresholding gives the original bitmap glyphs, dot for dot. */
  jpBits(str) {
    const key = str; let e = this.jpCache.get(key); if (e) return e;
    const c = this.jpCanvas, x = c.getContext('2d', { willReadFrequently: true });
    if (c.width !== 640) { c.width = 640; c.height = 14; }
    x.clearRect(0, 0, c.width, c.height); x.font = '10px "PixelMplus10", monospace'; x.textBaseline = 'top'; x.fillStyle = '#fff';
    const w = Math.max(1, Math.min(c.width, Math.ceil(x.measureText(str).width))); x.fillText(str, 0, 1);
    const d = x.getImageData(0, 0, w, 12).data, h = 12, bits = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bits[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    e = { w, h, bits };
    if (this.fontReady) this.jpCache.set(key, e);
    return e;
  },
  jp(str, x, y, o = {}) {
    const e = this.jpBits(str), b = o.b == null ? 1 : o.b, c = o.c || 0;
    if (o.align === 'c') x = Math.round(x - e.w / 2); else if (o.align === 'r') x = Math.round(x - e.w);
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) if (e.bits[j * e.w + i]) this.px(x + i, y + j - 2, b, c);
    return e.w;
  },
  jpW(str) { return this.isAscii(str) ? this.textW(str, 1) : this.jpBits(str).w; },
  present() {
    const W = this.W, H = this.H, d = this.img.data, buf = this.buf, col = this.col, pal = this.palette;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      const b = buf[i];
      if (b <= 0.01) { d[j + 3] = 0; continue; }
      const p = pal[col[i]]; const bb = Math.min(1, b);
      d[j] = p[0]; d[j + 1] = p[1]; d[j + 2] = p[2]; d[j + 3] = Math.round(bb * 255);
    }
    this.sctx.putImageData(this.img, 0, 0);
    const ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.small, 0, 0, cw, ch);
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = this.gapPattern; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    const g = this.gctx; g.clearRect(0, 0, cw, ch); g.imageSmoothingEnabled = true; g.drawImage(this.small, 0, 0, cw, ch);
  },
};
