import fs from 'node:fs/promises';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';

const COLOR_PRESETS = {
  gray:  { r: 0.7, g: 0.7, b: 0.7 },
  red:   { r: 0.9, g: 0.2, b: 0.2 },
  blue:  { r: 0.2, g: 0.3, b: 0.8 },
  green: { r: 0.2, g: 0.7, b: 0.3 },
};

export const watermarkPDF = async (inputPath, outputPath, options = {}) => {
  const text = options.text || 'CONFIDENTIAL';
  const opacity = Math.min(1, Math.max(0.05, parseFloat(options.opacity) || 0.15));
  const colorName = (options.color || 'gray').toLowerCase();
  const position = (options.position || 'diagonal').toLowerCase();

  if (text.length > 100) {
    throw new ValidationError('Watermark text must be 100 characters or fewer.');
  }

  const colorPreset = COLOR_PRESETS[colorName] || COLOR_PRESETS.gray;

  const pdfBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.min(width, height) * 0.08;
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    if (position === 'center') {
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size: fontSize,
        font,
        color: rgb(colorPreset.r, colorPreset.g, colorPreset.b),
        opacity,
      });
    } else {
      // Diagonal watermark — rotated 45 degrees across the page
      page.drawText(text, {
        x: width * 0.1,
        y: height * 0.3,
        size: fontSize,
        font,
        color: rgb(colorPreset.r, colorPreset.g, colorPreset.b),
        opacity,
        rotate: { type: 'degrees', angle: 45 },
      });
    }
  }

  const outputBytes = await doc.save();
  await fs.writeFile(outputPath, outputBytes);

  return {
    outputPath,
    pageCount: doc.getPageCount(),
    watermarkText: text,
    watermarkOpacity: opacity,
    watermarkColor: colorName,
    watermarkPosition: position,
  };
};
