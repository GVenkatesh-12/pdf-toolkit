// The Upload Controller.
//
// THE CONTROLLER PATTERN:
// Controllers are the "orchestration" layer. They sit between routes and services.
//
//   Route:       "When someone POSTs to /upload, call this controller"
//   Controller:  "Read the file from the request, ask the service to process it,
//                 format the result, send the response"
//   Service:     "Here's the file info you asked for"
//
// WHY NOT put this logic in the route?
// Because routes should be dead simple -- just URL → function mapping.
// If your route handler is more than 2-3 lines, it belongs in a controller.
//
// WHY NOT call the service directly from the route?
// Because the controller handles HTTP-specific concerns:
//   - Reading from req.file, req.params, req.query
//   - Setting status codes (201 for created, 200 for ok)
//   - Formatting the JSON response shape
// Services should know NOTHING about HTTP.

import * as storageService from '../services/storage.service.js';
import { formatFileSize } from '../utils/fileHelpers.js';
import { storageConfig } from '../config/index.js';

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

// GET /api/upload -- list all uploaded files
export const listFiles = async (req, res, next) => {
  try {
    const files = await storageService.listUploadedFiles();
    res.json({
      status: 'success',
      data: { files, count: files.length },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/upload/:filename -- get info about a specific file
export const getFile = async (req, res, next) => {
  try {
    const fileInfo = await storageService.getFileInfo(req.params.filename);
    res.json({
      status: 'success',
      data: fileInfo,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/upload/:filename/download -- download a file
export const downloadFile = async (req, res, next) => {
  try {
    const fileInfo = await storageService.getFileInfo(req.params.filename);
    res.download(fileInfo.path, fileInfo.filename);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/upload/:filename -- delete an uploaded file
export const removeFile = async (req, res, next) => {
  try {
    const result = await storageService.deleteFile(req.params.filename);
    res.json({
      status: 'success',
      message: `File '${result.filename}' deleted`,
    });
  } catch (err) {
    next(err);
  }
};
