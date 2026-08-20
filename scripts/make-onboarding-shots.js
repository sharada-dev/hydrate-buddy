/**
 * Renders clean PNGs of the two onboarding steps for the README (jimp, no
 * browser). Output: docs/onboarding-1.png, docs/onboarding-2.png
 *
 *   node scripts/make-onboarding-shots.js
 */
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

const C = (r, g, b, a = 255) => Jimp.rgbaToInt(r, g, b, a);
const INK = C(28, 28, 28);
const GRAY = C(120, 120, 120);
const CREAM = C(253, 253, 247);
const WHITE = C(255, 255, 255);
const GREEN = C(55, 194, 74);
const BAR = C(240, 240, 240);
const W = 520;

function fillRect(img, x, y, w, h, color) {
  const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
  const x1 = Math.min(img.bitmap.width, (x + w) | 0), y1 = Math.min(img.bitmap.height, (y + h) | 0);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) img.setPixelColor(color, xx, yy);
}
function insideRR(px, py, w, h, r) {
  if (px >= r && px <= w - 1 - r) return true;
  if (py >= r && py <= h - 1 - r) return true;
  const cx = px < r ? r : w - 1 - r;
  const cy = py < r ? r : h - 1 - r;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}
function roundFill(img, x, y, w, h, color, r) {
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (insideRR(px, py, w, h, r)) img.setPixelColor(color, x + px, y + py);
}
function roundBox(img, x, y, w, h, fill, border, r, bw) {
  roundFill(img, x, y, w, h, border, r);
  roundFill(img, x + bw, y + bw, w - 2 * bw, h - 2 * bw, fill, Math.max(1, r - bw));
}

async function build() {
  const fonts = {
    h1: await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
    body: await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
    white: await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE),
    small: await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK),
  };
  return fonts;
}

function titleBar(img) {
  fillRect(img, 0, 0, W, 36, BAR);
  // little app-icon dot
  roundFill(img, 14, 11, 14, 14, C(74, 163, 223), 4);
  img.print(fontsRef.small, 36, 0, { text: 'Welcome to Hydrate Buddy', alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, W - 70, 36);
  // close X
  img.print(fontsRef.small, W - 30, 0, { text: 'x', alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 20, 36);
}

let fontsRef;

function step1(fonts) {
  const H = 320;
  const img = new Jimp(W, H, CREAM);
  titleBar(img);
  const pad = 28;
  let y = 56;
  img.print(fonts.small, pad, y, 'STEP 1 OF 2'); y += 26;
  img.print(fonts.h1, pad, y, 'What should she call you?'); y += 28;
  img.print(fonts.body, pad, y, "She'll use your name in her reminders."); y += 34;
  // input
  roundBox(img, pad, y, W - 2 * pad, 46, WHITE, INK, 8, 2);
  img.print(fonts.body, pad + 14, y, { text: 'e.g. Alex', alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, W - 2 * pad - 20, 46);
  y += 68;
  // Next button (right aligned)
  const bw = 120, bx = W - pad - bw;
  roundBox(img, bx, y, bw, 42, GREEN, INK, 8, 2);
  img.print(fonts.white, bx, y, { text: 'Next', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, bw, 42);
  y += 58;
  img.print(fonts.small, pad, y, 'Leave it blank to keep her reminders generic.');
  return img;
}

function step2(fonts) {
  const H = 400;
  const img = new Jimp(W, H, CREAM);
  titleBar(img);
  const pad = 28;
  let y = 56;
  img.print(fonts.small, pad, y, 'STEP 2 OF 2'); y += 26;
  img.print(fonts.h1, pad, y, 'How often should she nudge you?'); y += 28;
  img.print(fonts.body, pad, y, 'Pick a reminder interval.'); y += 32;
  // chips
  const chips = ['15 min', '30 min', '45 min', '60 min', '90 min'];
  let cx = pad;
  chips.forEach((label, i) => {
    const cw = 78;
    if (cx + cw > W - pad) { cx = pad; y += 46; }
    const active = i === 2; // 45 highlighted
    roundBox(img, cx, y, cw, 36, active ? GREEN : WHITE, active ? GREEN : INK, 18, 2);
    img.print(active ? fonts.white : fonts.body, cx, y, { text: label, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, cw, 36);
    cx += cw + 8;
  });
  y += 56;
  // number field
  roundBox(img, pad, y, 90, 44, WHITE, INK, 8, 2);
  img.print(fonts.body, pad, y, { text: '45', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 90, 44);
  img.print(fonts.body, pad + 100, y, { text: 'minutes', alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 120, 44);
  y += 64;
  // Back + Done
  const doneW = 110, doneX = W - pad - doneW;
  roundBox(img, doneX, y, doneW, 42, GREEN, INK, 8, 2);
  img.print(fonts.white, doneX, y, { text: 'Done', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, doneW, 42);
  const backW = 100, backX = doneX - 12 - backW;
  roundBox(img, backX, y, backW, 42, WHITE, INK, 8, 2);
  img.print(fonts.body, backX, y, { text: 'Back', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, backW, 42);
  y += 58;
  img.print(fonts.small, pad, y, 'You can change both anytime from her tray icon.');
  return img;
}

(async () => {
  const fonts = await build();
  fontsRef = fonts;
  const outDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  await step1(fonts).writeAsync(path.join(outDir, 'onboarding-1.png'));
  await step2(fonts).writeAsync(path.join(outDir, 'onboarding-2.png'));
  console.log('Wrote docs/onboarding-1.png and docs/onboarding-2.png');
})();
