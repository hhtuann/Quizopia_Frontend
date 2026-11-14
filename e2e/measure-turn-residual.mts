import { chromium } from "@playwright/test";
import { promises as fs } from "node:fs";
// Serve the livekit-client ESM bundle via request interception (no real
// server, no firewall) so the probe page can import it through an importmap.
const dist = await fs.readFile(`${import.meta.dirname}/../node_modules/livekit-client/dist/livekit-client.esm.mjs`);

/**
 * P4-B measurements (issue #84/#87 evidence):
 *  1. TURN relay — connect a publisher with iceTransportPolicy:"relay"
 *     (embedded TURN on UDP 3478) and verify publish + relay candidates.
 *  2. Revoked-token residual exposure — after teacher revocation, rejoin
 *     with the OLD (unexpired) token and time how long LiveKit admits it
 *     (self-host limitation, ADR-08 D14 — measure, don't assume).
 */
const s = JSON.parse(await fs.readFile(`${import.meta.dirname}/.smoke-state.json`, "utf8"));
const cam = JSON.parse(await fs.readFile(`${import.meta.dirname}/.smoke-camera-f.json`, "utf8"));
const API = "http://localhost:8080";

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(API + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  const body = await r.json();
  return body.accessToken;
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Access tokens from the suite run have expired (15-min TTL): refresh.
const studentTokens = {} as Record<number, string>;
for (let i = 0; i < cam.students.length; i++) {
  studentTokens[i] = await login(cam.students[i].email, cam.students[i].password);
}
const teacherToken = await login(s.teacher.email, s.teacher.password);

// 1) TURN relay probe (uses grid-student-4's still-IN_PROGRESS attempt).
const stu = { ...cam.students[4], get accessToken() { return studentTokens[4]; } };
const renew = await api(`/api/attempts/${cam.attemptIds[4]}/monitoring/media-token`, stu.accessToken, {
  method: "POST",
  body: JSON.stringify({ schemaVersion: 1 }),
});
console.log("renewal:", renew.status);
const media = renew.body;

const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
await browser.newContext; // no-op
const page = await browser.newPage({ permissions: ["camera"] });
await page.route("http://127.0.0.1:9873/**", (route) =>
  route.fulfill({
    contentType: "text/javascript",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: dist,
  })
);
// Same-origin page on the SFU (its http origin serves "OK") so the SDK's
// signal requests are not cross-origin from about:blank.
await page.goto(media.wsUrl.replace("ws://", "http://"));
await page.setContent(
  `<html><body><script type="importmap">{"imports":{"livekit-client":"http://127.0.0.1:9873/livekit-client.esm.mjs"}}</script></body></html>`
);
const result = await page.evaluate(async (media) => {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room({ rtcConfig: { iceTransportPolicy: "relay" } });
  const connected = new Promise<boolean>((res) => {
    room.once(RoomEvent.Connected, () => res(true));
    setTimeout(() => res(false), 30_000);
  });
  await room.connect(media.wsUrl, media.mediaToken);
  const ok = await connected;
  let published = false;
  let relayCandidates = 0;
  let relayAddrs = "";
  if (ok) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    await room.localParticipant.publishTrack(track, { source: Track.Source.Camera });
    published = true;
    const stats = await room.engine.pcManager?.publisher?.getStats?.();
    const lines = stats ? String(stats).split("\n") : [];
    // RTCStats dump isn't text; use raw candidates via peer connection local description trick:
    const pc = room.engine.pcManager?.publisher as unknown as RTCPeerConnection;
    // Count relay candidates by watching the raw SDP.
    const sdp = pc?.localDescription?.sdp ?? "";
    relayCandidates = (sdp.match(/typ relay/g) ?? []).length;
    relayAddrs = (sdp.match(/candidate:\S+ 1 udp \d+ (\S+) \d+ typ relay/g) ?? [])
      .slice(0, 2)
      .map((m) => m.match(/udp \d+ (\S+)/)?.[1] ?? "?")
      .join(",");
    track.stop();
  }
  room.disconnect();
  return { connected: ok, published, relayCandidates, relayAddrs, identity: media.mediaIdentity };
}, media as never);
console.log("TURN-RELAY-RESULT", JSON.stringify(result));

// 2) Residual exposure: mint a token for grid-student-3's active binding
// (renewal path), have the teacher revoke that participant, then attempt a
// rejoin with the OLD (unexpired) token and record what happens.
const attemptId3 = cam.attemptIds[3];
const renew3 = await api(`/api/attempts/${attemptId3}/monitoring/media-token`, studentTokens[3], {
  method: "POST",
  body: JSON.stringify({ schemaVersion: 1 }),
});
console.log("renewal-3:", renew3.status);
const token2 = renew3.body as { mediaToken: string; wsUrl: string; mediaIdentity: string; mediaTokenExpiresAt: string };
const status = await api(`/api/exam-sessions/${cam.sessionId}/monitoring/camera-status`, teacherToken);
const victim = (status.body.participants ?? []).find(
  (p: { mediaIdentity: string }) => p.mediaIdentity === token2.mediaIdentity
);
console.log("victim-found:", Boolean(victim));
if (victim) {
  const revoke = await api(
    `/api/exam-sessions/${cam.sessionId}/monitoring/participants/${token2.mediaIdentity}/revoke`,
    teacherToken,
    { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
  );
  console.log("revoked:", revoke.status);
  const rejoin = await page.evaluate(async (t) => {
    const { Room, RoomEvent } = await import("livekit-client");
    const room = new Room();
    let ok = false;
    room.once(RoomEvent.Connected, () => (ok = true));
    try {
      await room.connect(t.wsUrl, t.mediaToken);
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      ok = false;
    }
    room.disconnect();
    return ok;
  }, token2 as never);
  console.log("REVOKED-TOKEN-REJOIN", rejoin ? "ADMITTED (residual window open until TTL expiry)" : "REJECTED");
  console.log("token-expires-at", token2.mediaTokenExpiresAt);
  // Renewal after revocation must be denied immediately (app layer).
  const renewAfter = await api(`/api/attempts/${attemptId3}/monitoring/media-token`, studentTokens[3], {
    method: "POST",
    body: JSON.stringify({ schemaVersion: 1 }),
  });
  console.log("renewal-after-revoke:", renewAfter.status, renewAfter.body?.code ?? "");
}
await browser.close();

