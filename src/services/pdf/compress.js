import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';
import { formatFileSize, generateUniqueFilename } from '../../utils/fileHelpers.js';
import logger from '../../utils/logger.js';

const execFileAsync = promisify(execFile);

const DEFAULT_LEVEL = 'best';

const COMPRESSION_PRESETS = {
  mild: {
    label: 'mild',
    ghostscriptSetting: '/printer',
    imageDPI: 300,
  },
  best: {
    label: 'best',
    ghostscriptSetting: '/ebook',
    imageDPI: 150,
  },
  heavy: {
    label: 'heavy',
    ghostscriptSetting: '/screen',
    imageDPI: 72,
  },
};

const toolAvailability = {};

const getCompressionPreset = (level = DEFAULT_LEVEL) => {
  const normalizedLevel = String(level).toLowerCase();
  const preset = COMPRESSION_PRESETS[normalizedLevel];

  if (!preset) {
    throw new ValidationError(
      `Unknown compression level "${level}". Available levels: mild, best, heavy.`
    );
  }

  return {
    level: normalizedLevel,
    ...preset,
  };
};

const isToolAvailable = async (binary) => {
  if (typeof toolAvailability[binary] === 'boolean') {
    return toolAvailability[binary];
  }

  try {
    const { stdout } = await execFileAsync(binary, ['--version']);
    toolAvailability[binary] = true;
    logger.info(`Compression tool found: ${binary}`, { version: stdout.trim().split('\n')[0] });
  } catch (err) {
    toolAvailability[binary] = false;
    logger.warn(`Compression tool NOT found: ${binary} — install it for better compression`, {
      error: err.code === 'ENOENT' ? 'binary not installed' : err.message,
    });
  }

  return toolAvailability[binary];
};

export const checkCompressionTools = async () => {
  await Promise.all([isToolAvailable('gs'), isToolAvailable('qpdf')]);
  const available = Object.entries(toolAvailability)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const missing = Object.entries(toolAvailability)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    logger.warn(
      `Compression running in degraded mode. Install missing tools: ${missing.join(', ')}. ` +
      'On Ubuntu: sudo apt install ghostscript qpdf -y'
    );
  }

  return { available, missing };
};

const createPdfLibCandidate = async (pdfBytes) => {
  const doc = await PDFDocument.load(pdfBytes, {
    updateMetadata: false,
  });

  const compressedBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  return {
    bytes: compressedBytes,
    engine: 'pdf-lib',
    pageCount: doc.getPageCount(),
  };
};

const GS_TIMEOUT = 120_000;
const QPDF_TIMEOUT = 60_000;

const runGhostscript = async (inputPath, outputPath, preset) => {
  await execFileAsync('gs', [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    `-dPDFSETTINGS=${preset.ghostscriptSetting}`,
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dEmbedAllFonts=true',
    `-dColorImageResolution=${preset.imageDPI}`,
    '-dColorImageDownsampleType=/Bicubic',
    `-dGrayImageResolution=${preset.imageDPI}`,
    '-dGrayImageDownsampleType=/Bicubic',
    `-dMonoImageResolution=${preset.imageDPI}`,
    '-dMonoImageDownsampleType=/Bicubic',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ], { timeout: GS_TIMEOUT });
};

const runQpdf = async (inputPath, outputPath) => {
  await execFileAsync('qpdf', [
    '--recompress-flate',
    '--compression-level=9',
    '--object-streams=generate',
    inputPath,
    outputPath,
  ], { timeout: QPDF_TIMEOUT });
};

export const compressPDF = async (inputPath, outputPath, options = {}) => {
  const preset = getCompressionPreset(options.level);
  const pdfBytes = await fs.readFile(inputPath);
  const originalSizeBytes = pdfBytes.length;

  const gsAvailable = await isToolAvailable('gs');
  const qpdfAvailable = await isToolAvailable('qpdf');

  const pdfLibCandidate = await createPdfLibCandidate(pdfBytes);
  const candidates = [pdfLibCandidate];

  const tempFiles = [];
  const trackTemp = (filePath) => { tempFiles.push(filePath); return filePath; };

  try {
    // Step 1: Run GS once and qpdf-on-original in parallel (the two heaviest tasks)
    const gsOutPath = trackTemp(path.join(os.tmpdir(), generateUniqueFilename('gs.pdf')));
    const qpdfOutPath = trackTemp(path.join(os.tmpdir(), generateUniqueFilename('qpdf.pdf')));

    const parallelTasks = [];

    if (gsAvailable) {
      parallelTasks.push(
        runGhostscript(inputPath, gsOutPath, preset)
          .then(() => fs.readFile(gsOutPath))
          .then((bytes) => { candidates.push({ bytes, engine: 'ghostscript' }); })
          .catch((err) => logger.warn('Ghostscript compression failed', { error: err.message }))
      );
    }

    if (qpdfAvailable) {
      parallelTasks.push(
        runQpdf(inputPath, qpdfOutPath)
          .then((bytes) => fs.readFile(qpdfOutPath))
          .then((bytes) => { candidates.push({ bytes, engine: 'qpdf' }); })
          .catch((err) => logger.warn('qpdf compression failed', { error: err.message }))
      );
    }

    await Promise.all(parallelTasks);

    // Step 2: If GS succeeded and qpdf is available, run qpdf on the GS output (multi-pass)
    const gsSucceeded = candidates.some((c) => c.engine === 'ghostscript');
    if (gsSucceeded && qpdfAvailable) {
      const multiPassOutPath = trackTemp(path.join(os.tmpdir(), generateUniqueFilename('mp.pdf')));
      try {
        await runQpdf(gsOutPath, multiPassOutPath);
        const bytes = await fs.readFile(multiPassOutPath);
        candidates.push({ bytes, engine: 'ghostscript+qpdf' });
      } catch (err) {
        logger.warn('Multi-pass compression failed', { error: err.message });
      }
    }
  } finally {
    await Promise.all(tempFiles.map((f) => fs.rm(f, { force: true }).catch(() => {})));
  }

  const bestCandidate = candidates.reduce((smallest, candidate) => {
    return candidate.bytes.length < smallest.bytes.length ? candidate : smallest;
  });

  const finalBytes = bestCandidate.bytes.length < originalSizeBytes
    ? bestCandidate.bytes
    : pdfBytes;

  await fs.writeFile(outputPath, finalBytes);

  const compressedSizeBytes = finalBytes.length;
  const savedBytesValue = Math.max(0, originalSizeBytes - compressedSizeBytes);
  const savedPercent = originalSizeBytes > 0
    ? ((savedBytesValue / originalSizeBytes) * 100).toFixed(1)
    : '0.0';

  logger.info('Compression complete', {
    engine: compressedSizeBytes < originalSizeBytes ? bestCandidate.engine : 'original',
    level: preset.label,
    originalSize: formatFileSize(originalSizeBytes),
    compressedSize: formatFileSize(compressedSizeBytes),
    savedPercent: `${savedPercent}%`,
    candidateCount: candidates.length,
  });

  return {
    outputPath,
    pageCount: pdfLibCandidate.pageCount,
    compressionLevel: preset.label,
    compressionEngine: compressedSizeBytes < originalSizeBytes
      ? bestCandidate.engine
      : 'original',
    originalSize: formatFileSize(originalSizeBytes),
    compressedSize: formatFileSize(compressedSizeBytes),
    savedBytes: formatFileSize(savedBytesValue),
    savedPercent: `${savedPercent}%`,
  };
};
