import { http } from "./http-client";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface UnreadCountResponse {
  count: number;
}

export function getNotifications(page = 0, size = 20): Promise<NotificationListResponse> {
  return http.get<NotificationListResponse>("/api/notifications", { params: { page, size } });
}

export function getUnreadCount(): Promise<UnreadCountResponse> {
  return http.get<UnreadCountResponse>("/api/notifications/unread-count");
}

export function markRead(id: number): Promise<void> {
  return http.put<void>(`/api/notifications/${id}/read`);
}

export function markAllRead(): Promise<void> {
  return http.put<void>("/api/notifications/read-all");
}
