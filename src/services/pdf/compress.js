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
  },
  best: {
    label: 'best',
    ghostscriptSetting: '/ebook',
  },
  heavy: {
    label: 'heavy',
    ghostscriptSetting: '/screen',
  },
};

let ghostscriptAvailable;

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

const canUseGhostscript = async () => {
  if (typeof ghostscriptAvailable === 'boolean') {
    return ghostscriptAvailable;
  }

  try {
    await execFileAsync('gs', ['--version']);
    ghostscriptAvailable = true;
  } catch {
    ghostscriptAvailable = false;
  }

  return ghostscriptAvailable;
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

const createGhostscriptCandidate = async (inputPath, ghostscriptSetting) => {
  if (!(await canUseGhostscript())) {
    return null;
  }

  const tempOutputPath = path.join(
    os.tmpdir(),
    generateUniqueFilename('ghostscript-compressed.pdf')
  );

  try {
    await execFileAsync('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-dPDFSETTINGS=${ghostscriptSetting}`,
      `-sOutputFile=${tempOutputPath}`,
      inputPath,
    ]);

    return {
      bytes: await fs.readFile(tempOutputPath),
      engine: 'ghostscript',
    };
  } catch (err) {
    logger.warn('Ghostscript compression failed, using pdf-lib fallback', {
      inputPath,
      ghostscriptSetting,
      error: err.message,
    });
    return null;
  } finally {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
  }
};

export const compressPDF = async (inputPath, outputPath, options = {}) => {
  const preset = getCompressionPreset(options.level);
  const pdfBytes = await fs.readFile(inputPath);
  const originalSizeBytes = pdfBytes.length;

  const pdfLibCandidate = await createPdfLibCandidate(pdfBytes);
  const candidates = [pdfLibCandidate];

  const ghostscriptCandidate = await createGhostscriptCandidate(
    inputPath,
    preset.ghostscriptSetting
  );

  if (ghostscriptCandidate) {
    candidates.push(ghostscriptCandidate);
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
