import { z } from "zod";

/**
 * Zod schemas mirroring the academic (subject) backend requests and their
 * Jakarta Validation constraints:
 *   - CreateSubjectRequest:
 *       code: @NotBlank, @Size(max = 50)
 *       name: @NotBlank, @Size(max = 150)
 *       description: @Size(max = 2000), nullable (no @NotBlank)
 *       schoolId: @NotNull
 *       gradeLevelId: @NotNull
 *   - UpdateSubjectRequest:
 *       name: @NotBlank, @Size(max = 150)
 *       description: @Size(max = 2000), nullable
 *
 * Client-side validation only; the backend remains the source of truth.
 */

export const createSubjectSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required.")
    .max(50, "Code must be 50 characters or fewer."),
  name: z
    .string()
    .min(1, "Name is required.")
    .max(150, "Name must be 150 characters or fewer."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional(),
  schoolId: z
    .number({ message: "School is required." })
    .int("School is required.")
    .positive("School is required."),
  gradeLevelId: z
    .number({ message: "Grade level is required." })
    .int("Grade level is required.")
    .positive("Grade level is required."),
});

export type CreateSubjectValues = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(150, "Name must be 150 characters or fewer."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional(),
});

export type UpdateSubjectValues = z.infer<typeof updateSubjectSchema>;
