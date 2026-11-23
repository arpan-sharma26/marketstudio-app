// Password login with an HMAC-signed session cookie. No database needed.
const COOKIE = "ms_session";
const SESSION_DAYS = 14;
const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured(env) {
  return Boolean(env.APP_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
}

// Compares via HMAC so the check takes the same time whatever the input.
export async function passwordMatches(env, password) {
  const a = await hmacHex(env.SESSION_SECRET, `pw:${password || ""}`);
  const b = await hmacHex(env.SESSION_SECRET, `pw:${env.APP_PASSWORD}`);
  return safeEqual(a, b);
}

export async function createSessionCookie(env, secure) {
  const exp = Date.now() + SESSION_DAYS * 86400e3;
  const sig = await hmacHex(env.SESSION_SECRET, `session:${exp}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function isAuthenticated(request, env) {
  if (!authConfigured(env)) return false;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([a-f0-9]{64})`));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > Date.now())) return false;
  const expected = await hmacHex(env.SESSION_SECRET, `session:${exp}`);
  return safeEqual(expected, m[2]);
}

export { hmacHex };
