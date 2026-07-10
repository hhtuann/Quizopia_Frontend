"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateUser, assignRole, createUser, disableUser, getRoles, listUsers,
  lockUser, unlockUser, updateUser,
  type CreateUserRequest, type UpdateUserRequest, type UsersListParams,
} from "@/lib/api/users";

export function useUsersQuery(params: UsersListParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });
}

export function useRolesQuery() {
  return useQuery({ queryKey: ["roles"], queryFn: getRoles, staleTime: 300_000 });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["users"] });
}

export function useCreateUserMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: CreateUserRequest) => createUser(req), onSuccess: () => invalidate(qc) });
}
export function useUpdateUserMutation(id: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (req: UpdateUserRequest) => updateUser(id, req), onSuccess: () => invalidate(qc) });
}
export function useActivateUserMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => activateUser(id), onSuccess: () => invalidate(qc) });
}
export function useDisableUserMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => disableUser(id), onSuccess: () => invalidate(qc) });
}
export function useLockUserMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => lockUser(id), onSuccess: () => invalidate(qc) });
}
export function useUnlockUserMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => unlockUser(id), onSuccess: () => invalidate(qc) });
}
export function useAssignRoleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleCode }: { id: number; roleCode: string }) => assignRole(id, roleCode),
    onSuccess: () => invalidate(qc),
  });
}
