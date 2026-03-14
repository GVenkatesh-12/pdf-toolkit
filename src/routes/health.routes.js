// Each feature gets its own route file.
// This keeps files small and focused. When you add PDF operations later,
// you'll create pdf.routes.js, upload.routes.js etc. -- each one independent.
//
// express.Router() creates a "mini-app" that can have its own routes.
// The main app then "mounts" this router at a path prefix.

import { Router } from 'express';

const router = Router();

// GET /api/health -- used by monitoring tools to check if the server is alive
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
