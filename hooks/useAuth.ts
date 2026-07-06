"use client";

import { useAuthStore } from "@/lib/auth";
import { useAuthContext } from "@/components/providers/AuthProvider";

/**
 * Single auth hook for components. Reads auth DATA (user, accessToken) from the
 * FE3 zustand store and auth STATUS + actions (login/register/logout) from the
 * AuthProvider context.
 *
 * Must be used inside <AuthProvider> (which is composed in app/layout.tsx).
 */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status, login, register, logout } = useAuthContext();

  return {
    user,
    accessToken,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    login,
    register,
    logout,
  };
}
