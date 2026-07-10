"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignStudentToSchool,
  listPendingStudents,
  type PendingStudentsParams,
} from "@/lib/api/student-onboarding";

/** Paginated pending-students list (ACADEMIC_ADMIN). */
export function usePendingStudentsQuery(params: PendingStudentsParams) {
  return useQuery({
    queryKey: ["admin", "pending-students", params],
    queryFn: () => listPendingStudents(params),
  });
}

/** Assign a student to a school (auto-generates student_code). Invalidates the list. */
export function useAssignSchoolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, schoolId }: { userId: number; schoolId: number }) =>
      assignStudentToSchool(userId, schoolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pending-students"] });
    },
  });
}
