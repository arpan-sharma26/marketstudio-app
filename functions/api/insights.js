import { CLIENTS, normalizeAccountId } from "../_lib/clients.js";
import { accountReport } from "../_lib/meta.js";
import { json } from "../_lib/http.js";

const CACHE_SECONDS = 600; // 10 minutes keeps us well inside Meta's rate limits
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (!DATE.test(since || "") || !DATE.test(until || "") || since > until) {
    return json({ error: "Pick a valid date range." }, 400);
  }
  const days = (Date.parse(until) - Date.parse(since)) / 86400e3 + 1;
  if (days > 400) return json({ error: "Pick a range of 400 days or less." }, 400);

  if (!env.META_ACCESS_TOKEN) {
    return json({ setupNeeded: true, clients: CLIENTS.map(publicClient) });
  }

  // Shared cache keyed by range only (all signed-in users see the same data).
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__cache/insights?since=${since}&until=${until}`);
  if (url.searchParams.get("refresh") !== "1") {
    const hit = await cache.match(cacheKey);
    if (hit) return withNoStore(hit);
  }

  const clients = await Promise.all(
    CLIENTS.map(async (c) => {
      const accountId = normalizeAccountId(env[c.accountEnv]);
      if (!accountId) return { ...publicClient(c), connected: false };
      try {
        const report = await accountReport(env, accountId, since, until);
        return { ...publicClient(c), connected: true, ...report };
      } catch (err) {
        return { ...publicClient(c), connected: true, error: friendlyError(err) };
      }
    })
  );

  const payload = { since, until, generatedAt: new Date().toISOString(), clients };
  const res = new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
  // Only cache when every connected account answered.
  if (!clients.some((c) => c.error)) waitUntil(cache.put(cacheKey, res.clone()));
  return withNoStore(res);
}

function publicClient(c) {
  return { id: c.id, name: c.name, logo: c.logo };
}

function withNoStore(res) {
  const r = new Response(res.body, res);
  r.headers.set("Cache-Control", "no-store");
  return r;
}

function friendlyError(err) {
  if (err && err.code === 190) return "The Meta access token has expired or was revoked. Create a new one and update META_ACCESS_TOKEN.";
  if (err && (err.code === 200 || err.code === 10)) return "The token does not have access to this ad account. Assign the account to the system user in Business Settings.";
  if (err && (err.code === 4 || err.code === 17 || err.code === 613 || err.code === 80004)) return "Meta is rate limiting requests. Try again in a few minutes.";
  return `Meta API error: ${err && err.message ? err.message : "unknown"}`;
}
