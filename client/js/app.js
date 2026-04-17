// ═══════════════════════════════════════════════════════════════
// PDF Toolkit — Frontend Application (Modern UI)
// ═══════════════════════════════════════════════════════════════

const API = '/api';

// ── Session Management ─────────────────────────────────────────
// Each browser tab gets a unique session ID for file isolation.
function getSessionId() {
  let sid = sessionStorage.getItem('pdf-toolkit-session');
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem('pdf-toolkit-session', sid);
  }
  return sid;
}

const SESSION_ID = getSessionId();

function apiHeaders() {
  return { 'X-Session-ID': SESSION_ID };
}

// ── DOM Helpers ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── State ──────────────────────────────────────────────────────
const state = {
  currentView: 'home',
  currentTool: null,
  files: [],
  isProcessing: false,
  // Preview state
  previewPages: 0,
  selectedPages: new Set(),
  pdfDoc: null,
  // Cancellation state
  activeXhr: null,
  activeJobId: null,
  pollAbortController: null,
};

// Tools that benefit from page preview
const PREVIEW_TOOLS = new Set(['split', 'remove-pages', 'rotate']);

// ── Tool Definitions ───────────────────────────────────────────
const TOOLS = {
  merge: {
    title: 'Merge PDF',
    subtitle: 'Combine multiple PDFs into a single document',
    iconClass: 'tool-icon--merge',
    maxFiles: 10,
    multi: true,
    options: [],
  },
  split: {
    title: 'Split PDF',
    subtitle: 'Extract a range of pages from your PDF',
    iconClass: 'tool-icon--split',
    maxFiles: 1,
    multi: false,
    options: [
      { key: 'start', label: 'Start Page', type: 'number', default: 1, min: 1 },
      { key: 'end', label: 'End Page', type: 'number', default: 1, min: 1 },
    ],
  },
  compress: {
    title: 'Compress PDF',
    subtitle: 'Reduce file size with adjustable quality',
    iconClass: 'tool-icon--compress',
    maxFiles: 1,
    multi: false,
    options: [
      {
        key: 'level', label: 'Level', type: 'select',
        choices: [
          { value: 'mild', label: 'Mild — keeps more quality' },
          { value: 'best', label: 'Best — balanced (default)' },
          { value: 'heavy', label: 'Heavy — maximum compression' },
        ],
        default: 'best',
      },
    ],
  },
  rotate: {
    title: 'Rotate PDF',
    subtitle: 'Rotate all pages by 90°, 180°, or 270°',
    iconClass: 'tool-icon--rotate',
    maxFiles: 1,
    multi: false,
    options: [
      {
        key: 'angle', label: 'Angle', type: 'select',
        choices: [
          { value: '90', label: '90° clockwise' },
          { value: '180', label: '180°' },
          { value: '270', label: '270° clockwise' },
        ],
        default: '90',
      },
    ],
  },
  'remove-pages': {
    title: 'Remove Pages',
    subtitle: 'Delete specific pages from your PDF',
    iconClass: 'tool-icon--remove',
    maxFiles: 1,
    multi: false,
    options: [
      { key: 'pages', label: 'Pages', type: 'text', placeholder: 'e.g. 2, 4-6, 9', hint: 'Click thumbnails below to select pages, or type page numbers above' },
    ],
  },
  watermark: {
    title: 'Watermark',
    subtitle: 'Add text watermarks to every page',
    iconClass: 'tool-icon--watermark',
    maxFiles: 1,
    multi: false,
    options: [
      { key: 'text', label: 'Text', type: 'text', default: 'CONFIDENTIAL', placeholder: 'Watermark text' },
      {
        key: 'color', label: 'Color', type: 'select',
        choices: [
          { value: 'gray', label: 'Gray' },
          { value: 'red', label: 'Red' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' },
        ],
        default: 'gray',
      },
      {
        key: 'position', label: 'Position', type: 'select',
        choices: [
          { value: 'diagonal', label: 'Diagonal' },
          { value: 'center', label: 'Center' },
        ],
        default: 'diagonal',
      },
      { key: 'opacity', label: 'Opacity', type: 'number', default: 0.15, min: 0.05, max: 1, step: 0.05 },
    ],
  },
  'page-numbers': {
    title: 'Page Numbers',
    subtitle: 'Add page numbers to your PDF',
    iconClass: 'tool-icon--pagenums',
    maxFiles: 1,
    multi: false,
    options: [
      {
        key: 'position', label: 'Position', type: 'select',
        choices: [
          { value: 'bottom-center', label: 'Bottom Center' },
          { value: 'bottom-right', label: 'Bottom Right' },
          { value: 'bottom-left', label: 'Bottom Left' },
          { value: 'top-center', label: 'Top Center' },
          { value: 'top-right', label: 'Top Right' },
        ],
        default: 'bottom-center',
      },
      {
        key: 'format', label: 'Format', type: 'select',
        choices: [
          { value: 'page-x-of-y', label: 'Page X of Y' },
          { value: 'page-x', label: 'Page X' },
          { value: 'number-only', label: 'Number only' },
        ],
        default: 'page-x-of-y',
      },
      { key: 'startNumber', label: 'Start At', type: 'number', default: 1, min: 1 },
    ],
  },
  unlock: {
    title: 'Unlock PDF',
    subtitle: 'Remove password protection from a PDF',
    iconClass: 'tool-icon--unlock',
    maxFiles: 1,
    multi: false,
    options: [
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Enter the PDF password' },
    ],
  },
};

// ── Utilities ──────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function escapeHtml(value) {
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'success'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : type === 'error'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span>${escapeHtml(message)}</span>
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  const close = () => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

// ── Theme Toggle ───────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('pdf-toolkit-theme');
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

$('#themeToggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pdf-toolkit-theme', next);
});

initTheme();

// ── Navigation ─────────────────────────────────────────────────
function showView(viewId) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  const view = $(`#view-${viewId}`);
  if (view) {
    view.classList.remove('active');
    // Force reflow for animation
    void view.offsetWidth;
    view.classList.add('active');
  }
  state.currentView = viewId;
}

function openTool(toolName) {
  const tool = TOOLS[toolName];
  if (!tool) return;

  state.currentTool = toolName;
  state.files = [];
  state.isProcessing = false;

  // Set header info
  const opIcon = $('#opIcon');
  opIcon.className = `op-icon ${tool.iconClass}`;
  opIcon.innerHTML = document.querySelector(`.tool-card[data-tool="${toolName}"] .tool-icon`).innerHTML;

  $('#opTitle').textContent = tool.title;
  $('#opSubtitle').textContent = tool.subtitle;

  // Configure file input
  const fileInput = $('#fileInput');
  fileInput.multiple = tool.multi;
  $('#uploadSubtitle').textContent = tool.multi
    ? `or click to browse — ${tool.maxFiles} files max, 50 MB each`
    : 'or click to browse — 1 file, max 50 MB';

  // Render options
  renderOptions(tool.options);

  // Reset state
  renderFileList();
  clearPreview();
  updateExecButton();
  hideResult();
  hideProgress();

  // Reset exec button state
  const btn = $('#execBtn');
  btn.classList.remove('loading');

  showView('operation');
}

function goHome() {
  if (state.isProcessing) {
    cancelCurrentOperation();
  }
  state.currentTool = null;
  state.files = [];
  clearPreview();
  showView('home');
}

// Tool card clicks
$$('.tool-card').forEach((card) => {
  card.addEventListener('click', () => openTool(card.dataset.tool));
});

// Back button
$('#backBtn')?.addEventListener('click', goHome);
$('#logoLink')?.addEventListener('click', (e) => { e.preventDefault(); goHome(); });

// ── Options Rendering ──────────────────────────────────────────
function renderOptions(options) {
  const panel = $('#optionsPanel');
  if (!options || options.length === 0) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = options.map((opt) => {
    let inputHtml = '';

    if (opt.type === 'select') {
      const optionsHtml = opt.choices.map((c) =>
        `<option value="${c.value}" ${c.value === opt.default ? 'selected' : ''}>${escapeHtml(c.label)}</option>`
      ).join('');
      inputHtml = `<select class="option-select" id="opt-${opt.key}">${optionsHtml}</select>`;
    } else if (opt.type === 'number') {
      inputHtml = `<input type="number" class="option-input" id="opt-${opt.key}"
        value="${opt.default || ''}" min="${opt.min || ''}" max="${opt.max || ''}" step="${opt.step || 1}" />`;
    } else if (opt.type === 'password') {
      inputHtml = `<input type="password" class="option-input" id="opt-${opt.key}"
        value="${opt.default || ''}" placeholder="${opt.placeholder || ''}" autocomplete="off" style="min-width:200px;" />`;
    } else {
      inputHtml = `<input type="text" class="option-input" id="opt-${opt.key}"
        value="${opt.default || ''}" placeholder="${opt.placeholder || ''}" style="min-width:200px;" />`;
    }

    const hintHtml = opt.hint ? `<span class="option-hint">${escapeHtml(opt.hint)}</span>` : '';

    return `<div class="option-group">
      <span class="option-label">${escapeHtml(opt.label)}</span>
      ${inputHtml}
      ${hintHtml}
    </div>`;
  }).join('');
}

function getOptionValues() {
  const tool = TOOLS[state.currentTool];
  if (!tool) return {};

  const values = {};
  for (const opt of tool.options) {
    const el = $(`#opt-${opt.key}`);
    if (el) values[opt.key] = el.value;
  }
  return values;
}

// ── File Handling ──────────────────────────────────────────────
function addFiles(newFiles) {
  const tool = TOOLS[state.currentTool];
  if (!tool) return;

  const pdfs = Array.from(newFiles).filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfs.length === 0) {
    showToast('Please select PDF files only.', 'error');
    return;
  }

  const maxSize = 50 * 1024 * 1024;
  for (const f of pdfs) {
    if (f.size > maxSize) {
      showToast(`File "${f.name}" exceeds the 50 MB limit.`, 'error');
      return;
    }
  }

  if (!tool.multi) {
    state.files = [pdfs[0]];
  } else {
    for (const f of pdfs) {
      if (state.files.length >= tool.maxFiles) break;
      state.files.push(f);
    }
  }

  renderFileList();
  updateExecButton();
  hideResult();

  // Render preview for tools that need it
  if (PREVIEW_TOOLS.has(state.currentTool) && state.files.length === 1) {
    renderPreview(state.files[0]);
  } else {
    clearPreview();
  }
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderFileList();
  updateExecButton();
  if (state.files.length === 0) clearPreview();
}

function renderFileList() {
  const container = $('#fileList');
  if (!container) return;

  if (state.files.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = state.files.map((file, i) => `
    <div class="file-entry">
      <div class="file-entry-info">
        <div class="file-entry-icon">PDF</div>
        <div class="file-entry-name-wrap">
          <div class="file-entry-name">${escapeHtml(file.name)}</div>
          <div class="file-entry-size">${formatSize(file.size)}</div>
        </div>
      </div>
      <button class="file-entry-remove" data-idx="${i}" title="Remove file">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.file-entry-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.idx, 10)));
  });
}

function updateExecButton() {
  const btn = $('#execBtn');
  if (!btn) return;

  const tool = TOOLS[state.currentTool];
  const minFiles = state.currentTool === 'merge' ? 2 : 1;

  btn.disabled = state.isProcessing || state.files.length < minFiles;
}

// ── Upload Zone ────────────────────────────────────────────────
const uploadZone = $('#uploadZone');
const fileInput = $('#fileInput');

if (uploadZone) {
  ['dragenter', 'dragover'].forEach((evt) => {
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    uploadZone.addEventListener(evt, () => {
      uploadZone.classList.remove('drag-over');
    });
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
}

if (fileInput) {
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
}

// ── Progress ───────────────────────────────────────────────────
function showProgress(label = 'Uploading...', percent = -1) {
  const wrap = $('#progressWrap');
  const lbl = $('#progressLabel');
  const fill = $('#progressFill');
  wrap.style.display = 'block';
  lbl.textContent = label;

  if (percent < 0) {
    fill.style.width = '0%';
    fill.classList.add('indeterminate');
  } else {
    fill.classList.remove('indeterminate');
    fill.style.width = `${Math.min(100, percent)}%`;
  }
}

function hideProgress() {
  $('#progressWrap').style.display = 'none';
  const fill = $('#progressFill');
  fill.style.width = '0%';
  fill.classList.remove('indeterminate');
}

// ── Result ─────────────────────────────────────────────────────
function showResult(meta, downloadUrl, downloadName) {
  const panel = $('#resultPanel');
  const metaEl = $('#resultMeta');
  const dlBtn = $('#downloadBtn');

  metaEl.innerHTML = meta;
  dlBtn.href = downloadUrl;
  dlBtn.download = downloadName || '';
  panel.style.display = 'block';
}

function hideResult() {
  $('#resultPanel').style.display = 'none';
}

$('#processAnotherBtn')?.addEventListener('click', () => {
  state.files = [];
  renderFileList();
  updateExecButton();
  hideResult();
  hideProgress();
  clearPreview();
});

// ═══════════════════════════════════════════════════════════════
// PDF Page Preview System
// Uses pdf.js to render page thumbnails client-side.
// - remove-pages: click thumbnails to toggle removal, auto-fills input
// - split: highlights start–end range, syncs with input fields
// - rotate: shows pages so the user knows what they're rotating
// ═══════════════════════════════════════════════════════════════

function clearPreview() {
  const panel = $('#previewPanel');
  const grid = $('#previewGrid');
  panel.style.display = 'none';
  grid.innerHTML = '';
  state.previewPages = 0;
  state.selectedPages = new Set();
  if (state.pdfDoc) {
    state.pdfDoc.destroy();
    state.pdfDoc = null;
  }
}

async function renderPreview(file) {
  clearPreview();

  const panel = $('#previewPanel');
  const grid = $('#previewGrid');
  const loading = $('#previewLoading');
  const info = $('#previewInfo');
  const hint = $('#previewHint');
  const title = $('#previewTitle');

  panel.style.display = 'block';
  loading.style.display = 'flex';
  grid.innerHTML = '';

  // Set hint text based on current tool
  if (state.currentTool === 'remove-pages') {
    title.textContent = 'Select Pages to Remove';
    hint.textContent = 'Click on pages you want to remove. Selected pages will be highlighted in red.';
  } else if (state.currentTool === 'split') {
    title.textContent = 'Page Preview';
    hint.textContent = 'Set the start and end page above. Included pages will be highlighted in blue.';
  } else {
    title.textContent = 'Page Preview';
    hint.textContent = '';
  }

  try {
    // Configure pdf.js worker
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    state.pdfDoc = pdf;
    state.previewPages = pdf.numPages;

    info.textContent = `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;

    // Update split end-page default to match total pages
    if (state.currentTool === 'split') {
      const endInput = $('#opt-end');
      if (endInput && (!endInput.value || endInput.value === '1')) {
        endInput.value = pdf.numPages;
      }
    }

    loading.style.display = 'none';

    // Render all pages as thumbnails
    const thumbWidth = 180; // px for rendering quality

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scale = thumbWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      thumb.dataset.page = pageNum;
      thumb.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'preview-thumb-label';
      label.textContent = `Page ${pageNum}`;
      thumb.appendChild(label);

      // Click handler for remove-pages
      if (state.currentTool === 'remove-pages') {
        thumb.addEventListener('click', () => togglePageSelection(pageNum));
      }
      // Click handler for split — click to set range start or end
      if (state.currentTool === 'split') {
        thumb.addEventListener('click', () => handleSplitPageClick(pageNum));
      }

      grid.appendChild(thumb);
    }

    // Initial highlight pass
    updatePreviewHighlights();

    // Wire split inputs to update highlights in real time
    if (state.currentTool === 'split') {
      const startInput = $('#opt-start');
      const endInput = $('#opt-end');
      if (startInput) startInput.addEventListener('input', updatePreviewHighlights);
      if (endInput) endInput.addEventListener('input', updatePreviewHighlights);
    }

    // Wire remove-pages text input to sync thumbnails (debounced)
    if (state.currentTool === 'remove-pages') {
      const pagesInput = $('#opt-pages');
      if (pagesInput) {
        let syncTimer = null;
        pagesInput.addEventListener('input', () => {
          clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            syncSelectedPagesFromInput(pagesInput.value);
            updatePreviewHighlights();
          }, 150);
        });
      }
    }

  } catch (err) {
    loading.style.display = 'none';
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1;text-align:center;padding:24px;">Could not render preview: ${escapeHtml(err.message)}</p>`;
  }
}

// ── Remove-pages: toggle page selection ─────────────────────────
function togglePageSelection(pageNum) {
  if (state.selectedPages.has(pageNum)) {
    state.selectedPages.delete(pageNum);
  } else {
    // Don't allow selecting ALL pages
    if (state.selectedPages.size >= state.previewPages - 1) {
      showToast('You must keep at least one page.', 'error');
      return;
    }
    state.selectedPages.add(pageNum);
  }

  // Update the pages text input
  const pagesInput = $('#opt-pages');
  if (pagesInput) {
    const sorted = [...state.selectedPages].sort((a, b) => a - b);
    pagesInput.value = compactPageList(sorted);
  }

  updatePreviewHighlights();
}

// Convert [1,2,3,5,7,8,9] → "1-3, 5, 7-9"
function compactPageList(pages) {
  if (pages.length === 0) return '';
  const ranges = [];
  let start = pages[0];
  let end = pages[0];

  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === end + 1) {
      end = pages[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = pages[i];
      end = pages[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

// ── Remove-pages: sync thumbnails from text input ──────────────
function syncSelectedPagesFromInput(value) {
  const pages = new Set();
  const chunks = value.split(',').map(s => s.trim()).filter(Boolean);

  const addIfValid = (n) => {
    if (Number.isInteger(n) && n >= 1 && n <= state.previewPages) pages.add(n);
  };

  for (const chunk of chunks) {
    if (chunk.includes('-')) {
      const parts = chunk.split('-').map(s => s.trim());
      const rawStart = parseInt(parts[0], 10);
      const rawEnd = parseInt(parts[1], 10);

      if (Number.isInteger(rawStart) && Number.isInteger(rawEnd) && rawStart <= rawEnd) {
        for (let p = rawStart; p <= rawEnd; p++) addIfValid(p);
      } else if (Number.isInteger(rawStart)) {
        // Partial range like "3-" while still typing — keep the start page selected
        addIfValid(rawStart);
      }
    } else {
      addIfValid(parseInt(chunk, 10));
    }
  }

  if (pages.size >= state.previewPages) {
    showToast('You must keep at least one page.', 'error');
    pages.delete([...pages].pop());
  }

  state.selectedPages = pages;
}

// ── Split: click to set range ──────────────────────────────────
let splitClickState = 'start'; // alternates between 'start' and 'end'

function handleSplitPageClick(pageNum) {
  const startInput = $('#opt-start');
  const endInput = $('#opt-end');
  if (!startInput || !endInput) return;

  if (splitClickState === 'start') {
    startInput.value = pageNum;
    // If end is less than new start, auto-adjust
    if (parseInt(endInput.value, 10) < pageNum) {
      endInput.value = pageNum;
    }
    splitClickState = 'end';
    showToast(`Start page set to ${pageNum}. Click another page to set end.`, 'info', 2000);
  } else {
    endInput.value = pageNum;
    // If start is greater than new end, auto-adjust
    if (parseInt(startInput.value, 10) > pageNum) {
      startInput.value = pageNum;
    }
    splitClickState = 'start';
    showToast(`Page range set: ${startInput.value}–${endInput.value}`, 'success', 2000);
  }

  updatePreviewHighlights();
}

// ── Update thumbnail highlights ────────────────────────────────
function updatePreviewHighlights() {
  const thumbs = $$('.preview-thumb');
  if (thumbs.length === 0) return;

  if (state.currentTool === 'remove-pages') {
    thumbs.forEach((thumb) => {
      const page = parseInt(thumb.dataset.page, 10);
      thumb.classList.toggle('selected', state.selectedPages.has(page));
    });
  }

  if (state.currentTool === 'split') {
    const startInput = $('#opt-start');
    const endInput = $('#opt-end');
    const start = parseInt(startInput?.value, 10) || 1;
    const end = parseInt(endInput?.value, 10) || state.previewPages;

    thumbs.forEach((thumb) => {
      const page = parseInt(thumb.dataset.page, 10);
      const inRange = page >= start && page <= end;
      thumb.classList.toggle('in-range', inRange);
      thumb.classList.toggle('out-of-range', !inRange);
    });
  }
}

// ── Cancellation ──────────────────────────────────────────────
function cleanupProcessingState() {
  state.activeXhr = null;
  state.activeJobId = null;
  state.pollAbortController = null;
}

async function cancelCurrentOperation() {
  if (!state.isProcessing) return;

  if (state.activeXhr) {
    state.activeXhr.abort();
    state.activeXhr = null;
  }

  if (state.pollAbortController) {
    state.pollAbortController.abort();
    state.pollAbortController = null;
  }

  if (state.activeJobId) {
    try {
      await fetch(`${API}/jobs/${state.activeJobId}`, {
        method: 'DELETE',
        headers: apiHeaders(),
      });
    } catch {
      // Best effort — server may already be done
    }
    state.activeJobId = null;
  }

  state.isProcessing = false;
  hideProgress();

  const btn = $('#execBtn');
  btn.classList.remove('loading');
  updateExecButton();
  showCancelBtn(false);
  showToast('Operation cancelled.', 'info');
}

function showCancelBtn(visible) {
  const btn = $('#cancelBtn');
  if (btn) btn.style.display = visible ? 'inline-flex' : 'none';
}

// ── Job Submission ─────────────────────────────────────────────
async function submitJob() {
  if (state.isProcessing || state.files.length === 0) return;

  const btn = $('#execBtn');

  state.isProcessing = true;
  btn.classList.add('loading');
  btn.disabled = true;
  hideResult();
  showCancelBtn(true);

  const formData = new FormData();
  state.files.forEach((f) => formData.append('files', f));
  formData.append('operation', state.currentTool);

  const options = getOptionValues();
  for (const [key, value] of Object.entries(options)) {
    if (value !== '') formData.append(key, value);
  }

  showProgress('Uploading files...');

  try {
    const { data } = await uploadWithProgress(formData);

    if (!state.isProcessing) return;

    if (data.status !== 'accepted') {
      throw new Error(data.message || 'Server rejected the request');
    }

    const { jobId } = data.data;
    state.activeJobId = jobId;
    showProgress('Processing...', -1);

    const result = await pollJobUntilDone(jobId);

    if (!state.isProcessing) return;

    hideProgress();
    showCancelBtn(false);

    if (result.state === 'completed') {
      const rawUrl = result.downloadUrl || `${API}/jobs/${jobId}/download`;
      const sep = rawUrl.includes('?') ? '&' : '?';
      const downloadUrl = `${rawUrl}${sep}sessionId=${SESSION_ID}`;
      const downloadName = result.downloadName || 'result.pdf';

      let metaHtml = '';
      if (result.result) {
        const hiddenKeys = ['outputPath'];
        const entries = Object.entries(result.result)
          .filter(([k]) => !hiddenKeys.includes(k))
          .map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`)
          .join(' &nbsp;·&nbsp; ');
        if (entries) metaHtml = entries;
      }
      if (result.duration) {
        metaHtml += (metaHtml ? '<br>' : '') + `Completed in ${escapeHtml(result.duration)}`;
      }

      showResult(metaHtml || 'Your PDF has been processed successfully.', downloadUrl, downloadName);
      showToast('PDF processed successfully!', 'success');

      state.files = [];
      renderFileList();
    } else if (result.state === 'cancelled') {
      // Already handled by cancelCurrentOperation
      return;
    } else {
      throw new Error(result.error || 'Processing failed');
    }
  } catch (err) {
    if (!state.isProcessing) return;
    hideProgress();
    showCancelBtn(false);
    if (err.name === 'AbortError') return;
    showToast(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    state.isProcessing = false;
    btn.classList.remove('loading');
    updateExecButton();
    showCancelBtn(false);
    cleanupProcessingState();
  }
}

function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    state.activeXhr = xhr;

    xhr.open('POST', `${API}/jobs`);
    xhr.setRequestHeader('X-Session-ID', SESSION_ID);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        showProgress(`Uploading... ${pct}%`, pct);
      }
    };

    xhr.onload = () => {
      state.activeXhr = null;
      try {
        const data = JSON.parse(xhr.responseText);
        resolve({ data });
      } catch {
        reject(new Error('Invalid server response'));
      }
    };

    xhr.onerror = () => {
      state.activeXhr = null;
      reject(new Error('Network error. Is the server running?'));
    };

    xhr.onabort = () => {
      state.activeXhr = null;
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.send(formData);
  });
}

async function pollJobUntilDone(jobId, maxPolls = 300) {
  const controller = new AbortController();
  state.pollAbortController = controller;

  try {
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 800));

      if (controller.signal.aborted) {
        throw new DOMException('Polling cancelled', 'AbortError');
      }

      try {
        const res = await fetch(`${API}/jobs/${jobId}`, {
          headers: apiHeaders(),
          signal: controller.signal,
        });
        const data = await res.json();
        const job = data.data;

        if (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') {
          return job;
        }

        showProgress(`Processing... (attempt ${job.attempts || 1})`, -1);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        // Retry on other network errors
      }
    }

    throw new Error('Processing timed out. Please try again.');
  } finally {
    state.pollAbortController = null;
  }
}

// Execute button
$('#execBtn')?.addEventListener('click', submitJob);

// Cancel button
$('#cancelBtn')?.addEventListener('click', cancelCurrentOperation);

// ── Queue Stats ────────────────────────────────────────────────
async function refreshQueueStats() {
  try {
    const res = await fetch(`${API}/jobs`, { headers: apiHeaders() });
    const data = await res.json();
    const stats = data.data;
    const active = (stats.queued || 0) + (stats.processing || 0);

    const label = $('#queueLabel');
    const dot = $('#statusDot');

    if (active > 0) {
      label.textContent = `${active} job${active > 1 ? 's' : ''} active`;
      dot.style.background = 'var(--warning)';
    } else {
      label.textContent = 'Ready';
      dot.style.background = 'var(--success)';
    }
  } catch {
    // ignore
  }
}

setInterval(refreshQueueStats, 5000);
refreshQueueStats();

// ── Page Unload Protection ─────────────────────────────────────
window.addEventListener('beforeunload', (e) => {
  if (state.isProcessing) {
    e.preventDefault();
    return '';
  }
});

window.addEventListener('unload', () => {
  if (state.activeJobId) {
    const url = `${API}/jobs/${state.activeJobId}`;
    navigator.sendBeacon(url + `?_method=DELETE&sessionId=${SESSION_ID}`);
  }
});

// ── Keyboard Shortcuts ─────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.currentView === 'operation') {
    if (state.isProcessing) {
      cancelCurrentOperation();
    } else {
      goHome();
    }
  }
});

// ── Initialization ─────────────────────────────────────────────
showView('home');
