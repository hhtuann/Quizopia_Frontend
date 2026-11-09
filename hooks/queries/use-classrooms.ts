"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptRosterInvitation,
  addMembers,
  addRosterEntry,
  createClassroom,
  getClassroom,
  getMyRosterInvitations,
  getClassroomMembers,
  getClassroomRoster,
  getMyClassrooms,
  getJoinedClassrooms,
  leaveClassroom,
  removeMember,
  revokeRosterEntry,
  updateClassroom,
  type AddMembersRequest,
  type ClassroomMembersParams,
  type CreateClassroomRequest,
  type CreateRosterEntryRequest,
  type RosterEntryResponse,
  type UpdateClassroomRequest,
  type ClassroomSessionsParams,
  getClassroomSessions,
  getAssignableSessions,
  assignSessionToClassroom,
  unassignSessionFromClassroom,
  getJoinedClassroom,
  getJoinedClassroomSessions,
  confirmRosterImport,
  downloadRosterTemplate,
  previewRosterImport,
  getGradebook,
  getGradebookSessions,
  getClassroomAnalytics,
  getMyResults,
  type GradebookParams,
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

// CLASS-M1: the learner linked-entries query + decline mutation were removed —
// /joined is the class-list source of truth and Leave (/leave) subsumes
// decline server-side. The backend /roster/my + decline endpoints stay for
// API stability.

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

// ----- CLASS-M1 (issue #50): joined membership + self-leave -----

/** Learner: my JOINED classes (source of truth: classroom_members). */
export function useJoinedClassroomsQuery(page = 0, size = 20) {
  return useQuery({
    queryKey: ["classrooms", "joined", { page, size }],
    queryFn: () => getJoinedClassrooms({ page, size }),
    // Keep the previous page visible while the next loads (repo pattern
    // for every paginated query).
    placeholderData: keepPreviousData,
  });
}

/**
 * Learner self-leave. Invalidates the shared `["classrooms"]` prefix
 * (joined list, rosters) AND the `["roster"]` / `["student"]` caches so
 * invitation state and CLASS_RESTRICTED session eligibility views
 * reconcile immediately after leaving. onError ALSO invalidates: the
 * defined repeat-leave 404 (or a lost race with teacher removal) means
 * the local list is stale and must refetch.
 */
export function useLeaveClassroomMutation() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["classrooms"] });
    queryClient.invalidateQueries({ queryKey: ["roster"] });
    queryClient.invalidateQueries({ queryKey: ["student"] });
  };
  return useMutation({
    mutationFn: (classroomId: number) => leaveClassroom(classroomId),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

// ----- CLASS-M2 (issue #52): classroom sessions -----

/** Teacher: sessions assigned to one owned classroom (paged, filterable). */
export function useClassroomSessionsQuery(id: number, params: ClassroomSessionsParams = {}) {
  const { page = 0, size = 20, status, search } = params;
  return useQuery({
    queryKey: ["classrooms", id, "sessions", { page, size, status, search }],
    queryFn: () => getClassroomSessions(id, { page, size, status, search }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Teacher: own eligible sessions not yet assigned to the classroom. */
export function useAssignableSessionsQuery(
  id: number,
  params: { page?: number; size?: number; search?: string } = {}
) {
  const { page = 0, size = 20, search } = params;
  return useQuery({
    queryKey: ["classrooms", id, "sessions", "assignable", { page, size, search }],
    queryFn: () => getAssignableSessions(id, { page, size, search }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Teacher: ADDITIVE assign of one own session to the classroom (idempotent). */
export function useAssignSessionMutation(classroomId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => assignSessionToClassroom(classroomId, sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["classrooms", classroomId, "sessions"] }),
  });
}

/** Teacher: remove exactly this (classroom, session) association (idempotent). */
export function useUnassignSessionMutation(classroomId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => unassignSessionFromClassroom(classroomId, sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["classrooms", classroomId, "sessions"] }),
  });
}

/** Learner: learner-safe detail of one joined classroom. */
export function useJoinedClassroomQuery(id: number, enabled = true) {
  return useQuery({
    queryKey: ["classrooms", "joined", id],
    queryFn: () => getJoinedClassroom(id),
    enabled: enabled && !!id,
  });
}

/** Learner: assigned sessions (no DRAFT) of one joined classroom. */
export function useJoinedClassroomSessionsQuery(
  id: number,
  params: { page?: number; size?: number; status?: string } = {}
) {
  const { page = 0, size = 20, status } = params;
  return useQuery({
    queryKey: ["classrooms", "joined", id, "sessions", { page, size, status }],
    queryFn: () => getJoinedClassroomSessions(id, { page, size, status }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

// ----- CLASS-M3 (issue #54): gradebook + analytics + my-results -----

/** Teacher: gradebook column catalog (session-level completion/average stats). */
export function useGradebookSessionsQuery(id: number, params: { page?: number; size?: number } = {}) {
  const { page = 0, size = 50 } = params;
  return useQuery({
    queryKey: ["classrooms", id, "gradebook", "sessions", { page, size }],
    queryFn: () => getGradebookSessions(id, { page, size }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Teacher: the gradebook matrix (paged students × the selected sessions). */
export function useGradebookQuery(id: number, params: GradebookParams = {}) {
  const { sessionIds, page = 0, size = 20, search, sort, direction } = params;
  return useQuery({
    queryKey: [
      "classrooms",
      id,
      "gradebook",
      "matrix",
      { sessionIds: sessionIds?.join(","), page, size, search, sort, direction },
    ],
    queryFn: () => getGradebook(id, { sessionIds, page, size, search, sort, direction }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Teacher: class-wide analytics (Overview KPIs + session trend). */
export function useClassroomAnalyticsQuery(id: number) {
  return useQuery({
    queryKey: ["classrooms", id, "analytics"],
    queryFn: () => getClassroomAnalytics(id),
    enabled: !!id,
  });
}

/** Learner: my results across the sessions of one joined classroom. */
export function useMyResultsQuery(id: number, params: { page?: number; size?: number } = {}) {
  const { page = 0, size = 20 } = params;
  return useQuery({
    queryKey: ["classrooms", "joined", id, "my-results", { page, size }],
    queryFn: () => getMyResults(id, { page, size }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}
