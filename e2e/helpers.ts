import type { Page } from "@playwright/test";
import * as http from "node:http";

/**
 * Shared fixtures for the P4-A browser smoke tests.
 *
 * All user/tenant data is created at RUNTIME by global-setup via the real
 * REST API (registration + Mailpit OTP + login) — nothing is hardcoded in
 * Git. State is persisted to e2e/.smoke-state.json for the specs.
 */

export const API = process.env.SMOKE_API_BASE ?? "http://localhost:8080";
export const MAILPIT = process.env.SMOKE_MAILPIT_BASE ?? "http://localhost:8025";
export const RUN = Date.now().toString(36);

export interface SeededUser {
  id: number;
  username: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
}

export interface SmokeState {
  teacher: SeededUser;
  student: SeededUser;
  stranger: SeededUser; // student NOT in the class
  classroomId: number;
  classroomName: string;
  bankId: number;
  questionIds: number[];
  examId: number;
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  // Kept for call sites that want a real Response object; routed through
  // node:http for the same undici-stall reason as apiJson.
  const url = new URL(`${API}${path}`);
  const { promise, resolve, reject } = Promise.withResolvers<Response>();
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: init.method ?? "GET",
      headers,
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0, headers: { "Content-Type": res.headers["content-type"] ?? "application/json" } }));
      });
    }
  );
  req.on("error", reject);
  req.setTimeout(30_000, () => req.destroy(new Error("api timeout")));
  if (init.body !== undefined && typeof init.body === "string") req.write(init.body);
  req.end();
  return promise;
}

/**
 * Backend HTTP over node:http — deliberately NOT global fetch/undici:
 * on some Windows hosts undici's connection handling stalls indefinitely
 * against this Tomcat while node:http and the browser (its own stack)
 * work fine. Body is JSON in/out (every call site uses JSON).
 */
export async function apiJson<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: string } = {}
): Promise<{ status: number; body: T | null; raw: string }> {
  const url = new URL(`${API}${path}`);
  const { promise, resolve, reject } = Promise.withResolvers<{
    status: number;
    body: T | null;
    raw: string;
  }>();
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: T | null = null;
        try {
          body = raw ? (JSON.parse(raw) as T) : null;
        } catch {
          body = null;
        }
        resolve({ status: res.statusCode ?? 0, body, raw });
      });
    }
  );
  req.on("error", reject);
  req.setTimeout(30_000, () => req.destroy(new Error("apiJson timeout")));
  if (init.body !== undefined) req.write(init.body);
  req.end();
  return promise;
}

function delay(ms: number): Promise<void> {
  // 6+ call sites in the OTP retry loops keep this lockstep behavior.
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** Registers a user through the REAL flow and clears the email OTP via Mailpit. */
export async function registerVerifiedUser(
  kind: "TEACHER" | "STUDENT",
  name: string
): Promise<SeededUser> {
  const username = `smoke-${name}-${RUN}`;
  const email = `${username}@quizopia-smoke.test`;
  const password = `Sm0ke!${RUN}aA`;

  const reg = await apiJson<{ id: number }>("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      username,
      email,
      password,
      displayName: `Smoke ${name}`,
      phone: "0000000000",
      accountType: kind,
    }),
  });
  if (reg.status !== 201 || !reg.body) {
    throw new Error(`register ${name} failed: ${reg.status} ${reg.raw}`);
  }

  // Fetch the 6-digit OTP from Mailpit (delivery is asynchronous).
  let otp = "";
  for (let attempt = 0; attempt < 20 && !otp; attempt++) {
    await delay(500);
    const list = (await fetch(`${MAILPIT}/api/v1/messages?limit=10`).then((r) =>
      r.json()
    )) as { messages?: Array<{ ID: string; To: Array<{ Address: string }> | string }> };
    for (const m of list.messages ?? []) {
      // Mailpit serializes To as [{Name, Address}, ...].
      const recipients = Array.isArray(m.To)
        ? m.To.map((r) => r.Address).join(",")
        : String(m.To ?? "");
      if (recipients.includes(email)) {
        const msg = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json());
        const text = String(msg.Text ?? msg.HTML ?? "");
        const match = text.match(/\b(\d{6})\b/);
        if (match) otp = match[1];
      }
    }
  }
  if (!otp) throw new Error(`no OTP arrived for ${email} (Mailpit)`);

  const verify = await api("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  if (verify.status !== 200) throw new Error(`verify ${name} failed: ${verify.status}`);

  const login = await loginViaApi(email, password);
  return {
    id: reg.body.id,
    username,
    email,
    password,
    displayName: `Smoke ${name}`,
    accessToken: login.accessToken,
  };
}

export async function loginViaApi(
  identifier: string,
  password: string
): Promise<{ accessToken: string }> {
  const res = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (res.status !== 200) throw new Error(`login ${identifier} failed: ${res.status}`);
  return (await res.json()) as { accessToken: string };
}

/** Logs in through the real UI (login form). */
export async function loginViaUi(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill("#identifier", identifier);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

/** Reads the state written by global-setup. */
export function state(): SmokeState {
  // Runtime artifact, intentionally outside module typing flow.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./.smoke-state.json") as SmokeState;
}

/** Datetime-local value N minutes from now (local timezone, form-shaped). */
export function inMinutes(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
