"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMyWorkspaces, type WorkspaceSummary } from "@/lib/api/workspaces";
import { useWorkspacePreference } from "@/lib/workspace/store";

/**
 * Workspaces query (Phase 1, Task A5). Workspaces change rarely — a 5-minute
 * staleTime keeps the switcher snappy without refetching on every mount.
 */
export function useWorkspacesQuery() {
  return useQuery({
    queryKey: ["workspaces", "my"],
    queryFn: () => fetchMyWorkspaces(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Resolved active workspace: the stored preference when still a member,
 * otherwise the personal workspace (the default). Returns `workspace: null`
 * while loading or on error — callers render a neutral fallback.
 */
export function useActiveWorkspace(): {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  isPersonal: boolean;
  isLoading: boolean;
} {
  const { data, isPending } = useWorkspacesQuery();
  const activeWorkspaceId = useWorkspacePreference((s) => s.activeWorkspaceId);
  const hydrate = useWorkspacePreference((s) => s.hydrate);

  // Restore the persisted preference once on the client.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const workspaces = data?.workspaces ?? [];
  const personalWorkspaceId = data?.personalWorkspaceId ?? null;

  const activeWorkspace =
    workspaces.find((w) => w.workspaceId === activeWorkspaceId) ??
    workspaces.find((w) => w.workspaceId === personalWorkspaceId) ??
    workspaces.find((w) => w.workspaceType === "PERSONAL") ??
    null;

  return {
    workspaces,
    activeWorkspace,
    isPersonal: activeWorkspace?.workspaceType === "PERSONAL" || activeWorkspace === null,
    isLoading: isPending,
  };
}
