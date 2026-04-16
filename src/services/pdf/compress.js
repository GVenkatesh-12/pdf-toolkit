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
    await execFileAsync(binary, ['--version']);
    toolAvailability[binary] = true;
  } catch {
    toolAvailability[binary] = false;
  }

  return toolAvailability[binary];
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

const createGhostscriptCandidate = async (inputPath, preset) => {
  if (!(await isToolAvailable('gs'))) {
    return null;
  }

  const tempOutputPath = path.join(
    os.tmpdir(),
    generateUniqueFilename('gs-compressed.pdf')
  );

  try {
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
      `-sOutputFile=${tempOutputPath}`,
      inputPath,
    ]);

    return {
      bytes: await fs.readFile(tempOutputPath),
      engine: 'ghostscript',
    };
  } catch (err) {
    logger.warn('Ghostscript compression failed', {
      inputPath,
      error: err.message,
    });
    return null;
  } finally {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
  }
};

const createQpdfCandidate = async (inputPath) => {
  if (!(await isToolAvailable('qpdf'))) {
    return null;
  }

  const tempOutputPath = path.join(
    os.tmpdir(),
    generateUniqueFilename('qpdf-compressed.pdf')
  );

  try {
    await execFileAsync('qpdf', [
      '--recompress-flate',
      '--compression-level=9',
      '--object-streams=generate',
      inputPath,
      tempOutputPath,
    ]);

    return {
      bytes: await fs.readFile(tempOutputPath),
      engine: 'qpdf',
    };
  } catch (err) {
    logger.warn('qpdf compression failed', {
      inputPath,
      error: err.message,
    });
    return null;
  } finally {
    await fs.rm(tempOutputPath, { force: true }).catch(() => {});
  }
};

const createMultiPassCandidate = async (inputPath, preset) => {
  const gsAvailable = await isToolAvailable('gs');
  const qpdfAvailable = await isToolAvailable('qpdf');
  if (!gsAvailable || !qpdfAvailable) {
    return null;
  }

  const gsTemp = path.join(os.tmpdir(), generateUniqueFilename('mp-gs.pdf'));
  const qpdfTemp = path.join(os.tmpdir(), generateUniqueFilename('mp-qpdf.pdf'));

  try {
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
      `-sOutputFile=${gsTemp}`,
      inputPath,
    ]);

    await execFileAsync('qpdf', [
      '--recompress-flate',
      '--compression-level=9',
      '--object-streams=generate',
      gsTemp,
      qpdfTemp,
    ]);

    return {
      bytes: await fs.readFile(qpdfTemp),
      engine: 'ghostscript+qpdf',
    };
  } catch (err) {
    logger.warn('Multi-pass compression failed', {
      inputPath,
      error: err.message,
    });
    return null;
  } finally {
    await Promise.all([
      fs.rm(gsTemp, { force: true }).catch(() => {}),
      fs.rm(qpdfTemp, { force: true }).catch(() => {}),
    ]);
  }
};

export const compressPDF = async (inputPath, outputPath, options = {}) => {
  const preset = getCompressionPreset(options.level);
  const pdfBytes = await fs.readFile(inputPath);
  const originalSizeBytes = pdfBytes.length;

  const [pdfLibCandidate, gsCandidate, qpdfCandidate, multiPassCandidate] =
    await Promise.all([
      createPdfLibCandidate(pdfBytes),
      createGhostscriptCandidate(inputPath, preset),
      createQpdfCandidate(inputPath),
      createMultiPassCandidate(inputPath, preset),
    ]);

  const candidates = [pdfLibCandidate];
  if (gsCandidate) candidates.push(gsCandidate);
  if (qpdfCandidate) candidates.push(qpdfCandidate);
  if (multiPassCandidate) candidates.push(multiPassCandidate);

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
