// LOCAL TESTING ONLY. A fake Graph API that returns made-up numbers so the UI can be
// checked without real credentials. Never point production at this.
// Run: node dev/mock-graph.mjs  then set META_GRAPH_BASE=http://127.0.0.1:8799 in .dev.vars
import http from "node:http";

function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function day(acc, date) {
  const r = rng(acc + date);
  const spend = 20 + r() * 40;
  const impressions = Math.round(spend * (90 + r() * 60));
  const reach = Math.round(impressions * (0.6 + r() * 0.2));
  const links = Math.round(impressions * (0.008 + r() * 0.012));
  const leads = Math.round(links * (0.03 + r() * 0.08));
  return { spend, impressions, reach, inline_link_clicks: links, clicks: Math.round(links * 1.4), leads };
}

function dates(range) {
  const out = [];
  for (let d = new Date(range.since + "T00:00:00Z"); d.toISOString().slice(0, 10) <= range.until; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function row(rows, extra = {}) {
  const s = rows.reduce((a, r) => { for (const k in r) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  return {
    spend: (s.spend || 0).toFixed(2), impressions: String(s.impressions || 0), reach: String(Math.round((s.reach || 0) * 0.7)),
    clicks: String(s.clicks || 0), inline_link_clicks: String(s.inline_link_clicks || 0), account_currency: "CAD",
    actions: s.leads ? [{ action_type: "lead", value: String(s.leads) }, { action_type: "link_click", value: String(s.inline_link_clicks) }] : [],
    ...extra,
  };
}

const CAMPAIGNS = ["Fall enrolment – lead form", "Retargeting – site visitors", "Open house promo"];

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean); // [version, act_x, edge]
  const acc = parts[1], edge = parts[2];
  const send = (b, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (url.searchParams.get("access_token") !== "mock-token") return send({ error: { message: "Invalid OAuth access token.", code: 190 } }, 400);
  if (acc === "act_999999") return send({ error: { message: "No permission", code: 200 } }, 400);
  if (edge === "campaigns") return send({ data: CAMPAIGNS.map((n, i) => ({ id: `${acc}_${i}`, effective_status: i === 2 ? "PAUSED" : "ACTIVE" })) });
  const range = JSON.parse(url.searchParams.get("time_range"));
  const ds = dates(range).filter((d) => d <= "2026-11-22");
  if (url.searchParams.get("level") === "campaign") {
    return send({ data: CAMPAIGNS.map((n, i) => row(ds.map((d) => { const x = day(acc + i, d); for (const k in x) x[k] *= [0.6, 0.3, 0.1][i]; return x; }), { campaign_id: `${acc}_${i}`, campaign_name: n, objective: i ? "OUTCOME_TRAFFIC" : "OUTCOME_LEADS" })) });
  }
  if (url.searchParams.get("time_increment") === "1") return send({ data: ds.map((d) => row([day(acc, d)], { date_start: d, date_stop: d })) });
  return send({ data: ds.length ? [row(ds.map((d) => day(acc, d)))] : [] });
}).listen(8799, () => console.log("mock graph on :8799"));
