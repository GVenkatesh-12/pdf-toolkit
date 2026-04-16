import fs from 'node:fs/promises';
import { PDFDocument, degrees } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';

const ALLOWED_ANGLES = new Set([90, 180, 270]);

export const rotatePDF = async (inputPath, outputPath, options = {}) => {
  const angle = Number.parseInt(options.angle, 10);

  if (!ALLOWED_ANGLES.has(angle)) {
    throw new ValidationError('Rotate requires angle 90, 180, or 270 degrees.');
  }

  const pdfBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(pdfBytes);

  for (const page of doc.getPages()) {
    page.setRotation(degrees(angle));
  }

  const outputBytes = await doc.save();
  await fs.writeFile(outputPath, outputBytes);

  return {
    outputPath,
    pageCount: doc.getPageCount(),
    rotatedPages: doc.getPageCount(),
    angle: `${angle}deg`,
  };
};
