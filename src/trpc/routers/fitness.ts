// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emoji, z } from 'zod'; // For input validation
import admin from 'firebase-admin'; // Import Firebase Admin SDK
import { DaySchema, EmojiSchema, EmojiWithIdSchema, ExerciseLogSchema, ExerciseLogWithIdSchema } from '../../types/types';

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
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

    getExerciseLogsByMonth : protectedProcedure
        .input(z.object({ month: z.string() }))
        .query(async ({ input, ctx }) => {
          const { user, firestore } = ctx;
          const userId = user.uid;
          const { month } = input;  // e.g. "2025-08"

          // Get start date of the month: "2025-08-01"
          const startDate = `${month}-01`;

          // Calculate last day of the month:
          const [year, monthNum] = month.split('-').map(Number);
          // JS months are 0-based, so subtract 1, then create a date for the next month day 0 which is last day of the previous month
          const lastDay = new Date(year, monthNum, 0).getDate();

          const endDate = `${month}-${lastDay.toString().padStart(2, '0')}`; // e.g. "2025-08-31"

          const snapshot = await firestore
            .collection('users')
            .doc(userId)
            .collection('fitnessLogs')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();

          const logs = snapshot.docs.map(doc => {
            return ExerciseLogWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
          });

    // Extract unique dates from logs
          const uniqueDatesSet = new Set<string>();
          logs.forEach(log => {
            if (log.date) uniqueDatesSet.add(log.date);
          });

          const uniqueDates = Array.from(uniqueDatesSet).sort(); // Sort ascending

          return {
            logs,
            uniqueDates,
          };
        }),

    getExerciseLogById: protectedProcedure
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

            return ExerciseLogWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
        }),

    deleteExerciseLog: protectedProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id } = input;

            const logRef = firestore.collection('users').doc(userId).collection('fitnessLogs').doc(id);
            const logDoc = await logRef.get();

            if (!logDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Fitness log not found.',
                });
            }

            await logRef.delete();

            return {
                id: id,
                message: 'Fitness log deleted successfully!',
            };
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
});
