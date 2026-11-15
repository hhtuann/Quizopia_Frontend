import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  fetchAttemptMediaStatus,
  fetchEvidenceUrl,
  fetchRecordingUrl,
  fetchSessionEvidence,
  fetchSessionRecordings,
  requestAlertClip,
  uploadEvidenceSnapshot,
} from "./evidence";

/**
 * P4-D evidence API routes (frozen contract, issues #91–#94): endpoints,
 * multipart shape of the snapshot upload and query-param building — all
 * against a mocked httpClient (no network in vitest).
 */

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(http.get);
const post = vi.mocked(http.post);

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(undefined as never);
  post.mockResolvedValue(undefined as never);
});

describe("uploadEvidenceSnapshot (student, multipart)", () => {
  it("posts a FormData with file + alertId + idempotencyKey + capturedAt", async () => {
    await uploadEvidenceSnapshot(9, {
      alertId: 12,
      capturedAtMs: 1_731_667_200_000,
      blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
      idempotencyKey: "0e2d1a1c-0000-4000-8000-000000000000",
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/api/attempts/9/evidence/snapshots");
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("alertId")).toBe("12");
    expect(form.get("idempotencyKey")).toBe(
      "0e2d1a1c-0000-4000-8000-000000000000"
    );
    expect(form.get("capturedAt")).toBe("1731667200000");
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("snapshot.jpg");
    expect((file as File).type).toBe("image/jpeg");
  });
});

describe("fetchAttemptMediaStatus (student)", () => {
  it("targets the monitoring media-status route", async () => {
    await fetchAttemptMediaStatus(9);
    expect(get).toHaveBeenCalledWith("/api/attempts/9/monitoring/media-status");
  });
});

describe("fetchSessionEvidence (teacher)", () => {
  it("hits the bare route without params", async () => {
    await fetchSessionEvidence(5);
    expect(get).toHaveBeenCalledWith("/api/exam-sessions/5/evidence");
  });

  it("builds alertId/kind/limit query params only when set", async () => {
    await fetchSessionEvidence(5, { alertId: 12, kind: "CLIP", limit: 10 });
    expect(get).toHaveBeenCalledWith(
      "/api/exam-sessions/5/evidence?alertId=12&kind=CLIP&limit=10"
    );
    await fetchSessionEvidence(5, { kind: "SNAPSHOT" });
    expect(get).toHaveBeenLastCalledWith(
      "/api/exam-sessions/5/evidence?kind=SNAPSHOT"
    );
  });
});

describe("requestAlertClip (teacher)", () => {
  it("posts to the alert clip route with no body", async () => {
    await requestAlertClip(5, 12);
    expect(post).toHaveBeenCalledWith(
      "/api/exam-sessions/5/ai-alerts/12/clip"
    );
  });
});

describe("fetchEvidenceUrl (teacher, presigned)", () => {
  it("targets the evidence url route", async () => {
    await fetchEvidenceUrl(5, "7a0d0f66-0000-4000-8000-000000000000");
    expect(get).toHaveBeenCalledWith(
      "/api/exam-sessions/5/evidence/7a0d0f66-0000-4000-8000-000000000000/url"
    );
  });
});

describe("fetchSessionRecordings (teacher)", () => {
  it("targets the recordings route", async () => {
    await fetchSessionRecordings(5);
    expect(get).toHaveBeenCalledWith("/api/exam-sessions/5/recordings");
  });
});

describe("fetchRecordingUrl (teacher, presigned)", () => {
  it("targets the recording playback-url route", async () => {
    await fetchRecordingUrl(5, "99999999-0000-4000-8000-000000000009");
    expect(get).toHaveBeenCalledWith(
      "/api/exam-sessions/5/recordings/99999999-0000-4000-8000-000000000009/url"
    );
  });
});
