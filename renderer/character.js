const presetsEl = document.getElementById('presets');
const previews = {
  idle: document.getElementById('preview-idle'),
  drinking: document.getElementById('preview-drinking'),
};
const applyBtn = document.getElementById('apply');
const closeBtn = document.getElementById('close');
const status = document.getElementById('status');

const sprites = { idle: null, drinking: null }; // processed custom sprites

function setStatus(msg, busy) {
  status.textContent = msg || '';
  status.classList.toggle('busy', !!busy);
}
function refreshApply() {
  applyBtn.disabled = !(sprites.idle && sprites.drinking);
}

// ---- Preset gallery -------------------------------------------------------
async function renderPresets() {
  const info = await window.hydrate.getPresets();
  presetsEl.innerHTML = '';
  info.presets.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card' + (info.active === p.key ? ' active' : '');
    card.innerHTML =
      '<div class="badge">✓</div>' +
      '<div class="thumb"><img alt="" src="' + p.thumb + '"></div>' +
      '<div class="name">' + p.label + '</div>';
    card.addEventListener('click', async () => {
      await window.hydrate.selectCharacter(p.key);
      setStatus('Now using: ' + p.label + ' ✨');
      renderPresets();
    });
    presetsEl.appendChild(card);
  });
  if (info.active === 'custom') setStatus('Using your own character.');
}

// ---- Bring-your-own import (in-canvas background removal) ------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}
function removeBackground(id, w, h, tolerance) {
  const data = id.data;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let br = 0, bg = 0, bb = 0;
  for (const [cx, cy] of corners) { const i = at(cx, cy); br += data[i]; bg += data[i + 1]; bb += data[i + 2]; }
  br /= 4; bg /= 4; bb /= 4;
  const tol2 = tolerance * tolerance;
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + (w - 1)); }
  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    data[i + 3] = 0;
    const x = p % w, y = (p - x) / w;
    if (x + 1 < w) stack.push(p + 1);
    if (x - 1 >= 0) stack.push(p - 1);
    if (y + 1 < h) stack.push(p + w);
    if (y - 1 >= 0) stack.push(p - w);
  }
}
function boundingBox(id, w, h) {
  const data = id.data;
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        found = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { x: 0, y: 0, w, h };
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
async function processImage(dataUrl) {
  const img = await loadImage(dataUrl);
  const maxDim = 1000;
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const cornerAlpha =
    (d[3] + d[(w - 1) * 4 + 3] + d[(h - 1) * w * 4 + 3] + d[((h - 1) * w + (w - 1)) * 4 + 3]) / 4;
  if (cornerAlpha > 200) removeBackground(id, w, h, 72);
  ctx.putImageData(id, 0, 0);
  const box = boundingBox(id, w, h);
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out.toDataURL('image/png');
}
function showPreview(slot, dataUrl) {
  previews[slot].innerHTML = '';
  const img = new Image();
  img.src = dataUrl;
  previews[slot].appendChild(img);
}
async function pick(slot) {
  const original = await window.hydrate.pickImage();
  if (!original) return;
  setStatus('Cutting out the background…', true);
  try {
    const processed = await processImage(original);
    sprites[slot] = processed;
    showPreview(slot, processed);
    setStatus('');
    refreshApply();
  } catch (e) {
    setStatus('Sorry, that image could not be processed — try another.', false);
  }
}

document.querySelectorAll('.pick').forEach((btn) => {
  btn.addEventListener('click', () => pick(btn.dataset.slot));
});
applyBtn.addEventListener('click', async () => {
  if (!(sprites.idle && sprites.drinking)) return;
  setStatus('Saving…', true);
  const ok = await window.hydrate.saveCharacter(sprites.idle, sprites.drinking);
  if (ok) {
    setStatus('Done! She’s now your character ✨');
    renderPresets();
  } else {
    setStatus('Something went wrong saving — please try again.', false);
  }
});
closeBtn.addEventListener('click', () => window.hydrate.closeCharacterWindow());

renderPresets();
