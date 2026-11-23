# Market Studio app

The agency web app at **app.marketstudio.ca**. First module: a Meta Ads
dashboard for Market Studio's clients (Blooming Steps Day Care, Blooming Minds
Day Care, LogicDental Ai).

- **Overview**: spend, leads, cost per lead, link clicks, link CTR and reach across
  all clients, compared with the previous period of the same length; daily chart;
  spend by client; a card per client.
- **Client page**: the same KPIs plus impressions, CPM and frequency, a daily chart
  (spend, leads, link clicks, impressions) and a sortable campaign table.
- Date ranges: 7, 14, 30, 90 days, this month, last month, custom.
- Password sign-in (signed cookie, 14 days). Pages are marked `noindex`.

All numbers come live from the Meta Marketing API (read-only `ads_read` token).
Nothing is stored; responses are cached for 10 minutes.

## Stack

- Static front end in `public/` (plain HTML, CSS, JS; no build step).
- API in `functions/` (Cloudflare Pages Functions).
- Hosted free on Cloudflare Pages.

```
public/            index.html, login.html, app.css, app.js, assets/
functions/
  _middleware.js   sign-in gate + security headers
  api/login.js     POST password → session cookie
  api/logout.js
  api/insights.js  GET ?since=YYYY-MM-DD&until=YYYY-MM-DD → all clients' data
  _lib/meta.js     Meta Graph API calls
  _lib/clients.js  client list (edit to add a client)
dev/mock-graph.mjs fake Graph API for local testing only
```

Setup and deployment: see [SETUP.md](SETUP.md).

## Run locally

```bash
cp .dev.vars.example .dev.vars   # fill in values
npx wrangler pages dev           # http://localhost:8788
```

To try the UI without Meta credentials, run `node dev/mock-graph.mjs` and set
`META_GRAPH_BASE=http://127.0.0.1:8799` and `META_ACCESS_TOKEN=mock-token` in
`.dev.vars`. The mock returns made-up numbers; never use it in production.
