// src/trpc/routers/fitness.ts
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod'; // For input validation
import admin from 'firebase-admin'; // Import Firebase Admin SDK
import { DaySchema, LabelSchema, LabelWithIdSchema, ExerciseLogSchema, ExerciseLogWithIdSchema } from '../../types/types';

export const labelRouter = router({
    addLabel: protectedProcedure
        .input(LabelSchema) // Validate input with Zod
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const newLogRef = firestore.collection('users').doc(userId).collection('labels').doc();
            await newLogRef.set({
                ...input,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }),

    getLabelById: protectedProcedure
        .input(z.object({ id: z.string().min(1) })) // Validate input with Zod
        .query(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id } = input;

            const doc = await firestore.collection('users').doc(userId).collection('labels').doc(id).get();

            if (!doc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Fitness log not found.',
                });
            }

            return LabelWithIdSchema.parse({
                id: doc.id,
                ...doc.data(),
            });
        }),

    getAllLabels: protectedProcedure
        .query(async ({ ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;

            const snapshot = await firestore.collection('users').doc(userId).collection('labels')
                .orderBy('createdAt', 'desc')
                .get();

            const labels = snapshot.docs.map(doc => {
                return LabelWithIdSchema.parse({
                    id: doc.id,
                    ...doc.data(),
                });
            });

            return labels;
        }),


    getAllLabelsFromMonth: protectedProcedure
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
            ...(doc.data() as { date: string; labelId: string })
        }));

        if (assignments.length === 0) {
            return [];
        }

        // Fetch labels for all used IDs
        const labelMap: Record<string, string> = {};
        const labelDocs = await Promise.all(
            [...new Set(assignments.map(a => a.labelId))]
                .map(labelId =>
                    firestore.collection('users').doc(userId).collection('labels').doc(labelId).get()
                )
        );

        // Track assignments to delete (those with non-existent labels)
        const assignmentsToDelete: string[] = [];

        for (const doc of labelDocs) {
            if (doc.exists) {
                const data = doc.data()!;
                labelMap[doc.id] = data.label;
            } else {
                // Label doesn't exist, mark assignment for deletion
                assignmentsToDelete.push(doc.id);
            }
        }

        // Delete assignments with non-existent labels
        if (assignmentsToDelete.length > 0) {
            const deletePromises = assignmentsToDelete.map(labelId => {
                // Find the assignment document that references this labelId
                const assignmentToDelete = assignments.find(a => a.labelId === labelId);
                if (assignmentToDelete) {
                    return firestore
                        .collection('users')
                        .doc(userId)
                        .collection('dayAssignments')
                        .doc(assignmentToDelete.id)
                        .delete();
                }
                return Promise.resolve();
            });

            await Promise.all(deletePromises);

            // Remove deleted assignments from the results
            const validAssignments = assignments.filter(a => !assignmentsToDelete.includes(a.labelId));

            // Return { date, label } for each valid assignment
            return validAssignments.map(a => ({
                date: a.date,
                label: labelMap[a.labelId] || ""
            }));
        }

        // Return { date, label } for each assignment
        return assignments.map(a => ({
            date: a.date,
            label: labelMap[a.labelId] || ""
        }));
    }),


    deleteLabel: protectedProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id } = input;

            const logRef = firestore.collection('users').doc(userId).collection('labels').doc(id);
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
                message: 'Label deleted successfully!',
            };
        }),

    editLabel: protectedProcedure
        .input(LabelWithIdSchema)
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { id, label, description } = input;

            const labelRef = firestore.collection('users').doc(userId).collection('labels').doc(id);
            const labelDoc = await labelRef.get();

            if (!labelDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Label not found.',
                });
            }

            const updateData: Record<string, unknown> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (label !== undefined) {
                updateData.label = label;
            }

            if (description !== undefined) {
                updateData.description = description;
            }

            await labelRef.update(updateData);

            const updatedDoc = await labelRef.get();

            return LabelWithIdSchema.parse({
                id: updatedDoc.id,
                ...updatedDoc.data(),
            });
        }),

    asignLabelToDay: protectedProcedure
        .input(DaySchema) // Use the updated DaySchema
        .mutation(async ({ input, ctx }) => {
            const { user, firestore } = ctx;
            const userId = user.uid;
            const { date, labelId } = input;

            // First, check if the label exists
            const labelRef = firestore.collection('users').doc(userId).collection('labels').doc(labelId);
            const labelDoc = await labelRef.get();

            if (!labelDoc.exists) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Label not found.',
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
            let previousLabelId: string | null = null;

            if (!existingAssignmentSnapshot.empty) {
                // Update existing assignment
                const existingDoc = existingAssignmentSnapshot.docs[0];
                assignmentId = existingDoc.id;
                isUpdate = true;
                previousLabelId = existingDoc.data().labelId;

                await existingDoc.ref.update({
                    labelId: labelId,
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
                    labelId: labelId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            // Update the label's dates array
            const labelData = labelDoc.data();
            const currentDates = labelData?.dates || [];

            // Add the date if it's not already in the array
            if (!currentDates.includes(date)) {
                await labelRef.update({
                    dates: admin.firestore.FieldValue.arrayUnion(date)
                });
            }

            // If this was an update and the previous label is different, remove the date from the previous label
            if (isUpdate && previousLabelId && previousLabelId !== labelId) {
                const previousLabelRef = firestore.collection('users').doc(userId).collection('labels').doc(previousLabelId);
                await previousLabelRef.update({
                    dates: admin.firestore.FieldValue.arrayRemove(date)
                });
            }

            return {
                id: assignmentId,
                date: date,
                labelId: labelId,
                message: isUpdate
                    ? 'Label assignment updated successfully!'
                    : 'Label assigned to day successfully!',
            };
        }),

    getLabelAsignmentByDate: protectedProcedure
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

            // Get the full label data
            const labelRef = firestore.collection('users').doc(userId).collection('labels').doc(assignmentData.labelId);
            const labelDoc = await labelRef.get();

            if (!labelDoc.exists) {
                // Label was deleted, automatically delete the assignment
                await assignmentDoc.ref.delete();
                return null; // Return null since the assignment was deleted
            }

            const labelData = labelDoc.data();

            return {
                id: assignmentDoc.id,
                date: assignmentData.date,
                labelId: assignmentData.labelId,
                label: labelData,
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
                    message: 'No label assignment found for this date.',
                });
            }

            const assignmentDoc = assignmentSnapshot.docs[0];
            const assignmentId = assignmentDoc.id;

            // Delete the assignment
            await assignmentDoc.ref.delete();

            return {
                id: assignmentId,
                date: date,
                message: 'Label assignment deleted successfully!',
            };
        }),
});
