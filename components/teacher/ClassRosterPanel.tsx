"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useAddRosterEntryMutation,
  useClassroomRosterQuery,
  useRevokeRosterEntryMutation,
} from "@/hooks/queries/use-classrooms";
import { rosterEntrySchema, type RosterEntryValues } from "@/lib/validation/roster-schemas";
import type { NormalizedApiError } from "@/lib/api";
import type { RosterEntryResponse } from "@/lib/api/classrooms";
import { Badge, Button, Input } from "@/components/ui";

/**
 * Identity-M3: "Thêm học sinh" roster panel for a classroom.
 *
 * Teachers add PENDING invitations by email (no user is created). Entries
 * link automatically once the invitee verifies that email; LINKED rows show
 * the member; PENDING rows can be revoked. Sensitive fields (DOB, phones)
 * are only echoed back to the classroom owner.
 */
export function ClassRosterPanel({
  classId,
  unboxed = false,
}: {
  classId: number;
  /** Render inside AddStudentsPanel without the section heading (card provided by the host). */
  unboxed?: boolean;
}) {
  const { data, isPending, isError } = useClassroomRosterQuery(classId);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const add = useAddRosterEntryMutation(classId);
  const revoke = useRevokeRosterEntryMutation(classId);

  const form = useForm<RosterEntryValues>({
    resolver: zodResolver(rosterEntrySchema),
    defaultValues: {
      fullName: "",
      studentNumber: "",
      gender: undefined,
      dob: "",
      phone: "",
      parentPhone: "",
      email: "",
    },
  });

  function describeError(err: unknown): string {
    const norm = err as NormalizedApiError | undefined;
    if (norm?.kind === "api") {
      switch (norm.code) {
        case "ROSTER_DUPLICATE_PENDING":
          return "This email already has a pending invitation for this class.";
        case "CLASSROOM_ACCESS_DENIED":
          return "You don't have permission to manage this roster.";
        default:
          return norm.message || "Could not add the roster entry.";
      }
    }
    if (norm?.kind === "network") return "Network error — check your connection.";
    return "Something went wrong. Please try again.";
  }

  function onSubmit(values: RosterEntryValues) {
    add.mutate(
      {
        fullName: values.fullName,
        studentNumber: values.studentNumber || null,
        gender: values.gender ?? null,
        dob: values.dob || null,
        phone: values.phone || null,
        parentPhone: values.parentPhone || null,
        email: values.email,
      },
      {
        onSuccess: (entry) => {
          setNotice({
            kind: "success",
            message:
              entry.status === "LINKED"
                ? `${entry.fullName} was linked and added to the class.`
                : `${entry.fullName} was added as a pending invitation.`,
          });
          form.reset();
        },
        onError: (err) => setNotice({ kind: "error", message: describeError(err) }),
      }
    );
  }

  function onRevoke(entry: RosterEntryResponse) {
    const message = entry.status === "LINKED"
      ? `Remove ${entry.fullName} from this class? Their membership will be deleted and the invitation revoked.`
      : `Revoke the pending invitation for ${entry.fullName}?`;
    if (!window.confirm(message)) return;
    revoke.mutate(entry.id, {
      onSuccess: () =>
        setNotice({ kind: "success", message: `Invitation for ${entry.fullName} revoked.` }),
      onError: (err) => setNotice({ kind: "error", message: describeError(err) }),
    });
  }

  return (
    <section className={unboxed ? "" : "mt-8"} aria-label="Class roster">
      {!unboxed && (
        <>
          <h2 className="text-lg font-semibold">Roster (email invitations)</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Add learners by email before they register. Once they verify that email they join
            automatically and can leave at any time.
          </p>
        </>
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-4 grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Full name *" error={form.formState.errors.fullName?.message}>
          <Input {...form.register("fullName")} placeholder="Nguyen Van A" />
        </Field>
        <Field label="Student number" error={form.formState.errors.studentNumber?.message}>
          <Input {...form.register("studentNumber")} placeholder="HS001" />
        </Field>
        <Field label="Gender" error={form.formState.errors.gender?.message}>
          <select
            {...form.register("gender")}
            className="w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 py-3 text-sm"
            defaultValue=""
          >
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Date of birth" error={form.formState.errors.dob?.message}>
          <Input type="date" {...form.register("dob")} />
        </Field>
        <Field label="Student phone" error={form.formState.errors.phone?.message}>
          <Input {...form.register("phone")} placeholder="+84 99 123 4567" />
        </Field>
        <Field label="Parent phone" error={form.formState.errors.parentPhone?.message}>
          <Input {...form.register("parentPhone")} placeholder="+84 98 765 4321" />
        </Field>
        <Field label="Email *" error={form.formState.errors.email?.message}>
          <Input type="email" {...form.register("email")} placeholder="learner@example.com" />
        </Field>
      </form>
      <div className="mt-2 flex justify-end">
        <Button type="submit" disabled={add.isPending} onClick={() => form.handleSubmit(onSubmit)()}>
          {add.isPending ? "Adding…" : "Add student"}
        </Button>
      </div>

      {notice?.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {notice.message}
        </p>
      )}

      {isPending && <p className="mt-6 text-sm text-[#64748B]">Loading roster…</p>}
      {isError && <p className="mt-6 text-sm text-red-600">Could not load the roster.</p>}
      {data && (
        <div className="mt-6 overflow-x-auto">
          {data.items.length === 0 ? (
            <p className="text-sm text-[#64748B]">No roster entries yet.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs uppercase tracking-wide text-[#64748B]">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">DOB</th>
                  <th className="py-2 pr-4">Parent phone</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#E2E8F0]/60">
                    <td className="py-2 pr-4">{entry.fullName}</td>
                    <td className="py-2 pr-4">{entry.email}</td>
                    <td className="py-2 pr-4">{entry.dob ?? "—"}</td>
                    <td className="py-2 pr-4">{entry.parentPhone ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                      {entry.status === "PENDING" && (
                        <span className="ml-2 text-xs text-[#64748B]">awaiting learner</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {(entry.status === "PENDING" || entry.status === "LINKED") && (
                        <Button variant="ghost" size="sm" onClick={() => onRevoke(entry)}>
                          {entry.status === "LINKED" ? "Remove" : "Revoke"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function statusVariant(status: RosterEntryResponse["status"]): "success" | "default" | "warn" {
  switch (status) {
    case "LINKED":
      return "success";
    case "PENDING":
      return "warn";
    default:
      return "default";
  }
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#64748B]">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
