/**
 * Turns the flat light-blue background of the source art into transparency
 * (flood-fill from the borders so interior colours are never touched),
 * trims the empty margins, and also carves out a little "face" tray icon.
 *
 * Run with:  npm run prepare-assets
 */
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

const RAW_DIR = path.join(__dirname, '..', 'assets', 'raw');
const OUT_DIR = path.join(__dirname, '..', 'assets');

// How close a pixel must be to the corner colour to count as background.
const TOLERANCE = 72;

function removeBackground(image, tolerance) {
  const { width, height, data } = image.bitmap;

  // Background colour = average of the four corners.
  const cornerIdx = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let br = 0, bg = 0, bb = 0;
  for (const i of cornerIdx) {
    br += data[i]; bg += data[i + 1]; bb += data[i + 2];
  }
  br /= 4; bg /= 4; bb /= 4;

  const tol2 = tolerance * tolerance;
  const visited = new Uint8Array(width * height);
  const stack = [];

  // Seed the flood fill from every border pixel.
  for (let x = 0; x < width; x++) {
    stack.push(x);
    stack.push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width);
    stack.push(y * width + (width - 1));
  }

  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;

    const i = p * 4;
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    if (dr * dr + dg * dg + db * db > tol2) continue; // hit the character

    data[i + 3] = 0; // make transparent

    const x = p % width;
    const y = (p - x) / width;
    if (x + 1 < width) stack.push(p + 1);
    if (x - 1 >= 0) stack.push(p - 1);
    if (y + 1 < height) stack.push(p + width);
    if (y - 1 >= 0) stack.push(p - width);
  }

  // Feather the 1px halo left along the silhouette so edges aren't hard blue.
  const T2 = tolerance * 1.7;
  const T2sq = T2 * T2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (data[i + 3] === 0) continue;

      const touchesEmpty =
        (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
        (x < width - 1 && data[(p + 1) * 4 + 3] === 0) ||
        (y > 0 && data[(p - width) * 4 + 3] === 0) ||
        (y < height - 1 && data[(p + width) * 4 + 3] === 0);
      if (!touchesEmpty) continue;

      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      const dist2 = dr * dr + dg * dg + db * db;
      if (dist2 < T2sq) {
        const d = Math.sqrt(dist2);
        const a = Math.round(((d - tolerance) / (T2 - tolerance)) * 255);
        const clamped = Math.max(0, Math.min(255, a));
        if (clamped < data[i + 3]) data[i + 3] = clamped;
      }
    }
  }

  return image;
}

async function processPose(name) {
  const src = path.join(RAW_DIR, `${name}.png`);
  const out = path.join(OUT_DIR, `${name}.png`);
  console.log(`  - ${name}.png ...`);
  const image = await Jimp.read(src);
  removeBackground(image, TOLERANCE);
  try {
    image.autocrop({ tolerance: 0.002, cropOnlyFrames: false });
  } catch (e) {
    console.log(`    (autocrop skipped: ${e.message})`);
  }
  await image.writeAsync(out);
  return image;
}

async function makeTrayIcon(idleImage) {
  const out = path.join(OUT_DIR, 'tray.png');
  try {
    const w = idleImage.bitmap.width;
    const h = idleImage.bitmap.height;
    const size = Math.round(h * 0.22);
    const cx = Math.round(w * 0.46);
    let x = Math.round(cx - size / 2);
    let y = Math.round(h * 0.02);
    x = Math.max(0, Math.min(x, w - size));
    y = Math.max(0, Math.min(y, h - size));
    const face = idleImage.clone().crop(x, y, size, size).resize(64, 64);
    await face.writeAsync(out);
    console.log('  - tray.png (from her face)');
  } catch (e) {
    // Fallback: a plain blue square so the tray still has an icon.
    const icon = new Jimp(32, 32, 0x4aa3dfff);
    await icon.writeAsync(out);
    console.log(`  - tray.png (fallback square: ${e.message})`);
  }
}

(async () => {
  if (!fs.existsSync(path.join(RAW_DIR, 'idle.png'))) {
    console.error('Missing assets/raw/idle.png — nothing to process.');
    process.exit(1);
  }
  console.log('Preparing transparent sprites:');
  const idle = await processPose('idle');
  await processPose('drinking');
  await makeTrayIcon(idle);
  console.log('Done. Sprites written to assets/.');
})();
