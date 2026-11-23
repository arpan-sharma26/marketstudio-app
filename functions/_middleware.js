import { isAuthenticated } from "./_lib/auth.js";
import { json } from "./_lib/http.js";

// Everything except the login page, the login endpoint and brand assets needs a session.
const PUBLIC_PATHS = new Set(["/login", "/login.html", "/api/login", "/app.css", "/favicon.ico"]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path) || path.startsWith("/assets/")) {
    return withSecurityHeaders(await next());
  }

  if (await isAuthenticated(request, env)) {
    return withSecurityHeaders(await next());
  }

  if (path.startsWith("/api/")) {
    return json({ error: "unauthorized" }, 401);
  }
  return Response.redirect(`${url.origin}/login`, 302);
}

function withSecurityHeaders(res) {
  const r = new Response(res.body, res);
  r.headers.set("X-Frame-Options", "DENY");
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "same-origin");
  r.headers.set("X-Robots-Tag", "noindex, nofollow");
  return r;
}
