import { z } from "zod";

/**
 * Zod schema mirroring backend `CreateExamSessionRequest` and its Jakarta
 * Validation constraints:
 *   - examId: @NotNull @Positive
 *   - examVersionNumber: @NotNull @Positive  (must reference a PUBLISHED version)
 *   - title: @NotBlank, @Size(max = 255)
 *   - startsAt / endsAt: @NotNull Instant      (datetime-local strings here → ISO on submit)
 *   - maxAttempts: @NotNull @Positive Integer
 *
 * `startsAt`/`endsAt` are held as `datetime-local` strings; the submit handler
 * converts them to ISO UTC. The cross-field check (endsAt > startsAt) is also
 * enforced server-side (EXAM_SESSION_TIME_INVALID).
 */
export const createSessionSchema = z
  .object({
    examId: z
      .number({ message: "Choose an exam." })
      .int("Choose an exam.")
      .positive("Choose an exam."),
    examVersionNumber: z
      .number({ message: "Choose a published version." })
      .int("Choose a published version.")
      .positive("Choose a published version."),
    title: z
      .string()
      .min(1, "Title is required.")
      .max(255, "Title must be 255 characters or fewer."),
    startsAt: z.string().min(1, "Start time is required."),
    endsAt: z.string().min(1, "End time is required."),
    maxAttempts: z
      .number({ message: "Max attempts is required." })
      .int("Max attempts must be a whole number.")
      .min(0, "Max attempts must be 0 or more (0 = unlimited)."),
    // Per-attempt time limit. Omitted/empty = inherit the exam version's duration.
    // 0 = unlimited (deadline = session endsAt). Positive = minutes per attempt.
    durationMinutes: z
      .number({ message: "Duration must be a whole number." })
      .int("Duration must be a whole number.")
      .min(0, "Duration must be 0 or more (0 = unlimited).")
      .optional(),
    // PUBLIC = all same-school students; CLASS_RESTRICTED = assigned classes only (default).
    visibility: z.enum(["PUBLIC", "CLASS_RESTRICTED"]),
    // Classrooms assigned when CLASS_RESTRICTED. Required-meaningful only then; the
    // create form validates "≥1 class when restricted" in onSubmit (component logic).
    classroomIds: z.array(z.number().int().positive()).optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "End time must be after the start time.",
    path: ["endsAt"],
  });

export type CreateSessionValues = z.infer<typeof createSessionSchema>;

/**
 * Zod schema mirroring backend `UpdateExamSessionRequest` (FE8b config edit):
 *   - title: @NotBlank, @Size(max = 255)
 *   - startsAt / endsAt: @NotNull Instant (datetime-local strings → ISO on submit)
 *   - maxAttempts: @NotNull @Positive Integer
 *
 * `expectedVersion` is NOT a form field — it is taken from `detail.version` at
 * submit (optimistic @Version). `endsAt > startsAt` is also enforced server-side.
 */
export const updateSessionSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required.")
      .max(255, "Title must be 255 characters or fewer."),
    startsAt: z.string().min(1, "Start time is required."),
    endsAt: z.string().min(1, "End time is required."),
    maxAttempts: z
      .number({ message: "Max attempts is required." })
      .int("Max attempts must be a whole number.")
      .min(0, "Max attempts must be 0 or more (0 = unlimited)."),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "End time must be after the start time.",
    path: ["endsAt"],
  });

export type UpdateSessionValues = z.infer<typeof updateSessionSchema>;
