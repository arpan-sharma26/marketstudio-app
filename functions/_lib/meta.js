// Reads ad performance from the Meta Marketing API (Graph API insights endpoint).
// Read-only: needs a token with the ads_read permission.
import { hmacHex } from "./auth.js";

const DEFAULT_VERSION = "v24.0";
const BASE_FIELDS = [
  "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
  "ctr", "cpm", "actions", "account_currency",
];

// Meta reports leads under several action types. "lead" already rolls up
// on-Facebook form leads and website pixel leads, so take the first one present
// rather than adding them together (adding would double count).
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped"];

export function leadsFrom(actions) {
  if (!Array.isArray(actions)) return 0;
  for (const t of LEAD_TYPES) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function shapeRow(row = {}) {
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    linkClicks: num(row.inline_link_clicks),
    leads: leadsFrom(row.actions),
  };
}

export class MetaApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function graphGet(env, path, params) {
  const base = (env.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
  const version = env.META_API_VERSION || DEFAULT_VERSION;
  const url = new URL(`${base}/${version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  url.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  if (env.META_APP_SECRET) {
    url.searchParams.set("appsecret_proof", await hmacHex(env.META_APP_SECRET, env.META_ACCESS_TOKEN));
  }

  const rows = [];
  let next = url.toString();
  for (let page = 0; next && page < 20; page++) {
    const res = await fetch(next);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const e = body.error || {};
      throw new MetaApiError(e.message || `Meta API returned ${res.status}`, e.code);
    }
    rows.push(...(body.data || []));
    next = body.paging && body.paging.next;
  }
  return rows;
}

function previousRange(since, until) {
  const day = 86400e3;
  const s = Date.parse(`${since}T00:00:00Z`);
  const u = Date.parse(`${until}T00:00:00Z`);
  const len = Math.round((u - s) / day) + 1;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return { since: iso(s - len * day), until: iso(s - day) };
}

// Everything the dashboard shows for one ad account and date range.
export async function accountReport(env, accountId, since, until) {
  const range = { since, until };
  const prev = previousRange(since, until);
  const fields = BASE_FIELDS.join(",");

  const [totals, previous, daily, campaigns, campaignInfo] = await Promise.all([
    graphGet(env, `${accountId}/insights`, { fields, time_range: range }),
    graphGet(env, `${accountId}/insights`, { fields, time_range: prev }),
    graphGet(env, `${accountId}/insights`, { fields, time_range: range, time_increment: "1", limit: "500" }),
    graphGet(env, `${accountId}/insights`, {
      fields: `campaign_id,campaign_name,objective,${fields}`, level: "campaign", time_range: range, limit: "200",
    }),
    graphGet(env, `${accountId}/campaigns`, { fields: "id,effective_status", limit: "200" }).catch(() => []),
  ]);

  const status = Object.fromEntries(campaignInfo.map((c) => [c.id, c.effective_status]));
  const currency = (totals[0] || daily[0] || campaigns[0] || {}).account_currency || null;

  return {
    currency,
    previousRange: prev,
    totals: shapeRow(totals[0]),
    previous: shapeRow(previous[0]),
    daily: daily
      .map((r) => ({ date: r.date_start, ...shapeRow(r) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: campaigns
      .map((r) => ({
        id: r.campaign_id,
        name: r.campaign_name,
        objective: r.objective || null,
        status: status[r.campaign_id] || null,
        ...shapeRow(r),
      }))
      .sort((a, b) => b.spend - a.spend),
  };
}
