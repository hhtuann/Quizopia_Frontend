import { z } from "zod";

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(128, "Use at most 128 characters."),
  confirmPassword: z.string().min(8, "Repeat your new password."),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Both new password entries must match.",
}).refine((values) => values.newPassword !== values.currentPassword, {
  path: ["newPassword"],
  message: "Choose a password different from your current one.",
});

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(3, "Enter your email address.").email("Enter a valid email address."),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Use at least 8 characters.").max(128, "Use at most 128 characters."),
  confirmPassword: z.string().min(8, "Repeat your new password."),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Both new password entries must match.",
});

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
