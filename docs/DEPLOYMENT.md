# Deploying Jotion

Jotion is a Next.js 14 application with a Convex backend. The two are
deployed separately:

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Vercel (the web app)   │───────▶│  Convex (the backend)        │
│  Next.js 14 / React 18  │  HTTPS  │  schema, queries, mutations   │
└─────────────────────────┘        └──────────────────────────────┘
```

---

## 1. The backend (Convex)

```bash
npm install
npx convex dev          # log in, link the project, push the schema
```

The CLI prints the deployment URL. Put it in `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
```

### Production deployment

```bash
CONVEX_DEPLOYMENT=prod:<production-name> npx convex deploy
```

The current production deployment is
**`https://impartial-nightingale-31.convex.cloud`** (it is also stored in
`.env.production`, so every production build points at it).

Useful commands:

```bash
npx convex data                 # list the tables of the deployment
npx convex function-spec        # list the deployed functions
npx convex env set KEY value    # set an environment variable
npx convex logs                 # tail the logs
```

### Payments (Razorpay)

```bash
npx convex env set RAZORPAY_KEY_ID rzp_test_xxx
npx convex env set RAZORPAY_KEY_SECRET xxx
npx convex env set RAZORPAY_WEBHOOK_SECRET xxx
```

Add `NEXT_PUBLIC_RAZORPAY_KEY_ID` to the Vercel project and point the webhook
of the Razorpay dashboard to `https://<your-domain>/api/webhooks/razorpay`
(event: *payment.captured*).

### The development sign-in (never in production)

A sign-in that works without a Clerk account, so the app can be tested
quickly. It is **not public**:

* `ALLOW_DEV_AUTH=true` has to be set on the **development** deployment —
  the production deployment simply has no such variable and every function
  refuses to run,
* the tokens are signed with the JWT secret of the deployment
  (`npx convex env set DEV_AUTH_SECRET <the JWT secret from the Convex
  dashboard → Settings → API Keys>`),
* the page is at `/dev/signin` and is not linked anywhere in the app.

```bash
npx convex env set ALLOW_DEV_AUTH true
npx convex env set DEV_AUTH_SECRET "<the JWT secret>"
npx convex run devAuth:seed '{}'      # creates Ada, Linus and Grace
npx convex run devAuth:status '{}'    # shows what is still missing
```

### The demo helpers

The `demo` module seeds a workspace and runs a self-check. It only works
when the `JOTION_DEMO_KEY` environment variable is set:

```bash
npx convex env set JOTION_DEMO_KEY "$(openssl rand -hex 16)"
npx convex run demo:seed '{"key":"<KEY>","userId":"<clerk_user_id>"}'
npx convex run demo:smoke '{"key":"<KEY>"}'
npx convex run demo:reset '{"key":"<KEY>"}'
```

---

## 2. The web app (Vercel)

### The environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel | `https://impartial-nightingale-31.convex.cloud` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | from the Clerk dashboard |
| `ANTHROPIC_API_KEY` *(optional)* | Vercel | enables the AI writing assistant |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` *(optional)* | Vercel | enables the Razorpay checkout (without it the demo card form is used) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Convex | the Razorpay credentials — the secret never reaches the browser |
| `RAZORPAY_WEBHOOK_SECRET` | Convex | verifies the webhooks of Razorpay |
| `RAZORPAY_INR_PER_USD` | Convex | the rate used to convert the USD price into INR (default 83) |
| `EDGE_STORE_ACCESS_KEY` / `EDGE_STORE_SECRET_KEY` *(optional)* | Vercel | durable file storage (without them uploads fall back to `/tmp`, which is ephemeral) |

Without the Clerk key the app shows a **“Jotion needs a little configuration”**
screen that lists exactly what is missing — it never crashes.

### Deploying

```bash
npx vercel login          # once
npx vercel link           # once — creates .vercel/project.json
npx vercel env add NEXT_PUBLIC_CONVEX_URL production
npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
npx vercel --prod
```

Or let GitHub do it: install the Vercel GitHub app for the repository, set
the environment variables in the Vercel project and every push to the
production branch deploys automatically. `.github/workflows/deploy.yml`
deploys the Convex backend and the web app together.

> **Tip:** deploy from a clean checkout. The Vercel CLI reads `.env.local`
> and fails when the file is excluded from the upload (`readlink … ENOENT`).
> A CI checkout never has `.env.local`, so it is not a problem there.

### The configuration files

| File | Purpose |
| --- | --- |
| `vercel.json` | framework, build command, region, security headers |
| `.vercelignore` | keeps the upload small (no `mcp-test-server`, no uploads, no local env) |
| `.env.production` | the public production Convex URL (no secrets) |
| `next.config.mjs` | a separate `distDir` for the dev server (`.next-dev`) so a production build never breaks `npm run dev` |

---

## 3. Before you deploy

```bash
npm run verify
```

This runs the type check, the lint, the 85 tests, the production build, the
asset check (every route must serve its JavaScript and CSS) and a Vercel
compatibility check. It is exactly what GitHub Actions runs.

---

## 4. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| “Jotion needs a little configuration” | An environment variable is missing | The screen lists which one — add it and restart |
| “Jotion could not start — Cannot read properties of null (reading 'get')” | An old build with the `useSearchParams()` bug | Update to the current code (`useSafeSearchParams`) |
| Pages load without any styling | The JavaScript and CSS return 404 | Run `npm run check:assets`; never run `npm run build` while `next dev` is running (the dev server uses `.next-dev`) |
| Uploads disappear | The local fallback writes to `/tmp` on serverless platforms | Configure EdgeStore for durable storage |
| The Convex schema is out of date | The schema was not pushed | `npx convex dev` |
