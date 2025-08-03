// src/trpc/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';
import { ZodError } from 'zod'; // Import ZodError

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create({
    // Custom error formatter to include Zod validation errors
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                zodError: error.code === 'BAD_REQUEST' && error.cause instanceof ZodError ?
                    error.cause.flatten() :
                    null,
            },
        };
    },
});

/**
 * Reusable procedure that doesn't require a user to be logged in
 */
export const publicProcedure = t.procedure;

/**
 * Reusable middleware to ensure a user is logged in
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to access this resource.',
        });
    }
    return next({
        ctx: {
            // Infers the `user` as non-nullable
            user: ctx.user,
        },
    });
});

/**
 * Reusable procedure that requires a user to be logged in
 */
export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/**
 * Router for tRPC
 */
export const router = t.router;
