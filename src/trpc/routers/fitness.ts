// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod'; // For input validation
import admin from 'firebase-admin'; // Import Firebase Admin SDK


const SetSchema = z.discriminatedUnion("setType", [
  z.object({
    setType: z.literal("kg"),
    value: z.string().optional(),
    reps: z.string().optional(),
  }),
  z.object({
    setType: z.literal("lbs"),
    value: z.string().optional(),
    reps: z.string().optional(),
  }),
  z.object({
    setType: z.literal("time"),
    value: z.string().optional(), // time in seconds, for example
    reps: z.string().optional(),
  }),
  z.object({
    setType: z.literal("distance"),
    value: z.string().optional(), // meters, km, etc.
    reps: z.string().optional(),
  }),
  z.object({
    setType: z.literal("steps"),
    value: z.string().optional(), // whole number of steps
    reps: z.string().optional(),
  }),
]);

// Zod schema for a fitness log entry
const ExerciseLogSchema = z.object({
    date: z.string().date(), // ISO 8601 date string
    activity: z.string().min(3).max(100),
    caloriesBurned: z.number().int().optional(),
    notes: z.string().max(500).optional(),
    sets: z.array(SetSchema), // Array of exercise sets
});

const DaySchema = z.object({
    date: z.string().date(), // ISO 8601 date string
    activities: z.array(ExerciseLogSchema), // Array of exercise logs for the day
    day: z.array(z.string().min(1).max(20)).optional(), // Optional day name (e.g., "Monday")
});

// Zod schema for a fitness log entry with an ID (when reading from DB)
const ExerciseLogWithIdSchema = ExerciseLogSchema.extend({
    id: z.string(),
});

export const fitnessRouter = router({
    // Add a new fitness log for the authenticated user

    addExerciseLog: protectedProcedure
        .input(ExerciseLogSchema) // Validate input with Zod
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const newLogRef = firestore.collection('users').doc(userId).collection('fitnessLogs').doc();
            await newLogRef.set({
                ...input,
            });
        }),

    getExerciseLogByDate: protectedProcedure
        .input(z.object({ date: z.string().date() })) // Validate input with Zod
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { date } = input;

            const snapshot = await firestore.collection('users').doc(userId).collection('fitnessLogs')
                .where('date', '==', date)
                .get();

            const logs = snapshot.docs.map(doc => {
                return ExerciseLogWithIdSchema.parse({
                    id: doc.id,
                    ...doc.data(),
                });
            });

            return logs;
        }),

    editExerciseLog: protectedProcedure
        .input(z.object({
            logId: z.string().min(1),
            data: ExerciseLogSchema, // Validate the data to update
        }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { logId, data } = input;
            const logRef = firestore.collection('users').doc(userId).collection('fitnessLogs').doc(logId);
            const logDoc = await logRef.get();
            if (!logDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Fitness log not found.',
                });
            }
            await logRef.update(data);
            return {
                id: logId,
                message: 'Fitness log updated successfully!',
            };
        }),
/*
    addLog: protectedProcedure
        .input(FitnessLogSchema) // Validate input with Zod
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const newLogRef = firestore.collection('users').doc(userId).collection('fitnessLogs').doc();
            await newLogRef.set({
                ...input,
                createdAt: admin.firestore.FieldValue.serverTimestamp(), // Add server timestamp
            });

            return {
                id: newLogRef.id,
                message: 'Fitness log added successfully!',
            };
        }),

    // Get all fitness logs for the authenticated user
    getLogs: protectedProcedure
        .query(async ({ ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const snapshot = await firestore.collection('users').doc(userId).collection('fitnessLogs')
                .orderBy('date', 'desc') // Order by date, latest first
                .get();

            const logs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));

            // You can add validation here for the output if needed, e.g.,
            // const validatedLogs = z.array(FitnessLogWithIdSchema).parse(logs);
            // return validatedLogs;

            return logs;
        }),

    // Get a single fitness log by ID for the authenticated user
    getLogById: protectedProcedure
        .input(z.object({ logId: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { logId } = input;

            const doc = await firestore.collection('users').doc(userId).collection('fitnessLogs').doc(logId).get();

            if (!doc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Fitness log not found.',
                });
            }

            return FitnessLogWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
        }), */
});
