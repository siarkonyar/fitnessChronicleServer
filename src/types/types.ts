import z from "zod";
import { Timestamp } from 'firebase-admin/firestore';

const FirestoreTimestampSchema = z.custom<Timestamp>(
    (val) => val instanceof Timestamp,
    {
        message: "Expected a Firebase Firestore Timestamp object",
    }
);

export const SetSchema = z.object({
  setType: z.enum(["warmup", "normal", "failure", "drop"]),
  measure: z.enum(["kg", "lbs", "sec", "distance", "step"]),
  value: z.string().optional(),
  reps: z.string().optional(),
});

// Zod schema for a fitness log entry
export const ExerciseLogSchema = z.object({
    date: z.string().date(), // ISO 8601 date string
    activity: z.string().min(3).max(100),
    caloriesBurned: z.number().int().optional(),
    notes: z.string().max(500).optional(),
    sets: z.array(SetSchema), // Array of exercise sets
    createdAt: FirestoreTimestampSchema.optional(),
});

export const LabelSchema = z.object({
    label: z.string().min(1).max(10), // Limit emoji length
    description: z.string().min(1).max(100), // Add length constraints
    dates: z.array(z.string().date()).default([]).optional(), // Make dates optional with default empty array
    muscleGroups: z.array(z.string()).default([]).optional(),
    createdAt: FirestoreTimestampSchema.optional(),
});

export const DaySchema = z.object({
    date: z.string().date(), // ISO 8601 date string
    labelId: z.string().min(1), // Reference to emoji ID instead of full object
    createdAt: FirestoreTimestampSchema.optional(),
});

export const ExerciseNameListSchema = z.object({
    name: z.string(),
    createdAt: FirestoreTimestampSchema.optional(),
})

// Zod schema for emoji assignments with an ID (when reading from DB)
export const LabelWithIdSchema = LabelSchema.extend({
    id: z.string(),
});

// Zod schema for day assignments with an ID (when reading from DB)
export const DayWithIdSchema = DaySchema.extend({
    id: z.string(),
});

// Zod schema for a fitness log entry with an ID (when reading from DB)
export const ExerciseLogWithIdSchema = ExerciseLogSchema.extend({
    id: z.string(),
});

export const ExerciseNameListWithIdSchema = ExerciseNameListSchema.extend({
    id: z.string(),
});