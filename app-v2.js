const $ = (selector) => document.querySelector(selector);
const ui = {
  fileInput: $('#fileInput'), dropZone: $('#dropZone'), controls: $('#controls'), results: $('#results'),
  template: $('#resultTemplate'), qualityRange: $('#qualityRange'), qualityOutput: $('#qualityOutput'),
  presetGroup: $('#presetGroup'), targetSize: $('#targetSize'), targetUnit: $('#targetUnit'),
  applyTargetBtn: $('#applyTargetBtn'), stripMetadata: $('#stripMetadata'), addMoreBtn: $('#addMoreBtn'),
  resizePresetGroup: $('#resizePresetGroup'), manualResize: $('#manualResize'), resizeWidth: $('#resizeWidth'),
  resizeHeight: $('#resizeHeight'), applyResizeBtn: $('#applyResizeBtn'),
  processingSummary: $('#processingSummary'), batchActions: $('#batchActions'), batchSummary: $('#batchSummary'),
  batchSaved: $('#batchSaved'), downloadAllBtn: $('#downloadAllBtn'), downloadAllLabel: $('#downloadAllLabel'),
  mobileSaveHint: $('#mobileSaveHint'), compareModal: $('#compareModal'), compareTitle: $('#compareTitle'),
  compareDescription: $('#compareDescription'), compareBefore: $('#compareBefore'), compareAfter: $('#compareAfter'),
  compareRange: $('#compareRange'), compareDivider: $('.compare-divider'), compareStats: $('#compareStats'),
};

const destinationPresets = {
  whatsapp: { targetBytes: 350 * 1024, quality: 0.78, maxDimension: 1600 },
  email: { targetBytes: 1024 * 1024, quality: 0.84, maxDimension: 2200 },
  web: { targetBytes: 250 * 1024, quality: 0.8, maxDimension: 1600 },
  print: { targetBytes: 4 * 1024 * 1024, quality: 0.93, maxDimension: 3600 },
};
const resizePresets = {
  social: { width: 1080, height: 1080 },
  email: { width: 1600, height: 1600 },
  web: { width: 1920, height: 1920 },
};
const state = {
  items: [], preset: 'whatsapp', quality: 0.78, targetBytes: 350 * 1024,
  maxDimension: 1600, resizeMode: 'auto', resizeWidth: 1200, resizeHeight: 1200,
  stripMetadata: true, revision: 0,
};
const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const supportsWebP = (() => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
})();

ui.mobileSaveHint.hidden = !isTouchDevice;
if (isTouchDevice) ui.downloadAllLabel.textContent = 'Guardar archivos';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const place = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** place;
  return `${value >= 10 || place === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[place]}`;
}
const extension = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : 'archivo';
const baseName = (name) => name.replace(/\.[^/.]+$/, '');

function recommendationFor(file) {
  const type = file.type;
  const ext = extension(file.name);
  if (type === 'application/pdf' || ext === 'pdf') return { title: 'Objetivo: 1–5 MB', detail: 'Usa 150 DPI, imágenes JPG al 75–82% y elimina páginas o fuentes innecesarias.' };
  if (type.startsWith('video/')) return { title: 'Objetivo: 8–20 MB/min', detail: 'Exporta en MP4 (H.264), 1080p a 4–8 Mbps o 720p a 2–4 Mbps.' };
  if (type.startsWith('audio/')) return { title: 'Objetivo: 1–2 MB/min', detail: 'Para voz usa AAC/MP3 a 96–128 kbps; para música, 192–256 kbps.' };
  if (/zip|rar|7z/.test(ext)) return { title: 'Ya está comprimido', detail: 'Reducirlo otra vez probablemente producirá muy poco ahorro.' };
  if (/docx?|pptx?|xlsx?/.test(ext)) return { title: 'Objetivo: menos de 10 MB', detail: 'Comprime las imágenes internas a 150 DPI y elimina contenido multimedia incrustado.' };
  return { title: 'Revisa el formato', detail: 'Convierte recursos visuales a WEBP/JPG o empaqueta archivos de texto como ZIP.' };
}

function outputSettings(file) {
  const transparent = file.type === 'image/png' || extension(file.name) === 'png';
  let outputType = 'image/jpeg';
  if (supportsWebP && (transparent || file.type === 'image/webp')) outputType = 'image/webp';
  if (!supportsWebP && transparent) outputType = 'image/png';
  const outputExt = outputType === 'image/webp' ? 'webp' : outputType === 'image/png' ? 'png' : 'jpg';
  return { outputType, outputExt };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${extension(file.name).toUpperCase()} no se pudo leer. Para fotos HEIC prueba Safari en iPhone o Mac.`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      try {
        const parts = canvas.toDataURL(type, quality).split(',');
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        resolve(new Blob([bytes], { type: parts[0].match(/:(.*?);/)[1] }));
      } catch (error) { reject(error); }
      return;
    }
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('El navegador no pudo exportar este formato.')), type, quality);
  });
}

async function renderImage(image, width, height, outputType, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('No se pudo iniciar el procesador de imágenes.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, outputType, quality);
}

function visualQualityLabel(quality, scale) {
  const score = quality * 0.7 + Math.min(1, scale) * 0.3;
  if (score >= 0.87) return 'Excelente';
  if (score >= 0.76) return 'Muy buena';
  if (score >= 0.65) return 'Buena';
  return 'Reducida';
}

function initialResizeScale(image) {
  if (state.resizeMode === 'original') return 1;
  if (state.resizeMode === 'auto') {
    return Math.min(1, state.maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  }
  const suggested = resizePresets[state.resizeMode];
  const widthLimit = suggested?.width || state.resizeWidth || image.naturalWidth;
  const heightLimit = suggested?.height || state.resizeHeight || image.naturalHeight;
  return Math.min(1, widthLimit / image.naturalWidth, heightLimit / image.naturalHeight);
}

async function findBestCompression(image, file, revision) {
  const { outputType, outputExt } = outputSettings(file);
  const naturalMax = Math.max(image.naturalWidth, image.naturalHeight);
  const effectiveTarget = Math.min(state.targetBytes, Math.max(20 * 1024, Math.floor(file.size * 0.98)));
  let dimensionScale = initialResizeScale(image);
  const mayShrinkFurther = state.resizeMode === 'auto';
  let best = null;
  let smallest = null;
  for (let dimensionPass = 0; dimensionPass < 6; dimensionPass += 1) {
    if (revision !== state.revision) return null;
    const width = Math.max(1, Math.round(image.naturalWidth * dimensionScale));
    const height = Math.max(1, Math.round(image.naturalHeight * dimensionScale));
    if (outputType === 'image/png') {
      const blob = await renderImage(image, width, height, outputType, state.quality);
      const candidate = { blob, width, height, quality: state.quality, scale: dimensionScale, outputType, outputExt };
      if (!smallest || blob.size < smallest.blob.size) smallest = candidate;
      if (blob.size <= effectiveTarget) { best = candidate; break; }
    } else {
      let low = 0.45;
      let high = state.quality;
      let passBest = null;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        if (revision !== state.revision) return null;
        const quality = (low + high) / 2;
        const blob = await renderImage(image, width, height, outputType, quality);
        const candidate = { blob, width, height, quality, scale: dimensionScale, outputType, outputExt };
        if (!smallest || blob.size < smallest.blob.size) smallest = candidate;
        if (blob.size <= effectiveTarget) { passBest = candidate; low = quality; } else { high = quality; }
      }
      if (passBest) { best = passBest; break; }
    }
    if (!mayShrinkFurther || naturalMax * dimensionScale * 0.8 < 640) break;
    dimensionScale *= 0.8;
  }
  return best || smallest;
}

async function compressImage(item, revision) {
  const image = await loadImage(item.file);
  if (revision !== state.revision) return;
  const result = await findBestCompression(image, item.file, revision);
  if (!result || revision !== state.revision) return;
  let finalBlob = result.blob;
  let keptOriginal = false;
  if (!state.stripMetadata && item.file.size <= state.targetBytes && item.file.size < result.blob.size) {
    finalBlob = item.file; keptOriginal = true;
  }
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  item.blob = finalBlob;
  item.outputUrl = URL.createObjectURL(finalBlob);
  item.outputName = keptOriginal ? item.file.name : `${baseName(item.file.name)}-reducido-${Math.ceil(state.targetBytes / 1024)}kb.${result.outputExt}`;
  item.width = keptOriginal ? image.naturalWidth : result.width;
  item.height = keptOriginal ? image.naturalHeight : result.height;
  item.originalWidth = image.naturalWidth;
  item.originalHeight = image.naturalHeight;
  item.quality = keptOriginal ? 1 : result.quality;
  item.scale = keptOriginal ? 1 : result.scale;
  item.targetBytes = state.targetBytes;
  item.targetHit = finalBlob.size <= state.targetBytes;
  item.metadataRemoved = state.stripMetadata && !keptOriginal;
  item.qualityLabel = visualQualityLabel(item.quality, item.scale);
  item.processing = false; item.error = null;
  updateCard(item); updateBatch(); updateProcessingSummary();
}

function buildCard(item) {
  const card = ui.template.content.firstElementChild.cloneNode(true);
  item.card = card;
  card.dataset.id = item.id;
  card.querySelector('.file-name').textContent = item.file.name;
  card.querySelector('.file-meta').textContent = `${formatBytes(item.file.size)} · ${item.file.type || extension(item.file.name).toUpperCase()}`;
  const preview = card.querySelector('.file-preview');
  if (item.isImage) {
    const image = document.createElement('img'); image.alt = ''; image.src = item.previewUrl; preview.append(image);
  } else preview.textContent = extension(item.file.name).slice(0, 5);
  card.querySelector('.remove-button').addEventListener('click', () => removeItem(item.id));
  ui.results.append(card);
  updateCard(item);
}

function updateCard(item) {
  if (!item.card) return;
  const progress = item.card.querySelector('.progress-track span');
  const status = item.card.querySelector('.file-status');
  const action = item.card.querySelector('.file-action');
  action.replaceChildren();
  if (!item.isImage) {
    progress.style.width = '100%';
    const advice = recommendationFor(item.file);
    status.textContent = 'Análisis listo · no se modificó el archivo';
    const box = document.createElement('div'); box.className = 'recommendation';
    box.innerHTML = `<strong>${advice.title}</strong>${advice.detail}`; action.append(box); return;
  }
  if (item.processing || (!item.blob && !item.error)) {
    progress.classList.remove('error'); progress.style.width = '56%';
    status.innerHTML = '<span class="working-label">ANALIZANDO</span> Probando calidad y resolución…'; return;
  }
  if (item.error) {
    progress.style.width = '100%'; progress.classList.add('error');
    status.innerHTML = `<span class="result-badge miss">NO PROCESADO</span><span class="result-line">${item.error}</span>`; return;
  }
  progress.classList.remove('error'); progress.style.width = '100%';
  const saved = Math.max(0, item.file.size - item.blob.size);
  const percent = item.file.size ? Math.round(saved / item.file.size * 100) : 0;
  const targetBadge = item.targetHit ? '<span class="result-badge hit">✓ OBJETIVO CUMPLIDO</span>' : '<span class="result-badge miss">CERCA DEL OBJETIVO</span>';
  const privacyBadge = item.metadataRemoved ? '<span class="privacy-result">ESCUDO PRIVADO · METADATOS ELIMINADOS</span>' : '';
  const dimensions = item.originalWidth === item.width && item.originalHeight === item.height
    ? `${item.width}×${item.height}px · medidas conservadas`
    : `${item.originalWidth}×${item.originalHeight} → <strong>${item.width}×${item.height}px</strong>`;
  status.innerHTML = `${targetBadge}<span class="result-line">${formatBytes(item.file.size)} → <strong>${formatBytes(item.blob.size)}</strong> · ${percent}% menos</span><span class="result-line">Medidas: ${dimensions}</span><span class="result-line">Calidad visual: <strong>${item.qualityLabel}</strong> ${privacyBadge}</span>`;
  const compareButton = document.createElement('button');
  compareButton.className = 'compare-button'; compareButton.type = 'button'; compareButton.textContent = 'Comparar';
  compareButton.addEventListener('click', () => openCompare(item));
  const saveButton = document.createElement('button');
  saveButton.className = 'download-button'; saveButton.type = 'button';
  saveButton.textContent = isTouchDevice ? 'Guardar archivo' : 'Descargar';
  saveButton.addEventListener('click', () => saveItem(item));
  action.append(compareButton, saveButton);
}

function addFiles(fileList) {
  [...fileList].forEach((file) => {
    if (state.items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) return;
    const ext = extension(file.name);
    const isImage = (file.type.startsWith('image/') || /^(jpe?g|png|webp|heic|heif)$/i.test(ext)) && !/^(svg|gif)$/i.test(ext);
    const item = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, file, isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : null, outputUrl: null,
      blob: null, processing: isImage, error: null,
    };
    state.items.push(item); buildCard(item);
  });
  ui.fileInput.value = ''; syncLayout(); recompressAll();
}

function removeItem(id) {
  const index = state.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = state.items.splice(index, 1);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  item.card.remove(); syncLayout();
}

function syncLayout() {
  const hasFiles = state.items.length > 0;
  ui.controls.hidden = !hasFiles;
  ui.dropZone.style.display = hasFiles ? 'none' : '';
  updateBatch(); updateProcessingSummary();
}
function updateProcessingSummary() {
  const images = state.items.filter((item) => item.isImage);
  ui.processingSummary.hidden = !images.length || !images.some((item) => item.processing);
}
function updateBatch() {
  const images = state.items.filter((item) => item.isImage && item.blob && !item.processing);
  ui.batchActions.hidden = images.length === 0;
  if (!images.length) return;
  const original = images.reduce((sum, item) => sum + item.file.size, 0);
  const compressed = images.reduce((sum, item) => sum + item.blob.size, 0);
  const saved = Math.max(0, original - compressed);
  const hits = images.filter((item) => item.targetHit).length;
  ui.batchSummary.textContent = `${images.length} ${images.length === 1 ? 'imagen lista' : 'imágenes listas'}`;
  ui.batchSaved.textContent = `${hits}/${images.length} cumplen el objetivo · Ahorro: ${formatBytes(saved)} (${original ? Math.round(saved / original * 100) : 0}%)`;
}

function updateComparePosition(value) {
  ui.compareAfter.style.clipPath = `inset(0 ${100 - Number(value)}% 0 0)`;
  ui.compareDivider.style.left = `${value}%`;
}
function openCompare(item) {
  if (!item.outputUrl) return;
  ui.compareTitle.textContent = item.file.name;
  ui.compareDescription.textContent = `Calidad ${item.qualityLabel.toLowerCase()} · ${formatBytes(item.blob.size)} finales`;
  ui.compareBefore.src = item.previewUrl; ui.compareAfter.src = item.outputUrl;
  ui.compareRange.value = 50; updateComparePosition(50);
  ui.compareStats.innerHTML = `<div><span>ORIGINAL</span><strong>${formatBytes(item.file.size)}</strong></div><div><span>RESULTADO</span><strong>${formatBytes(item.blob.size)}</strong></div><div><span>AHORRO</span><strong>${Math.max(0, Math.round((1 - item.blob.size / item.file.size) * 100))}%</strong></div><div><span>PRIVACIDAD</span><strong>${item.metadataRemoved ? 'Limpia' : 'Original'}</strong></div>`;
  ui.compareModal.hidden = false; document.body.classList.add('modal-open');
  ui.compareModal.querySelector('.compare-close').focus();
}
function closeCompare() { ui.compareModal.hidden = true; document.body.classList.remove('modal-open'); }

function downloadItem(item) {
  if (!item.outputUrl) return;
  const link = document.createElement('a'); link.href = item.outputUrl; link.download = item.outputName; link.rel = 'noopener';
  document.body.append(link); link.click(); link.remove();
}
async function saveItem(item) {
  if (!item.outputUrl || !item.blob) return;
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const outputExtension = item.outputName.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = item.blob.type || 'image/jpeg';
      const handle = await window.showSaveFilePicker({ suggestedName: item.outputName, types: [{ description: 'Imagen reducida', accept: { [mimeType]: [`.${outputExtension}`] } }] });
      const writable = await handle.createWritable(); await writable.write(item.blob); await writable.close();
      ui.mobileSaveHint.hidden = false;
      ui.mobileSaveHint.innerHTML = '<strong>Archivo guardado.</strong> Se guardó en la ubicación que elegiste.'; return;
    } catch (error) { if (error?.name === 'AbortError') return; }
  }
  downloadItem(item);
  if (isAppleMobile) {
    ui.mobileSaveHint.hidden = false;
    ui.mobileSaveHint.innerHTML = '<strong>Descarga iniciada.</strong> Encuentra la imagen en <b>Archivos → Descargas</b> de tu iPhone o iPad.';
  } else if (isTouchDevice) {
    ui.mobileSaveHint.hidden = false;
    ui.mobileSaveHint.innerHTML = '<strong>Descarga iniciada.</strong> Revisa la carpeta <b>Descargas</b> de tu dispositivo.';
  }
}

async function recompressAll() {
  const revision = ++state.revision;
  const images = state.items.filter((item) => item.isImage);
  images.forEach((item) => { item.processing = true; item.error = null; updateCard(item); });
  updateProcessingSummary(); updateBatch();
  for (const item of images) {
    if (revision !== state.revision) break;
    try { await compressImage(item, revision); }
    catch (error) {
      if (revision !== state.revision) break;
      item.processing = false; item.error = error?.message || 'No se pudo procesar esta imagen.';
      updateCard(item); updateProcessingSummary();
    }
  }
}

function selectPreset(name) {
  const preset = destinationPresets[name];
  if (!preset) return;
  Object.assign(state, { preset: name, quality: preset.quality, targetBytes: preset.targetBytes, maxDimension: preset.maxDimension });
  ui.qualityRange.value = Math.round(state.quality * 100); ui.qualityOutput.value = `${ui.qualityRange.value}%`;
  if (preset.targetBytes >= 1024 * 1024 && preset.targetBytes % (1024 * 1024) === 0) {
    ui.targetSize.value = preset.targetBytes / (1024 * 1024); ui.targetUnit.value = 'MB';
  } else { ui.targetSize.value = Math.round(preset.targetBytes / 1024); ui.targetUnit.value = 'KB'; }
  ui.presetGroup.querySelectorAll('.preset').forEach((button) => {
    const selected = button.dataset.preset === name;
    button.classList.toggle('active', selected); button.setAttribute('aria-checked', String(selected));
  });
  setResizeMode('auto', false);
  recompressAll();
}

function setResizeMode(mode, shouldCompress = true) {
  ui.manualResize.hidden = mode !== 'manual';
  ui.resizePresetGroup.querySelectorAll('.resize-preset').forEach((button) => {
    const selected = button.dataset.resize === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  if (mode === 'manual') {
    ui.resizeWidth.focus();
    return;
  }
  state.resizeMode = mode;
  if (shouldCompress) recompressAll();
}

ui.dropZone.addEventListener('click', () => ui.fileInput.click());
ui.dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ui.fileInput.click(); } });
ui.fileInput.addEventListener('change', () => addFiles(ui.fileInput.files));
ui.addMoreBtn.addEventListener('click', () => ui.fileInput.click());
['dragenter', 'dragover'].forEach((type) => ui.dropZone.addEventListener(type, (event) => { event.preventDefault(); ui.dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((type) => ui.dropZone.addEventListener(type, (event) => { event.preventDefault(); ui.dropZone.classList.remove('dragging'); }));
ui.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
ui.presetGroup.addEventListener('click', (event) => { const button = event.target.closest('.preset'); if (button) selectPreset(button.dataset.preset); });
ui.resizePresetGroup.addEventListener('click', (event) => {
  const button = event.target.closest('.resize-preset');
  if (button) setResizeMode(button.dataset.resize);
});
ui.applyResizeBtn.addEventListener('click', () => {
  const width = Number(ui.resizeWidth.value);
  const height = Number(ui.resizeHeight.value);
  if (!Number.isFinite(width) || width < 100 || width > 10000) { ui.resizeWidth.focus(); return; }
  if (!Number.isFinite(height) || height < 100 || height > 10000) { ui.resizeHeight.focus(); return; }
  state.resizeMode = 'manual'; state.resizeWidth = width; state.resizeHeight = height;
  ui.applyResizeBtn.textContent = '✓ Medidas aplicadas';
  setTimeout(() => { ui.applyResizeBtn.textContent = 'Aplicar medidas'; }, 1600);
  recompressAll();
});
ui.applyTargetBtn.addEventListener('click', () => {
  const value = Number(ui.targetSize.value);
  if (!Number.isFinite(value) || value <= 0) { ui.targetSize.focus(); return; }
  Object.assign(state, { preset: 'custom', targetBytes: value * (ui.targetUnit.value === 'MB' ? 1024 * 1024 : 1024), maxDimension: 2600 });
  ui.presetGroup.querySelectorAll('.preset').forEach((button) => { button.classList.remove('active'); button.setAttribute('aria-checked', 'false'); });
  ui.applyTargetBtn.textContent = '✓ Objetivo aplicado'; setTimeout(() => { ui.applyTargetBtn.textContent = 'Aplicar objetivo'; }, 1600);
  recompressAll();
});
ui.qualityRange.addEventListener('input', () => { ui.qualityOutput.value = `${ui.qualityRange.value}%`; });
ui.qualityRange.addEventListener('change', () => { state.quality = Number(ui.qualityRange.value) / 100; recompressAll(); });
ui.stripMetadata.addEventListener('change', () => { state.stripMetadata = ui.stripMetadata.checked; recompressAll(); });
ui.compareRange.addEventListener('input', () => updateComparePosition(ui.compareRange.value));
ui.compareModal.addEventListener('click', (event) => { if (event.target.closest('[data-close-compare]')) closeCompare(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !ui.compareModal.hidden) closeCompare(); });
ui.downloadAllBtn.addEventListener('click', async () => {
  const images = state.items.filter((item) => item.isImage && item.blob && !item.processing);
  if (images.length === 1) return saveItem(images[0]);
  for (const item of images) { downloadItem(item); await new Promise((resolve) => setTimeout(resolve, 250)); }
  if (isAppleMobile) {
    ui.mobileSaveHint.hidden = false;
    ui.mobileSaveHint.innerHTML = `<strong>${images.length} descargas iniciadas.</strong> Safari puede pedir permiso para descargar varios archivos. Búscalos en <b>Archivos → Descargas</b>.`;
  } else if (isTouchDevice) {
    ui.mobileSaveHint.hidden = false;
    ui.mobileSaveHint.innerHTML = `<strong>${images.length} descargas iniciadas.</strong> Revisa la carpeta <b>Descargas</b> de tu dispositivo.`;
  }
});
window.addEventListener('beforeunload', () => state.items.forEach((item) => {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
}));
