import { z } from "zod";

/**
 * Zod schemas mirroring the backend auth DTOs (LoginRequest / RegisterRequest)
 * and their Jakarta Validation constraints. Client-side validation only — the
 * backend remains the source of truth; these just give early feedback and
 * shape the form values. See:
 *   - com.hhtuann.backend.authentication.dto.LoginRequest
 *   - com.hhtuann.backend.authentication.dto.RegisterRequest
 */

/** `LoginRequest(identifier, password)` — both `@NotBlank`. */
export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginValues = z.infer<typeof loginSchema>;

/** `RegisterRequest(...)` with the same length/presence constraints. */
export const registerSchema = z
  .object({
    username: z
      .string()
      .min(1, "Username is required.")
      .max(50, "Username must be 50 characters or fewer.")
      // Backend treats identifier with '@' as an email; a username must not contain it.
      .refine((v) => !v.includes("@"), "Username cannot contain '@'."),
    email: z
      .string()
      .min(1, "Email is required.")
      .email("Enter a valid email address.")
      .max(254, "Email must be 254 characters or fewer."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    displayName: z
      .string()
      .min(1, "Display name is required.")
      .max(150, "Display name must be 150 characters or fewer."),
    phone: z.string().min(1, "Phone number is required."),
    nationalId: z.string().min(1, "National ID is required."),
    // Required here; the form seeds "STUDENT" via defaultValues (the backend
    // treats a missing accountType as STUDENT, but the client always sends one).
    accountType: z.enum(["STUDENT", "TEACHER"]),
    teacherInviteCode: z.string().optional(),
  })
  .refine(
    (data) => data.accountType !== "TEACHER" || !!data.teacherInviteCode?.trim(),
    {
      message: "Teacher invite code is required for teacher accounts.",
      path: ["teacherInviteCode"],
    }
  );

export type RegisterValues = z.infer<typeof registerSchema>;
