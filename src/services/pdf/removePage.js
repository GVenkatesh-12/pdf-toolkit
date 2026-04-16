import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';

const parsePageSelection = (pagesInput, totalPages) => {
  if (!pagesInput || typeof pagesInput !== 'string') {
    throw new ValidationError('Remove pages requires a pages option like "2,4-6".');
  }

  const pages = new Set();
  const chunks = pagesInput.split(',').map((part) => part.trim()).filter(Boolean);

  if (chunks.length === 0) {
    throw new ValidationError('Remove pages requires at least one page number.');
  }

  for (const chunk of chunks) {
    if (chunk.includes('-')) {
      const [rawStart, rawEnd] = chunk.split('-').map((part) => Number.parseInt(part.trim(), 10));
      if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd) || rawStart > rawEnd) {
        throw new ValidationError(`Invalid page range "${chunk}". Use formats like "2" or "4-6".`);
      }

      for (let page = rawStart; page <= rawEnd; page += 1) {
        pages.add(page);
      }
    } else {
      const page = Number.parseInt(chunk, 10);
      if (!Number.isInteger(page)) {
        throw new ValidationError(`Invalid page value "${chunk}". Use formats like "2" or "4-6".`);
      }
      pages.add(page);
    }
  }

  for (const page of pages) {
    if (page < 1 || page > totalPages) {
      throw new ValidationError(`Page ${page} is out of range. Document has ${totalPages} page(s).`);
    }
  }

  if (pages.size >= totalPages) {
    throw new ValidationError('You must keep at least one page in the output PDF.');
  }

  return [...pages].sort((a, b) => a - b);
};

export const removePagesPDF = async (inputPath, outputPath, options = {}) => {
  const pdfBytes = await fs.readFile(inputPath);
  const sourceDoc = await PDFDocument.load(pdfBytes);
  const totalPages = sourceDoc.getPageCount();
  const pagesToRemove = parsePageSelection(options.pages, totalPages);
  const removeSet = new Set(pagesToRemove.map((page) => page - 1));

  const outputDoc = await PDFDocument.create();
  const pagesToKeep = sourceDoc
    .getPageIndices()
    .filter((pageIndex) => !removeSet.has(pageIndex));

  const copiedPages = await outputDoc.copyPages(sourceDoc, pagesToKeep);
  for (const page of copiedPages) {
    outputDoc.addPage(page);
  }

  const outputBytes = await outputDoc.save();
  await fs.writeFile(outputPath, outputBytes);

  return {
    outputPath,
    pageCount: outputDoc.getPageCount(),
    totalSourcePages: totalPages,
    removedPages: pagesToRemove.join(', '),
  };
};
