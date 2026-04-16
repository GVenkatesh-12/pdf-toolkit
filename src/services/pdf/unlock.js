import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { ValidationError } from '../../utils/errors.js';

export const unlockPDF = async (inputPath, outputPath, options = {}) => {
  const password = options.password;

  if (!password || typeof password !== 'string') {
    throw new ValidationError('A password is required to unlock the PDF.');
  }

  const pdfBytes = await fs.readFile(inputPath);

  let doc;
  try {
    // Attempt to load with the user-provided password
    doc = await PDFDocument.load(pdfBytes, {
      password,
      // Don't throw on invalid structure, just on wrong password
      ignoreEncryption: false,
    });
  } catch (err) {
    // pdf-lib throws when the password is wrong or the PDF can't be decrypted
    if (
      err.message.includes('password') ||
      err.message.includes('decrypt') ||
      err.message.includes('encrypted')
    ) {
      throw new ValidationError(
        'Incorrect password. Please check and try again.'
      );
    }
    throw err;
  }

  // Save without encryption — this produces an unlocked PDF
  const unlockedBytes = await doc.save();
  await fs.writeFile(outputPath, unlockedBytes);

  return {
    outputPath,
    pageCount: doc.getPageCount(),
    status: 'Password protection removed',
  };
};
