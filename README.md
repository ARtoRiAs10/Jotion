# Jotion

**The connected workspace where better, faster work happens.**

Jotion is a full Notion-style collaborative workspace: block based pages, databases
with multiple views, workspaces and members, comments, version history, public
sharing, templates — and a complete **pricing & billing system** (plans, seat based
pricing, monthly/annual billing, promo codes, checkout, taxes, invoices, prorated
upgrades, scheduled downgrades and feature gating).

---

## Features

### Workspace
- **Workspaces** – every page belongs to a workspace; switch between them from the
  sidebar switcher.
- **Roles & permissions** – `owner`, `admin`, `member`, `guest`, enforced on the
  server (Convex) as well as in the UI.
- **Invitations** – invite people by email with a role, guests are limited by plan.
- **Member management** – change roles, remove members, workspace overview.
- **Audit log** – every page, member and billing event is recorded, with cursor
  pagination and a *Load more* button.

### Collaboration & import
- **Real-time collaboration** – the page is edited through a Yjs CRDT document
  that is synced through Convex: concurrent edits are merged, never overwritten,
  and the people on the page are shown in the header.
- **Synced blocks** – a page can mirror the content of another page; the copy
  updates automatically.
- **Import** – from Markdown, from a CSV, or from a whole **Notion export**
  (upload the ZIP: pages, sub-pages and databases are recreated).

### AI
- **Writing assistant** – improve, shorten, summarize, continue or translate the
  selection (or the whole page). Works with Anthropic or any OpenAI-compatible
  provider — set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

### Pages
- **Block editor** (BlockNote) with slash commands, headings, lists, to-dos, code,
  tables, images, uploads, drag & drop and keyboard shortcuts.
- **Page properties** – Status, Tags, Owner, Due date (select, multi-select, date,
  checkbox, person, url, email, number, text) plus **page mentions** with a
  *linked mentions* panel on every page.
- **Import from Markdown** – paste Markdown and get a page with real blocks.
- **Conflicting-edit protection** – a page that was changed by somebody else is
  never silently overwritten.
- **Cover & icon** – emoji picker and cover image (Edge Store or the built-in local
  storage fallback).
- **Favorites**, **templates**, **duplicate**, **move** (drag & drop in the
  sidebar), **archive / restore / delete forever**, **lock**, **full width**.
- **Private pages** — only visible to their creator and the workspace admins
  (Plus and above; the Free plan is blocked on the server).
- **Sub-pages** – every page lists and creates its own sub-pages, exactly like
  Notion renders them at the bottom of a page.
- **Version history** – automatic snapshots with restore, retention is driven by the
  workspace plan.
- **Comments** – threads, replies, resolve/reopen and `@mentions` that create
  notifications.
- **Public sharing** – publish a page to the web with `Restricted / Can view /
  Can comment / Can edit` access, optionally protected by a **password**.
- **Page level access** – a page can be *restricted* to specific people, each with
  their own permission (`Can view / Can comment / Can edit`).
- **Export** – download any page as Markdown.

### Databases
- Table, **Board** (kanban), List, Gallery and Calendar views.
- **Relations & rollups** – link the rows of two databases and aggregate them
  (count, sum, average, min, max, list), computed live on the server.
- **Automations** – when a row property reaches a value, set another property or
  notify the team (plan limited: Free none, Plus 5 per database, Business ∞).
- **CSV import / export** and **Markdown import**.
- Typed columns: text, number, select, multi-select, date, checkbox, person, url,
  email, phone and **formula**.
- **Property editor** – rename a column, change its type, edit the options of a
  select, or write a formula.
- **Formulas** – a small expression engine (`prop("Price") * prop("Qty")`,
  `concat(...)`, `if(...)`, `lower(...)`, `sum(...)`, …) evaluated live in the
  database.
- **Sorting & filtering** – every saved view keeps its own sort and filter rules.
- **CSV import / export** – paste a CSV to create rows (new columns are created
  automatically) or download the database as a CSV.
- Multiple saved views per database, grouping, inline cell editing, new
  rows/columns, and rows that are real pages (open them like any other page).

### Navigation & productivity
- Notion-style resizable/collapsible sidebar with Favorites, Teamspace tree and
  Trash.
- **Command palette** (`⌘K` / `Ctrl+K`, `⌘⇧P`, `⌘N`) with page search and actions.
- **Notification inbox** – mentions and comments, with an unread badge in the
  sidebar.
- Dashboard with greeting, recents, favorites and quick actions.
- Dark mode, responsive layout with a mobile drawer.

### Pricing & billing (fully implemented)
- Four plans — **Free, Plus, Business, Enterprise** — defined once in
  [`lib/plans.ts`](./lib/plans.ts) and consumed by both the UI and the backend.
- **Monthly / annual billing** with annual discounts, per-seat pricing.
- Marketing pricing page (`/pricing`) with plan cards, a seat selector, a feature
  comparison table, an education/non-profit offer and a *talk to sales* form.
- **Checkout flow** (`/billing/checkout`) – two steps (details → payment), Luhn
  card validation, promo codes, tax calculation, payment method storage and a
  pending invoice that is the single source of truth.
- **Promo codes** – global codes (`JOTION20`, `EDU50`, `WELCOME10`) plus workspace
  coupons (percentage or fixed amount, restricted to certain plans, with a
  redemption limit).
- **Billing settings** – current plan, usage meters against every plan limit, seat
  management (prorated), invoice history with downloadable invoices, payment
  methods, billing details (tax rate, billing email, address), cancel/resume,
  upgrade (prorated, charged immediately) and downgrade (scheduled for the end of
  the period, and cancelable).
- **Renewals** – when a billing period ends the subscription renews automatically
  and any scheduled downgrade is applied.
- **Feature gating** enforced on the server: guest limits, member limits, page
  limits, database limits, blocks per page, version history retention, file upload
  size — each plan has its own limits, and hitting one opens an upgrade dialog.
- 14 day free trials, invoice numbering, activity log for billing events.
- **E-mail notifications** – mentions, invitations and invoices are sent
  through a provider agnostic mailer (Resend, with a log fallback).

---

## Deploying to Vercel

The app is a standard Next.js application and deploys to Vercel as it is:

```bash
vercel link
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel --prod
```

`vercel.json` pins the framework, the build command (`npm run build`), the
region and the security headers; `.vercelignore` keeps the repository lean.
The backend is deployed separately with `npx convex deploy --prod` (see
`.github/workflows/deploy.yml` for the automated pipeline).

## Tech stack

| Layer      | Technology                                  |
| ---------- | ------------------------------------------- |
| Frontend   | Next.js 14 (App Router), React 18, Tailwind |
| Editor     | BlockNote (`@blocknote/*`)                  |
| Backend    | Convex (schema, queries, mutations)          |
| Auth       | Clerk                                       |
| Storage    | EdgeStore (with local filesystem fallback)  |
| UI         | Radix primitives + shadcn/ui                |

---

## Getting started

```bash
# 1. install dependencies
npm install

# 2. configure the environment
cp .env.example .env.local
#   → add your Convex URL and Clerk publishable key

# 3. push the Convex schema & functions
npx convex dev

# 4. run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Edge Store is optional.** If `EDGE_STORE_ACCESS_KEY` / `EDGE_STORE_SECRET_KEY`
> are not set, uploads are stored on the local filesystem (`/api/upload`) and
> served from `/api/upload/[id]`.

### Useful scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # run the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # 84 automated tests (Vitest + an in-memory Convex backend)
npm run check:assets # verifies that every route serves its JavaScript and CSS
npm run verify     # the full pre-deployment check (typecheck, lint, tests,
                   # build, asset check and Vercel compatibility)
npm run test:watch # the same, in watch mode
npm run docs       # regenerate the Word documents in docs/
```

### Demo helpers (development only)

A key-gated seeder populates a deployment with realistic data and runs a
self-check against the live backend:

```bash
npx convex env set JOTION_DEMO_KEY "$(openssl rand -hex 16)"
npx convex run demo:seed '{"key":"<KEY>","userId":"<clerk_user_id>"}'
npx convex run demo:smoke '{"key":"<KEY>"}'   # pricing, formulas and limits
npx convex run demo:reset '{"key":"<KEY>"}'   # clean up again
```

The helpers refuse to run when `JOTION_DEMO_KEY` is not configured, so they
are inert on a deployment where the secret is missing.

---

## Project layout

```
app/
  (marketing)/            landing page + /pricing
  (main)/                 authenticated workspace shell
    (routes)/documents    dashboard + page editor
    (routes)/notifications notification inbox
    (routes)/settings     general, members, billing, activity, trash
    (routes)/templates    template gallery
    (routes)/billing      checkout
  (public)/preview        published page view (password protected)
  api/upload              local file storage fallback
components/
  billing/                plan cards, billing settings, upgrade dialog
  command/                command palette
  database/               table / board / list / gallery / calendar views,
                          property editor, CSV import & export
  page/                   title, properties, sub-pages, comments, history,
                          sharing
  providers/              convex, workspace, theme, modals
  sidebar/                workspace switcher, page tree, trash, user menu
  templates/              template gallery
convex/
  schema.ts               the data model
  documents.ts            pages, properties, versions, sharing, page access
  databases.ts            columns, views, rows, formulas, CSV import
  comments.ts             threads + mentions
  workspaces.ts           workspaces, members, roles, usage
  billing.ts              plans, checkout, invoices, coupons, payment methods
  activity.ts             audit log
  templates.ts            built-in & custom templates
  versions.ts             page history
  users.ts                user mirror + notifications
lib/
  plans.ts                the single source of truth for pricing & limits
  formula.ts              the database formula engine
  upgrade.ts              upgrade prompts for plan limits
```

---

## License

MIT — see [LICENSE](./LICENSE).
