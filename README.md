# PDF Toolkit Backend

> **Live Demo:** [https://pdf-toolkit.duckdns.org/](https://pdf-toolkit.duckdns.org/)

A modular, production-architecture Node.js backend for PDF processing -- inspired by [iLovePDF](https://www.ilovepdf.com/). Built as a learning project to understand modular design, functional programming, job queues, and scalable backend architecture.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Upload](#upload)
  - [PDF Operations (Synchronous)](#pdf-operations-synchronous)
  - [Jobs (Asynchronous Queue)](#jobs-asynchronous-queue)
- [The Job Queue System](#the-job-queue-system)
- [Adding a New PDF Operation](#adding-a-new-pdf-operation)
- [Architecture Patterns](#architecture-patterns)
- [Configuration](#configuration)
- [Error Handling](#error-handling)

---

## Features

- **Merge** -- combine multiple PDFs into one
- **Split** -- extract a page range from a PDF
- **Compress** -- reduce PDF file size by re-serializing
- **Job Queue** -- background processing with concurrency control, retry logic, and status polling
- **Modular Architecture** -- each layer has a single responsibility; new features require minimal changes
- **Two Processing Modes** -- synchronous (immediate) and asynchronous (queue-based)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                     HTTP Request                     │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Middleware     │  requestLogger, express.json,
              │   Pipeline      │  multer (file upload), validation
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     Routes      │  Maps URLs → controllers
              │  (thin layer)   │  /api/health, /api/upload,
              └────────┬────────┘  /api/pdf, /api/jobs
                       │
                       ▼
              ┌─────────────────┐
              │   Controllers   │  Reads request, calls services,
              │ (orchestration) │  formats response
              └────────┬────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
   ┌────────────────┐   ┌────────────────┐
   │  PDF Services   │   │  Queue Service  │
   │  (pure funcs)   │   │  (state machine)│
   │  merge, split,  │   │  add, poll,     │
   │  compress       │   │  complete, fail │
   └────────────────┘   └───────┬────────┘
                                │
                                ▼
                       ┌────────────────┐
                       │     Worker     │  Background loop
                       │  (consumer)    │  picks jobs, calls
                       │                │  PDF services
                       └────────────────┘
```

**Data flows DOWN. Each layer only depends on layers below it, never above.**

---

## Project Structure

```
src/
├── index.js                        # Entry point -- assembles and starts everything
│
├── config/                         # All settings in one place
│   ├── index.js                    # Barrel file -- re-exports all config modules
│   ├── server.js                   # Port, environment
│   ├── storage.js                  # Upload paths, file size limits, allowed types
│   └── queue.js                    # Concurrency, retries, poll interval, job TTL
│
├── routes/                         # URL → controller mapping (thin, no logic)
│   ├── index.js                    # Route aggregator -- mounts all route modules
│   ├── health.routes.js            # GET /api/health
│   ├── upload.routes.js            # CRUD for uploaded files
│   ├── pdf.routes.js               # Synchronous PDF processing
│   └── jobs.routes.js              # Asynchronous job queue endpoints
│
├── controllers/                    # Request/response orchestration
│   ├── upload.controller.js        # Handles file upload/download/delete
│   ├── pdf.controller.js           # Synchronous PDF operation handler
│   └── job.controller.js           # Job creation, status polling, result download
│
├── services/                       # Business logic (no HTTP knowledge)
│   ├── storage.service.js          # File system operations (save, list, delete)
│   ├── queue.service.js            # In-memory job queue with state machine
│   └── pdf/                        # PDF operations (pure functions)
│       ├── index.js                # Operation registry (strategy map)
│       ├── merge.js                # Merge multiple PDFs into one
│       ├── split.js                # Extract page range from a PDF
│       └── compress.js             # Re-serialize to reduce file size
│
├── workers/                        # Background job processors
│   └── pdf.worker.js               # Polls queue, calls PDF services, manages concurrency
│
├── middleware/                     # Cross-cutting concerns
│   ├── requestLogger.js            # Logs every request with timing
│   ├── errorHandler.js             # Global error handler (catches all thrown errors)
│   ├── upload.js                   # Multer configuration for file uploads
│   └── validateUpload.js           # File type and MIME type validation
│
└── utils/                          # Pure helper functions
    ├── logger.js                   # Logging adapter (wraps console)
    ├── errors.js                   # Custom error classes (AppError, NotFoundError, ValidationError)
    └── fileHelpers.js              # Unique filenames, file size formatting
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm**

### Installation

```bash
git clone <your-repo-url>
cd backend-learning
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development
```

### Running

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/api/health
```

---

## API Reference

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

**Response:**
```json
{
  "status": "ok",
  "uptime": 42,
  "timestamp": "2026-03-14T12:00:00.000Z"
}
```

---

### Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload a single PDF |
| POST | `/api/upload/multiple` | Upload multiple PDFs |
| GET | `/api/upload` | List all uploaded files |
| GET | `/api/upload/:filename` | Get file metadata |
| GET | `/api/upload/:filename/download` | Download a file |
| DELETE | `/api/upload/:filename` | Delete a file |

**Upload a single file:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@document.pdf"
```

**Upload multiple files:**
```bash
curl -X POST http://localhost:3000/api/upload/multiple \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.pdf"
```

**Constraints:**
- Max file size: 50 MB
- Max files per request: 10
- Allowed types: PDF only (checked by both extension and MIME type)

---

### PDF Operations (Synchronous)

Processes the PDF **during the request**. The client waits until processing is complete. Suitable for small files and quick testing.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pdf/operations` | List all available operations |
| POST | `/api/pdf/:operation` | Execute a PDF operation |
| GET | `/api/pdf/download/:filename` | Download a processed file |

**Merge two PDFs:**
```bash
curl -X POST http://localhost:3000/api/pdf/merge \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.pdf"
```

**Split pages 2-5 from a PDF:**
```bash
curl -X POST http://localhost:3000/api/pdf/split \
  -F "files=@document.pdf" \
  -F "start=2" \
  -F "end=5"
```

**Compress a PDF:**
```bash
curl -X POST http://localhost:3000/api/pdf/compress \
  -F "files=@document.pdf"
```

---

### Jobs (Asynchronous Queue)

Queues the operation for **background processing**. The server responds immediately with a job ID. The client polls for status. This is the **recommended approach** for production use.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | Queue statistics |
| POST | `/api/jobs` | Create a new job |
| GET | `/api/jobs/:jobId` | Poll job status |
| GET | `/api/jobs/:jobId/download` | Download completed result |

**Step 1 -- Create a job:**
```bash
curl -X POST http://localhost:3000/api/jobs \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.pdf" \
  -F "operation=merge"
```

Response (`202 Accepted`):
```json
{
  "status": "accepted",
  "message": "Job queued for \"merge\" operation",
  "data": {
    "jobId": "69d83578-f6ef-4219-ba2c-d7536ab50875",
    "state": "queued",
    "pollUrl": "/api/jobs/69d83578-f6ef-4219-ba2c-d7536ab50875"
  }
}
```

**Step 2 -- Poll for status:**
```bash
curl http://localhost:3000/api/jobs/69d83578-f6ef-4219-ba2c-d7536ab50875
```

Response (when complete):
```json
{
  "status": "success",
  "data": {
    "id": "69d83578-f6ef-4219-ba2c-d7536ab50875",
    "state": "completed",
    "operation": "merge",
    "attempts": 1,
    "duration": "87ms",
    "result": {
      "pageCount": 5,
      "inputFileCount": 2
    },
    "downloadUrl": "/api/jobs/69d83578-f6ef-4219-ba2c-d7536ab50875/download"
  }
}
```

**Step 3 -- Download the result:**
```bash
curl -O http://localhost:3000/api/jobs/69d83578-f6ef-4219-ba2c-d7536ab50875/download
```

**Queue statistics:**
```bash
curl http://localhost:3000/api/jobs
```

```json
{
  "status": "success",
  "data": {
    "queued": 3,
    "processing": 2,
    "completed": 15,
    "failed": 0,
    "total": 20
  }
}
```

---

## The Job Queue System

The queue ensures the server never crashes under load. Instead of processing PDFs during the HTTP request, work is deferred to a background worker.

### How It Works

```
User uploads files + picks operation
         │
         ▼
┌─────────────────────┐
│  POST /api/jobs     │  Server adds job to queue
│  Response: 202      │  Responds INSTANTLY with jobId
│  { jobId: "abc" }   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  In-Memory Queue    │  Jobs wait here in FIFO order
│  ┌───┬───┬───┬───┐  │
│  │ 4 │ 3 │ 2 │ 1 │  │  ← Worker picks from front
│  └───┴───┴───┴───┘  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Worker             │  Processes up to 2 jobs at a time
│  (polls every 500ms)│  Calls the same pure PDF functions
│  concurrency: 2     │  from the registry
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Job Complete       │  State: "completed"
│  Result stored      │  Download URL available
└─────────────────────┘
```

### Job States

```
queued → processing → completed
                   ↘ failed → (retry if attempts left) → queued
```

| State | Meaning |
|-------|---------|
| `queued` | Waiting in line for a worker |
| `processing` | A worker is currently handling it |
| `completed` | Done successfully, result available for download |
| `failed` | Permanently failed after exhausting all retries |

### Why Not Process Inline?

| Scenario | Without Queue | With Queue |
|----------|--------------|------------|
| 1 user, small file | Works fine | Works fine |
| 1 user, 200MB file | Client waits 30s, server blocked | Client gets jobId in 50ms |
| 50 users simultaneously | Server out of memory, crash | 50 jobs queue up, processed 2 at a time |

---

## Adding a New PDF Operation

The registry pattern makes this a **two-file change**:

### 1. Create the handler function

```
src/services/pdf/watermark.js
```

```javascript
import fs from 'node:fs/promises';
import { PDFDocument, rgb } from 'pdf-lib';

export const watermarkPDF = async (inputPath, outputPath, options = {}) => {
  const pdfBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.load(pdfBytes);
  const text = options.text || 'CONFIDENTIAL';

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 4,
      y: height / 2,
      size: 50,
      color: rgb(0.9, 0.9, 0.9),
      opacity: 0.3,
    });
  }

  const resultBytes = await doc.save();
  await fs.writeFile(outputPath, resultBytes);

  return { outputPath, pageCount: doc.getPageCount() };
};
```

### 2. Register it

In `src/services/pdf/index.js`, add the import and one registry entry:

```javascript
import { watermarkPDF } from './watermark.js';

// Inside the operations object:
watermark: {
  handler: watermarkPDF,
  description: 'Add a watermark to each page',
  minFiles: 1,
  maxFiles: 1,
  acceptsOptions: true,
},
```

**That's it.** Both `/api/pdf/watermark` (sync) and `POST /api/jobs` with `operation=watermark` (async) now work automatically. No controller, route, or worker changes needed.

---

## Architecture Patterns

| Pattern | Description | Where Used |
|---------|-------------|------------|
| **Single Responsibility** | Each file/module does exactly one thing | Every file in the project |
| **Barrel File** | `index.js` re-exports from a directory for clean imports | `config/index.js`, `routes/index.js`, `services/pdf/index.js` |
| **Adapter** | Wraps a dependency so the app doesn't depend on it directly | `utils/logger.js` wraps `console` |
| **Registry / Strategy Map** | Object maps names to handler functions; avoids if/else chains | `services/pdf/index.js` |
| **Middleware Pipeline** | Functions chained together; each does one thing, calls `next()` | `upload → validate → controller` |
| **Controller / Service Split** | Controllers handle HTTP; services handle business logic | `controllers/` vs `services/` |
| **Producer / Consumer** | Controller produces jobs; worker consumes them | `job.controller` → `queue.service` → `pdf.worker` |
| **State Machine** | Jobs transition through defined states with explicit transitions | `queue.service.js` |
| **Domain Errors** | Custom error classes carry HTTP status codes as structured data | `utils/errors.js` |
| **Open/Closed Principle** | Add new features without modifying existing code | Registry: add operation, nothing else changes |

---

## Configuration

All configuration lives in `src/config/`. Settings are read from environment variables with sensible defaults.

### Server (`config/server.js`)

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `port` | `PORT` | `3000` | HTTP port |
| `nodeEnv` | `NODE_ENV` | `development` | Environment |

### Storage (`config/storage.js`)

| Setting | Default | Description |
|---------|---------|-------------|
| `uploadDir` | `<project>/uploads/` | Where uploaded files are saved |
| `processedDir` | `<project>/processed/` | Where processed results are saved |
| `maxFileSize` | `50 MB` | Maximum upload file size |
| `maxFileCount` | `10` | Maximum files per upload request |
| `allowedMimeTypes` | `['application/pdf']` | Accepted MIME types |
| `allowedExtensions` | `['.pdf']` | Accepted file extensions |

### Queue (`config/queue.js`)

| Setting | Default | Description |
|---------|---------|-------------|
| `concurrency` | `2` | Maximum simultaneous jobs |
| `maxRetries` | `2` | Retry attempts before permanent failure |
| `pollInterval` | `500ms` | How often the worker checks for new jobs |
| `jobTTL` | `1 hour` | Auto-cleanup age for completed/failed jobs |

---

## Error Handling

All errors flow through the global error handler (`middleware/errorHandler.js`).

### Custom Error Classes

| Class | Status Code | Usage |
|-------|------------|-------|
| `AppError` | (custom) | Base class for all operational errors |
| `ValidationError` | `400` | Bad input (wrong file type, missing fields, invalid page range) |
| `NotFoundError` | `404` | Resource not found (file, job) |

### Error Response Format

```json
{
  "status": "error",
  "message": "Human-readable error description"
}
```

Unexpected errors (bugs) return `500 Internal Server Error` with a generic message. The full stack trace is logged server-side but never exposed to the client.
