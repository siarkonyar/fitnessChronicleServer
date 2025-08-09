// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod'; // For input validation
export const enviromentRouter = router({

    getExerciseLogByDate: protectedProcedure
        .input(z.object({ date: z.string().date() })) // Validate input with Zod
        .query(async ({ input, ctx }) => {

        }),
});
