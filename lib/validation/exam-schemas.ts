import { z } from "zod";

/**
 * Zod schema mirroring backend `CreateExamRequest` and its Jakarta Validation
 * constraints:
 *   - subjectId: @NotNull @Positive        (selected from the school-scoped dropdown)
 *   - purposeId: @Positive, nullable        (optional — "" maps to null on submit)
 *   - title: @NotBlank, @Size(max = 255)
 *   - description: @Size(max = 2000), nullable
 *
 * `code` is no longer client-supplied — the backend auto-generates it.
 * `purposeId` is held as a string (the raw `<select>` value) and converted to
 * `number | null` in the submit handler.
 */
export const createExamSchema = z.object({
  subjectId: z
    .number({ message: "Subject is required." })
    .int("Subject is required.")
    .positive("Subject is required."),
  purposeId: z.string().optional(),
  title: z
    .string()
    .min(1, "Title is required.")
    .max(255, "Title must be 255 characters or fewer."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional(),
});

export type CreateExamValues = z.infer<typeof createExamSchema>;
