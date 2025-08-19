// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { emoji, z } from 'zod'; // For input validation
import admin from 'firebase-admin'; // Import Firebase Admin SDK
import { DaySchema, EmojiSchema, EmojiWithIdSchema, ExerciseLogSchema, ExerciseLogWithIdSchema } from '../../types/types';

export const emojiRouter = router({
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


    getAllEmojisFromMonth: protectedProcedure
    .input(z.object({
        date: z.string().regex(/^\d{4}-\d{2}$/, 'Date must be in YYYY-MM format')
    }))
    .query(async ({ input, ctx }) => {
        const { user, firestore } = ctx;
        const userId = user.uid;
        const { date } = input;

        const [year, month] = date.split('-').map(Number);
        const startDateStr = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDateStr = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

        // Fetch day assignments
        const assignmentsSnapshot = await firestore
            .collection('users')
            .doc(userId)
            .collection('dayAssignments')
            .where('date', '>=', startDateStr)
            .where('date', '<=', endDateStr)
            .get();

        const assignments = assignmentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as { date: string; emojiId: string })
        }));

        if (assignments.length === 0) {
            return [];
        }

        // Fetch emojis for all used IDs
        const emojiMap: Record<string, string> = {};
        const emojiDocs = await Promise.all(
            [...new Set(assignments.map(a => a.emojiId))]
                .map(emojiId =>
                    firestore.collection('users').doc(userId).collection('emojis').doc(emojiId).get()
                )
        );

        for (const doc of emojiDocs) {
            if (doc.exists) {
                const data = doc.data()!;
                emojiMap[doc.id] = data.emoji;
            }
        }

        // Return { date, emoji } for each assignment
        return assignments.map(a => ({
            date: a.date,
            emoji: emojiMap[a.emojiId] || ""
        }));
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

    editEmoji: protectedProcedure
        .input(EmojiWithIdSchema)
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id, emoji, description } = input;

            const emojiRef = firestore.collection('users').doc(userId).collection('emojis').doc(id);
            const emojiDoc = await emojiRef.get();

            if (!emojiDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Emoji not found.',
                });
            }

            const updateData: Record<string, unknown> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (emoji !== undefined) {
                updateData.emoji = emoji;
            }

            if (description !== undefined) {
                updateData.description = description;
            }

            await emojiRef.update(updateData);

            const updatedDoc = await emojiRef.get();

            return EmojiWithIdSchema.parse({
                id: updatedDoc.id,
                ...updatedDoc.data(),
            });
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
            let previousEmojiId: string | null = null;

            if (!existingAssignmentSnapshot.empty) {
                // Update existing assignment
                const existingDoc = existingAssignmentSnapshot.docs[0];
                assignmentId = existingDoc.id;
                isUpdate = true;
                previousEmojiId = existingDoc.data().emojiId;

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

            // Update the emoji's dates array
            const emojiData = emojiDoc.data();
            const currentDates = emojiData?.dates || [];

            // Add the date if it's not already in the array
            if (!currentDates.includes(date)) {
                await emojiRef.update({
                    dates: admin.firestore.FieldValue.arrayUnion(date)
                });
            }

            // If this was an update and the previous emoji is different, remove the date from the previous emoji
            if (isUpdate && previousEmojiId && previousEmojiId !== emojiId) {
                const previousEmojiRef = firestore.collection('users').doc(userId).collection('emojis').doc(previousEmojiId);
                await previousEmojiRef.update({
                    dates: admin.firestore.FieldValue.arrayRemove(date)
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
