This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project self-hosts its design-system fonts (Calistoga, Inter, JetBrains Mono) via [`next/font/local`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) from `app/fonts/` — no build-time font CDN dependency.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Account profile (Identity M5-A)

`/profile` is shared by all authenticated roles through `AuthenticatedShell`, independent of the selected student/teacher view. Open it from the Header account menu → **Hồ sơ**. Account identity, roles, status, email verification, and Google linkage are read-only; avatars use initials, not uploads.

The personal-details form sends only `{ displayName, phone }` to `PUT /api/account/profile`. Display names are trimmed, require 1–150 characters, and reject control characters. Phone numbers are optional: blank sends `null`; otherwise the trimmed value accepts 7–15 digits and an optional leading `+`. Cancel restores the last saved form values. Saving disables duplicate actions and preserves edits on errors. A successful write calls `refreshUser()` so the Header name and initials update without signing in again. A failed identity refresh is reported separately from a failed save and can be retried without repeating the write.

Focused coverage is in `components/account/Profile.test.tsx`, `components/layout/Header.test.tsx`, and `lib/validation/profile-schema.test.ts`. The existing `AuthenticatedShell` tests cover authentication loading and role-neutral access. Run the frontend test, type-check/build, and lint gates from `package.json` before merging; adding these tests does not imply they have been run.

## Password recovery (Identity M5)

Public recovery starts from the login footer's **Forgot password?** link. `/forgot-password` submits `{ email }` to `POST /api/auth/password/forgot` (`passwordApi` in `lib/api/password.ts`) and shows one neutral confirmation for every syntactically valid submit — registered or not, throttled or not — with a 60-second resend cooldown, so the UI never signals account existence or eligibility. `/reset-password` captures the `#token=` fragment into a ref and strips it from the URL with `history.replaceState` immediately on mount, before any network activity; the opaque token lives only in component memory (StrictMode-safe — never in storage, logs, or the URL). A missing or empty token renders a request-new state. The new/confirm form is guarded by `resetPasswordSchema` with a visibility toggle and rule list; invalid, expired, replaced, and reused tokens all share one generic retry state with a **Request a new link** CTA. A successful `POST /api/auth/password/reset` (204) calls `invalidateSession()` and routes to `/login?passwordReset=1`, where the login page shows a success notice — a reset never auto-logs-in. Both endpoints are public: `http-client` strips Authorization and never refreshes for `/api/auth/password/*`.

Focused coverage is in `app/forgot-password/forgot-password.test.tsx` and `app/reset-password/reset-password.test.tsx`. Run the frontend test, type-check/build, and lint gates from `package.json` before merging; adding these tests does not imply they have been run.

## Auth session generation (Identity M5)

The in-memory auth store owns status, token, user, and one monotonic `generation`. `invalidateSession()` synchronously advances it and clears identity, provider status, and registered QueryClient caches. Use this action after server-side credential revocation; do not issue a redundant logout request. Ordinary logout dispatches its request before invalidating locally and never clears a newer session when its response settles.

Capture `sessionGeneration()` before authenticated asynchronous work and check `isCurrentSession(generation)` before applying results or failures. Login and OAuth acquisition call `beginSession()` **before** requesting tokens; `completeLogin(token, generation)` requires that captured generation. Boot, login, identity fetches, and OAuth reject superseded completions rather than resurrecting a session. Profile writes likewise bind their post-save refresh to the initiating generation.

The HTTP request interceptor synchronously records the generation before dispatch. Expired-access-token responses share one refresh flight per generation and retry once only while that generation remains current. Stale refresh successes/failures cannot write tokens, clear a newer identity, retry requests, or release a newer flight's slot. Public `/api/auth/password/forgot` and `/api/auth/password/reset` requests explicitly strip Authorization and never refresh. Google login and authenticated Google linking keep their existing endpoint contracts.

Deferred-race regressions live in `components/providers/AuthProvider.test.tsx` and `lib/auth/refresh-interceptor.test.ts`. No credential UI is introduced by this infrastructure change; tests must be run by the integration owner.
