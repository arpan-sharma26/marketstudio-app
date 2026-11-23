import { clearSessionCookie } from "../_lib/auth.js";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/login`, "Set-Cookie": clearSessionCookie(url.protocol === "https:") },
  });
}
