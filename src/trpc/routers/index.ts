// src/trpc/routers/index.ts
import { router } from '../trpc';
import { fitnessRouter } from './fitness'; // Import your specific routers

/**
 * This is the primary router for your server.
 * All procedures are merged here.
 */
export const appRouter = router({
    fitness: fitnessRouter, // Expose fitness operations under `fitness` namespace
    // You can add more routers here, e.g.,
    // auth: authRouter,
    // profile: profileRouter,
});

// Export type definition of the router for your client!
export type AppRouter = typeof appRouter;
