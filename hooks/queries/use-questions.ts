"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getQuestion, updateQuestion, type UpdateQuestionRequest } from "@/lib/api/questions";

export function useQuestionDetailQuery(id: number, enabled = true) {
  return useQuery({
    queryKey: ["question", id],
    queryFn: () => getQuestion(id),
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateQuestionMutation(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateQuestionRequest) => updateQuestion(id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question", id] });
      qc.invalidateQueries({ queryKey: ["question-banks"] });
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}
