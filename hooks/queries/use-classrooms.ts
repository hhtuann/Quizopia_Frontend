"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptRosterInvitation,
  addMembers,
  addRosterEntry,
  createClassroom,
  declineRosterEntry,
  getClassroom,
  getMyRosterInvitations,
  getClassroomMembers,
  getClassroomRoster,
  getMyClassrooms,
  getMyRosterEntries,
  removeMember,
  revokeRosterEntry,
  updateClassroom,
  type AddMembersRequest,
  type ClassroomMembersParams,
  type CreateClassroomRequest,
  type CreateRosterEntryRequest,
  type RosterEntryResponse,
  type UpdateClassroomRequest,
  confirmRosterImport,
  downloadRosterTemplate,
  previewRosterImport,
} from "@/lib/api/classrooms";

/** Flat list of the caller's classrooms (feeds the list page + nav). */
export function useMyClassroomsQuery() {
  return useQuery({
    queryKey: ["classrooms"],
    queryFn: getMyClassrooms,
  });
}

/** Single classroom detail (with the full member roster). */
export function useClassroomQuery(id: number) {
  return useQuery({
    queryKey: ["classrooms", id],
    queryFn: () => getClassroom(id),
    enabled: !!id,
  });
}

/** Paginated members (for large rosters; the detail query already carries the
 *  full roster for small classrooms). */
export function useClassroomMembersQuery(id: number, params: ClassroomMembersParams = {}) {
  const { page = 0, size = 20, sort } = params;
  return useQuery({
    queryKey: ["classrooms", id, "members", { page, size, sort }],
    queryFn: () => getClassroomMembers(id, { page, size, sort }),
    enabled: !!id,
  });
}

/** All mutations invalidate the `["classrooms"]` prefix, which covers the list,
 *  the detail, and the paginated members in one shot. */

export function useCreateClassroomMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateClassroomRequest) => createClassroom(req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export function useUpdateClassroomMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateClassroomRequest) => updateClassroom(id, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export function useAddMembersMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: AddMembersRequest) => addMembers(id, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export function useRemoveMemberMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeMember(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

// ----- Identity-M3 roster hooks -----

/** Pending/linked roster entries of a classroom (owner view). */
export function useClassroomRosterQuery(id: number) {
  return useQuery({
    queryKey: ["classrooms", id, "roster"],
    queryFn: () => getClassroomRoster(id, { size: 200 }),
    enabled: !!id,
  });
}

export function useAddRosterEntryMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateRosterEntryRequest) => addRosterEntry(id, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export function useRevokeRosterEntryMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) => revokeRosterEntry(id, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

/** Learner: my linked roster entries (classes joined via email verification). */
export function useMyRosterEntriesQuery() {
  return useQuery({
    queryKey: ["roster", "my"],
    queryFn: getMyRosterEntries,
  });
}

export function useDeclineRosterEntryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) => declineRosterEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["classrooms"] });
    },
  });
}

// ----- Identity-M4 roster import hooks -----

export function useRosterPreviewMutation(id: number) {
  return useMutation({
    mutationFn: (file: File) => previewRosterImport(id, file),
  });
}

export function useRosterConfirmMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => confirmRosterImport(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export { downloadRosterTemplate };

/** Learner: pending invitations awaiting my consent (Identity-M3 review). */
export function useMyRosterInvitationsQuery<T = RosterEntryResponse[]>() {
  return useQuery<T>({
    queryKey: ["roster", "invitations"],
    queryFn: () => getMyRosterInvitations() as Promise<T>,
  });
}

export function useAcceptRosterInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) => acceptRosterInvitation(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["classrooms"] });
    },
  });
}
