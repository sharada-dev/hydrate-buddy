/**
 * Builds docs/demo.gif by compositing the sprite PNGs into scenes with jimp
 * (no browser / rendering engine involved) and encoding with gifenc.
 *
 *   node scripts/make-gif.js
 */
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const W = 660;
const H = 460;
const CHAR_H = 300;

const C = (r, g, b, a = 255) => Jimp.rgbaToInt(r, g, b, a);
const INK = C(28, 28, 28);
const CREAM = C(253, 253, 247);
const GREEN = C(55, 194, 74);
const GREEN_DK = C(40, 150, 55);

function fillRect(img, x, y, w, h, color) {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(W, (x + w) | 0);
  const y1 = Math.min(H, (y + h) | 0);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) img.setPixelColor(color, xx, yy);
  }
}

// border box: outer ink border of `b` px, inner fill
function box(img, x, y, w, h, fill, b = 4) {
  fillRect(img, x, y, w, h, INK);
  fillRect(img, x + b, y + b, w - 2 * b, h - 2 * b, fill);
}

function background(img) {
  // vertical gradient indigo -> deep violet
  const top = [109, 139, 214];
  const bot = [67, 64, 143];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = Math.round(top[0] + (bot[0] - top[0]) * t);
    const g = Math.round(top[1] + (bot[1] - top[1]) * t);
    const b = Math.round(top[2] + (bot[2] - top[2]) * t);
    fillRect(img, 0, y, W, 1, C(r, g, b));
  }
  // soft lighter "floor" band
  for (let y = H - 80; y < H; y++) {
    const t = (y - (H - 80)) / 80;
    const a = Math.round(26 * t);
    for (let x = 0; x < W; x++) {
      const base = Jimp.intToRGBA(img.getPixelColor(x, y));
      const r = Math.min(255, base.r + a);
      const g = Math.min(255, base.g + a);
      const b = Math.min(255, base.b + a);
      img.setPixelColor(C(r, g, b), x, y);
    }
  }
}

function tail(img, tx, ty) {
  // small downward black triangle (bubble pointer)
  for (let i = 0; i < 20; i++) {
    const half = Math.round((20 - i) * 0.7);
    fillRect(img, tx - half, ty + i, half * 2, 1, INK);
  }
}

function drawBubble(img, fonts, cfg) {
  const { x, y, w, h, text, withButtons, pressed } = cfg;
  box(img, x, y, w, h, CREAM, 5);
  tail(img, x + w - 78, y + h);

  const pad = 18;
  const textH = withButtons ? h - 78 : h;
  img.print(
    fonts.ink,
    x + pad,
    y + (withButtons ? 12 : 6),
    {
      text: text.toUpperCase(),
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    },
    w - 2 * pad,
    textH
  );

  if (withButtons) {
    const by = y + h - 52;
    // YES button (green)
    const yx = x + 24;
    const yw = 168;
    const off = pressed ? 3 : 0;
    box(img, yx + off, by + off, yw, 36, pressed ? GREEN_DK : GREEN, 3);
    img.print(
      fonts.white,
      yx + off,
      by + off,
      { text: 'YES, I DRANK', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE },
      yw,
      36
    );
    // SNOOZE button (cream)
    const sx = yx + yw + 14;
    const sw = 96;
    box(img, sx, by, sw, 36, CREAM, 3);
    img.print(
      fonts.ink,
      sx,
      by,
      { text: 'SNOOZE', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE },
      sw,
      36
    );
  }
}

const CONFETTI_COLORS = [
  [55, 194, 74],
  [74, 163, 223],
  [255, 212, 71],
  [255, 122, 89],
  [138, 214, 255],
];

function confetti(img, count, seed) {
  // deterministic pseudo-random scatter in the upper area
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const cx = Math.round(rnd() * (W - 20)) + 6;
    const cy = Math.round(rnd() * (H * 0.62)) + 6;
    const sz = 6 + Math.round(rnd() * 5);
    const col = CONFETTI_COLORS[(rnd() * CONFETTI_COLORS.length) | 0];
    fillRect(img, cx, cy, sz, sz, C(col[0], col[1], col[2]));
  }
}

(async () => {
  const idle = (await Jimp.read(path.join(__dirname, '..', 'assets', 'idle.png'))).resize(Jimp.AUTO, CHAR_H);
  const drink = (await Jimp.read(path.join(__dirname, '..', 'assets', 'drinking.png'))).resize(Jimp.AUTO, CHAR_H);
  const fonts = {
    ink: await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
    white: await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE),
  };

  const PROMPT = 'Time to drink water to keep your skin glowing!';
  const restX = 452;

  // scene builder: {sprite, x, dy, face, bubble, confetti}
  const SCENES = [
    { d: 500, x: 660 }, // 0 offstage
    { d: 200, x: 585, dy: -6 }, // 1 walk in
    { d: 200, x: 512 }, // 2 walk in
    { d: 1600, x: restX, bubble: { text: PROMPT, withButtons: true } }, // 3 prompt
    { d: 380, x: restX, bubble: { text: PROMPT, withButtons: true, pressed: true } }, // 4 pressed
    { d: 700, x: restX, drink: true, bubble: { text: 'Yay! Stay glowing!', short: true }, cf: 16 }, // 5 sip
    { d: 1100, x: restX, dy: -16, bubble: { text: 'Yay! Stay glowing!', short: true }, cf: 44 }, // 6 hop
    { d: 900, x: restX, face: 'right', bubble: { text: 'See you in a bit!', short: true } }, // 7 turn
    { d: 240, x: 540, dy: -6, face: 'right' }, // 8 walk off
    { d: 700, x: 690, face: 'right' }, // 9 gone
  ];

  const gif = GIFEncoder();

  for (let i = 0; i < SCENES.length; i++) {
    const sc = SCENES[i];
    const frame = new Jimp(W, H, 0x000000ff);
    background(frame);

    if (sc.cf) confetti(frame, sc.cf, 1000 + i * 7);

    let spr = (sc.drink ? drink : idle).clone();
    if (sc.face === 'right') spr = spr.flip(true, false);
    const cw = spr.bitmap.width;
    const charY = H - CHAR_H + (sc.dy || 0);
    frame.composite(spr, Math.round(sc.x - cw / 2), charY);

    if (sc.bubble) {
      const b = sc.bubble;
      if (b.short) {
        drawBubble(frame, fonts, { x: 350, y: 40, w: 276, h: 86, text: b.text, withButtons: false });
      } else {
        drawBubble(frame, fonts, {
          x: 314, y: 22, w: 324, h: 150,
          text: b.text, withButtons: true, pressed: b.pressed,
        });
      }
    }

    if (process.env.DUMP_FRAMES) {
      await frame.writeAsync(path.join(process.env.DUMP_FRAMES, `frame-${i}.png`));
    }

    const rgba = new Uint8Array(frame.bitmap.data);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, W, H, { palette, delay: sc.d, repeat: i === 0 ? 0 : undefined });
    console.log(`  frame ${i}`);
  }

  gif.finish();
  const out = path.join(__dirname, '..', 'docs', 'demo.gif');
  fs.writeFileSync(out, Buffer.from(gif.bytes()));
  console.log(`Wrote docs/demo.gif (${Math.round(fs.statSync(out).size / 1024)} KB).`);
})();
