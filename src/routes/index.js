// The route aggregator.
// This file combines ALL route modules and mounts them at their URL prefixes.
//
// WHY not register routes directly in the main app file?
// Because as your app grows, you'll have 10+ route files. If they're all
// in index.js, that file becomes 200+ lines of imports and app.use() calls.
//
// With this pattern:
//   - Main app imports ONE thing: this file
//   - Adding a new feature = create route file + add one line here
//   - Each route file is independent and testable

import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/health', healthRoutes);

// As you add features, you'll add lines like:
// router.use('/upload', uploadRoutes);
// router.use('/jobs', jobRoutes);

export default router;
