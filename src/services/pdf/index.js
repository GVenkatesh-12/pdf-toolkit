// THE OPERATION REGISTRY
//
// This is the most important architectural pattern in this project.
//
// PROBLEM: As you add more PDF operations (merge, split, compress,
//          watermark, rotate, encrypt...), how do you avoid a giant
//          if/else chain in the controller?
//
//   if (operation === 'merge') { ... }
//   else if (operation === 'split') { ... }
//   else if (operation === 'compress') { ... }
//   // 20 more else-ifs...
//
// SOLUTION: A registry (also called a "strategy map" or "handler map").
// It's just an object that maps names to functions:
//
//   { merge: mergePDFs, split: splitPDF, compress: compressPDF }
//
// The controller calls: registry["merge"](files, output)
// No if/else needed. Adding a new operation is ONE line in this file.
//
// This is the STRATEGY PATTERN from OOP / HIGHER-ORDER FUNCTIONS from FP.
// Same concept, different names.

import { mergePDFs } from './merge.js';
import { splitPDF } from './split.js';
import { compressPDF } from './compress.js';
import { ValidationError } from '../../utils/errors.js';

// Each entry maps an operation name to metadata about that operation.
// This makes the registry self-documenting.
const operations = {
  merge: {
    handler: mergePDFs,
    description: 'Combine multiple PDFs into one',
    minFiles: 2,      // merge needs at least 2 files
    maxFiles: 10,
    acceptsOptions: false,
  },
  split: {
    handler: splitPDF,
    description: 'Extract a range of pages from a PDF',
    minFiles: 1,
    maxFiles: 1,       // split works on exactly 1 file
    acceptsOptions: true,  // needs { start, end }
  },
  compress: {
    handler: compressPDF,
    description: 'Reduce PDF file size with selectable compression levels',
    minFiles: 1,
    maxFiles: 1,
    acceptsOptions: true,
  },
  // ─── ADDING A NEW OPERATION ──────────────────────────
  // To add "watermark" support, you would:
  // 1. Create src/services/pdf/watermark.js
  // 2. Import it above
  // 3. Add this entry:
  //    watermark: {
  //      handler: watermarkPDF,
  //      description: 'Add a watermark to each page',
  //      minFiles: 1,
  //      maxFiles: 1,
  //      acceptsOptions: true,  // needs { text, opacity }
  //    },
  // That's it. No other file needs to change.
};

// Get an operation's config by name. Throws if not found.
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

// List all available operations (useful for a "what can I do?" endpoint)
export const listOperations = () => {
  return Object.entries(operations).map(([name, config]) => ({
    name,
    description: config.description,
    minFiles: config.minFiles,
    maxFiles: config.maxFiles,
    acceptsOptions: config.acceptsOptions,
  }));
};
