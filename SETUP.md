# Setting up app.marketstudio.ca

Three parts, about 30–45 minutes in total. Everything here is on free plans.

1. **Meta**: get a read-only access token and the three ad account IDs.
2. **Cloudflare Pages**: host the app and store the secrets.
3. **GoDaddy**: point `app.marketstudio.ca` at Cloudflare.

---

## 1. Meta (Business Manager + developer app)

You need admin access to the Meta business portfolio (Business Manager) that has
the three clients' ad accounts.

### 1a. Check the ad accounts are in your business portfolio

Go to **business.facebook.com → Settings → Accounts → Ad accounts**. All three
should be listed (owned by you, or shared with you as a partner):

- Blooming Steps Day Care
- Blooming Minds Day Care
- LogicDental Ai

Click each one and copy its **Ad account ID** (just the number). You will need all three.

### 1b. Create a Meta app

1. Go to **developers.facebook.com → My Apps → Create app**.
2. Use case: **Other**, then app type **Business**.
3. Name it `Market Studio Dashboard` and connect it to your business portfolio.
4. On the app dashboard, add the **Marketing API** product.
5. Under **App settings → Basic**, copy the **App secret** (optional but recommended).

The app can stay in development mode. Reading your own business's ad accounts
does not need App Review.

### 1c. Create a system user and token

A system user token belongs to the business, not to a person, and can be set
to never expire.

1. **business.facebook.com → Settings → Users → System users → Add**.
   Name: `dashboard-reader`, role: **Employee**.
2. With the system user selected, click **Assign assets**:
   - **Ad accounts**: select all three, permission **View performance** only.
   - **Apps**: select `Market Studio Dashboard`, permission **Develop app** (needed to generate the token).
3. Click **Generate new token**:
   - App: `Market Studio Dashboard`
   - Expiration: **Never**
   - Permissions: **ads_read** (nothing else is needed)
4. Copy the token right away. Meta shows it only once. Keep it somewhere safe (a password manager).

The token is read-only. The dashboard cannot change budgets, ads or anything else.

---

## 2. Cloudflare Pages

1. Create a free account at **dash.cloudflare.com** (no need to move your domain).
2. **Workers & Pages → Create → Pages → Connect to Git**, and pick the
   `marketstudio-app` GitHub repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
4. Click **Save and Deploy**. You'll get a `marketstudio-app.pages.dev` address.
5. Open the project → **Settings → Variables and Secrets** and add these for
   **Production** (use type **Secret** for the first four):

| Name | Value |
|---|---|
| `APP_PASSWORD` | The password you'll use to sign in to the app |
| `SESSION_SECRET` | A random string, at least 32 characters (e.g. from a password manager's generator) |
| `META_ACCESS_TOKEN` | The system user token from step 1c |
| `META_APP_SECRET` | The app secret from step 1b (optional) |
| `META_ACCOUNT_BLOOMING_STEPS` | Blooming Steps ad account ID |
| `META_ACCOUNT_BLOOMING_MINDS` | Blooming Minds ad account ID |
| `META_ACCOUNT_LOGICDENTAL` | LogicDental Ai ad account ID |

6. **Deployments → latest → Retry deployment** so the new variables take effect.
7. **Custom domains → Set up a custom domain** → `app.marketstudio.ca`.
   Cloudflare will show a CNAME target (`marketstudio-app.pages.dev`).

---

## 3. GoDaddy DNS

In GoDaddy → **My Products → marketstudio.ca → DNS → Add new record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `app` | `marketstudio-app.pages.dev` | 1 hour |

This doesn't touch the main website (`www` and the apex records stay as they are).
Cloudflare issues the HTTPS certificate automatically, usually within 15 minutes.

---

## Troubleshooting

| What the dashboard says | Fix |
|---|---|
| "Connect Meta to see live numbers" | `META_ACCESS_TOKEN` isn't set, or the deployment wasn't retried after adding it. |
| "Ad account not connected yet" | That client's `META_ACCOUNT_…` variable is missing or not a number. |
| "token has expired or was revoked" | Generate a new system user token (step 1c) and update `META_ACCESS_TOKEN`. |
| "does not have access to this ad account" | Assign that ad account to the system user (step 1c.2). |
| "Meta is rate limiting requests" | Wait a few minutes. Data is cached for 10 minutes to avoid this. |

## Adding a client later

1. Add an entry to `functions/_lib/clients.js` (name, logo, env variable name).
2. Put the logo in `public/assets/`.
3. Add the ad account ID variable in Cloudflare and redeploy.
