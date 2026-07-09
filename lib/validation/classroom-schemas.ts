import { z } from "zod";

/**
 * Zod schemas mirroring the classroom backend requests and their Jakarta
 * Validation constraints:
 *   - CreateClassroomRequest: code @NotBlank @Size(max=30), name @NotBlank @Size(max=100),
 *     description @Size(max=500) (nullable, no @NotBlank).
 *   - UpdateClassroomRequest: name @Size(max=100), description @Size(max=500) (both optional).
 *
 * Client-side validation only; the backend remains the source of truth.
 */
export const createClassroomSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required.")
    .max(30, "Code must be 30 characters or fewer."),
  name: z
    .string()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
});

export type CreateClassroomValues = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = z.object({
  name: z
    .string()
    .max(100, "Name must be 100 characters or fewer.")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
});

export type UpdateClassroomValues = z.infer<typeof updateClassroomSchema>;
