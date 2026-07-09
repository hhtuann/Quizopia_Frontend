"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMembers,
  createClassroom,
  getClassroom,
  getClassroomMembers,
  getMyClassrooms,
  removeMember,
  updateClassroom,
  type AddMembersRequest,
  type ClassroomMembersParams,
  type CreateClassroomRequest,
  type UpdateClassroomRequest,
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
    mutationFn: (studentProfileId: number) => removeMember(id, studentProfileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}
