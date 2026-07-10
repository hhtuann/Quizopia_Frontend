"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { Badge, Button, Input, buttonVariants, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  useActivateUserMutation, useAssignRoleMutation, useCreateUserMutation,
  useDisableUserMutation, useLockUserMutation, useRolesQuery, useUnlockUserMutation,
  useUpdateUserMutation, useUsersQuery,
} from "@/hooks/queries/use-users";
import type { UserListItem, UserStatus } from "@/lib/api/users";
import {
  createUserSchema, updateUserSchema,
  type CreateUserValues, type UpdateUserValues,
} from "@/lib/validation/admin-schemas";
import type { NormalizedApiError } from "@/lib/api";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: (UserStatus | "")[] = ["", "ACTIVE", "LOCKED", "DISABLED", "PENDING"];
const labelClass = "mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]";
const selectClass = "h-11 rounded-lg border border-[#E2E8F0] bg-transparent px-4 pr-9 text-sm text-[#0F172A] outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2";
const pageBtnClass = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function statusVariant(s: UserStatus): "success" | "warn" | "destructive" | "default" {
  if (s === "ACTIVE") return "success";
  if (s === "LOCKED") return "warn";
  if (s === "DISABLED") return "destructive";
  return "default";
}
function describeCreateError(err: unknown): { field?: "username" | "email"; message: string } {
  const n = err as NormalizedApiError | undefined;
  if (n?.kind === "api") {
    switch (n.code) {
      case "USER_USERNAME_ALREADY_EXISTS": return { field: "username", message: "This username is already in use." };
      case "USER_EMAIL_ALREADY_EXISTS": return { field: "email", message: "This email is already in use." };
      case "USER_ACCESS_DENIED": return { message: "You don't have permission to create users." };
      default: return { message: n.message || "Could not create the user." };
    }
  }
  if (n?.kind === "network") return { message: "Network error — check your connection." };
  return { message: "Something went wrong. Please try again." };
}

export default function AdminUsersPage() {
  return <RequireAuth requireRole="SYSTEM_ADMIN"><UsersAdmin /></RequireAuth>;
}

function UsersAdmin() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserListItem | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ action: "disable" | "lock"; userId: number; displayName: string } | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const activateMut = useActivateUserMutation();
  const disableMut = useDisableUserMutation();
  const lockMut = useLockUserMutation();
  const unlockMut = useUnlockUserMutation();
  const assignRoleMut = useAssignRoleMutation();
  const { data: rolesData } = useRolesQuery();
  const roles = rolesData?.items ?? [];

  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  const params = useMemo(() => ({ page, size: PAGE_SIZE, search: search || undefined, status: statusFilter || undefined, role: roleFilter || undefined }), [page, search, statusFilter, roleFilter]);
  const { data, isPending, isError, error } = useUsersQuery(params);
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;
  const statusBusy = activateMut.isPending || disableMut.isPending || lockMut.isPending || unlockMut.isPending;

  const runStatus = async (action: "activate" | "disable" | "lock" | "unlock", userId: number) => {
    setNotice(null);
    try {
      const mut = action === "activate" ? activateMut : action === "disable" ? disableMut : action === "lock" ? lockMut : unlockMut;
      await mut.mutateAsync(userId);
      setNotice({ kind: "success", message: `User ${action}d.` });
    } catch { setNotice({ kind: "error", message: "Action failed. Please try again." }); }
  };

  const onConfirmStatus = () => {
    if (!confirmTarget) return;
    const { action, userId } = confirmTarget;
    setConfirmTarget(null);
    void runStatus(action, userId);
  };

  const onAssignRole = async (userId: number, roleCode: string) => {
    setNotice(null);
    try { await assignRoleMut.mutateAsync({ id: userId, roleCode }); setNotice({ kind: "success", message: `Role ${roleCode} assigned.` }); }
    catch { setNotice({ kind: "error", message: "Could not assign role." }); }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Dashboard
          </Link>
          <h1 className="mt-3 font-display text-2xl tracking-tight text-[#0F172A] sm:text-3xl">User Management</h1>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Create user
        </Button>
      </header>

      {notice && (
        <div role={notice.kind === "success" ? "status" : "alert"} className={cn("mb-6 rounded-lg border p-4 text-sm font-medium", notice.kind === "success" ? "border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]" : "border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]")}>
          {notice.message}
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name, username, or email…" className="h-11" aria-label="Search users" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ""); setPage(0); }} className={selectClass} aria-label="Filter by status">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }} className={selectClass} aria-label="Filter by role">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
        </select>
      </div>

      <div className={cn(cardVariants(), "p-4 sm:p-6")}>
        {isPending ? <Skeleton /> : isError ? <ErrorState error={error as unknown as NormalizedApiError | undefined} /> : items.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                  <th scope="col" className="px-3 pb-3 font-semibold">Username</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Name</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Roles</th>
                  <th scope="col" className="px-3 pb-3 font-semibold">Created</th>
                  <th scope="col" className="px-3 pb-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b border-[#E2E8F0] text-[#0F172A] transition-colors last:border-0 group hover:bg-[#F1F5F9]">
                    <td className="px-3 py-3 align-top">
                      <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-1 font-mono text-xs text-[#64748B] whitespace-nowrap transition-colors group-hover:text-[#0052FF]">{u.username}</span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-medium">{u.displayName}</span>
                      <span className="mt-0.5 block max-w-xs truncate text-xs text-[#64748B]">{u.email}</span>
                    </td>
                    <td className="px-3 py-3 align-top"><Badge variant={statusVariant(u.status)}>{u.status}</Badge></td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => <Badge key={r} variant="default">{r}</Badge>)}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-[#64748B]">{formatDate(u.createdAt)}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {/* Contextual status buttons */}
                        {(u.status === "ACTIVE" || u.status === "LOCKED") && (
                          <button type="button" disabled={statusBusy} onClick={() => setConfirmTarget({ action: "disable", userId: u.id, displayName: u.displayName })}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-[#EF4444] hover:bg-[#EF4444]/5")}>Disable</button>
                        )}
                        {u.status === "ACTIVE" && (
                          <button type="button" disabled={statusBusy} onClick={() => setConfirmTarget({ action: "lock", userId: u.id, displayName: u.displayName })}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>Lock</button>
                        )}
                        {u.status === "LOCKED" && (
                          <button type="button" disabled={statusBusy} onClick={() => runStatus("unlock", u.id)}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>Unlock</button>
                        )}
                        {(u.status === "DISABLED" || u.status === "PENDING") && (
                          <button type="button" disabled={statusBusy} onClick={() => runStatus("activate", u.id)}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>Activate</button>
                        )}
                        {/* Role assign */}
                        <select value="" disabled={assignRoleMut.isPending} onChange={(e) => { if (e.target.value) onAssignRole(u.id, e.target.value); }}
                          className="h-8 rounded-lg border border-[#E2E8F0] bg-transparent px-1.5 text-xs text-[#64748B] outline-none focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2" aria-label={`Assign role to ${u.displayName}`}>
                          <option value="">+ Role</option>
                          {roles.filter((r) => !u.roles.includes(r.code)).map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
                        </select>
                        {/* Edit */}
                        <button type="button" onClick={() => setEditTarget(u)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isPending && !isError && items.length > 0 && (
          <div className="mt-4 flex items-center justify-between px-1 pt-4">
            <p className="text-xs font-medium text-[#64748B]" aria-live="polite">{totalElements} user{totalElements === 1 ? "" : "s"} · Page {page + 1} of {Math.max(totalPages, 1)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 0} aria-label="Previous page" className={pageBtnClass}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
              <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page" className={pageBtnClass}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg></button>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={(msg) => { setCreateOpen(false); setNotice({ kind: "success", message: msg }); }} />
      )}
      {editTarget && (
        <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} onSaved={(msg) => { setEditTarget(null); setNotice({ kind: "success", message: msg }); }} />
      )}
      <ConfirmDialog
        open={confirmTarget !== null}
        titleId="user-status-title"
        title={confirmTarget ? `${confirmTarget.action === "disable" ? "Disable" : "Lock"} ${confirmTarget.displayName}?` : ""}
        description={confirmTarget?.action === "disable" ? "A disabled user cannot sign in. They can be reactivated later." : "A locked user is temporarily blocked for 15 minutes."}
        confirmLabel={confirmTarget?.action === "disable" ? "Disable" : "Lock"}
        cancelLabel="Cancel"
        busyLabel="Working…"
        busy={statusBusy}
        onConfirm={onConfirmStatus}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const createMut = useCreateUserMutation();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: "", email: "", password: "", displayName: "", accountType: "STUDENT", phone: "", nationalId: "" },
  });
  const onSubmit = async (v: CreateUserValues) => {
    setFormError(null);
    try {
      const res = await createMut.mutateAsync({ username: v.username.trim(), email: v.email.trim(), password: v.password, displayName: v.displayName.trim(), accountType: v.accountType, phone: v.phone?.trim() || undefined, nationalId: v.nationalId?.trim() || undefined });
      onCreated(`User "${res.displayName}" created.`);
    } catch (err) {
      const m = describeCreateError(err);
      if (m.field === "username") setError("username", { message: m.message });
      else if (m.field === "email") setError("email", { message: m.message });
      else setFormError(m.message);
    }
  };
  return (
    <ModalShell title="Create user" onClose={onClose}>
      {formError && <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">{formError}</div>}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="user-username" className={labelClass}>Username</label>
            <Input id="user-username" type="text" className={cn(errors.username && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("username")} />
            <FieldError message={errors.username?.message} />
          </div>
          <div>
            <label htmlFor="user-displayName" className={labelClass}>Display name</label>
            <Input id="user-displayName" type="text" className={cn(errors.displayName && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("displayName")} />
            <FieldError message={errors.displayName?.message} />
          </div>
        </div>
        <div>
          <label htmlFor="user-email" className={labelClass}>Email</label>
          <Input id="user-email" type="email" className={cn(errors.email && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="user-password" className={labelClass}>Password</label>
          <Input id="user-password" type="password" className={cn(errors.password && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")} {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label htmlFor="user-accountType" className={labelClass}>Account type</label>
          <select id="user-accountType" className={cn(selectClass, "w-full")} {...register("accountType")}>
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="user-phone" className={labelClass}>Phone <span className="font-normal normal-case text-[#64748B]/60">(optional)</span></label>
            <Input id="user-phone" type="text" {...register("phone")} />
          </div>
          <div>
            <label htmlFor="user-nationalId" className={labelClass}>National ID <span className="font-normal normal-case text-[#64748B]/60">(optional)</span></label>
            <Input id="user-nationalId" type="text" {...register("nationalId")} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>Cancel</button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create user"}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: UserListItem; onClose: () => void; onSaved: (msg: string) => void }) {
  const updateMut = useUpdateUserMutation(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<UpdateUserValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { displayName: user.displayName, email: user.email },
  });
  const onSubmit = async (v: UpdateUserValues) => {
    setFormError(null);
    try {
      await updateMut.mutateAsync({ displayName: v.displayName?.trim() || undefined, email: v.email?.trim() || undefined });
      onSaved("User updated.");
    } catch { setFormError("Could not save. Please try again."); }
  };
  return (
    <ModalShell title={`Edit ${user.username}`} onClose={onClose}>
      {formError && <div role="alert" className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-sm font-medium text-[#EF4444]">{formError}</div>}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-displayName" className={labelClass}>Display name</label>
          <Input id="edit-displayName" type="text" {...register("displayName")} />
        </div>
        <div>
          <label htmlFor="edit-email" className={labelClass}>Email</label>
          <Input id="edit-email" type="email" {...register("email")} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>Cancel</button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={cn(cardVariants({ variant: "elevated" }), "relative w-full max-w-lg p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] outline-none transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>{message}</p>;
}
function Skeleton() { return <div role="status" aria-busy="true" aria-label="Loading users" className="space-y-3 py-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />)}<span className="sr-only">Loading…</span></div>; }
function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  const m = error?.kind === "api" ? error.code === "USER_ACCESS_DENIED" ? "You don't have access to user management." : error.code === "AUTH_ACCESS_TOKEN_INVALID" ? "Your session has expired — please sign in again." : error.message || "Couldn't load users." : error?.kind === "network" ? "Network error." : "Something went wrong.";
  return <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-5 text-sm font-medium text-[#EF4444]"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg><span>{m}</span></div>;
}
function EmptyState() { return <div className="flex flex-col items-center justify-center px-4 py-16 text-center"><p className="font-display text-lg font-bold text-[#0F172A]">No users found</p><p className="mt-1 text-sm text-[#64748B]">Try adjusting your filters or create a new user.</p></div>; }
