// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emoji, z } from 'zod'; // For input validation
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

const EmojiSchema = z.object({
    emoji: z.string().min(1).max(10), // Limit emoji length
    description: z.string().min(1).max(100), // Add length constraints
    dates: z.array(z.string().date()).default([]) // Make dates optional with default empty array
});

const DaySchema = z.object({
    date: z.string().date(), // ISO 8601 date string
    emojiId: z.string().min(1), // Reference to emoji ID instead of full object
});

// Zod schema for emoji assignments with an ID (when reading from DB)
const EmojiWithIdSchema = EmojiSchema.extend({
    id: z.string(),
});

// Zod schema for day assignments with an ID (when reading from DB)
const DayWithIdSchema = DaySchema.extend({
    id: z.string(),
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

    addEmoji: protectedProcedure
        .input(EmojiSchema) // Validate input with Zod
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const newLogRef = firestore.collection('users').doc(userId).collection('emojis').doc();
            await newLogRef.set({
                ...input,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }),

    getEmojiById: protectedProcedure
        .input(z.object({ id: z.string().min(1) })) // Validate input with Zod
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id } = input;

            const doc = await firestore.collection('users').doc(userId).collection('emojis').doc(id).get();

            if (!doc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Fitness log not found.',
                });
            }

            return EmojiWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
        }),

    getAllEmojis: protectedProcedure
        .query(async ({ ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const snapshot = await firestore.collection('users').doc(userId).collection('emojis')
                .orderBy('createdAt', 'desc')
                .get();

            const emojis = snapshot.docs.map(doc => {
                return EmojiWithIdSchema.parse({
                    id: doc.id,
                    ...doc.data(),
                });
            });

            return emojis;
        }),

    deleteEmoji: protectedProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id } = input;

            const logRef = firestore.collection('users').doc(userId).collection('emojis').doc(id);
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
                message: 'Emoji deleted successfully!',
            };
        }),

    asignEmojiToDay: protectedProcedure
        .input(DaySchema) // Use the updated DaySchema
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { date, emojiId } = input;

            // First, check if the emoji exists
            const emojiRef = firestore.collection('users').doc(userId).collection('emojis').doc(emojiId);
            const emojiDoc = await emojiRef.get();

            if (!emojiDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Emoji not found.',
                });
            }

            // Check if there's already an assignment for this date
            const existingAssignmentSnapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('dayAssignments')
                .where('date', '==', date)
                .limit(1)
                .get();

            let assignmentId: string;
            let isUpdate = false;

            if (!existingAssignmentSnapshot.empty) {
                // Update existing assignment
                const existingDoc = existingAssignmentSnapshot.docs[0];
                assignmentId = existingDoc.id;
                isUpdate = true;

                await existingDoc.ref.update({
                    emojiId: emojiId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } else {
                // Create new assignment
                const newAssignmentRef = firestore
                    .collection('users')
                    .doc(userId)
                    .collection('dayAssignments')
                    .doc();

                assignmentId = newAssignmentRef.id;

                await newAssignmentRef.set({
                    date: date,
                    emojiId: emojiId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            return {
                id: assignmentId,
                date: date,
                emojiId: emojiId,
                message: isUpdate
                    ? 'Emoji assignment updated successfully!'
                    : 'Emoji assigned to day successfully!',
            };
        }),

    getEmojiAsignmentByDate: protectedProcedure
        .input(z.object({ date: z.string().date() }))
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { date } = input;

            // Find the assignment for this date
            const assignmentSnapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('dayAssignments')
                .where('date', '==', date)
                .limit(1)
                .get();

            if (assignmentSnapshot.empty) {
                return null; // No assignment found for this date
            }

            const assignmentDoc = assignmentSnapshot.docs[0];
            const assignmentData = assignmentDoc.data();

            if (!assignmentData) {
                return null;
            }

            // Get the full emoji data
            const emojiRef = firestore.collection('users').doc(userId).collection('emojis').doc(assignmentData.emojiId);
            const emojiDoc = await emojiRef.get();

            if (!emojiDoc.exists) {
                // Emoji was deleted, return assignment without emoji data
                return {
                    id: assignmentDoc.id,
                    date: assignmentData.date,
                    emojiId: assignmentData.emojiId,
                    emoji: null,
                };
            }

            const emojiData = emojiDoc.data();

            return {
                id: assignmentDoc.id,
                date: assignmentData.date,
                emojiId: assignmentData.emojiId,
                emoji: emojiData,
            };
        }),

    deleteAssignment: protectedProcedure
        .input(z.object({ date: z.string().date() }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { date } = input;

            // Find the assignment for this date
            const assignmentSnapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('dayAssignments')
                .where('date', '==', date)
                .limit(1)
                .get();

            if (assignmentSnapshot.empty) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'No emoji assignment found for this date.',
                });
            }

            const assignmentDoc = assignmentSnapshot.docs[0];
            const assignmentId = assignmentDoc.id;

            // Delete the assignment
            await assignmentDoc.ref.delete();

            return {
                id: assignmentId,
                date: date,
                message: 'Emoji assignment deleted successfully!',
            };
        }),
});
