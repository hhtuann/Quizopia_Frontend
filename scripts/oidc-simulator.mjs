#!/usr/bin/env node
/**
 * Quizopia simulated OIDC provider (review R2-M1-D).
 *
 * A dependency-free local OIDC authorization/token/JWKS server used to drive
 * REAL browser E2E for the Google login and account-linking flows when no
 * live Google credentials exist:
 *
 *   GET  /authorize   → records (state → nonce, client_id, redirect_uri),
 *                       issues a one-time code, 302 back to redirect_uri.
 *   POST /token       → validates the code, returns a locally-signed RS256
 *                       id_token carrying the recorded nonce (and the
 *                       `code`-bound subject/email), access_token.
 *   GET  /jwks.json   → the simulator's public JWK (rotated per process).
 *
 * Wire the backend to it with:
 *   QUIZOPIA_GOOGLE_CLIENT_ID=sim-client
 *   QUIZOPIA_GOOGLE_CLIENT_SECRET=sim-secret
 *   QUIZOPIA_GOOGLE_ISSUER=http://localhost:9700
 *   QUIZOPIA_GOOGLE_JWKS_URI=http://localhost:9700/jwks.json
 *   QUIZOPIA_OAUTH_AUTHORIZATION_URI=http://localhost:9700/authorize
 *   QUIZOPIA_OAUTH_TOKEN_URI=http://localhost:9700/token
 *
 * Test subjects: run with SUB/EMAIL env to control the identity, e.g.
 *   SUB=sim-sub-1 EMAIL=sim.learner@example.com node scripts/oidc-simulator.mjs
 *
 * E2E flow (browser): login page → "Continue with Google" → backend
 * /oauth2/authorization/google → simulator /authorize → backend callback →
 * SPA /auth/callback?code → POST /api/auth/oauth/exchange → dashboard.
 * The linking flow rides the same endpoints with the link callback redirect.
 */
import { createServer } from "node:http";
import { generateKeyPairSync, createSign, createPublicKey, randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 9700);
const ISSUER = process.env.ISSUER || `http://localhost:${PORT}`;
const SUBJECT = process.env.SUB || "sim-google-sub-1";
const EMAIL = process.env.EMAIL || "sim.learner@example.com";
const EMAIL_VERIFIED = process.env.EMAIL_VERIFIED !== "false";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "jwk" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const publicJwk = publicKey;
const KID = "sim-oidc-key-1";

/** code → { nonce, clientId, sub, email, used } */
const codes = new Map();

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);

function mintIdToken({ nonce, clientId, sub, email }) {
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const payload = {
    iss: ISSUER,
    aud: clientId,
    sub,
    email,
    email_verified: EMAIL_VERIFIED,
    ...(nonce ? { nonce } : {}),
    iat: nowSec(),
    exp: nowSec() + 600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, ISSUER);

  if (req.method === "GET" && url.pathname === "/jwks.json") {
    const body = JSON.stringify({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] });
    res.writeHead(200, { "Content-Type": "application/json" }).end(body);
    return;
  }

  if (req.method === "GET" && url.pathname === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const nonce = url.searchParams.get("nonce");
    const clientId = url.searchParams.get("client_id");
    if (!redirectUri || !state) {
      res.writeHead(400).end("missing redirect_uri/state");
      return;
    }
    const code = `simcode_${randomBytes(12).toString("hex")}`;
    codes.set(code, {
      nonce,
      clientId,
      sub: url.searchParams.get("login_hint_sub") || SUBJECT,
      email: url.searchParams.get("login_hint_email") || EMAIL,
      used: false,
    });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    console.log(`[sim] authorize -> ${back.origin}${back.pathname} (code=${code.slice(0, 14)}…)`);
    res.writeHead(302, { Location: back.toString() }).end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/token") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const form = new URLSearchParams(raw);
      const code = form.get("code");
      const entry = code && codes.get(code);
      if (!entry || entry.used) {
        res.writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }
      entry.used = true;
      const idToken = mintIdToken(entry);
      console.log(`[sim] token -> id_token for sub=${entry.sub} email=${entry.email}`);
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          access_token: `simat_${randomBytes(10).toString("hex")}`,
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 600,
        }),
      );
    });
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  console.log(`[sim] OIDC provider on ${ISSUER} (sub=${SUBJECT} email=${EMAIL})`);
});
