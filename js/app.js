/**
 * Image Resizer Pro — app.js
 * Drag & Drop, Canvas Pan/Zoom, Background Removal, WebP Export, ZIP
 * Pure client-side — no external API needed
 */

// ─── Slot Config ─────────────────────────────────────────────────────────────
const SLOTS = [
  { id: 'logo',    w: 400,  h: 400,  removeBg: true  },
  { id: 'favicon', w: 512,  h: 512,  removeBg: true  },
  { id: 'banner',  w: 1920, h: 600,  removeBg: false },
  { id: 'post',    w: 500,  h: 762,  removeBg: false },
];

// ─── State per slot ───────────────────────────────────────────────────────────
const slotState = {};
SLOTS.forEach(cfg => {
  slotState[cfg.id] = {
    cfg,
    img: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOffX: 0,
    dragOffY: 0,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getEls(slotId) {
  const zone        = document.getElementById(`drop-${slotId}`);
  const placeholder = zone.querySelector('.drop-placeholder');
  const wrapper     = zone.querySelector('.canvas-wrapper');
  const canvas      = zone.querySelector('.preview-canvas');
  const overlay     = zone.querySelector('.processing-overlay');
  const zoomLabel   = zone.querySelector('.zoom-label');
  const zoomIn      = zone.querySelector('.zoom-in');
  const zoomOut     = zone.querySelector('.zoom-out');
  const resetBtn    = zone.querySelector('.btn-reset');
  const removeBtn   = zone.querySelector('.btn-remove');
  return { zone, placeholder, wrapper, canvas, overlay, zoomLabel, zoomIn, zoomOut, resetBtn, removeBtn };
}

function showToast(msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function updateExportBtn() {
  const count  = SLOTS.filter(cfg => slotState[cfg.id].img).length;
  const btn    = document.getElementById('btn-export');
  const status = document.getElementById('export-status');
  if (count === 0) {
    btn.disabled = true;
    status.textContent = 'Chưa có ảnh nào. Hãy kéo & thả ảnh vào các ô ở trên.';
  } else {
    btn.disabled = false;
    const names = SLOTS.filter(cfg => slotState[cfg.id].img).map(c => c.id).join(', ');
    status.textContent = `${count}/4 ảnh sẵn sàng (${names}) — nhấn để xuất ZIP`;
  }
}

// ─── Background Removal (client-side, canvas flood-fill + edge) ───────────────
/**
 * Remove background from an image using flood fill from corners/edges
 * and flood fill to detect the dominant background color.
 */
function removeBackgroundCanvas(srcImg) {
  return new Promise(resolve => {
    // Work at reduced size for performance, then scale
    const maxSide = 600;
    const ratio   = Math.min(maxSide / srcImg.naturalWidth, maxSide / srcImg.naturalHeight, 1);
    const w = Math.round(srcImg.naturalWidth  * ratio);
    const h = Math.round(srcImg.naturalHeight * ratio);

    const tmpC   = document.createElement('canvas');
    tmpC.width   = w;
    tmpC.height  = h;
    const tmpCtx = tmpC.getContext('2d');
    tmpCtx.drawImage(srcImg, 0, 0, w, h);

    const imageData = tmpCtx.getImageData(0, 0, w, h);
    const data      = imageData.data; // RGBA flat array

    // ── Step 1: Sample background color from corners (top-left area)
    function getPixel(x, y) {
      const i = (y * w + x) * 4;
      return [data[i], data[i+1], data[i+2], data[i+3]];
    }

    // Average corner pixels as "background" reference
    const corners = [
      getPixel(0,0), getPixel(w-1,0), getPixel(0,h-1), getPixel(w-1,h-1),
      getPixel(Math.floor(w/2),0), getPixel(0,Math.floor(h/2)),
      getPixel(w-1,Math.floor(h/2)), getPixel(Math.floor(w/2),h-1)
    ];
    const bgR = Math.round(corners.reduce((a,c)=>a+c[0],0)/corners.length);
    const bgG = Math.round(corners.reduce((a,c)=>a+c[1],0)/corners.length);
    const bgB = Math.round(corners.reduce((a,c)=>a+c[2],0)/corners.length);

    // ── Step 2: Multi-seed flood fill from all edges
    const tolerance = 42;
    const visited = new Uint8Array(w * h);

    function colorDiff(r,g,b) {
      return Math.sqrt((r-bgR)**2 + (g-bgG)**2 + (b-bgB)**2);
    }

    const queue = [];
    // Add edge pixels as seeds
    for (let x = 0; x < w; x++) { queue.push(x, 0); queue.push(x, h-1); }
    for (let y = 1; y < h-1; y++) { queue.push(0, y); queue.push(w-1, y); }

    let qi = 0;
    while (qi < queue.length) {
      const x = queue[qi++];
      const y = queue[qi++];
      const idx = y * w + x;
      if (visited[idx]) continue;
      const pi  = idx * 4;
      if (data[pi+3] < 20) { visited[idx] = 1; continue; } // already transparent
      const diff = colorDiff(data[pi], data[pi+1], data[pi+2]);
      if (diff > tolerance) continue;
      visited[idx] = 1;
      // Make transparent
      data[pi+3] = 0;
      if (x>0)   { queue.push(x-1, y); }
      if (x<w-1) { queue.push(x+1, y); }
      if (y>0)   { queue.push(x, y-1); }
      if (y<h-1) { queue.push(x, y+1); }
    }

    // ── Step 3: Soft edge smoothing (erode 1px on mask boundary)
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      alpha[i] = data[i * 4 + 3] / 255;
    }
    // Gaussian-like blur on alpha to soften edges
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const idx = y * w + x;
        const avg = (
          alpha[(y-1)*w+x-1] + alpha[(y-1)*w+x]*2 + alpha[(y-1)*w+x+1] +
          alpha[y*w+x-1]*2   + alpha[idx]*4         + alpha[y*w+x+1]*2   +
          alpha[(y+1)*w+x-1] + alpha[(y+1)*w+x]*2 + alpha[(y+1)*w+x+1]
        ) / 16;
        data[idx * 4 + 3] = Math.round(avg * 255);
      }
    }

    tmpCtx.putImageData(imageData, 0, 0);

    // ── Step 4: Scale result back to original size on a full-res canvas
    const outC   = document.createElement('canvas');
    outC.width   = srcImg.naturalWidth;
    outC.height  = srcImg.naturalHeight;
    const outCtx = outC.getContext('2d');
    outCtx.clearRect(0, 0, outC.width, outC.height);
    outCtx.drawImage(tmpC, 0, 0, outC.width, outC.height);

    // Return as Image
    outC.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }, 'image/png');
  });
}

// ─── Canvas Rendering ─────────────────────────────────────────────────────────
function renderCanvas(slotId) {
  const st  = slotState[slotId];
  const els = getEls(slotId);
  if (!st.img || !els.canvas) return;

  const { wrapper, canvas, zoomLabel } = els;
  const { w: targetW, h: targetH } = st.cfg;
  const wrapW = wrapper.clientWidth  || 400;
  const wrapH = wrapper.clientHeight || 300;

  const displayScale = Math.min(wrapW / targetW, wrapH / targetH, 1);
  const dispW = Math.round(targetW * displayScale);
  const dispH = Math.round(targetH * displayScale);

  canvas.width        = dispW;
  canvas.height       = dispH;
  canvas.style.width  = dispW + 'px';
  canvas.style.height = dispH + 'px';
  canvas.style.left   = Math.round((wrapW - dispW) / 2) + 'px';
  canvas.style.top    = Math.round((wrapH - dispH) / 2) + 'px';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);

  const imgW = st.img.naturalWidth  * st.scale * displayScale;
  const imgH = st.img.naturalHeight * st.scale * displayScale;
  const drawX = st.offsetX * displayScale + (dispW - imgW) / 2;
  const drawY = st.offsetY * displayScale + (dispH - imgH) / 2;

  ctx.drawImage(st.img, drawX, drawY, imgW, imgH);
  if (zoomLabel) zoomLabel.textContent = Math.round(st.scale * 100) + '%';
}

// ─── Fit image to slot ────────────────────────────────────────────────────────
function fitImageToSlot(slotId) {
  const st = slotState[slotId];
  if (!st.img) return;
  const { w: targetW, h: targetH } = st.cfg;
  const imgW = st.img.naturalWidth;
  const imgH = st.img.naturalHeight;
  st.scale   = Math.max(targetW / imgW, targetH / imgH);
  st.offsetX = 0;
  st.offsetY = 0;
}

// ─── Show/hide canvas ─────────────────────────────────────────────────────────
function showCanvas(slotId) {
  const { placeholder, wrapper } = getEls(slotId);
  const { w, h } = slotState[slotId].cfg;
  const zone = document.getElementById(`drop-${slotId}`);
  const zoneW = zone.clientWidth || 400;
  const dispH = Math.min(Math.round(zoneW * (h / w)), 440);
  placeholder.style.display = 'none';
  wrapper.style.display     = 'block';
  wrapper.style.height      = dispH + 'px';
  wrapper.style.minHeight   = dispH + 'px';
}

function hideCanvas(slotId) {
  const { placeholder, wrapper } = getEls(slotId);
  placeholder.style.display = '';
  wrapper.style.display     = 'none';
}

// ─── Load image into slot ─────────────────────────────────────────────────────
async function loadImageToSlot(slotId, file) {
  const st  = slotState[slotId];
  const cfg = st.cfg;
  const els = getEls(slotId);

  showCanvas(slotId);
  els.overlay.style.display = 'flex';
  const overlayText = els.overlay.querySelector('p');

  try {
    // Load original image
    overlayText.textContent = 'Đang tải ảnh…';
    const url0 = URL.createObjectURL(file);
    const srcImg = await new Promise((res, rej) => {
      const i = new Image();
      i.onload  = () => res(i);
      i.onerror = rej;
      i.src = url0;
    });

    let finalImg = srcImg;

    if (cfg.removeBg) {
      overlayText.textContent = 'Đang xóa nền…';
      try {
        const result = await removeBackgroundCanvas(srcImg);
        if (result) finalImg = result;
        else showToast('Xóa nền không hoàn hảo, dùng ảnh gốc', 'info');
      } catch (e) {
        console.warn('BG remove error:', e);
        showToast('Xóa nền thất bại, dùng ảnh gốc', 'error');
      }
    }

    st.img = finalImg;
    fitImageToSlot(slotId);
    els.overlay.style.display = 'none';
    renderCanvas(slotId);
    updateExportBtn();
    showToast(`"${cfg.id}" đã sẵn sàng ✓`, 'success');
  } catch (err) {
    console.error(err);
    els.overlay.style.display = 'none';
    hideCanvas(slotId);
    showToast(`Lỗi tải ảnh: ${err.message}`, 'error');
  }
}

// ─── Drop Zone Setup ──────────────────────────────────────────────────────────
function setupDropZone(slotId) {
  const { zone } = getEls(slotId);

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImageToSlot(slotId, file);
    } else {
      showToast('Vui lòng thả file ảnh hợp lệ', 'error');
    }
  });

  const fileInput = zone.querySelector('.file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) loadImageToSlot(slotId, fileInput.files[0]);
      fileInput.value = '';
    });
  }
}

// ─── Canvas Drag (pan) ────────────────────────────────────────────────────────
function setupCanvasDrag(slotId) {
  const { canvas, wrapper } = getEls(slotId);
  const st  = slotState[slotId];
  const cfg = st.cfg;

  const getXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY];

  const onDown = e => {
    if (!st.img) return;
    e.preventDefault();
    const [x, y] = getXY(e);
    st.dragging   = true;
    st.dragStartX = x;
    st.dragStartY = y;
    st.dragOffX   = st.offsetX;
    st.dragOffY   = st.offsetY;
  };

  const onMove = e => {
    if (!st.dragging) return;
    e.preventDefault();
    const [x, y] = getXY(e);
    const wrapW  = wrapper.clientWidth || 400;
    const dScale = Math.min(wrapW / cfg.w, 1);
    st.offsetX   = st.dragOffX + (x - st.dragStartX) / dScale;
    st.offsetY   = st.dragOffY + (y - st.dragStartY) / dScale;
    renderCanvas(slotId);
  };

  const onUp = () => { st.dragging = false; };

  canvas.addEventListener('mousedown',   onDown);
  canvas.addEventListener('touchstart',  onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup',   onUp);
  document.addEventListener('touchend',  onUp);

  // Wheel zoom
  wrapper.addEventListener('wheel', e => {
    if (!st.img) return;
    e.preventDefault();
    const d = e.deltaY > 0 ? -0.07 : 0.07;
    st.scale = Math.max(0.05, Math.min(12, st.scale + d));
    renderCanvas(slotId);
  }, { passive: false });
}

// ─── Controls (zoom buttons, reset, remove) ────────────────────────────────────
function setupControls(slotId) {
  const st  = slotState[slotId];
  const els = getEls(slotId);

  els.zoomIn?.addEventListener('click', () => {
    if (!st.img) return;
    st.scale = Math.min(12, st.scale + 0.15);
    renderCanvas(slotId);
  });
  els.zoomOut?.addEventListener('click', () => {
    if (!st.img) return;
    st.scale = Math.max(0.05, st.scale - 0.15);
    renderCanvas(slotId);
  });
  els.resetBtn?.addEventListener('click', () => {
    if (!st.img) return;
    fitImageToSlot(slotId);
    renderCanvas(slotId);
    showToast(`Reset "${slotId}"`, 'info');
  });
  els.removeBtn?.addEventListener('click', () => {
    st.img = null;
    st.scale = 1; st.offsetX = 0; st.offsetY = 0;
    hideCanvas(slotId);
    updateExportBtn();
    showToast(`Đã xóa ảnh "${slotId}"`, 'info');
  });
}

// ─── Resize observer ──────────────────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    SLOTS.forEach(({ id }) => {
      if (slotState[id].img) { showCanvas(id); renderCanvas(id); }
    });
  }, 120);
});

// ─── Render to full-size offscreen canvas ─────────────────────────────────────
function renderToFullCanvas(slotId) {
  const st  = slotState[slotId];
  const cfg = st.cfg;
  if (!st.img) return null;

  const c   = document.createElement('canvas');
  c.width   = cfg.w;
  c.height  = cfg.h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, cfg.w, cfg.h);

  const imgW  = st.img.naturalWidth  * st.scale;
  const imgH  = st.img.naturalHeight * st.scale;
  const drawX = st.offsetX + (cfg.w - imgW) / 2;
  const drawY = st.offsetY + (cfg.h - imgH) / 2;
  ctx.drawImage(st.img, drawX, drawY, imgW, imgH);
  return c;
}

// ─── WebP optimization (<100KB) ───────────────────────────────────────────────
async function canvasToWebPOptimized(canvas, targetKB = 100) {
  const targetBytes = targetKB * 1024;

  const toBlob = (c, q) => new Promise(res => c.toBlob(res, 'image/webp', q));

  // Quick check at high quality
  let blob = await toBlob(canvas, 0.92);
  if (blob && blob.size <= targetBytes) return blob;

  // Binary search for quality
  let lo = 0.01, hi = 0.88;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    blob = await toBlob(canvas, mid);
    if (!blob) break;
    if (blob.size <= targetBytes) lo = mid; else hi = mid;
    if (hi - lo < 0.01) break;
  }
  blob = await toBlob(canvas, lo);

  // If still too large, resize canvas proportionally
  if (blob && blob.size > targetBytes) {
    const ratio = Math.sqrt(targetBytes / blob.size) * 0.95;
    const nw = Math.max(1, Math.floor(canvas.width  * ratio));
    const nh = Math.max(1, Math.floor(canvas.height * ratio));
    const tmp = document.createElement('canvas');
    tmp.width = nw; tmp.height = nh;
    tmp.getContext('2d').drawImage(canvas, 0, 0, nw, nh);
    blob = await toBlob(tmp, 0.80);
  }

  return blob;
}

// ─── Export ZIP ───────────────────────────────────────────────────────────────
async function exportAll() {
  const btn    = document.getElementById('btn-export');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất…';

  try {
    const zip = new window.JSZip();

    const now = new Date();
    const p   = n => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const folder = zip.folder(`images_${ts}`);

    const fileNames = {
      logo:    'logo_400x400',
      favicon: 'favicon_512x512',
      banner:  'banner_1920x600',
      post:    'post_500x762',
    };

    let exported = 0;
    for (const cfg of SLOTS) {
      if (!slotState[cfg.id].img) continue;
      const canvas = renderToFullCanvas(cfg.id);
      if (!canvas) continue;

      showToast(`Đang tối ưu "${cfg.id}"…`, 'info');
      const blob = await canvasToWebPOptimized(canvas, 100);
      if (blob) {
        folder.file(`${fileNames[cfg.id]}.webp`, blob);
        exported++;
        console.log(`✅ ${cfg.id}: ${(blob.size/1024).toFixed(1)} KB`);
      }
    }

    if (exported === 0) { showToast('Không có ảnh để xuất', 'error'); return; }

    const zipBlob = await zip.generateAsync({
      type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 }
    });
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(zipBlob),
      download: `images_${ts}.zip`,
    });
    a.click();
    URL.revokeObjectURL(a.href);

    showToast(`Xuất thành công ${exported} ảnh! 🎉`, 'success');
  } catch (err) {
    console.error(err);
    showToast(`Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Xuất ZIP (WebP &lt;100KB)';
    updateExportBtn();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
SLOTS.forEach(({ id }) => {
  setupDropZone(id);
  setupCanvasDrag(id);
  setupControls(id);
});

document.getElementById('btn-export')?.addEventListener('click', exportAll);
updateExportBtn();
