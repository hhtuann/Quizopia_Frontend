"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  authorAiMarkdown,
  extractAiDocument,
  getAiAuthoringStatus,
  type AiAuthorRequest,
  type AiAuthorResponse,
  type AiExtractedDocument,
} from "@/lib/api/ai-authoring";

/**
 * TanStack Query hooks for the AI authoring endpoints (Phase 5, issue #114).
 *
 * - Status probe: `retry: false` + 5 min `staleTime` — a transient provider
 *   hiccup must not spam the endpoint, and callers treat the query's
 *   `isError` exactly like `available === false` ("unavailable").
 * - Mutations are plain passthroughs: the chat component owns conversation
 *   state, so there is no cache to invalidate (nothing is persisted
 *   server-side).
 */
export function useAiAuthoringStatusQuery(bankId: number) {
  return useQuery({
    queryKey: ["question-banks", bankId, "ai", "authoring"],
    queryFn: () => getAiAuthoringStatus(bankId),
    enabled: Number.isFinite(bankId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/** Upload one file for server-side text extraction (multipart part `file`). */
export function useExtractAiDocumentMutation(bankId: number) {
  return useMutation<AiExtractedDocument, Error, File>({
    mutationFn: (file: File) => extractAiDocument(bankId, file),
  });
}

/** One authoring turn: instruction + current Markdown + documents + history. */
export function useAuthorAiMarkdownMutation(bankId: number) {
  return useMutation<AiAuthorResponse, Error, AiAuthorRequest>({
    mutationFn: (request: AiAuthorRequest) => authorAiMarkdown(bankId, request),
  });
}
