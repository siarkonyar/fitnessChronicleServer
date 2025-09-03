// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emoji, z } from 'zod'; // For input validation
import admin from 'firebase-admin'; // Import Firebase Admin SDK
import { ExerciseLogSchema, ExerciseLogWithIdSchema, ExerciseNameListWithIdSchema } from '../../types/types';
import exerciseNamesMaster from '../../types/exercise_names_master.json';

const MASTER_EXERCISE_NAMES_SET = new Set(
  (exerciseNamesMaster as string[]).map((name) => name.toLowerCase())
);

export const fitnessRouter = router({
    // Add a new fitness log for the authenticated user

    addExerciseLog: protectedProcedure
        .input(ExerciseLogSchema) // Validate input with Zod
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const exerciseName = input.activity

            const newLogRef = firestore.collection('users').doc(userId).collection('fitnessLogs').doc();

            await newLogRef.set({
                ...input,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            const namesRef = firestore
                .collection('users')
                .doc(userId)
                .collection('exerciseNames');

            // Query to check if exerciseName already exists
            const snapshot = await namesRef
                .where('name', '==', exerciseName)
                .limit(1)
                .get();

            if (!snapshot.empty) {
              // Already exists
              console.log('Exercise name already exists');
            } else {
              // Add new exercise name
              const newNameRef = namesRef.doc();
              await newNameRef.set({
                name: exerciseName,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              console.log('Exercise name added successfully');
            }
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

    getAllExerciseNames : protectedProcedure
        .query(async ({ ctx }) => {
          const { user, firestore } = ctx;
          const userId = user.uid;

          const snapshot = await firestore
            .collection('users')
            .doc(userId)
            .collection('exerciseNames')
            .get();

          const names = snapshot.docs.map(doc => {
            return ExerciseNameListWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
          });

          return {
            names,
          };
        }),

    getLatestExerciseByName : protectedProcedure
        .input(z.object({ name: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { name } = input;

            const orderedSnapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('fitnessLogs')
                .where('activity', '==', name)
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

            if (!orderedSnapshot.empty) {
                const doc = orderedSnapshot.docs[0];
                return ExerciseLogWithIdSchema.parse({
                    id: doc.id,
                    ...doc.data(),
                });
            }

            return null;
        }),
    /* getLatestExerciseByName : protectedProcedure
        .input(z.object({ name: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { name } = input;

            // Prefer a direct query on createdAt (server timestamp set in addExerciseLog)
            try {
                const orderedSnapshot = await firestore
                    .collection('users')
                    .doc(userId)
                    .collection('fitnessLogs')
                    .where('activity', '==', name)
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();

                if (!orderedSnapshot.empty) {
                    const doc = orderedSnapshot.docs[0];
                    return ExerciseLogWithIdSchema.parse({
                        id: doc.id,
                        ...doc.data(),
                    });
                }
            } catch (e) {
                console.log(e)
            }

            // Fallback: fetch and sort in memory using createdAt then createdBy
            const snapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('fitnessLogs')
                .where('activity', '==', name)
                .get();

            if (snapshot.empty) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `No exercise logs found with name: ${name}`,
                });
            }

            const docs = snapshot.docs.map(doc => {
                const data = doc.data() as any;
                const createdAtTs = data.createdAt?.toDate?.();
                const createdByTs = data.createdBy?.toDate?.();
                const createdTime = (createdAtTs instanceof Date
                    ? createdAtTs
                    : createdByTs instanceof Date
                        ? createdByTs
                        : new Date(0));
                return { id: doc.id, data, createdTime };
            });

            docs.sort((a, b) => b.createdTime.getTime() - a.createdTime.getTime());

            const latestDoc = docs[0];
            return ExerciseLogWithIdSchema.parse({
                id: latestDoc.id,
                ...latestDoc.data,
            });
        }), */


    deleteExerciseName : protectedProcedure
        .input(z.object({ name: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { name } = input;

            const snapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('exerciseNames')
                .where('name', '==', name)
                .get();

            if (snapshot.empty) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Exercise name not found.',
                });
            }

            const batch = firestore.batch();
            const deletedIds: string[] = [];

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                deletedIds.push(doc.id);
            });

            await batch.commit();

            return {
                deletedIds,
                message: 'Exercise name deleted successfully!',
            };
        }),
});
