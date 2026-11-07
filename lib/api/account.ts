import { http } from "./http-client";
import type { CurrentUserResponse } from "@/lib/auth/types";
import type { ProfileUpdate } from "@/lib/validation/profile-schema";

export function updateProfile({ displayName, phone }: ProfileUpdate): Promise<CurrentUserResponse> {
  return http.put<CurrentUserResponse>("/api/account/profile", { displayName, phone });
}

export interface AccountSecurity {
  localCredentialState: "ENABLED" | "DISABLED" | "UNKNOWN";
  canChangePassword: boolean;
  googleLinked: boolean;
  passwordChangedAt: string;
}

export function getAccountSecurity(): Promise<AccountSecurity> {
  return http.get<AccountSecurity>("/api/account/security");
}

export function changePassword(values: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<void> {
  return http.post<void>("/api/account/security/change-password", values).then(() => undefined);
}
