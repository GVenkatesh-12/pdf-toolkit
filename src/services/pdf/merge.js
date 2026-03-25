// MERGE PDF -- combines multiple PDFs into one.
//
// PURE FUNCTION CONCEPT:
// This function knows NOTHING about:
//   - HTTP requests or responses
//   - Express or routes
//   - Job queues or workers
//   - Who uploaded the files or why
//
// It only knows: "given these file paths, merge them into one PDF at this output path."
//
// WHY is this powerful?
// Because this same function can be called from:
//   1. A controller (synchronous processing, Stage 3)
//   2. A background worker (job queue, Stage 4)
//   3. A CLI tool (if you build one later)
//   4. A test file (easy to test in isolation)
//
// If we had put HTTP logic in here, it would ONLY work inside Express.
// By keeping it pure, it works ANYWHERE.

import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

// inputPaths: string[] -- array of paths to PDF files
// outputPath: string   -- where to save the merged PDF
// Returns: { outputPath, pageCount, inputFileCount }
export const mergePDFs = async (inputPaths, outputPath) => {
  // Create a brand new empty PDF document
  const mergedDoc = await PDFDocument.create();

  for (const inputPath of inputPaths) {
    // Read the source PDF file as raw bytes
    const pdfBytes = await fs.readFile(inputPath);

    // Load it into pdf-lib so we can extract pages
    const sourceDoc = await PDFDocument.load(pdfBytes);

    // Copy ALL pages from this source into our merged document.
    // copyPages() returns an array of page objects that we then add.
    const copiedPages = await mergedDoc.copyPages(
      sourceDoc,
      sourceDoc.getPageIndices(),
    );

    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
  }

  // Serialize the merged PDF to bytes and write to disk
  const mergedBytes = await mergedDoc.save();
  await fs.writeFile(outputPath, mergedBytes);

  return {
    outputPath,
    pageCount: mergedDoc.getPageCount(),
    inputFileCount: inputPaths.length,
  };
};
