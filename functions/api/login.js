import { authConfigured, passwordMatches, createSessionCookie } from "../_lib/auth.js";
import { json } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!authConfigured(env)) {
    return json({ error: "Login is not set up yet. Add APP_PASSWORD and SESSION_SECRET in Cloudflare." }, 503);
  }
  let password = "";
  try {
    const body = await request.json();
    password = String(body.password || "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!(await passwordMatches(env, password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: "That password is not right." }, 401);
  }
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "Set-Cookie": await createSessionCookie(env, secure) });
}
