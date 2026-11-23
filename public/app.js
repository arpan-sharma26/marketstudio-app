// Market Studio – Meta Ads dashboard (no build step, no framework).
const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");

const state = {
  range: loadPref("range", "30"),
  custom: { since: null, until: null },
  data: null,
  loading: false,
  error: null,
  metric: "spend",
  sort: { key: "spend", dir: -1 },
};

/* ---------------- Formatting ---------------- */
let currency = "CAD";
const fmtMoney = (v, digits) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
    minimumFractionDigits: digits ?? (Math.abs(v) >= 1000 ? 0 : 2),
    maximumFractionDigits: digits ?? (Math.abs(v) >= 1000 ? 0 : 2),
  }).format(v);
const fmtInt = (v) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(v);
const fmtCompact = (v) => new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const fmtPct = (v) => `${(v * 100).toFixed(2)}%`;
const fmtDec = (v) => v.toFixed(2);
const DASH = "–";

const METRICS = {
  spend: { label: "Amount spent", format: (v) => fmtMoney(v), axis: (v) => fmtMoney(v, 0), kind: "area", better: 0 },
  leads: { label: "Leads", format: fmtInt, axis: fmtCompact, kind: "bars", better: 1 },
  cpl: { label: "Cost per lead", format: (v) => fmtMoney(v, 2), better: -1, derived: true,
    help: "Amount spent divided by leads." },
  linkClicks: { label: "Link clicks", format: fmtInt, axis: fmtCompact, kind: "bars", better: 1 },
  ctr: { label: "Link CTR", format: fmtPct, better: 1, derived: true,
    help: "Link clicks divided by impressions." },
  reach: { label: "Reach", format: fmtInt, better: 1,
    help: "People who saw an ad at least once. On the all-clients view this is the sum of each account's reach." },
  impressions: { label: "Impressions", format: fmtInt, axis: fmtCompact, kind: "bars", better: 1 },
  cpm: { label: "CPM", format: (v) => fmtMoney(v, 2), better: -1, derived: true,
    help: "Cost per 1,000 impressions." },
  frequency: { label: "Frequency", format: fmtDec, better: 0, derived: true,
    help: "Average number of times each person saw an ad." },
};

function derive(t) {
  return {
    ...t,
    cpl: t.leads > 0 ? t.spend / t.leads : null,
    ctr: t.impressions > 0 ? t.linkClicks / t.impressions : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    frequency: t.reach > 0 ? t.impressions / t.reach : null,
  };
}

function sumRows(rows) {
  const keys = ["spend", "impressions", "reach", "clicks", "linkClicks", "leads"];
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) for (const k of keys) out[k] += r[k] || 0;
  return out;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Dates ---------------- */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, opts = { month: "short", day: "numeric" }) => parseIso(s).toLocaleDateString("en-CA", opts);

function rangeDates() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const r = state.range;
  if (r === "custom" && state.custom.since && state.custom.until) return { ...state.custom };
  if (r === "month") return { since: iso(new Date(today.getFullYear(), today.getMonth(), 1)), until: iso(today) };
  if (r === "lastmonth") {
    return {
      since: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      until: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  const n = Number(r) || 30;
  // Last N full days, ending yesterday (today's numbers are still incomplete).
  const until = new Date(today); until.setDate(until.getDate() - 1);
  const since = new Date(until); since.setDate(since.getDate() - (n - 1));
  return { since: iso(since), until: iso(until) };
}

function rangeLabel({ since, until }) {
  const sameYear = since.slice(0, 4) === until.slice(0, 4);
  const a = fmtDate(since, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  const b = fmtDate(until, { month: "short", day: "numeric", year: "numeric" });
  return since === until ? b : `${a} – ${b}`;
}

function eachDay(since, until) {
  const out = [];
  for (let d = parseIso(since); iso(d) <= until; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

/* ---------------- Prefs ---------------- */
function loadPref(k, fallback) {
  try { return localStorage.getItem(`ms.${k}`) ?? fallback; } catch { return fallback; }
}
function savePref(k, v) {
  try { localStorage.setItem(`ms.${k}`, v); } catch { /* private mode */ }
}

/* ---------------- Data ---------------- */
async function load(refresh = false) {
  const { since, until } = rangeDates();
  state.loading = true; state.error = null;
  render();
  const btn = $("#refresh");
  btn.disabled = true; btn.classList.add("spin");
  try {
    const qs = new URLSearchParams({ since, until });
    if (refresh) qs.set("refresh", "1");
    const res = await fetch(`/api/insights?${qs}`, { credentials: "same-origin" });
    if (res.status === 401) { location.href = "/login"; return; }
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
    state.data = body;
  } catch (e) {
    state.error = e.message || "Could not load data.";
  } finally {
    state.loading = false;
    btn.disabled = false; btn.classList.remove("spin");
    render();
  }
}

/* ---------------- Routing ---------------- */
function route() {
  const m = location.hash.match(/^#\/client\/([\w-]+)/);
  return m ? { name: "client", id: m[1] } : { name: "overview" };
}

/* ---------------- Rendering ---------------- */
function render() {
  syncFilters();
  const r = route();
  const { since, until } = rangeDates();
  const d = state.data;
  const client = r.name === "client" && d ? d.clients.find((c) => c.id === r.id) : null;

  $("#crumb").innerHTML = r.name === "client"
    ? `<a class="crumb" href="#/"><span aria-hidden="true">←</span> All clients</a>` : "";
  $("#title").textContent = r.name === "client" ? (client ? client.name : "Client") : "All clients";
  $("#subtitle").textContent = `Meta Ads · ${rangeLabel({ since, until })}`;
  document.title = `${r.name === "client" && client ? client.name : "Ads Dashboard"} · Market Studio`;

  if (state.loading && !d) { view.innerHTML = skeleton(); $("#foot").textContent = ""; return; }
  if (state.error) {
    view.innerHTML = `<div class="banner warn"><div><h2>Could not load the numbers</h2><p>${escapeHtml(state.error)}</p></div></div>`;
    return;
  }
  if (!d) return;

  const firstCurrency = d.clients.find((c) => c.currency)?.currency;
  if (firstCurrency) currency = firstCurrency;

  view.innerHTML = r.name === "client" ? renderClient(client) : renderOverview(d);
  view.style.opacity = state.loading ? ".55" : "1";
  mountCharts();
  bindTable();

  const gen = d.generatedAt ? new Date(d.generatedAt) : null;
  $("#foot").innerHTML = d.setupNeeded ? "" : [
    `<span>Source: Meta Marketing API</span>`,
    gen ? `<span>Fetched ${gen.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span>` : "",
    `<span>Numbers refresh every 10 minutes. Meta can revise recent days for up to 28 days.</span>`,
  ].join("");
}

function skeleton() {
  const tiles = Array.from({ length: 6 }, () => `<div class="kpi"><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:26px;width:80%;margin-top:14px"></div></div>`).join("");
  return `<div class="kpis">${tiles}</div><div class="grid-2"><div class="panel"><div class="skeleton" style="height:260px"></div></div><div class="panel"><div class="skeleton" style="height:260px"></div></div></div>`;
}

function setupBanner() {
  return `<div class="banner"><div>
    <h2>Connect Meta to see live numbers</h2>
    <p>The dashboard is ready. It needs a Meta access token and each client's ad account ID, added as environment variables in Cloudflare:</p>
    <ol>
      <li><code>META_ACCESS_TOKEN</code> (a system user token with <code>ads_read</code>)</li>
      <li><code>META_ACCOUNT_BLOOMING_STEPS</code>, <code>META_ACCOUNT_BLOOMING_MINDS</code>, <code>META_ACCOUNT_LOGICDENTAL</code></li>
    </ol>
    <p style="margin-top:8px">Full steps are in SETUP.md in the app's repository.</p>
  </div></div>`;
}

function kpiTile(key, cur, prev, { note } = {}) {
  const m = METRICS[key];
  const v = cur[key];
  const p = prev ? prev[key] : null;
  let delta = "";
  if (v != null && p != null && p !== 0) {
    const ch = (v - p) / Math.abs(p);
    const dir = Math.abs(ch) < 0.005 ? "flat" : (m.better === 0 ? "flat" : ((ch > 0) === (m.better > 0) ? "good" : "bad"));
    const arrow = Math.abs(ch) < 0.005 ? "" : ch > 0 ? "▲" : "▼";
    delta = `<span class="delta ${dir}"><span aria-hidden="true">${arrow}</span>${Math.abs(ch * 100).toFixed(Math.abs(ch) < 0.1 ? 1 : 0)}%</span> vs previous period`;
  } else if (prev) {
    delta = `No data for previous period`;
  }
  const help = m.help ? `<button class="info" type="button" title="${escapeHtml(m.help)}" aria-label="${escapeHtml(m.help)}">i</button>` : "";
  return `<div class="kpi">
    <div class="kpi-label">${m.label}${help}</div>
    <div class="kpi-value tnum">${v == null ? DASH : m.format(v)}</div>
    <div class="kpi-delta">${note || delta || "&nbsp;"}</div>
  </div>`;
}

function statusPill(c) {
  if (!c.connected) return `<span class="pill">Not connected</span>`;
  if (c.error) return `<span class="pill issue">Needs attention</span>`;
  const active = (c.campaigns || []).some((x) => x.status === "ACTIVE");
  return active ? `<span class="pill active">Active</span>` : `<span class="pill paused">No active campaigns</span>`;
}

function renderOverview(d) {
  if (d.setupNeeded) {
    return setupBanner() + `<h2 class="section-title">Clients</h2><div class="clients">${d.clients.map(clientCard).join("")}</div>`;
  }
  const live = d.clients.filter((c) => c.connected && !c.error);
  const cur = derive(sumRows(live.map((c) => c.totals)));
  const prev = derive(sumRows(live.map((c) => c.previous)));
  const mixed = new Set(live.map((c) => c.currency).filter(Boolean)).size > 1;

  const issues = d.clients.filter((c) => c.error);
  const issueBanner = issues.map((c) => `<div class="banner warn"><div><h2>${escapeHtml(c.name)}</h2><p>${escapeHtml(c.error)}</p></div></div>`).join("");
  const mixedBanner = mixed ? `<div class="banner warn"><div><h2>Accounts use different currencies</h2><p>Totals add raw amounts across currencies. Check each client on its own page.</p></div></div>` : "";

  const daily = eachDay(d.since, d.until).map((date) => {
    const rows = live.map((c) => c.daily.find((x) => x.date === date)).filter(Boolean);
    return { date, ...sumRows(rows) };
  });

  const bySpend = [...live].sort((a, b) => b.totals.spend - a.totals.spend);
  const maxSpend = Math.max(1, ...bySpend.map((c) => c.totals.spend));

  return `${issueBanner}${mixedBanner}
    <div class="kpis">
      ${["spend", "leads", "cpl", "linkClicks", "ctr", "reach"].map((k) => kpiTile(k, cur, prev)).join("")}
    </div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>Daily ${METRICS[state.metric].label.toLowerCase()}, all clients</h2>${metricSwitch()}</div>
        <div class="chart" data-series='${JSON.stringify(daily.map((r) => ({ date: r.date, value: r[state.metric] })))}' data-m="${state.metric}"></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Spend by client</h2><span class="hint">${rangeLabel(d)}</span></div>
        ${bySpend.length ? `<div class="hbars">${bySpend.map((c) => {
          const t = derive(c.totals);
          return `<div class="hbar-row">
            <span class="hbar-name">${escapeHtml(c.name)}</span><span class="hbar-val tnum">${fmtMoney(t.spend)}</span>
            <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(0.5, (t.spend / maxSpend) * 100)}%"></div></div>
            <span class="hbar-sub tnum">${fmtInt(t.leads)} leads · ${t.cpl == null ? "no leads" : `${fmtMoney(t.cpl, 2)} per lead`}</span>
          </div>`;
        }).join("")}</div>` : `<p class="chart-empty">No connected accounts yet.</p>`}
      </section>
    </div>
    <h2 class="section-title">Clients</h2>
    <div class="clients">${d.clients.map(clientCard).join("")}</div>`;
}

function clientCard(c) {
  const logo = `<img class="client-logo" src="${c.logo}" alt="" loading="lazy">`;
  const head = `<div class="client-top">${logo}<div><div class="client-name">${escapeHtml(c.name)}</div><div class="client-meta">${statusPill(c)}</div></div></div>`;
  if (!c.connected || c.error || !c.totals) {
    const msg = !c.connected ? "Ad account not connected yet." : c.error || "No data.";
    return `<div class="client-card">${head}<p class="client-empty">${escapeHtml(msg)}</p></div>`;
  }
  const t = derive(c.totals);
  const active = c.campaigns.filter((x) => x.status === "ACTIVE").length;
  return `<a class="client-card" href="#/client/${c.id}">
    ${head}
    <dl class="client-stats">
      <div><dt>Spent</dt><dd class="tnum">${fmtMoney(t.spend)}</dd></div>
      <div><dt>Leads</dt><dd class="tnum">${fmtInt(t.leads)}</dd></div>
      <div><dt>Cost / lead</dt><dd class="tnum">${t.cpl == null ? DASH : fmtMoney(t.cpl, 2)}</dd></div>
      <div><dt>Link CTR</dt><dd class="tnum">${t.ctr == null ? DASH : fmtPct(t.ctr)}</dd></div>
    </dl>
    <div class="client-foot"><span>${c.campaigns.length} campaign${c.campaigns.length === 1 ? "" : "s"} with delivery · ${active} active</span><span class="go">Open →</span></div>
  </a>`;
}

function metricSwitch() {
  const opts = ["spend", "leads", "linkClicks", "impressions"];
  return `<div class="seg" role="group" aria-label="Chart metric">${opts.map((k) =>
    `<button type="button" data-metric="${k}" aria-pressed="${state.metric === k}">${METRICS[k].label.replace("Amount spent", "Spend")}</button>`).join("")}</div>`;
}

function renderClient(c) {
  if (!c) return `<div class="banner warn"><div><h2>Client not found</h2><p><a href="#/">Back to all clients</a></p></div></div>`;
  if (state.data.setupNeeded) return setupBanner();
  if (!c.connected) return `<div class="banner"><div><h2>Ad account not connected</h2><p>Set this client's ad account ID in Cloudflare to see its numbers.</p></div></div>`;
  if (c.error) return `<div class="banner warn"><div><h2>Meta returned an error</h2><p>${escapeHtml(c.error)}</p></div></div>`;

  const cur = derive(c.totals);
  const prev = derive(c.previous);
  const days = eachDay(state.data.since, state.data.until);
  const byDate = Object.fromEntries(c.daily.map((r) => [r.date, r]));
  const series = days.map((date) => ({ date, value: (byDate[date] || {})[state.metric] || 0 }));

  return `
    <div class="kpis">
      ${["spend", "leads", "cpl", "linkClicks", "ctr", "reach"].map((k) => kpiTile(k, cur, prev)).join("")}
    </div>
    <div class="kpis">
      ${["impressions", "cpm", "frequency"].map((k) => kpiTile(k, cur, prev)).join("")}
    </div>
    <section class="panel" style="margin-bottom:20px">
      <div class="panel-head"><h2>Daily ${METRICS[state.metric].label.toLowerCase()}</h2>${metricSwitch()}</div>
      <div class="chart" data-series='${JSON.stringify(series)}' data-m="${state.metric}"></div>
    </section>
    <section class="panel" style="margin-bottom:20px">
      <div class="panel-head"><h2>Campaigns</h2><span class="hint">Campaigns with spend in this period</span></div>
      ${campaignTable(c)}
    </section>`;
}

const COLS = [
  { key: "name", label: "Campaign" },
  { key: "spend", label: "Spent" },
  { key: "leads", label: "Leads" },
  { key: "cpl", label: "Cost / lead" },
  { key: "linkClicks", label: "Link clicks" },
  { key: "ctr", label: "Link CTR" },
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "cpm", label: "CPM" },
];

function campaignTable(c) {
  if (!c.campaigns.length) return `<p class="chart-empty">No campaign delivered in this period.</p>`;
  const rows = c.campaigns.map(derive);
  const { key, dir } = state.sort;
  rows.sort((a, b) => {
    const x = a[key], y = b[key];
    if (key === "name") return dir * String(x).localeCompare(String(y));
    if (x == null) return 1; if (y == null) return -1;
    return dir * (x - y);
  });
  const cell = (r, k) => k === "name"
    ? `<td class="name"><strong>${escapeHtml(r.name)}</strong><span>${statusText(r.status)}${r.objective ? ` · ${objectiveText(r.objective)}` : ""}</span></td>`
    : `<td class="tnum">${r[k] == null ? DASH : METRICS[k].format(r[k])}</td>`;
  const total = derive(c.totals);
  return `<div class="table-wrap"><table>
    <thead><tr>${COLS.map((col) => `<th scope="col" ${col.key === key ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${col.key}">${col.label}${col.key === key ? (dir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${COLS.map((col) => cell(r, col.key)).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr><td>Account total</td>${COLS.slice(1).map((col) => `<td class="tnum">${total[col.key] == null ? DASH : METRICS[col.key].format(total[col.key])}</td>`).join("")}</tr></tfoot>
  </table></div>`;
}

function statusText(s) {
  if (!s) return "Status unknown";
  return { ACTIVE: "Active", PAUSED: "Paused", CAMPAIGN_PAUSED: "Paused", ARCHIVED: "Archived", DELETED: "Deleted", IN_PROCESS: "Processing", WITH_ISSUES: "Has issues" }[s] || s.toLowerCase().replace(/_/g, " ");
}
function objectiveText(o) {
  return o.replace(/^OUTCOME_/, "").toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/* ---------------- Chart (inline SVG, single series) ---------------- */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function mountCharts() {
  view.querySelectorAll(".chart").forEach(drawChart);
}

function drawChart(el) {
  const pts = JSON.parse(el.dataset.series);
  const m = METRICS[el.dataset.m];
  if (!pts.length || pts.every((p) => !p.value)) {
    el.innerHTML = `<p class="chart-empty">No ${m.label.toLowerCase()} in this period.</p>`;
    return;
  }
  const W = Math.max(280, el.clientWidth || 600);
  const H = W < 500 ? 220 : 280;
  const pad = { t: 12, r: 8, b: 28, l: 56 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...pts.map((p) => p.value)));
  const n = pts.length;
  const bars = m.kind === "bars";
  const step = iw / (bars ? n : Math.max(1, n - 1));
  const x = (i) => pad.l + (bars ? step * i + step / 2 : step * i);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const axisFmt = m.axis || m.format;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const grid = ticks.map((t) => `<line class="${t === 0 ? "baseline" : "gridline"}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>
    <text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${axisFmt(t)}</text>`).join("");

  const labelEvery = Math.max(1, Math.ceil(n / Math.floor(iw / 70)));
  const xl = pts.map((p, i) => (i % labelEvery === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtDate(p.date)}</text>` : "")).join("");

  let marks = "";
  if (bars) {
    const bw = Math.max(2, Math.min(22, step - 2));
    marks = pts.map((p, i) => {
      if (!p.value) return "";
      const h = Math.max(1, ih - (y(p.value) - pad.t));
      const top = pad.t + ih - h, r = Math.min(4, bw / 2, h);
      const left = x(i) - bw / 2;
      // Rounded top corners only, square at the baseline.
      return `<path class="bar" data-i="${i}" d="M${left},${pad.t + ih} V${top + r} Q${left},${top} ${left + r},${top} H${left + bw - r} Q${left + bw},${top} ${left + bw},${top + r} V${pad.t + ih} Z"/>`;
    }).join("");
  } else {
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    marks = `<path class="area" d="${line} L${x(n - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z"/><path class="line" d="${line}"/>`;
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(m.label)} by day">
      <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E9E9A" stop-opacity=".22"/><stop offset="1" stop-color="#2E9E9A" stop-opacity="0"/></linearGradient></defs>
      <g class="axis">${grid}${xl}</g>
      ${marks}
      <line class="cross" y1="${pad.t}" y2="${pad.t + ih}"/>
      ${bars ? "" : `<circle class="dot" r="5"/>`}
      <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent" class="hit"/>
    </svg><div class="tip" role="status"></div>
    <div class="sr-only"><table><caption>${escapeHtml(m.label)} by day</caption><tbody>${pts.map((p) => `<tr><th>${p.date}</th><td>${m.format(p.value)}</td></tr>`).join("")}</tbody></table></div>`;

  const svg = $("svg", el), tip = $(".tip", el), cross = $(".cross", el), dot = $(".dot", el);
  const move = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(bars ? (sx - pad.l - step / 2) / step : (sx - pad.l) / step)));
    const p = pts[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    if (dot) { dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.value)); }
    svg.querySelectorAll(".bar").forEach((b) => b.classList.toggle("dim", Number(b.dataset.i) !== i));
    tip.innerHTML = `<strong class="tnum">${m.format(p.value)}</strong>${fmtDate(p.date, { weekday: "short", month: "short", day: "numeric" })}`;
    const px = (x(i) / W) * rect.width;
    tip.style.left = `${Math.max(70, Math.min(rect.width - 70, px))}px`;
    tip.style.top = `${Math.max(56, (y(p.value) / H) * rect.height)}px`;
    el.classList.add("hovering");
  };
  const leave = () => { el.classList.remove("hovering"); svg.querySelectorAll(".bar").forEach((b) => b.classList.remove("dim")); };
  svg.addEventListener("pointermove", (e) => move(e.clientX));
  svg.addEventListener("pointerdown", (e) => move(e.clientX));
  svg.addEventListener("pointerleave", leave);
}

/* ---------------- Events ---------------- */
function bindTable() {
  view.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.sort;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
    render();
  }));
  view.querySelectorAll("[data-metric]").forEach((b) => b.addEventListener("click", () => {
    state.metric = b.dataset.metric;
    render();
  }));
}

function syncFilters() {
  document.querySelectorAll("#ranges button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));
  $("#custom").classList.toggle("show", state.range === "custom");
}

$("#ranges").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-range]");
  if (!b) return;
  state.range = b.dataset.range;
  if (state.range === "custom") {
    const cur = rangeDates();
    $("#since").value = state.custom.since || cur.since;
    $("#until").value = state.custom.until || cur.until;
    syncFilters();
    return;
  }
  savePref("range", state.range);
  load();
});

for (const id of ["since", "until"]) {
  $(`#${id}`).addEventListener("change", () => {
    const since = $("#since").value, until = $("#until").value;
    if (since && until && since <= until) {
      state.custom = { since, until };
      load();
    }
  });
}

$("#refresh").addEventListener("click", () => load(true));
window.addEventListener("hashchange", () => { state.sort = { key: "spend", dir: -1 }; render(); window.scrollTo(0, 0); });
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(mountCharts, 150); });

if (state.range === "custom") state.range = "30";
load();
