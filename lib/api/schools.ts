import { http } from "./http-client";

export interface SchoolResponse {
  id: number;
  code: string;
  name: string;
  address: string | null;
  status: string;
  createdAt: string;
}

export interface SchoolListResponse {
  items: SchoolResponse[];
}

/** `GET /api/schools` — ACADEMIC_ADMIN sees their school; SYSTEM_ADMIN sees all. */
export function getSchools(): Promise<SchoolListResponse> {
  return http.get<SchoolListResponse>("/api/schools");
}
