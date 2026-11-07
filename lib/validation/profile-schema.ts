import { z } from "zod";

export const profileSchema = z.object({
  displayName: z.string()
    .refine((value) => !/\p{Cc}/u.test(value), "Display name cannot contain control characters.")
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Display name is required.").max(150, "Display name must be 150 characters or fewer.")),
  phone: z.string().trim()
    .refine((value) => value === "" || /^\+?[0-9]{7,15}$/.test(value), "Use 7–15 digits with an optional leading +.")
    .transform((value) => value || null),
});

export type ProfileValues = z.input<typeof profileSchema>;
export type ProfileUpdate = z.output<typeof profileSchema>;
