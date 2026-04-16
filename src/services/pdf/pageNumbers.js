import fs from 'node:fs/promises';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const POSITION_MAP = {
  'bottom-center': (width, _height, textWidth) => ({
    x: (width - textWidth) / 2,
    y: 24,
  }),
  'bottom-right': (width, _height, textWidth) => ({
    x: width - textWidth - 36,
    y: 24,
  }),
  'bottom-left': (_width, _height, _textWidth) => ({
    x: 36,
    y: 24,
  }),
  'top-center': (width, height, textWidth) => ({
    x: (width - textWidth) / 2,
    y: height - 36,
  }),
  'top-right': (width, height, textWidth) => ({
    x: width - textWidth - 36,
    y: height - 36,
  }),
};

export const addPageNumbersPDF = async (inputPath, outputPath, options = {}) => {
  const position = (options.position || 'bottom-center').toLowerCase();
  const startNumber = parseInt(options.startNumber, 10) || 1;
  const format = (options.format || 'page-x-of-y').toLowerCase();
  const fontSize = 10;

  const pdfBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const totalPages = pages.length;

  const positionFn = POSITION_MAP[position] || POSITION_MAP['bottom-center'];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = startNumber + i;
    const { width, height } = page.getSize();

    let text;
    switch (format) {
      case 'number-only':
        text = `${pageNum}`;
        break;
      case 'page-x':
        text = `Page ${pageNum}`;
        break;
      case 'page-x-of-y':
      default:
        text = `Page ${pageNum} of ${totalPages + startNumber - 1}`;
        break;
    }

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const { x, y } = positionFn(width, height, textWidth);

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const outputBytes = await doc.save();
  await fs.writeFile(outputPath, outputBytes);

  return {
    outputPath,
    pageCount: totalPages,
    numberFormat: format,
    numberPosition: position,
    startNumber,
  };
};
