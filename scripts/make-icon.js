/**
 * Generates build/icon.png (256x256) used by electron-builder for the app /
 * installer icon: her face on a rounded blue tile.
 *
 *   node scripts/make-icon.js
 */
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const SIZE = 256;
const RADIUS = 52;
const BG = { r: 74, g: 163, b: 223 }; // #4aa3df

function insideRounded(x, y, s, r) {
  if (x >= r && x <= s - 1 - r) return true; // vertical band
  if (y >= r && y <= s - 1 - r) return true; // horizontal band
  const cx = x < r ? r : s - 1 - r;
  const cy = y < r ? r : s - 1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

(async () => {
  const icon = new Jimp(SIZE, SIZE, 0x00000000);
  icon.scan(0, 0, SIZE, SIZE, function (x, y, idx) {
    if (insideRounded(x, y, SIZE, RADIUS)) {
      this.bitmap.data[idx] = BG.r;
      this.bitmap.data[idx + 1] = BG.g;
      this.bitmap.data[idx + 2] = BG.b;
      this.bitmap.data[idx + 3] = 255;
    }
  });

  // Crop her face from the transparent idle sprite and drop it on the tile.
  const idle = await Jimp.read(path.join(__dirname, '..', 'assets', 'idle.png'));
  const w = idle.bitmap.width;
  const h = idle.bitmap.height;
  const cropSize = Math.round(h * 0.24);
  const cx = Math.round(w * 0.46);
  const fx = Math.max(0, Math.min(Math.round(cx - cropSize / 2), w - cropSize));
  const fy = Math.max(0, Math.round(h * 0.02));
  const fh = Math.min(cropSize, h - fy);

  const face = idle.clone().crop(fx, fy, cropSize, fh).resize(196, Jimp.AUTO);
  const px = Math.round((SIZE - face.bitmap.width) / 2);
  const py = 40;
  icon.composite(face, px, py);

  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  await icon.writeAsync(path.join(outDir, 'icon.png'));
  console.log('Wrote build/icon.png (256x256).');
})();
