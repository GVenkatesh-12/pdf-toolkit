// The Upload Controller — session-scoped file management.
import * as storageService from '../services/storage.service.js';
import { formatFileSize } from '../utils/fileHelpers.js';

// POST /api/upload -- upload a single PDF
export const uploadFile = (req, res) => {
  const { file } = req;
  res.status(201).json({
    status: 'success',
    message: 'File uploaded successfully',
    data: {
      filename: file.filename,
      originalName: file.originalname,
      size: formatFileSize(file.size),
      mimetype: file.mimetype,
    },
  });
};

// POST /api/upload/multiple -- upload multiple PDFs
export const uploadFiles = (req, res) => {
  const { files } = req;
  const fileData = files.map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    size: formatFileSize(file.size),
    mimetype: file.mimetype,
  }));

  res.status(201).json({
    status: 'success',
    message: `${files.length} file(s) uploaded successfully`,
    data: { files: fileData },
  });
};

// GET /api/upload -- list uploaded files (session-scoped)
export const listFiles = async (req, res, next) => {
  try {
    const dir = req.sessionUploadDir;
    const files = await storageService.listFiles(dir);
    res.json({
      status: 'success',
      data: { files, count: files.length },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/upload/:filename -- get file info (session-scoped)
export const getFile = async (req, res, next) => {
  try {
    const fileInfo = await storageService.getFileInfo(
      req.sessionUploadDir,
      req.params.filename
    );
    res.json({ status: 'success', data: fileInfo });
  } catch (err) {
    next(err);
  }
};

// GET /api/upload/:filename/download -- download a file (session-scoped)
export const downloadFile = async (req, res, next) => {
  try {
    const fileInfo = await storageService.getFileInfo(
      req.sessionUploadDir,
      req.params.filename
    );
    res.download(fileInfo.path, fileInfo.filename);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/upload/:filename -- delete a file (session-scoped)
export const removeFile = async (req, res, next) => {
  try {
    const result = await storageService.deleteFile(
      req.sessionUploadDir,
      req.params.filename
    );
    res.json({
      status: 'success',
      message: `File '${result.filename}' deleted`,
    });
  } catch (err) {
    next(err);
  }
};
