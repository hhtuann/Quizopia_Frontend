import { z } from "zod";

/**
 * Identity-M3 roster schemas mirroring the backend CreateRosterEntryRequest:
 *   - fullName @NotBlank @Size(max=150)
 *   - studentNumber @Size(max=50) (optional)
 *   - gender MALE|FEMALE|OTHER (optional)
 *   - dob @Past (optional, ISO date)
 *   - phone/parentPhone @Pattern(+digits().- ) (optional)
 *   - email @NotBlank @Email @Size(max=254)
 * Client-side validation only; the backend remains the source of truth.
 */
const phonePattern = /^[+0-9 ().-]{5,20}$/;

/** Empty inputs arrive as "" (react-hook-form), not undefined. */
const optionalPhone = z
  .union([z.literal(""), z.string().regex(phonePattern, "Invalid phone format.")])
  .optional();

const optionalIsoDate = z
  .union([
    z.literal(""),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be a valid date.")
      .refine((v) => new Date(v).getTime() < Date.now(), {
        message: "Date of birth must be in the past.",
      }),
  ])
  .optional();

export const rosterEntrySchema = z.object({
  fullName: z
    .string()
    .min(1, "Full name is required.")
    .max(150, "Full name must be 150 characters or fewer."),
  studentNumber: z
    .string()
    .max(50, "Student number must be 50 characters or fewer.")
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dob: optionalIsoDate,
  phone: optionalPhone,
  parentPhone: optionalPhone,
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Invalid email address.")
    .max(254, "Email must be 254 characters or fewer."),
});

export type RosterEntryValues = z.infer<typeof rosterEntrySchema>;
