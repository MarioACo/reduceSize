const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const controls = document.querySelector('#controls');
const results = document.querySelector('#results');
const template = document.querySelector('#resultTemplate');
const qualityRange = document.querySelector('#qualityRange');
const qualityOutput = document.querySelector('#qualityOutput');
const presetGroup = document.querySelector('#presetGroup');
const addMoreBtn = document.querySelector('#addMoreBtn');
const batchActions = document.querySelector('#batchActions');
const batchSummary = document.querySelector('#batchSummary');
const batchSaved = document.querySelector('#batchSaved');
const downloadAllBtn = document.querySelector('#downloadAllBtn');
const downloadAllLabel = document.querySelector('#downloadAllLabel');
const mobileSaveHint = document.querySelector('#mobileSaveHint');

const state = { items: [], quality: 0.78, revision: 0 };
const presets = { light: 0.9, balanced: 0.78, small: 0.62 };
const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const supportsWebP = (() => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
})();

mobileSaveHint.hidden = !isTouchDevice;
if (isTouchDevice) downloadAllLabel.textContent = 'Guardar / compartir';

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const place = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** place;
  return `${value >= 10 || place === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[place]}`;
};

const extension = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : 'archivo';
const baseName = (name) => name.replace(/\.[^/.]+$/, '');

function recommendationFor(file) {
  const type = file.type;
  const ext = extension(file.name);
  if (type === 'application/pdf' || ext === 'pdf') {
    return { title: 'Objetivo: 1–5 MB', detail: 'Usa 150 DPI, imágenes JPG al 75–82% y elimina páginas o fuentes innecesarias.' };
  }
  if (type.startsWith('video/')) {
    return { title: 'Objetivo: 8–20 MB/min', detail: 'Exporta en MP4 (H.264), 1080p a 4–8 Mbps o 720p a 2–4 Mbps.' };
  }
  if (type.startsWith('audio/')) {
    return { title: 'Objetivo: 1–2 MB/min', detail: 'Para voz usa AAC/MP3 a 96–128 kbps; para música, 192–256 kbps.' };
  }
  if (/zip|rar|7z/.test(ext)) {
    return { title: 'Ya está comprimido', detail: 'Es probable que reducirlo más produzca muy poco ahorro.' };
  }
  if (/docx?|pptx?|xlsx?/.test(ext)) {
    return { title: 'Objetivo: menos de 10 MB', detail: 'Comprime las imágenes internas a 150 DPI y elimina contenido multimedia incrustado.' };
  }
  return { title: 'Revisa el formato', detail: 'Convierte recursos visuales a WEBP/JPG o empaqueta archivos de texto como ZIP.' };
}

function outputSettings(file) {
  const transparent = file.type === 'image/png';
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
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      try {
        const dataUrl = canvas.toDataURL(type, quality);
        const parts = dataUrl.split(',');
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        resolve(new Blob([bytes], { type: parts[0].match(/:(.*?);/)[1] }));
      } catch (error) {
        reject(error);
      }
      return;
    }
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Safari no pudo exportar este formato')),
      type,
      quality,
    );
  });
}

async function compressImage(item, revision) {
  const image = await loadImage(item.file);
  if (revision !== state.revision) return;
  const maxDimension = state.quality >= 0.88 ? 3000 : state.quality >= 0.72 ? 2200 : 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const { outputType, outputExt } = outputSettings(item.file);
  if (outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, outputType, state.quality);
  if (revision !== state.revision) return;
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  item.blob = blob.size < item.file.size ? blob : item.file;
  item.outputUrl = URL.createObjectURL(item.blob);
  item.outputName = blob.size < item.file.size ? `${baseName(item.file.name)}-reducido.${outputExt}` : item.file.name;
  item.width = width;
  item.height = height;
  item.processing = false;
  updateCard(item);
  updateBatch();
}

function buildCard(item) {
  const card = template.content.firstElementChild.cloneNode(true);
  item.card = card;
  card.dataset.id = item.id;
  card.querySelector('.file-name').textContent = item.file.name;
  card.querySelector('.file-meta').textContent = `${formatBytes(item.file.size)} · ${item.file.type || extension(item.file.name).toUpperCase()}`;
  const preview = card.querySelector('.file-preview');
  if (item.isImage) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = item.previewUrl;
    preview.append(image);
  } else {
    preview.textContent = extension(item.file.name).slice(0, 5);
  }
  card.querySelector('.remove-button').addEventListener('click', () => removeItem(item.id));
  results.append(card);
  updateCard(item);
}

function updateCard(item) {
  if (!item.card) return;
  const progress = item.card.querySelector('.progress-track span');
  const status = item.card.querySelector('.file-status');
  const action = item.card.querySelector('.file-action');
  action.replaceChildren();
  if (item.isImage) {
    if (item.processing || !item.blob) {
      progress.style.width = '54%';
      status.textContent = 'Optimizando en tu navegador…';
      return;
    }
    progress.style.width = '100%';
    const saved = Math.max(0, item.file.size - item.blob.size);
    const percent = item.file.size ? Math.round(saved / item.file.size * 100) : 0;
    status.innerHTML = `${formatBytes(item.file.size)} → <strong>${formatBytes(item.blob.size)}</strong> · ${item.width}×${item.height}px · ${percent}% menos`;
    const button = document.createElement('button');
    button.className = 'download-button';
    button.type = 'button';
    button.textContent = isTouchDevice ? 'Guardar / compartir' : 'Descargar';
    button.addEventListener('click', () => saveItem(item));
    action.append(button);
  } else {
    progress.style.width = '100%';
    const advice = recommendationFor(item.file);
    status.textContent = 'Análisis listo · no se modificó el archivo';
    const box = document.createElement('div');
    box.className = 'recommendation';
    box.innerHTML = `<strong>${advice.title}</strong>${advice.detail}`;
    action.append(box);
  }
}

function addFiles(fileList) {
  [...fileList].forEach((file) => {
    const duplicate = state.items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (duplicate) return;
    const isImage = file.type.startsWith('image/') && !file.type.includes('svg') && !file.type.includes('gif');
    const item = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      file,
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
      outputUrl: null,
      blob: null,
      processing: isImage,
    };
    state.items.push(item);
    buildCard(item);
  });
  fileInput.value = '';
  syncLayout();
  recompressAll();
}

function removeItem(id) {
  const index = state.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = state.items.splice(index, 1);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  item.card.remove();
  syncLayout();
}

function syncLayout() {
  const hasFiles = state.items.length > 0;
  controls.hidden = !hasFiles;
  dropZone.style.display = hasFiles ? 'none' : '';
  updateBatch();
}

function updateBatch() {
  const images = state.items.filter((item) => item.isImage && item.blob);
  batchActions.hidden = images.length === 0;
  if (!images.length) return;
  const original = images.reduce((sum, item) => sum + item.file.size, 0);
  const compressed = images.reduce((sum, item) => sum + item.blob.size, 0);
  const saved = Math.max(0, original - compressed);
  const percent = original ? Math.round(saved / original * 100) : 0;
  batchSummary.textContent = `${images.length} ${images.length === 1 ? 'imagen lista' : 'imágenes listas'}`;
  batchSaved.textContent = `Ahorro total: ${formatBytes(saved)} (${percent}%)`;
}

function downloadableFile(item) {
  try {
    return new File([item.blob], item.outputName, { type: item.blob.type || 'application/octet-stream' });
  } catch {
    return item.blob;
  }
}

function canShareFiles(files) {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

function downloadItem(item) {
  if (!item.outputUrl) return;
  const link = document.createElement('a');
  link.href = item.outputUrl;
  link.download = item.outputName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}

async function saveItem(item) {
  if (!item.outputUrl || !item.blob) return;
  const file = downloadableFile(item);
  if (file instanceof File && canShareFiles([file])) {
    try {
      await navigator.share({
        files: [file],
        title: item.outputName,
        text: 'Imagen reducida con ReduceSize',
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  if (isAppleMobile) {
    const opened = window.open(item.outputUrl, '_blank', 'noopener');
    if (opened) return;
  }
  downloadItem(item);
}

function recompressAll() {
  const revision = ++state.revision;
  state.items.filter((item) => item.isImage).forEach((item) => {
    item.processing = true;
    item.card?.querySelector('.progress-track span').style.setProperty('width', '38%');
    item.card?.querySelector('.file-status').replaceChildren(document.createTextNode('Optimizando en tu navegador…'));
    compressImage(item, revision).catch((error) => {
      item.processing = false;
      item.card.querySelector('.file-status').textContent = error.message;
    });
  });
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => addFiles(fileInput.files));
addMoreBtn.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

presetGroup.addEventListener('click', (event) => {
  const button = event.target.closest('.preset');
  if (!button) return;
  presetGroup.querySelectorAll('.preset').forEach((preset) => {
    const selected = preset === button;
    preset.classList.toggle('active', selected);
    preset.setAttribute('aria-checked', String(selected));
  });
  state.quality = presets[button.dataset.preset];
  qualityRange.value = Math.round(state.quality * 100);
  qualityOutput.value = `${qualityRange.value}%`;
  recompressAll();
});

qualityRange.addEventListener('input', () => {
  qualityOutput.value = `${qualityRange.value}%`;
  state.quality = Number(qualityRange.value) / 100;
  presetGroup.querySelectorAll('.preset').forEach((preset) => {
    preset.classList.remove('active');
    preset.setAttribute('aria-checked', 'false');
  });
});
qualityRange.addEventListener('change', recompressAll);

downloadAllBtn.addEventListener('click', async () => {
  const images = state.items.filter((item) => item.isImage && item.blob);
  const files = images.map(downloadableFile).filter((file) => file instanceof File);
  if (files.length && files.length === images.length && canShareFiles(files)) {
    try {
      await navigator.share({
        files,
        title: 'Imágenes reducidas',
        text: `${files.length} ${files.length === 1 ? 'imagen reducida' : 'imágenes reducidas'} con ReduceSize`,
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  for (const item of images) {
    if (isAppleMobile) {
      await saveItem(item);
    } else {
      downloadItem(item);
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
});

window.addEventListener('beforeunload', () => {
  state.items.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  });
});
