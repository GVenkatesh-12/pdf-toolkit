// THE OPERATION REGISTRY
//
// Maps operation names to their handler functions and metadata.
// Adding a new operation = import + one registry entry. That's it.
// No controller, route, or worker changes needed.

import { mergePDFs } from './merge.js';
import { splitPDF } from './split.js';
import { compressPDF } from './compress.js';
import { rotatePDF } from './rotate.js';
import { removePagesPDF } from './removePage.js';
import { watermarkPDF } from './watermark.js';
import { addPageNumbersPDF } from './pageNumbers.js';
import { unlockPDF } from './unlock.js';
import { ValidationError } from '../../utils/errors.js';

const operations = {
  merge: {
    handler: mergePDFs,
    description: 'Combine multiple PDFs into one',
    minFiles: 2,
    maxFiles: 10,
    acceptsOptions: false,
  },
  split: {
    handler: splitPDF,
    description: 'Extract a range of pages from a PDF',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  compress: {
    handler: compressPDF,
    description: 'Reduce PDF file size with selectable compression levels',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  rotate: {
    handler: rotatePDF,
    description: 'Rotate all pages in a PDF',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  'remove-pages': {
    handler: removePagesPDF,
    description: 'Delete selected pages from a PDF',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  watermark: {
    handler: watermarkPDF,
    description: 'Add a text watermark to every page',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  'page-numbers': {
    handler: addPageNumbersPDF,
    description: 'Add page numbers to every page',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  unlock: {
    handler: unlockPDF,
    description: 'Remove password protection from a PDF',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
};

export const getOperation = (name) => {
  const op = operations[name];
  if (!op) {
    const available = Object.keys(operations).join(', ');
    throw new ValidationError(
      `Unknown operation "${name}". Available operations: ${available}`
    );
  }
  return op;
};

export const listOperations = () => {
  return Object.entries(operations).map(([name, config]) => ({
    name,
    description: config.description,
    minFiles: config.minFiles,
    maxFiles: config.maxFiles,
    acceptsOptions: config.acceptsOptions,
  }));
};
