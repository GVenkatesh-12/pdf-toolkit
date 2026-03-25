// ═══════════════════════════════════════════════════════════════
// PDF Toolkit -- Frontend Application
// ═══════════════════════════════════════════════════════════════

const API = '/api';
const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const SPLIT_THUMB_LIMIT = 8;

const pdfjs = window.pdfjsLib || null;
if (pdfjs) {
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
}

// ── State ────────────────────────────────────────────────────
const state = {
  activePanel: 'home',
  files: { merge: [], split: [], compress: [] },
  jobs: [],
  pollingIntervals: {},
  splitPreview: {
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    isLoading: false,
    error: '',
    fileToken: 0,
    renderToken: 0,
  },
};

// ── DOM References ───────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Navigation ───────────────────────────────────────────────

function switchPanel(panelId) {
  state.activePanel = panelId;

  $$('.panel').forEach((p) => p.classList.remove('active'));
  $(`#panel-${panelId}`)?.classList.add('active');

  $$('.tab').forEach((t) => t.classList.remove('active'));
  $$(`.tab[data-panel="${panelId}"]`).forEach((t) => t.classList.add('active'));

  $$('.sidebar-item').forEach((s) => s.classList.remove('active'));
  $$(`.sidebar-item[data-panel="${panelId}"]`).forEach((s) => s.classList.add('active'));

  const fileNames = {
    home: 'welcome.md', merge: 'merge.sh',
    split: 'split.sh', compress: 'compress.sh', jobs: 'jobs.log',
  };
  $('#statusFile').textContent = fileNames[panelId] || panelId;

  if (panelId === 'split' && state.splitPreview.pdfDoc) {
    renderSplitMainPreview();
  }
}

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
});
$$('.sidebar-item').forEach((item) => {
  item.addEventListener('click', () => switchPanel(item.dataset.panel));
});

// ── File Helpers ─────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}

function renderCompressionSummary(result) {
  if (!result?.originalSize || !result?.compressedSize) return '';

  return `
    <div class="result-summary">
      <div><span class="cmt">level:</span> <span class="val">${escapeHtml(result.compressionLevel || 'best')}</span></div>
      <div><span class="cmt">size:</span> <span class="val">${escapeHtml(result.originalSize)}</span> <span class="cmt">&rarr;</span> <span class="val">${escapeHtml(result.compressedSize)}</span></div>
      <div><span class="cmt">difference:</span> <span class="val">${escapeHtml(result.savedBytes || '0 B')}</span> <span class="cmt">saved</span> <span class="val">(${escapeHtml(result.savedPercent || '0.0%')})</span></div>
    </div>`;
}

// ── Drop Zones & File Inputs ─────────────────────────────────

function setupDropZone(operation) {
  const dropZone = $(`#${operation}DropZone`);
  const fileInput = $(`#${operation}FileInput`);
  if (!dropZone || !fileInput) return;

  ['dragenter', 'dragover'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropZone.addEventListener(evt, () => {
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'),
    );
    addFiles(operation, files);
  });

  fileInput.addEventListener('change', () => {
    addFiles(operation, Array.from(fileInput.files));
    fileInput.value = '';
  });
}

function addFiles(operation, newFiles) {
  const maxFiles = operation === 'merge' ? 10 : 1;

  if (operation !== 'merge') {
    state.files[operation] = [];
  }

  for (const file of newFiles) {
    if (state.files[operation].length >= maxFiles) break;
    state.files[operation].push(file);
  }

  renderFileList(operation);
  updateExecButton(operation);

  if (operation === 'split') {
    if (state.files.split[0]) {
      loadSplitPreview(state.files.split[0]);
    } else {
      resetSplitPreview();
    }
  }
}

function removeFile(operation, index) {
  state.files[operation].splice(index, 1);
  renderFileList(operation);
  updateExecButton(operation);

  if (operation === 'split' && state.files.split.length === 0) {
    resetSplitPreview();
  }
}

function renderFileList(operation) {
  const container = $(`#${operation}FileList`);
  if (!container) return;

  container.innerHTML = state.files[operation]
    .map(
      (file, i) => `
    <div class="file-entry">
      <div class="file-entry-left">
        <span class="fn">&#9656;</span>
        <span class="file-entry-name">${escapeHtml(file.name)}</span>
        <span class="file-entry-size">${formatSize(file.size)}</span>
      </div>
      <span class="file-entry-remove" data-op="${operation}" data-idx="${i}">&times;</span>
    </div>`,
    )
    .join('');

  container.querySelectorAll('.file-entry-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFile(btn.dataset.op, parseInt(btn.dataset.idx, 10));
    });
  });
}

function updateExecButton(operation) {
  const btn = $(`#${operation}ExecBtn`);
  if (!btn) return;
  const minFiles = operation === 'merge' ? 2 : 1;

  if (state.files[operation].length < minFiles) {
    btn.disabled = true;
    return;
  }

  if (operation === 'split') {
    const splitRange = getSplitRangeState();
    btn.disabled = state.splitPreview.isLoading || !splitRange.valid;
    return;
  }

  btn.disabled = false;
}

['merge', 'split', 'compress'].forEach(setupDropZone);

function setSplitPreviewEmpty(message) {
  const empty = $('#splitPreviewEmpty');
  const wrap = $('#splitPreviewCanvasWrap');
  if (!empty || !wrap) return;

  empty.textContent = message;
  wrap.classList.remove('has-preview');
}

function showSplitPreviewCanvas() {
  $('#splitPreviewCanvasWrap')?.classList.add('has-preview');
}

function resetSplitPreview(message = 'Load a PDF to preview pages.') {
  state.splitPreview.fileToken += 1;
  state.splitPreview.pdfDoc = null;
  state.splitPreview.pageCount = 0;
  state.splitPreview.currentPage = 1;
  state.splitPreview.isLoading = false;
  state.splitPreview.error = '';
  state.splitPreview.renderToken += 1;

  const canvas = $('#splitPreviewCanvas');
  if (canvas) {
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = '0';
    canvas.style.height = '0';
  }

  $('#splitSummary').textContent = 'No PDF loaded.';
  $('#splitSelectionMeta').textContent = 'waiting for file...';
  $('#splitPreviewLabel').textContent = 'page -- / --';
  $('#splitThumbGrid').innerHTML = '<div class="split-empty-card">Selected pages will appear here.</div>';
  $('#splitRangeHint').textContent = 'Select a PDF to inspect its pages before splitting.';
  $('#splitPrevPageBtn').disabled = true;
  $('#splitNextPageBtn').disabled = true;
  setSplitPreviewEmpty(message);
}

function getSplitRangeState() {
  const hasFile = state.files.split.length > 0;
  const start = Number.parseInt($('#splitStart')?.value || '', 10);
  const end = Number.parseInt($('#splitEnd')?.value || '', 10);
  const pageCount = state.splitPreview.pageCount;

  if (!hasFile) {
    return { valid: false, reason: 'Select a PDF to split.', pageCount };
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { valid: false, reason: 'Enter numeric start and end pages.', pageCount };
  }

  if (start < 1 || end < 1) {
    return { valid: false, reason: 'Page numbers start at 1.', pageCount };
  }

  if (start > end) {
    return { valid: false, reason: 'Start page must be less than or equal to end page.', pageCount };
  }

  if (pageCount && end > pageCount) {
    return { valid: false, reason: `End page cannot exceed page ${pageCount}.`, pageCount };
  }

  return {
    valid: true,
    start,
    end,
    count: (end - start) + 1,
    pageCount,
  };
}

function syncSplitInputBounds() {
  const pageCount = state.splitPreview.pageCount;
  const startInput = $('#splitStart');
  const endInput = $('#splitEnd');
  if (!startInput || !endInput) return;

  if (pageCount) {
    startInput.max = String(pageCount);
    endInput.max = String(pageCount);
  } else {
    startInput.removeAttribute('max');
    endInput.removeAttribute('max');
  }
}

function updateSplitPreviewControls() {
  const { pageCount, currentPage } = state.splitPreview;
  const label = $('#splitPreviewLabel');
  if (label) {
    label.textContent = pageCount ? `page ${currentPage} / ${pageCount}` : 'page -- / --';
  }

  const prevBtn = $('#splitPrevPageBtn');
  const nextBtn = $('#splitNextPageBtn');
  if (prevBtn) prevBtn.disabled = !pageCount || currentPage <= 1;
  if (nextBtn) nextBtn.disabled = !pageCount || currentPage >= pageCount;
}

async function renderPdfPageToCanvas(pdfDoc, pageNumber, canvas, targetWidth) {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.max(targetWidth / baseViewport.width, 0.25);
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;
  const context = canvas.getContext('2d');

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  context.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  }).promise;
}

function updateSplitThumbSelection() {
  $$('.split-thumb').forEach((thumb) => {
    thumb.classList.toggle(
      'active',
      Number.parseInt(thumb.dataset.page || '0', 10) === state.splitPreview.currentPage
    );
  });
}

async function renderSplitMainPreview() {
  const { pdfDoc, currentPage, pageCount } = state.splitPreview;
  if (!pdfDoc || !pageCount) {
    setSplitPreviewEmpty(state.splitPreview.error || 'Load a PDF to preview pages.');
    updateSplitPreviewControls();
    return;
  }

  const wrap = $('#splitPreviewCanvasWrap');
  const canvas = $('#splitPreviewCanvas');
  if (!wrap || !canvas) return;

  const renderId = ++state.splitPreview.renderToken;
  showSplitPreviewCanvas();
  updateSplitPreviewControls();

  try {
    const targetWidth = Math.min(Math.max(wrap.clientWidth - 32, 220), 620);
    await renderPdfPageToCanvas(pdfDoc, currentPage, canvas, targetWidth);
    if (renderId !== state.splitPreview.renderToken) return;
    showSplitPreviewCanvas();
    updateSplitThumbSelection();
  } catch {
    if (renderId !== state.splitPreview.renderToken) return;
    state.splitPreview.error = 'Page preview could not be rendered.';
    setSplitPreviewEmpty(state.splitPreview.error);
  }
}

async function renderSplitThumbs(rangeState) {
  const thumbGrid = $('#splitThumbGrid');
  const selectionMeta = $('#splitSelectionMeta');
  const { pdfDoc } = state.splitPreview;
  if (!thumbGrid || !selectionMeta) return;

  if (!pdfDoc || !rangeState.valid || !rangeState.pageCount) {
    selectionMeta.textContent = rangeState.valid
      ? 'preview unavailable'
      : 'waiting for valid range...';
    thumbGrid.innerHTML = '<div class="split-empty-card">Selected pages will appear here.</div>';
    return;
  }

  const pages = [];
  for (let page = rangeState.start; page <= rangeState.end; page += 1) {
    pages.push(page);
    if (pages.length >= SPLIT_THUMB_LIMIT) break;
  }

  selectionMeta.textContent = rangeState.count > SPLIT_THUMB_LIMIT
    ? `showing ${pages.length} of ${rangeState.count} selected pages`
    : `${rangeState.count} page${rangeState.count === 1 ? '' : 's'} selected`;

  thumbGrid.innerHTML = pages.map((pageNumber) => `
    <button type="button" class="split-thumb" data-page="${pageNumber}">
      <canvas class="split-thumb-canvas"></canvas>
      <span class="split-thumb-label">page ${pageNumber}</span>
    </button>
  `).join('');

  thumbGrid.querySelectorAll('.split-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      state.splitPreview.currentPage = Number.parseInt(thumb.dataset.page, 10);
      updateSplitPreviewControls();
      updateSplitThumbSelection();
      renderSplitMainPreview();
    });
  });

  const renderId = ++state.splitPreview.renderToken;

  await Promise.all(
    pages.map(async (pageNumber) => {
      const thumb = thumbGrid.querySelector(`.split-thumb[data-page="${pageNumber}"] .split-thumb-canvas`);
      if (!thumb) return;
      await renderPdfPageToCanvas(pdfDoc, pageNumber, thumb, 120);
    })
  ).catch(() => {
    if (renderId !== state.splitPreview.renderToken) return;
    selectionMeta.textContent = 'thumbnail preview unavailable';
  });

  if (renderId !== state.splitPreview.renderToken) return;
  updateSplitThumbSelection();
}

function updateSplitRangeUI() {
  syncSplitInputBounds();

  const startInput = $('#splitStart');
  const endInput = $('#splitEnd');
  const rangeState = getSplitRangeState();
  const file = state.files.split[0];
  const summary = $('#splitSummary');
  const hint = $('#splitRangeHint');

  startInput?.classList.toggle('invalid', !rangeState.valid);
  endInput?.classList.toggle('invalid', !rangeState.valid);

  if (!file) {
    resetSplitPreview();
    updateExecButton('split');
    return;
  }

  if (state.splitPreview.isLoading) {
    summary.textContent = `Inspecting ${file.name}...`;
    hint.textContent = 'Loading page previews...';
    $('#splitSelectionMeta').textContent = 'building preview...';
    $('#splitThumbGrid').innerHTML = '<div class="split-empty-card">Rendering page previews...</div>';
    setSplitPreviewEmpty('Rendering preview...');
    updateExecButton('split');
    return;
  }

  if (state.splitPreview.error) {
    summary.textContent = `${file.name} loaded. Preview unavailable.`;
    hint.textContent = state.splitPreview.error;
  } else if (state.splitPreview.pageCount) {
    const countText = rangeState.valid
      ? `${rangeState.count} page${rangeState.count === 1 ? '' : 's'} selected`
      : 'invalid range';
    summary.textContent = `${file.name} • ${state.splitPreview.pageCount} pages • ${countText}`;
    hint.textContent = rangeState.valid
      ? `Split will extract pages ${rangeState.start}-${rangeState.end}.`
      : rangeState.reason;
  } else {
    summary.textContent = `${file.name} ready to split.`;
    hint.textContent = rangeState.valid
      ? `Split will extract pages ${rangeState.start}-${rangeState.end}.`
      : rangeState.reason;
  }

  if (rangeState.valid && state.splitPreview.pageCount) {
    state.splitPreview.currentPage = Math.min(
      Math.max(state.splitPreview.currentPage, rangeState.start),
      rangeState.end
    );
  }

  updateExecButton('split');
  updateSplitPreviewControls();

  if (state.splitPreview.pageCount) {
    renderSplitMainPreview();
    renderSplitThumbs(rangeState);
  } else if (!state.splitPreview.error) {
    setSplitPreviewEmpty('Preview is not ready yet.');
  }
}

async function loadSplitPreview(file) {
  const fileToken = ++state.splitPreview.fileToken;
  state.splitPreview.isLoading = true;
  state.splitPreview.error = '';
  state.splitPreview.pdfDoc = null;
  state.splitPreview.pageCount = 0;
  state.splitPreview.currentPage = 1;
  updateSplitRangeUI();

  if (!pdfjs) {
    state.splitPreview.isLoading = false;
    state.splitPreview.error = 'Preview library failed to load, but split still works.';
    updateSplitRangeUI();
    return;
  }

  try {
    const fileBytes = await file.arrayBuffer();
    if (fileToken !== state.splitPreview.fileToken) return;

    const pdfDoc = await pdfjs.getDocument({ data: fileBytes }).promise;
    if (fileToken !== state.splitPreview.fileToken) return;

    state.splitPreview.pdfDoc = pdfDoc;
    state.splitPreview.pageCount = pdfDoc.numPages;
    state.splitPreview.currentPage = 1;
    state.splitPreview.isLoading = false;
    state.splitPreview.error = '';

    $('#splitStart').value = '1';
    $('#splitEnd').value = String(pdfDoc.numPages);

    updateSplitRangeUI();
  } catch {
    if (fileToken !== state.splitPreview.fileToken) return;
    state.splitPreview.isLoading = false;
    state.splitPreview.error = 'Could not parse this PDF for preview. You can still split it manually.';
    updateSplitRangeUI();
  }
}

// ── Terminal Output Helpers ──────────────────────────────────

function appendOutput(panelId, html) {
  const container = $(`#${panelId}Output`);
  if (!container) return;
  const div = document.createElement('div');
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearOutput(panelId) {
  const container = $(`#${panelId}Output`);
  if (container) container.innerHTML = '';
}

function logPrompt(panelId, command) {
  appendOutput(
    panelId,
    `<div class="prompt-line"><span class="prompt">user@pdf-toolkit:~$</span> <span class="cmd">${escapeHtml(command)}</span></div>`,
  );
}

function logResult(panelId, text, cls = '') {
  appendOutput(
    panelId,
    `<div class="output-text ${cls}">${text}</div>`,
  );
}

// ── Job Submission ───────────────────────────────────────────

async function submitJob(operation) {
  const files = state.files[operation];
  if (!files.length) return;

  const btn = $(`#${operation}ExecBtn`);
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = '<span class="spinner"></span> processing...';

  const outputPanel = operation;
  const commandParts = [
    `pdf-toolkit ${operation}`,
    `--files ${files.map((f) => f.name).join(' ')}`,
  ];

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('operation', operation);

  if (operation === 'split') {
    const splitRange = getSplitRangeState();
    if (!splitRange.valid) {
      logResult(outputPanel, `<span class="err">error:</span> ${escapeHtml(splitRange.reason)}`);
      resetExecButton(operation);
      return;
    }

    const start = $('#splitStart').value;
    const end = $('#splitEnd').value;
    formData.append('start', start);
    formData.append('end', end);
    commandParts.push(`--start ${start}`);
    commandParts.push(`--end ${end}`);
  }

  if (operation === 'compress') {
    const level = $('#compressLevel')?.value || 'best';
    formData.append('level', level);
    commandParts.push(`--level ${level}`);
  }

  logPrompt(outputPanel, commandParts.join(' '));

  try {
    const res = await fetch(`${API}/jobs`, { method: 'POST', body: formData });
    const data = await res.json();

    if (data.status !== 'accepted') {
      logResult(outputPanel, `<span class="err">error:</span> ${escapeHtml(data.message)}`);
      resetExecButton(operation);
      return;
    }

    const { jobId } = data.data;
    logResult(outputPanel, `<span class="cmt">job queued:</span> <span class="val">${jobId}</span>`);
    logResult(outputPanel, `<span class="cmt">state:</span> <span class="kw">queued</span> <span class="spinner"></span>`);

    addJobToPanel(jobId, operation);
    pollJob(jobId, operation);
  } catch (err) {
    logResult(outputPanel, `<span class="err">fetch error:</span> ${escapeHtml(err.message)}`);
    resetExecButton(operation);
  }
}

function resetExecButton(operation) {
  const btn = $(`#${operation}ExecBtn`);
  if (!btn) return;
  btn.classList.remove('loading');
  btn.innerHTML = `<span class="prompt-char">$</span> execute ${operation}`;
  updateExecButton(operation);
}

// ── Job Polling ──────────────────────────────────────────────

function pollJob(jobId, operation) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/jobs/${jobId}`);
      const data = await res.json();
      const job = data.data;

      updateJobInPanel(jobId, job);

      if (job.state === 'completed') {
        clearInterval(interval);
        onJobCompleted(jobId, job, operation);
      } else if (job.state === 'failed') {
        clearInterval(interval);
        onJobFailed(jobId, job, operation);
      }
    } catch {
      clearInterval(interval);
    }
  }, 800);

  state.pollingIntervals[jobId] = interval;
}

function onJobCompleted(jobId, job, operation) {
  const outputPanel = operation;

  const lastSpinner = $(`#${outputPanel}Output .spinner`);
  if (lastSpinner) lastSpinner.closest('.output-text')?.remove();

  logResult(outputPanel, `<span class="cmt">state:</span> <span class="val">completed</span> (${job.duration})`);

  if (job.result) {
    if (operation === 'compress') {
      const compressionSummary = renderCompressionSummary(job.result);
      if (compressionSummary) logResult(outputPanel, compressionSummary);
    }

    const hiddenKeys = ['outputPath'];
    if (operation === 'compress') {
      hiddenKeys.push('originalSize', 'compressedSize', 'savedBytes', 'savedPercent', 'compressionLevel');
    }

    const info = Object.entries(job.result)
      .filter(([k]) => !hiddenKeys.includes(k))
      .map(([k, v]) => `<span class="cmt">${escapeHtml(k)}:</span> <span class="val">${escapeHtml(v)}</span>`)
      .join('  ');
    if (info) logResult(outputPanel, info);
  }

  const downloadUrl = job.downloadUrl || `${API}/jobs/${jobId}/download`;
  if (job.downloadName) {
    logResult(
      outputPanel,
      `<span class="cmt">download file:</span> <span class="val">${escapeHtml(job.downloadName)}</span>`,
    );
  }
  logResult(
    outputPanel,
    `<a href="${downloadUrl}" class="job-download" download="${escapeHtml(job.downloadName || '')}">&#11015; download result</a>`,
  );

  resetExecButton(operation);
  state.files[operation] = [];
  renderFileList(operation);
  if (operation === 'split') {
    resetSplitPreview();
  }
  refreshQueueStats();
}

function onJobFailed(jobId, job, operation) {
  const outputPanel = operation;
  const lastSpinner = $(`#${outputPanel}Output .spinner`);
  if (lastSpinner) lastSpinner.closest('.output-text')?.remove();

  logResult(outputPanel, `<span class="err">state: failed</span>`);
  logResult(outputPanel, `<span class="err">error:</span> ${escapeHtml(job.error || 'Unknown error')}`);

  resetExecButton(operation);
  refreshQueueStats();
}

// ── Jobs Panel ───────────────────────────────────────────────

function addJobToPanel(jobId, operation) {
  const entry = {
    id: jobId,
    operation,
    state: 'queued',
    createdAt: new Date().toISOString(),
  };
  state.jobs.unshift(entry);
  renderJobsPanel();

  if (state.activePanel !== 'jobs') {
    const jobsTab = $(`.tab[data-panel="jobs"]`);
    if (jobsTab) jobsTab.style.color = 'var(--amber)';
  }
}

function updateJobInPanel(jobId, jobData) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (job) {
    Object.assign(job, jobData);
    renderJobsPanel();
  }
}

function renderJobsPanel() {
  const container = $('#jobsOutput');
  if (!container) return;

  if (state.jobs.length === 0) {
    container.innerHTML = `
      <div class="prompt-line"><span class="prompt">user@pdf-toolkit:~$</span> <span class="cmd">tail -f jobs.log</span></div>
      <div class="output-text cmt">Waiting for jobs...</div>`;
    return;
  }

  let html = `<div class="prompt-line"><span class="prompt">user@pdf-toolkit:~$</span> <span class="cmd">tail -f jobs.log</span></div>`;

  for (const job of state.jobs) {
    const shortId = job.id.slice(0, 8);
    html += `
      <div class="job-entry">
        <div class="job-header">
          <span class="job-state ${job.state}">${job.state}</span>
          <span class="job-op">${job.operation}</span>
          <span class="job-id">${shortId}...</span>
          ${job.state === 'processing' ? '<span class="spinner"></span>' : ''}
        </div>`;

    if (job.duration) {
      html += `<div class="job-detail">duration: <span class="val">${job.duration}</span></div>`;
    }
    if (job.downloadName) {
      html += `<div class="job-detail">file: <span class="val">${escapeHtml(job.downloadName)}</span></div>`;
    }
    if (job.state === 'completed' && job.id) {
      html += `<a href="${escapeHtml(job.downloadUrl || `${API}/jobs/${job.id}/download`)}" class="job-download" download="${escapeHtml(job.downloadName || '')}">&#11015; download</a>`;
    }
    if (job.state === 'failed' && job.error) {
      html += `<div class="job-detail"><span class="err">error: ${escapeHtml(job.error)}</span></div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ── Execute Buttons ──────────────────────────────────────────

$('#mergeExecBtn')?.addEventListener('click', () => submitJob('merge'));
$('#splitExecBtn')?.addEventListener('click', () => submitJob('split'));
$('#compressExecBtn')?.addEventListener('click', () => submitJob('compress'));

$('#splitStart')?.addEventListener('input', updateSplitRangeUI);
$('#splitEnd')?.addEventListener('input', updateSplitRangeUI);

$('#splitPrevPageBtn')?.addEventListener('click', () => {
  if (state.splitPreview.currentPage <= 1) return;
  state.splitPreview.currentPage -= 1;
  updateSplitPreviewControls();
  renderSplitMainPreview();
});

$('#splitNextPageBtn')?.addEventListener('click', () => {
  if (!state.splitPreview.pageCount || state.splitPreview.currentPage >= state.splitPreview.pageCount) return;
  state.splitPreview.currentPage += 1;
  updateSplitPreviewControls();
  renderSplitMainPreview();
});

let splitResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(splitResizeTimer);
  splitResizeTimer = setTimeout(() => {
    if (state.activePanel === 'split' && state.splitPreview.pdfDoc) {
      renderSplitMainPreview();
    }
  }, 120);
});

resetSplitPreview();

// ── Queue Stats ──────────────────────────────────────────────

async function refreshQueueStats() {
  try {
    const res = await fetch(`${API}/jobs`);
    const data = await res.json();
    const stats = data.data;
    const total = (stats.queued || 0) + (stats.processing || 0);
    $('#queueCount').textContent = total;

    const dot = $('.qi-dot');
    if (dot) {
      dot.style.background =
        total > 0 ? 'var(--amber)' : 'var(--green)';
    }
  } catch {
    // ignore
  }
}

setInterval(refreshQueueStats, 3000);
refreshQueueStats();

// ── Sidebar Operations List ──────────────────────────────────

async function loadOperations() {
  try {
    const res = await fetch(`${API}/pdf/operations`);
    const data = await res.json();
    const container = $('#sidebarOps');
    if (!container || !data.data) return;

    container.innerHTML = data.data.operations
      .map(
        (op) => `
      <div class="sidebar-op-item">
        <span class="op-name">${op.name}</span>
        <span class="op-desc">${op.description}</span>
      </div>`,
      )
      .join('');
  } catch {
    // server might not be ready
  }
}

loadOperations();

// ── CLI Input ────────────────────────────────────────────────

const cliInput = $('#cliInput');
const vimMode = $('#vimMode');

cliInput?.addEventListener('focus', () => {
  vimMode.textContent = 'INSERT';
  vimMode.classList.remove('normal');
  vimMode.classList.add('insert');
});

cliInput?.addEventListener('blur', () => {
  vimMode.textContent = 'NORMAL';
  vimMode.classList.remove('insert');
  vimMode.classList.add('normal');
});

vimMode.classList.add('normal');

cliInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = cliInput.value.trim();
    cliInput.value = '';
    if (cmd) handleCommand(cmd);
  }
});

const CLI_COMMANDS = {
  help() {
    return `<span class="val">Available commands:</span>
  <span class="fn">help</span>      <span class="cmt">-- show this help</span>
  <span class="fn">status</span>    <span class="cmt">-- show queue statistics</span>
  <span class="fn">ops</span>       <span class="cmt">-- list available operations</span>
  <span class="fn">clear</span>     <span class="cmt">-- clear terminal output</span>
  <span class="fn">whoami</span>    <span class="cmt">-- display user info</span>
  <span class="fn">date</span>      <span class="cmt">-- display current date/time</span>
  <span class="fn">health</span>    <span class="cmt">-- check server health</span>
  <span class="fn">merge</span>     <span class="cmt">-- switch to merge panel</span>
  <span class="fn">split</span>     <span class="cmt">-- switch to split panel</span>
  <span class="fn">compress</span>  <span class="cmt">-- switch to compress panel</span>
  <span class="fn">jobs</span>      <span class="cmt">-- switch to jobs panel</span>`;
  },

  whoami() {
    return `<span class="val">user</span> <span class="cmt">@ pdf-toolkit (guest session)</span>`;
  },

  date() {
    return `<span class="val">${new Date().toString()}</span>`;
  },

  clear() {
    clearOutput('home');
    return null;
  },

  async status() {
    try {
      const res = await fetch(`${API}/jobs`);
      const data = await res.json();
      const s = data.data;
      return `<span class="val">Queue Statistics:</span>
  <span class="cmt">queued:</span>     <span class="val">${s.queued}</span>
  <span class="cmt">processing:</span> <span class="val">${s.processing}</span>
  <span class="cmt">completed:</span>  <span class="val">${s.completed}</span>
  <span class="cmt">failed:</span>     <span class="val">${s.failed}</span>
  <span class="cmt">total:</span>      <span class="val">${s.total}</span>`;
    } catch {
      return `<span class="err">error: could not connect to server</span>`;
    }
  },

  async health() {
    try {
      const res = await fetch(`${API}/health`);
      const data = await res.json();
      return `<span class="val">Server Health:</span>
  <span class="cmt">status:</span>    <span class="val">${data.status}</span>
  <span class="cmt">uptime:</span>    <span class="val">${data.uptime}s</span>
  <span class="cmt">timestamp:</span> <span class="val">${data.timestamp}</span>`;
    } catch {
      return `<span class="err">error: server unreachable</span>`;
    }
  },

  async ops() {
    try {
      const res = await fetch(`${API}/pdf/operations`);
      const data = await res.json();
      const lines = data.data.operations
        .map((op) => `  <span class="fn">${op.name.padEnd(12)}</span> <span class="cmt">${op.description}</span>  [${op.minFiles}-${op.maxFiles} files]`)
        .join('\n');
      return `<span class="val">Available Operations:</span>\n${lines}`;
    } catch {
      return `<span class="err">error: could not fetch operations</span>`;
    }
  },

  merge() { switchPanel('merge'); return `<span class="cmt">switched to merge panel</span>`; },
  split() { switchPanel('split'); return `<span class="cmt">switched to split panel</span>`; },
  compress() { switchPanel('compress'); return `<span class="cmt">switched to compress panel</span>`; },
  jobs() { switchPanel('jobs'); return `<span class="cmt">switched to jobs panel</span>`; },
  home() { switchPanel('home'); return `<span class="cmt">switched to home panel</span>`; },
};

async function handleCommand(cmd) {
  const panel = 'home';
  if (state.activePanel !== 'home') {
    switchPanel('home');
  }

  logPrompt(panel, cmd);

  const parts = cmd.split(/\s+/);
  const command = parts[0].toLowerCase();

  if (CLI_COMMANDS[command]) {
    const result = await CLI_COMMANDS[command](...parts.slice(1));
    if (result !== null && result !== undefined) {
      logResult(panel, `<pre>${result}</pre>`);
    }
  } else {
    logResult(panel, `<span class="err">zsh: command not found: ${command}</span>`);
  }
}
