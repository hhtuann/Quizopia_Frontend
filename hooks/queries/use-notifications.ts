"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from "@/lib/api/notifications";

const NOTIF_KEY = ["notifications"];

export function useNotificationsQuery() {
  return useQuery({
    queryKey: NOTIF_KEY,
    queryFn: () => getNotifications(0, 20),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadCountQuery() {
  return useQuery({
    queryKey: [...NOTIF_KEY, "unread-count"],
    queryFn: () => getUnreadCount(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMarkReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEY });
    },
  });
}

export function useMarkAllReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEY });
    },
  });
}
