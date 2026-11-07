"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile } from "@/lib/api/account";
import type { NormalizedApiError } from "@/lib/api";
import type { CurrentUserResponse } from "@/lib/auth/types";
import { isCurrentSession, sessionGeneration } from "@/lib/auth/store";
import { profileSchema, type ProfileUpdate, type ProfileValues } from "@/lib/validation/profile-schema";
import { initialsOf } from "@/lib/utils/initials";

export function Profile() {
  const { user, refreshUser } = useAuth();
  return user ? <ProfileForm key={user.id} user={user} refreshUser={refreshUser} /> : <p role="status">Loading your profile…</p>;
}

function ProfileForm({ user, refreshUser }: {
  user: CurrentUserResponse;
  refreshUser: () => Promise<CurrentUserResponse>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<ProfileValues, unknown, ProfileUpdate>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName, phone: user.phone ?? "" },
  });
  const busy = isSubmitting || refreshing;

  async function syncIdentity() {
    const generation = sessionGeneration();
    setRefreshing(true);
    try {
      await refreshUser();
      if (!isCurrentSession(generation)) return;
      setRefreshNeeded(false);
      setError(null);
      setMessage("Profile saved.");
    } catch {
      if (!isCurrentSession(generation)) return;
      setRefreshNeeded(true);
      setError("Your profile was saved, but the account display could not refresh. Retry the refresh; you do not need to save again.");
    } finally {
      setRefreshing(false);
    }
  }

  async function save(values: ProfileUpdate) {
    const generation = sessionGeneration();
    setError(null);
    setMessage(null);
    try {
      const saved = await updateProfile(values);
      if (!isCurrentSession(generation)) return;
      reset({ displayName: saved.displayName, phone: saved.phone ?? "" });
    } catch (err) {
      if (!isCurrentSession(generation)) return;
      const failure = err as NormalizedApiError;
      if (failure?.kind === "network") {
        setError("Network error — check your connection and try again.");
      } else if ((failure?.kind === "api" || failure?.kind === "http") && failure.status === 423) {
        setError("Your account is temporarily locked. Please try again later.");
      } else if (failure?.kind === "api" && failure.status === 400) {
        setError("Check your display name and phone number, then try again.");
      } else {
        setError("Could not save your profile. Please try again.");
      }
      return;
    }
    if (isCurrentSession(generation)) await syncIdentity();
  }

  return (
    <div className="page-form w-full space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#0052FF]">Your account</p>
        <h1 className="mt-2 font-display text-3xl text-[#0F172A] sm:text-4xl">Profile</h1>
        <p className="mt-3 text-sm text-[#64748B]">One profile across all your Quizopia workspaces and roles.</p>
      </div>
      <Card className="space-y-6 p-5 sm:p-8" aria-labelledby="account-heading">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-xl font-bold text-white">{initialsOf(user.displayName || user.username)}</div>
          <div className="min-w-0">
            <h2 id="account-heading" className="text-lg font-semibold text-[#0F172A]">Account information</h2>
            <p className="break-words text-sm text-[#64748B]">{user.displayName}</p>
          </div>
        </div>
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div><dt className="text-[#64748B]">Username</dt><dd className="mt-1 break-words font-medium text-[#0F172A]">{user.username}</dd></div>
          <div><dt className="text-[#64748B]">Email</dt><dd className="mt-1 break-words font-medium text-[#0F172A]">{user.email}</dd></div>
          <div><dt className="text-[#64748B]">Roles</dt><dd className="mt-2 flex flex-wrap gap-2">{user.roles.map((role) => <Badge key={role}>{role}</Badge>)}</dd></div>
          <div><dt className="text-[#64748B]">Account status</dt><dd className="mt-2"><Badge>{user.status}</Badge></dd></div>
          <div><dt className="text-[#64748B]">Email verification</dt><dd className="mt-2"><Badge variant={user.emailVerified ? "accent" : "default"}>{user.emailVerified ? "Email verified" : "Email not verified"}</Badge></dd></div>
          <div><dt className="text-[#64748B]">Google account</dt><dd className="mt-2"><Badge variant={user.googleLinked ? "accent" : "default"}>{user.googleLinked ? "Google linked" : "Google not linked"}</Badge></dd></div>
        </dl>
        <p className="text-xs text-[#64748B]">Account identity, roles, verification, and linked providers are read-only here.</p>
      </Card>
      <Card className="p-5 sm:p-8">
        <h2 id="profile-heading" className="text-lg font-semibold text-[#0F172A]">Personal details</h2>
        <p className="mt-2 text-sm text-[#64748B]">Choose the name others see. Your phone number is optional.</p>
        <form aria-labelledby="profile-heading" aria-busy={busy} noValidate onSubmit={handleSubmit(save)} className="mt-6 space-y-5">
          <div>
            <label htmlFor="displayName" className="mb-2 block text-sm font-medium text-[#0F172A]">Display name</label>
            <Input id="displayName" autoComplete="name" disabled={busy} aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? "displayName-error" : undefined} {...register("displayName")} />
            {errors.displayName && <p id="displayName-error" className="mt-2 text-sm text-[#B91C1C]">{errors.displayName.message}</p>}
          </div>
          <div>
            <label htmlFor="phone" className="mb-2 block text-sm font-medium text-[#0F172A]">Phone number (optional)</label>
            <Input id="phone" type="tel" autoComplete="tel" disabled={busy} aria-invalid={!!errors.phone} aria-describedby={`phone-help${errors.phone ? " phone-error" : ""}`} {...register("phone")} />
            <p id="phone-help" className="mt-2 text-xs text-[#64748B]">7–15 digits, with an optional leading +. Leave blank to remove your phone number.</p>
            {errors.phone && <p id="phone-error" className="mt-2 text-sm text-[#B91C1C]">{errors.phone.message}</p>}
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#B91C1C]">{error}</p>}
          {message && <p role="status" className="text-sm text-[#0052FF]">{message}</p>}
          {refreshNeeded && <Button type="button" variant="outline" disabled={busy} onClick={() => void syncIdentity()}>Refresh account display</Button>}
          <div className="flex flex-col gap-3 border-t border-[#E2E8F0] pt-5 sm:flex-row sm:items-center sm:justify-end">
            {isDirty && <p className="text-xs text-[#64748B] sm:mr-auto">Unsaved changes</p>}
            <Button type="button" variant="outline" disabled={!isDirty || busy} onClick={() => { reset(); setMessage(null); if (!refreshNeeded) setError(null); }}>Cancel</Button>
            <Button type="submit" disabled={!isDirty || busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
