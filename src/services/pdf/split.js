// SPLIT PDF -- extracts a range of pages from a PDF.
//
// FUNCTIONAL PATTERN: Notice how similar the signature is to merge.js:
//   merge:  (inputPaths[], outputPath) → result
//   split:  (inputPath,    outputPath, options) → result
//
// All PDF operations follow the same shape:
//   - Take file paths as input
//   - Take an output path
//   - Optionally take an options object for operation-specific settings
//   - Return a result object describing what was produced
//
// This UNIFORM INTERFACE is what makes the registry pattern possible.
// The registry doesn't need to know the details of each operation --
// it just calls handler(inputPaths, outputPath, options).

import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';

// inputPath:  string -- path to the source PDF
// outputPath: string -- where to save the extracted pages
// options: { start: number, end: number } -- 1-based page numbers
// Returns: { outputPath, pageCount, range }
export const splitPDF = async (inputPath, outputPath, options = {}) => {
  const pdfBytes = await fs.readFile(inputPath);
  const sourceDoc = await PDFDocument.load(pdfBytes);
  const totalPages = sourceDoc.getPageCount();

  // Default: extract just the first page
  const start = options.start || 1;
  const end = options.end || totalPages;

  if (start < 1 || end > totalPages || start > end) {
    throw new ValidationError(
      `Invalid page range ${start}-${end}. Document has ${totalPages} page(s).`
    );
  }

  const newDoc = await PDFDocument.create();

  // Convert from 1-based (user-friendly) to 0-based (pdf-lib uses 0-based indices)
  const pageIndices = [];
  for (let i = start - 1; i < end; i++) {
    pageIndices.push(i);
  }

  const copiedPages = await newDoc.copyPages(sourceDoc, pageIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  const newPdfBytes = await newDoc.save();
  await fs.writeFile(outputPath, newPdfBytes);

  return {
    outputPath,
    pageCount: newDoc.getPageCount(),
    totalSourcePages: totalPages,
    range: { start, end },
  };
};
