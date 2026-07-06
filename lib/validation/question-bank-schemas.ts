import { z } from "zod";

/**
 * Zod schema mirroring backend `CreateQuestionBankRequest` and its Jakarta
 * Validation constraints:
 *   - code: @NotBlank, @Size(max = 80)
 *   - name: @NotBlank, @Size(max = 255)
 *   - description: @Size(max = 2000), nullable (no @NotBlank)
 *   - subjectId: @NotNull (selected from the school-scoped dropdown)
 *
 * Client-side validation only; the backend remains the source of truth.
 */
export const createBankSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required.")
    .max(80, "Code must be 80 characters or fewer."),
  name: z
    .string()
    .min(1, "Name is required.")
    .max(255, "Name must be 255 characters or fewer."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional(),
  subjectId: z
    .number({ message: "Subject is required." })
    .int("Subject is required.")
    .positive("Subject is required."),
});

export type CreateBankValues = z.infer<typeof createBankSchema>;
