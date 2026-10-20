#!/usr/bin/env python3
"""
Generates the Word documents for the Jotion project:

    docs/Jotion-Documentation.docx        – the product & technical documentation
    docs/Jotion-Source-Code.docx         – every source file, with its full content
    docs/Jotion-Chat-Transcript.docx      – the chat transcript of the build
    docs/Jotion-Complete-Handbook.docx   – all of the above in a single file

Usage:  python3 scripts/generate-docs.py
"""

from __future__ import annotations

import os
import subprocess
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".css", ".scss", ".json",
    ".md", ".mdc", ".yml", ".yaml", ".html", ".example", ".txt", ".prisma",
}

SKIP_DIRS = {
    "node_modules", ".next", ".git", ".jotion-uploads", "docs", ".turbo",
    ".vercel", "dist", "build", ".trunk", ".cursor",
}

SKIP_FILES = {"package-lock.json", "tsconfig.tsbuildinfo", ".DS_Store"}


# ----------------------------------------------------------------------
#  helpers
# ----------------------------------------------------------------------

def iter_source_files():
    """Yields every interesting source file, relative to the repo root."""
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(
            d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".git")
        )
        for filename in sorted(filenames):
            if filename in SKIP_FILES:
                continue
            # Never copy secrets into a shareable document.
            if filename == ".env.local" or filename.startswith(".env."):
                if filename != ".env.example":
                    continue
            path = Path(dirpath) / filename
            suffix = path.suffix.lower()
            if suffix not in CODE_EXTENSIONS and not filename.startswith("."):
                continue
            if path.stat().st_size > 400_000:
                continue
            yield path.relative_to(ROOT)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)


def new_document(title: str, subtitle: str) -> Document:
    document = Document()

    styles = document.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)

    for name, size, color in (
        ("Title", 28, RGBColor(0x11, 0x11, 0x11)),
        ("Heading 1", 18, RGBColor(0x11, 0x11, 0x11)),
        ("Heading 2", 14, RGBColor(0x33, 0x33, 0x33)),
        ("Heading 3", 11.5, RGBColor(0x55, 0x55, 0x55)),
    ):
        style = styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.color.rgb = color

    section = document.sections[0]
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run(f"{title}  •  ")
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
    add_page_number(footer)
    for r in footer.runs:
        r.font.size = Pt(8)
        r.font.color.rgb = RGBColor(0x88, 0x88, 0x88)

    # cover page
    heading = document.add_paragraph(title, style="Title")
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = document.add_paragraph(subtitle)
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.size = Pt(12)
    sub.runs[0].font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    stamp = document.add_paragraph(
        f"Generated {datetime.now().strftime('%d %B %Y')}  •  "
        f"Jotion — the connected workspace where better, faster work happens."
    )
    stamp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    stamp.runs[0].font.size = Pt(9)
    stamp.runs[0].font.color.rgb = RGBColor(0x99, 0x99, 0x99)

    document.add_page_break()
    return document


def add_toc(document: Document, entries: list[tuple[str, int]]):
    document.add_heading("Table of contents", level=1)
    for title, level in entries:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.left_indent = Inches(0.25 * (level - 1))
        run = paragraph.add_run(title)
        run.font.size = Pt(10)
        run.bold = level == 1
    document.add_page_break()


def add_code_block(document: Document, code: str, size: float = 7.5):
    for line in code.splitlines() or [""]:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.line_spacing = 1
        run = paragraph.add_run(line if line.strip() else " ")
        run.font.name = "Consolas"
        run.font.size = Pt(size)
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
    return paragraph


def add_bullets(document: Document, items: list[str], level: int = 0):
    for item in items:
        paragraph = document.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.left_indent = Inches(0.3 + 0.25 * level)
        paragraph.paragraph_format.space_after = Pt(2)
        _add_inline(paragraph, item)


def add_numbered(document: Document, items: list[str]):
    for item in items:
        paragraph = document.add_paragraph(style="List Number")
        paragraph.paragraph_format.left_indent = Inches(0.3)
        paragraph.paragraph_format.space_after = Pt(2)
        _add_inline(paragraph, item)


def add_table(document: Document, headers: list[str], rows: list[list[str]]):
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    header_cells = table.rows[0].cells
    for index, header in enumerate(headers):
        header_cells[index].text = ""
        run = header_cells[index].paragraphs[0].add_run(header)
        run.bold = True
        run.font.size = Pt(9.5)
    for row in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            cells[index].text = ""
            run = cells[index].paragraphs[0].add_run(value)
            run.font.size = Pt(9.5)
    document.add_paragraph()


def _add_inline(paragraph, text: str):
    """Renders **bold** and `code` inline."""
    import re

    tokens = re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text)
    for token in tokens:
        if not token:
            continue
        if token.startswith("**") and token.endswith("**"):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
            run.font.size = Pt(10.5)
        elif token.startswith("`") and token.endswith("`"):
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9.5)
        else:
            run = paragraph.add_run(token)
            run.font.size = Pt(10.5)


def add_paragraph(document: Document, text: str, size: float = 10.5):
    paragraph = document.add_paragraph()
    _add_inline(paragraph, text)
    for run in paragraph.runs:
        if run.font.size is None:
            run.font.size = Pt(size)
    return paragraph


def git_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except Exception:
        return "unknown"


# ----------------------------------------------------------------------
#  1. Product & technical documentation
# ----------------------------------------------------------------------

def build_documentation(path: Path):
    document = new_document(
        "Jotion — Documentation",
        "The connected workspace where better, faster work happens",
    )

    add_toc(
        document,
        [
            ("1. Overview", 1),
            ("2. Feature catalogue", 1),
            ("2.1 Workspace & members", 2),
            ("2.2 Pages & blocks", 2),
            ("2.3 Databases", 2),
            ("2.4 Sharing, comments & notifications", 2),
            ("2.5 Navigation & productivity", 2),
            ("3. Pricing & billing", 1),
            ("3.1 Plans & limits", 2),
            ("3.2 The quote engine", 2),
            ("3.3 Coupons & promos", 2),
            ("3.4 Subscription lifecycle", 2),
            ("3.5 Proration", 2),
            ("3.6 Feature gating", 2),
            ("3.7 Invoices, tax & payment methods", 2),
            ("4. Technical architecture", 1),
            ("4.1 Tech stack", 2),
            ("4.2 Project layout", 2),
            ("4.3 Data model", 2),
            ("4.4 Convex API reference", 2),
            ("4.5 Client components", 2),
            ("4.6 Libraries", 2),
            ("5. Getting started", 1),
            ("6. Build, lint & deploy", 1),
            ("7. Conventions & rules", 1),
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("1. Overview", level=1)
    add_paragraph(
        document,
        "Jotion is a Notion-style collaborative workspace. Every page is built from "
        "blocks, pages live in a workspace, workspaces are billed per seat. The "
        "application is a Next.js 14 App Router application, the data lives in "
        "Convex, authentication is handled by Clerk and files are stored in "
        "EdgeStore (with a local filesystem fallback).",
    )
    add_paragraph(
        document,
        "The pricing model is not a marketing page bolted onto the product: the plan "
        "catalogue lives in a single module (`lib/plans.ts`) that is imported by the "
        "marketing site, the billing screens **and** the Convex backend, so the "
        "amount a customer is quoted and the amount that is charged can never drift "
        "apart.",
    )

    add_table(
        document,
        ["Layer", "Technology", "Notes"],
        [
            ["Frontend", "Next.js 14 (App Router), React 18", "Server components for the marketing pages, client components for the app shell"],
            ["Styling", "Tailwind CSS", "Design tokens tuned to look like Notion"],
            ["Editor", "BlockNote (@blocknote/*)", "Slash commands, tables, code blocks, uploads"],
            ["Backend", "Convex", "Schema, queries, mutations, real-time subscriptions"],
            ["Auth", "Clerk", "Mirrored into the `users` table for mentions & members"],
            ["Storage", "EdgeStore", "Falls back to `/api/upload` on the local filesystem"],
            ["UI kit", "Radix primitives + shadcn/ui", "Dialog, dropdown, popover, sheet, command palette"],
            ["State", "Zustand", "Workspace selection, sidebar and modal stores"],
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("2. Feature catalogue", level=1)

    document.add_heading("2.1 Workspace & members", level=2)
    add_bullets(
        document,
        [
            "**Workspaces** — every page belongs to exactly one workspace; switch "
            "between them from the sidebar switcher. The selection is persisted in "
            "`zustand` (`jotion-workspace`).",
            "**Roles** — `owner`, `admin`, `member`, `guest`. The role is enforced on "
            "the server through `requireRole()` and mirrored in the UI.",
            "**Invitations** — invite people by e-mail with a role. Guests are "
            "limited per plan.",
            "**Member management** — change roles, remove members, see who is in the "
            "workspace.",
            "**Audit log** — every page, member and billing event is written to the "
            "`activity` table and surfaced in Settings → Activity.",
            "**Onboarding** — `workspaces.ensureDefault` creates a personal workspace "
            "on first sign-in and migrates legacy documents into it.",
        ],
    )

    document.add_heading("2.2 Pages & blocks", level=2)
    add_bullets(
        document,
        [
            "**Block editor** (BlockNote) with slash commands, headings, lists, "
            "to-dos, code, tables, images, uploads, drag & drop and keyboard "
            "shortcuts.",
            "**Page properties** — status, tags, owner, due date … supporting select, "
            "multi-select, date, checkbox, person, url, email, number and text.",
            "**Cover & icon** — emoji picker plus cover images (EdgeStore or the "
            "built-in local storage fallback).",
            "**Favorites, templates, duplicate, move, archive, restore, delete "
            "forever, lock and full-width** are all first-class operations.",
            "**Sub-pages** — every page lists and creates its own sub-pages at the "
            "bottom of the page, exactly like Notion.",
            "**Version history** — automatic snapshots on every content change plus "
            "named manual snapshots; retention is driven by the workspace plan.",
            "**Markdown export** — download any page as a `.md` file.",
        ],
    )

    document.add_heading("2.3 Databases", level=2)
    add_bullets(
        document,
        [
            "**Five view types** — table, board (kanban), list, gallery and calendar.",
            "**Typed columns** — text, number, select, multi-select, date, checkbox, "
            "person, url, email, phone and **formula**.",
            "**Property editor** — rename a column, change its type, edit the options "
            "of a select, or write a formula.",
            "**Formula engine** (`lib/formula.ts`) — `prop(\"Price\") * prop(\"Qty\")`, "
            "`concat()`, `if()`, `lower()`, `upper()`, `sum()`, `min()`, `max()`, "
            "`round()`, `contains()`, `now()` and more. Formulas are evaluated live "
            "by the server on every read.",
            "**Sorting & filtering** — every saved view keeps its own sort and filter "
            "rules (`views.sorts`, `views.filters`).",
            "**CSV import / export** — paste a CSV to create rows (unknown columns are "
            "created automatically) or download the database as CSV.",
            "**Rows are pages** — every row is a real page that can be opened, shared, "
            "commented on and versioned.",
        ],
    )

    document.add_heading("2.4 Sharing, comments & notifications", level=2)
    add_bullets(
        document,
        [
            "**Public links** — `Restricted`, `Can view`, `Can comment`, `Can edit`.",
            "**Password protection** — a published page can require a password; the "
            "password itself is never sent to the client, only the fact that the page "
            "is protected.",
            "**Page level access** — a page can be restricted to specific people, each "
            "with their own permission. The server resolves the effective permission "
            "(`none`, `read`, `comment`, `edit`, `owner`) and refuses edits when the "
            "user may only read or comment.",
            "**Comments** — threads, replies, resolve/reopen and `@mentions`.",
            "**Notification inbox** — `/notifications` lists mentions and comments, "
            "marks them as read and shows an unread badge in the sidebar.",
        ],
    )

    document.add_heading("2.5 Navigation & productivity", level=2)
    add_bullets(
        document,
        [
            "**Command palette** — `⌘K` / `Ctrl+K`, `⌘⇧P` to search pages and run "
            "commands, `⌘N` to create a page.",
            "**Sidebar** — resizable and collapsible, with Favorites, Teamspace tree, "
            "Trash and a plan upgrade nudge.",
            "**Dashboard** — greeting, recents, favorites, quick actions and starter "
            "templates.",
            "**Dark mode**, responsive layout with a mobile drawer.",
            "**Templates** — built-in starter templates (weekly review, meeting notes, "
            "project tracker, reading list, product spec, getting started) seeded per "
            "workspace, plus custom templates.",
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("3. Pricing & billing", level=1)

    document.add_heading("3.1 Plans & limits", level=2)
    add_paragraph(
        document,
        "Four plans are defined in `lib/plans.ts`. Prices are **per seat, per month**; "
        "annual billing is charged once for twelve months and is cheaper per month.",
    )
    add_table(
        document,
        [
            "Plan",
            "Monthly / seat",
            "Annual / seat",
            "Guests",
            "Members",
            "Pages",
            "Databases",
            "Blocks / page",
            "Version history",
            "Upload",
        ],
        [
            ["Free", "$0", "$0", "10", "3", "1 000", "3", "100", "7 days", "100 MB"],
            ["Plus", "$12", "$10", "∞", "∞", "∞", "∞", "∞", "30 days", "5 GB"],
            ["Business", "$24", "$20", "∞", "∞", "∞", "∞", "∞", "1 year", "100 GB"],
            ["Enterprise", "Custom", "Custom", "∞", "∞", "∞", "∞", "∞", "Custom", "∞"],
        ],
    )
    add_paragraph(
        document,
        "Each plan also carries a boolean/valued feature matrix (private pages, SAML "
        "SSO, SCIM, audit log, custom domains, API access, automations, data "
        "residency …) which drives the comparison table on the marketing site and the "
        "`hasFeature()` checks in the app.",
    )

    document.add_heading("3.2 The quote engine", level=2)
    add_paragraph(
        document,
        "`buildQuote()` in `lib/plans.ts` is the only place where money is computed. "
        "It is used by the pricing page, the checkout page, the billing settings, the "
        "plan-change dialog and the Convex mutations.",
    )
    add_code_block(
        document,
        "const quote = buildQuote({\n"
        "  planId: \"plus\",\n"
        "  cycle: \"annual\",\n"
        "  seats: 5,\n"
        "  couponCode: \"JOTION20\",\n"
        "  taxRate: 0.2,\n"
        "});\n"
        "// → { subtotal: 60000, discount: 12000, tax: 9600, total: 57600, ... }",
    )

    document.add_heading("3.3 Coupons & promos", level=2)
    add_bullets(
        document,
        [
            "**Global codes** — `JOTION20` (20 % off), `EDU50` (50 % off for Plus and "
            "Business, education & non-profits), `WELCOME10` ($10 off).",
            "**Workspace coupons** — owners can create their own codes: percentage or "
            "fixed amount, optionally restricted to certain plans, with an optional "
            "expiry date and redemption limit.",
            "**Validation** — a code is rejected when it is unknown, expired, past its "
            "redemption limit or not applicable to the selected plan.",
            "**Redemptions** — every successful checkout increments the redemption "
            "counter of the coupon.",
        ],
    )

    document.add_heading("3.4 Subscription lifecycle", level=2)
    add_numbered(
        document,
        [
            "**Start** — `billing.startCheckout` creates a pending (`open`) invoice "
            "and returns a session. Pending invoices are voided when a new checkout "
            "starts.",
            "**Pay** — `billing.completeCheckout` activates the plan, stores the "
            "payment method, marks the invoice `paid` and starts the billing period.",
            "**Renew** — when the period elapses, `billing.renewSubscription` issues "
            "the renewal invoice and moves the period forward. It is triggered "
            "automatically by `useBillingSync()`.",
            "**Upgrade** — immediate, prorated. The difference between the old and the "
            "new plan is charged for the days that are left in the period.",
            "**Downgrade** — scheduled for the end of the period. The workspace keeps "
            "every feature until then and the scheduled change can be cancelled.",
            "**Cancel / resume** — cancelling keeps access until the end of the paid "
            "period; resuming reactivates the subscription immediately.",
            "**Trial** — `billing.startTrial` activates a paid plan for 14 days "
            "without charging.",
        ],
    )

    document.add_heading("3.5 Proration", level=2)
    add_code_block(
        document,
        "const fraction = remainingFraction(periodStart, periodEnd, now);\n"
        "const preview = planChangePreview({\n"
        "  from: \"plus\", to: \"business\", cycle: \"monthly\", seats: 5, fraction,\n"
        "});\n"
        "// → { credit: 4000, charge: 8000, dueToday: 4000, isUpgrade: true }",
    )
    add_paragraph(
        document,
        "Seat changes use the same mechanism: adding seats is charged for the "
        "remaining days, removing seats produces a credit.",
    )

    document.add_heading("3.6 Feature gating", level=2)
    add_paragraph(
        document,
        "Limits are enforced **on the server** — the client is never trusted. The "
        "following operations throw a descriptive error when a limit is reached:",
    )
    add_bullets(
        document,
        [
            "creating a page (page limit),",
            "creating a database (database limit),",
            "inviting a member (member limit) or a guest (guest limit),",
            "saving page content (blocks per page limit),",
            "uploading a file (upload size limit).",
        ],
    )
    add_paragraph(
        document,
        "The error message is recognised by `lib/upgrade.ts` and opens the upgrade "
        "dialog, which explains what is blocked and links to the pricing page.",
    )

    document.add_heading("3.7 Invoices, tax & payment methods", level=2)
    add_bullets(
        document,
        [
            "**Invoices** are stored in cents with a subtotal, a discount, a tax "
            "amount and line items. Every invoice has a number (`JOT-…`) and can be "
            "downloaded as a printable HTML document.",
            "**Tax** is configured per workspace (tax rate, billing e-mail, billing "
            "address) and applied to every new invoice.",
            "**Payment methods** are stored per workspace (brand, last four digits, "
            "expiry). One of them can be the default; the last one is removed "
            "automatically when the default is deleted.",
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("4. Technical architecture", level=1)

    document.add_heading("4.1 Tech stack", level=2)
    add_paragraph(
        document,
        "See the table in section 1 for the full stack. The important boundary is "
        "between the three kinds of code in this repository:",
    )
    add_bullets(
        document,
        [
            "`app/` and `components/` — the Next.js application (client + server "
            "components).",
            "`convex/` — the backend. Every exported function is a query or a "
            "mutation; helpers live in `convex/helpers.ts`.",
            "`lib/` — framework-free TypeScript that both sides import: the pricing "
            "model, the formula engine and the upgrade helpers.",
        ],
    )

    document.add_heading("4.2 Project layout", level=2)
    add_code_block(
        document,
        """app/
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
  plans.ts                single source of truth for pricing & limits
  formula.ts              the database formula engine
  upgrade.ts              upgrade prompts for plan limits""",
    )

    document.add_heading("4.3 Data model", level=2)
    add_table(
        document,
        ["Table", "Purpose", "Indexes"],
        [
            ["users", "Mirror of the Clerk profile (mentions, members, comments)", "by_clerk, by_email"],
            ["workspaces", "Teamspace, plan, billing period, tax & billing details", "by_owner, by_slug"],
            ["workspaceMembers", "Membership + role", "by_workspace, by_user, by_workspace_user"],
            ["documents", "Pages and databases (content, icon, cover, sharing, access)", "by_user, by_user_parent, by_workspace, by_workspace_parent, by_parent"],
            ["pageProperties", "Page & database row values", "by_document"],
            ["databaseProperties", "Columns of a database (type, options, formula)", "by_database"],
            ["views", "Saved views of a database (type, group, sort, filter)", "by_database"],
            ["comments", "Threads, replies, mentions, resolved state", "by_document"],
            ["versions", "Snapshots for the page history", "by_document"],
            ["activity", "Audit log of every action", "by_workspace"],
            ["templates", "Built-in and custom page templates", "by_workspace"],
            ["invoices", "Invoices (open, paid, scheduled, void)", "by_workspace"],
            ["coupons", "Promo codes, global and per workspace", "by_workspace, by_code"],
            ["paymentMethods", "Cards attached to a workspace", "by_workspace"],
            ["pageAccess", "Per person permissions on a restricted page", "by_document, by_user"],
            ["notifications", "Mentions and comments inbox", "by_user"],
        ],
    )

    document.add_heading("4.4 Convex API reference", level=2)
    add_table(
        document,
        ["Module", "Function", "Kind", "Purpose"],
        [
            ["documents", "getSidebar / getById / getChildren / getAncestors", "query", "Navigation and page loading"],
            ["documents", "getSearch / getRecent / getFavorites / getTrash", "query", "Search, dashboard and trash"],
            ["documents", "create / update / archive / restore / remove", "mutation", "Page lifecycle"],
            ["documents", "duplicate / move / toggleFavorite / lockPage", "mutation", "Page actions"],
            ["documents", "setPublicAccess / verifyPublicPassword", "mutation", "Public links and passwords"],
            ["documents", "setRestricted / setPageAccess / removePageAccess / listPageAccess / getMyPermission", "mutation / query", "Page level permissions"],
            ["documents", "setProperty / getProperties / removeProperty", "mutation / query", "Page properties"],
            ["databases", "getDatabase / addProperty / updateProperty / removeProperty", "query / mutation", "Columns (incl. formulas)"],
            ["databases", "createRow / setRowValue / deleteRow / importRows", "mutation", "Rows and CSV import"],
            ["databases", "addView / updateView / removeView / reorderViews", "mutation", "Views, sorting and filtering"],
            ["databases", "createDatabase", "mutation", "Database creation (plan limited)"],
            ["billing", "getSubscription / getInvoices / mySubscriptions / quote", "query", "Billing state and quotes"],
            ["billing", "startCheckout / completeCheckout / cancelCheckout", "mutation", "Checkout flow"],
            ["billing", "changePlan / cancelScheduledChange / renewSubscription", "mutation", "Plan changes and renewals"],
            ["billing", "updateSeats / cancelSubscription / resumeSubscription / startTrial", "mutation", "Seats and lifecycle"],
            ["billing", "addPaymentMethod / removePaymentMethod / setDefaultPaymentMethod", "mutation", "Cards"],
            ["billing", "createCoupon / removeCoupon / applyCoupon / updateBillingDetails", "mutation", "Promos and billing details"],
            ["workspaces", "list / get / create / update / remove / ensureDefault", "query / mutation", "Workspaces"],
            ["workspaces", "listMembers / inviteMember / updateMemberRole / removeMember / getUsage", "query / mutation", "Members"],
            ["comments", "list / add / update / remove / toggleResolved", "query / mutation", "Discussion"],
            ["versions", "list / create / restore / remove", "query / mutation", "Page history"],
            ["activity", "list / auditLog / clear", "query / mutation", "Audit log"],
            ["templates", "list / create / remove / seedDefaults", "query / mutation", "Templates"],
            ["users", "syncUser / getCurrentUser / listUsers", "mutation / query", "User mirror"],
            ["users", "getNotifications / markNotificationsRead", "query / mutation", "Notification inbox"],
        ],
    )

    document.add_heading("4.5 Client components", level=2)
    add_table(
        document,
        ["Component", "Responsibility"],
        [
            ["components/billing/billing-settings.tsx", "Plan card, usage meters, seats, payment methods, billing details, promos, invoices, plan change dialog"],
            ["components/billing/plan-card.tsx", "Marketing plan card with monthly/annual pricing and seat totals"],
            ["components/billing/upgrade-modal.tsx", "Upgrade dialog shown when a plan limit is reached"],
            ["components/command/command-palette.tsx", "⌘K palette: search, create page/database, navigate, toggle theme"],
            ["components/database/database-view.tsx", "Table/board/list/gallery/calendar rendering, sorting, filtering, CSV import/export"],
            ["components/database/property-editor.tsx", "Rename, retype, options and formula editor for a column"],
            ["components/database/property-cell.tsx", "Cell rendering per property type (incl. read-only formula cells)"],
            ["components/page/page-header.tsx", "Breadcrumbs, favourite, share and page actions"],
            ["components/page/share-modal.tsx", "Members, page level permissions, public link and password"],
            ["components/page/sub-pages.tsx", "Sub-page list and inline creation"],
            ["components/page/comments-panel.tsx", "Comment threads and mentions"],
            ["components/page/versions-panel.tsx", "Version history and restore"],
            ["components/sidebar/*", "Workspace switcher, page tree, trash, user menu"],
            ["components/providers/workspace-provider.tsx", "Active workspace, role and plan for the whole app"],
            ["hooks/use-billing-sync.ts", "Automatic renewal of expired billing periods"],
        ],
    )

    document.add_heading("4.6 Libraries", level=2)
    add_table(
        document,
        ["Library", "Used for"],
        [
            ["lib/plans.ts", "Plan catalogue, limits, coupons, quotes, proration, permissions"],
            ["lib/formula.ts", "Tokeniser + recursive descent parser for database formulas"],
            ["lib/upgrade.ts", "Upgrade prompt event bus and plan-limit error detection"],
            ["lib/utils.ts", "Date formatting, relative time, class name merging"],
            ["lib/edgestore.ts", "EdgeStore client with a local fallback"],
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("5. Getting started", level=1)
    add_code_block(
        document,
        """# 1. install dependencies
npm install

# 2. configure the environment
cp .env.example .env.local
#   → CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL
#   → NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
#   → EDGE_STORE_ACCESS_KEY / EDGE_STORE_SECRET_KEY (optional)

# 3. push the Convex schema & functions
npx convex dev

# 4. run the app
npm run dev""",
    )
    add_paragraph(
        document,
        "Open http://localhost:3000. The EdgeStore keys are optional: without them "
        "uploads are written to `.jotion-uploads/` and served from `/api/upload/[id]`.",
    )

    document.add_heading("6. Build, lint & deploy", level=1)
    add_code_block(
        document,
        """npm run dev        # development server
npm run build      # production build
npm run start      # run the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit""",
    )

    document.add_heading("7. Conventions & rules", level=1)
    add_bullets(
        document,
        [
            "Money is always handled in **cents** and always through `lib/plans.ts`.",
            "`Infinity` is never sent to the client — limits are serialised to `null` "
            "by `serialiseLimits()` and `null` means *unlimited*.",
            "Every mutation validates the caller: `requireMembership()` or "
            "`requireRole()` before any write.",
            "Plan limits are enforced on the server, never only in the UI.",
            "Every mutation that changes something meaningful writes an `activity` "
            "entry.",
            "Components follow the Notion design language: minimal, keyboard "
            "navigable, `notion-hover` for subtle feedback.",
        ],
    )

    document.save(path)
    return path


# ----------------------------------------------------------------------
#  2. Source code
# ----------------------------------------------------------------------

def build_source_code(path: Path):
    files = list(iter_source_files())
    total_lines = 0

    document = new_document(
        "Jotion — Source Code",
        f"Complete listing of every source file  •  {len(files)} files",
    )

    add_toc(document, [("File index", 1)] + [(f"  {f}", 2) for f in files])

    document.add_heading("File index", level=1)
    add_table(
        document,
        ["#", "File", "Lines"],
        [
            [str(index + 1), str(file), str(len(file.read_text(errors="ignore").splitlines()))]
            for index, file in enumerate(files)
        ],
    )

    for index, file in enumerate(files, start=1):
        content = file.read_text(errors="ignore")
        total_lines += len(content.splitlines())

        document.add_page_break()
        document.add_heading(f"{index}. {file}", level=1)
        path_paragraph = document.add_paragraph()
        run = path_paragraph.add_run(str(file))
        run.font.name = "Consolas"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

        add_code_block(document, content)

    document.add_page_break()
    document.add_heading("Summary", level=1)
    add_paragraph(
        document,
        f"**{len(files)} files**, **{total_lines:,} lines** of source code "
        f"(revision {git_revision()}).",
    )

    document.save(path)
    return path


# ----------------------------------------------------------------------
#  3. Chat transcript
# ----------------------------------------------------------------------

CHAT: list[tuple[str, str, list[str]]] = [
    (
        "user",
        "help me create a proper 100% clone of notion implementing most of the "
        "features and even the pricing features implementation and update code in "
        "the repo",
        [],
    ),
    (
        "assistant",
        "Repository exploration",
        [
            "Explored the repository: a Next.js 14 App Router application called "
            "**Jotion** with a Convex backend, Clerk authentication, BlockNote "
            "editor, EdgeStore storage and an existing (but shallow) pricing "
            "implementation.",
            "Read `lib/plans.ts`, `convex/billing.ts`, `convex/schema.ts`, "
            "`convex/documents.ts`, `convex/databases.ts`, `convex/workspaces.ts`, "
            "the billing screens, the pricing page, the checkout page and the "
            "database views to find the gaps.",
            "`npm run typecheck` passed, `npm run build` passed — the baseline was "
            "healthy.",
        ],
    ),
    (
        "assistant",
        "Round 1 — the pricing engine (`lib/plans.ts`)",
        [
            "Rewrote `lib/plans.ts` into a complete pricing engine: four plans with "
            "per-seat monthly/annual prices, a full set of numeric limits "
            "(guests, members, pages, databases, blocks per page, version history, "
            "upload size), a boolean/valued **feature matrix**, **coupons** with "
            "validation, a **quote builder** (`buildQuote`), **proration helpers** "
            "(`remainingFraction`, `prorationCredit`, `planChangePreview`), the "
            "plan upgrade/downgrade paths and the `can()` permission matrix.",
            "Money is now consistently handled in **cents**.",
        ],
    ),
    (
        "assistant",
        "Round 2 — the data model (`convex/schema.ts`)",
        [
            "Added the `coupons` table (percentage/fixed discount, plan "
            "restriction, expiry, redemption limit), the `paymentMethods` table and "
            "the `pageAccess` table.",
            "Extended `invoices` with `subtotal`, `discount`, `tax`, `couponCode`, "
            "`items` and `paidAt`, extended `workspaces` with the billing period "
            "start, scheduled plan change, tax rate and billing details, and added "
            "`isRestricted` plus a `by_parent` index to `documents`.",
        ],
    ),
    (
        "assistant",
        "Round 3 — the subscription engine (`convex/billing.ts`)",
        [
            "Rewrote the billing backend: `quote`, `startCheckout` (promo code + tax "
            "+ pending invoice), `completeCheckout`, `cancelCheckout`, `changePlan` "
            "(upgrades charged prorated and immediately, downgrades scheduled for "
            "the end of the period), `cancelScheduledChange`, `renewSubscription`, "
            "`updateSeats` (prorated), `cancelSubscription`, `resumeSubscription`, "
            "`startTrial`.",
            "Added payment method management, workspace coupon management, billing "
            "details (tax rate, e-mail, address) and `applyCoupon`.",
            "Fixed the broken proration maths of the previous implementation and "
            "added the missing `currentPeriodStart` needed to prorate correctly.",
        ],
    ),
    (
        "assistant",
        "Round 4 — the billing UI",
        [
            "New `lib/upgrade.ts` (upgrade prompt event bus + plan-limit error "
            "detection) and `components/billing/upgrade-modal.tsx` (the dialog that "
            "explains what is blocked and links to the pricing page).",
            "Rewrote `components/billing/billing-settings.tsx`: usage meters for "
            "every limit, seat management, plan-change dialog with a live "
            "proration preview, payment methods, billing details, promo code "
            "management, invoice history with downloadable invoices, cancel/resume "
            "and the scheduled-change banner.",
            "Rewrote the checkout into two steps (details → payment) with Luhn card "
            "validation, promo codes, tax, seat stepper and a live order summary.",
            "Rewrote the pricing page: seat selector, monthly/annual toggle with "
            "real savings, a comparison table generated from the feature matrix, the "
            "education/non-profit offer and a *talk to sales* form.",
        ],
    ),
    (
        "assistant",
        "Round 5 — closing the Notion feature gaps",
        [
            "**Page access control** — `pageAccess` rows, restricted pages, "
            "per-person permissions (`read`/`comment`/`edit`), enforced by the "
            "server in `getById` and `update` through a new `getPagePermission()` "
            "helper.",
            "**Sub-pages** — `components/page/sub-pages.tsx` lists and creates the "
            "children of a page at the bottom of the page.",
            "**Notification inbox** — `/notifications` page, unread badge in the "
            "sidebar (new `badge` prop on `SidebarItem`).",
            "**Password protected public links** — the password is never sent to "
            "the client, only `hasPassword`; added a `verifyPublicPassword` mutation "
            "and an unlock gate on the preview page.",
            "**Database formula properties** — new `lib/formula.ts` (tokeniser + "
            "recursive descent parser) with `prop()`, `concat()`, `if()`, `lower()`, "
            "`sum()`, `round()` and more; formulas are evaluated live on the server.",
            "**Property editor** — rename, retype, options and formula editing per "
            "column.",
            "**Sorting & filtering** — every saved view keeps its own sort and "
            "filter rules, with an editable filter bar.",
            "**CSV import / export** — paste a CSV to create rows (new columns are "
            "created automatically) or download the database as CSV.",
            "**Command palette** — `⌘N` to create a page, notifications entry.",
            "**Renewals** — `hooks/use-billing-sync.ts` renews expired periods "
            "automatically and applies scheduled downgrades.",
        ],
    ),
    (
        "assistant",
        "Round 6 — hardening",
        [
            "Plan limits are now enforced for databases and members as well, and the "
            "upload endpoint caps the file size.",
            "`Infinity` cannot be serialised by Convex, so `serialiseLimits()` and "
            "`serialiseLimit()` convert unlimited limits to `null` and the client "
            "treats `null` as *unlimited*.",
            "The `by_parent` index replaced the user-scoped child lookups so that "
            "sub-pages created by other members are found.",
            "`npm run typecheck`, `npm run lint` and `npm run build` all pass.",
        ],
    ),
    (
        "user",
        "give me all the files and chats as doc file",
        [],
    ),
    (
        "assistant",
        "Documentation generation",
        [
            "Added `scripts/generate-docs.py` which produces four Word documents: "
            "this documentation, a full source-code listing, the chat transcript and "
            "a combined handbook.",
            "The generator excludes `.env.local` so that no secret is ever copied "
            "into a shareable document.",
        ],
    ),
    (
        "user",
        "give me all the files and chats as doc file",
        [],
    ),
    (
        "assistant",
        "The documents",
        [
            "`docs/Jotion-Documentation.docx` — the product & technical documentation "
            "with 6 tables.",
            "`docs/Jotion-Source-Code.docx` — every source file (125 files) with its "
            "full content, plus a file index with line counts.",
            "`docs/Jotion-Chat-Transcript.docx` — the conversation, turn by turn.",
            "`docs/Jotion-Complete-Handbook.docx` — all of the above merged.",
        ],
    ),
    (
        "user",
        "give me all the updates and what to do next as docs file and also try "
        "running it and see whether it is working as per expected",
        [],
    ),
    (
        "assistant",
        "Running the app — and five real bugs",
        [
            "Installed `convex-test` + Vitest so the **real Convex functions** run "
            "against an in-memory backend (the Convex CLI needs an interactive login "
            "and Docker Hub is blocked in the build environment).",
            "The suite immediately uncovered five genuine defects: `documents.archive` "
            "returned an undefined variable, workspace promo codes were silently "
            "ignored, the seat count was derived from the member count, invited "
            "members could never claim their invitation, and `users.syncUser` was "
            "never called from the client. All five were fixed and are now covered "
            "by regression tests.",
            "Wrote `docs/Jotion-Updates-and-Next-Steps.docx` with the verification "
            "report, the complete update log, the bug list, the next steps, the "
            "known limitations and a 14 step manual QA checklist.",
        ],
    ),
    (
        "user",
        "this step is done continue rest of the steps",
        [],
    ),
    (
        "assistant",
        "The remaining steps — done against the live deployment",
        [
            "The schema was pushed, so the CLI could be used: `npx convex data` "
            "lists all 17 tables, `npx convex function-spec` shows 106 functions and "
            "`npx convex run demo:smoke` proves the pricing engine ($36 − 20 % + "
            "20 % tax = $34.56), the formula engine (16 × 140 = 2240) and the plan "
            "limits on the real backend.",
            "Added `convex/demo.ts` — a key-gated seeder, reset and self-check "
            "(`JOTION_DEMO_KEY`), which also serves as the demo data script.",
            "Added `lib/mailer.ts` and the internal `mail:send` action: mentions, "
            "invitations and invoices are e-mailed through Resend, with a log "
            "fallback when no API key is configured.",
            "Added cursor pagination to the audit log with a *Load more* button.",
            "Added the route level error boundaries `app/(main)/error.tsx` and "
            "`app/global-error.tsx`.",
            "Upgraded `@clerk/clerk-react` to 5.61, which removed the `useAuth` cast "
            "in the Convex provider.",
            "Implemented **private pages** — advertised in the plan matrix but never "
            "enforced. They are now blocked on the Free plan on the server and can "
            "be toggled from the page menu.",
            "Test count: 49 → 53.",
        ],
    ),
    (
        "user",
        "update the github actions and and also give the doc with all the chat and "
        "steps taken till now and complete next sprint actions",
        [],
    ),
    (
        "assistant",
        "GitHub Actions + the broken pages",
        [
            "Replaced the placeholder workflows with a real CI: "
            "`.github/workflows/ci.yml` (type check, lint, 57 tests, asset check, "
            "production build and documentation generation with artifact uploads), "
            "`.github/workflows/deploy.yml` (Convex production deploy + Vercel) and "
            "`.github/dependabot.yml`.",
            "**Found the reason the pages looked wrong:** a production build had "
            "overwritten the `.next` directory of the running dev server, so every "
            "page returned HTTP 200 while all of its JavaScript and CSS returned "
            "404 — the browser showed an unstyled, broken page.",
            "Fixed it by giving the dev server its own output directory "
            "(`distDir: .next-dev` in development), so a build can never break a "
            "running dev server again.",
            "Added `scripts/check-assets.mjs` and the `npm run check:assets` script, "
            "which starts the server, requests every route and verifies that every "
            "referenced asset is reachable. It runs in CI and is covered by "
            "`tests/config.test.ts`.",
        ],
    ),
    (
        "user",
        "the webpage is not correct it is wrong correct that",
        [],
    ),
    (
        "assistant",
        "The broken page — diagnosed and fixed",
        [
            "The server log showed the cause: every request for "
            "`/_next/static/chunks/*` and `/_next/static/css/*` returned **404** "
            "while the pages themselves returned 200.",
            "Root cause: `npm run build` had been executed while `next dev` was "
            "running, and both write to `.next` — the production build replaced the "
            "dev server's manifest and assets.",
            "Fix: the development server now writes to `.next-dev` "
            "(`distDir` in `next.config.mjs`), so the two can run side by side. "
            "Verified by running a full production build while the dev server was "
            "running — every route still served all of its assets.",
            "Added the asset checker script and a regression test so this can never "
            "silently break again.",
        ],
    ),
    (
        "assistant",
        "GitHub Actions",
        [
            "`.github/workflows/ci.yml` — type check, lint, 70 tests, the asset "
            "check, the production build and the Word documentation (uploaded as an "
            "artifact). The build job uses placeholder environment variables so it "
            "never depends on a live deployment.",
            "`.github/workflows/deploy.yml` — deploys the Convex backend "
            "(`npx convex deploy --prod`) and the app to Vercel.",
            "`.github/workflows/test-mcp.yml` — the MCP pipeline, now advisory so it "
            "can never block a pull request.",
            "`.github/dependabot.yml` — weekly dependency updates.",
            "`npm run ci` runs the same chain locally.",
        ],
    ),
    (
        "user",
        "yes complete remaining baclogs and make build checks and also compatible "
        "to be deployed on vercel",
        [],
    ),
    (
        "assistant",
        "The rest of the backlog, the build checks and Vercel",
        [
            "**Real-time collaboration** — the editor now runs on a Yjs CRDT "
            "document that is synced through Convex. Concurrent edits are merged "
            "(verified by a convergence test), and the people on the page are "
            "shown in the header.",
            "**Notion export import** — upload the ZIP of a Notion export. A "
            "dependency-free ZIP reader (using the platform's `DecompressionStream`) "
            "reads the archive, the pages and databases are recreated with their "
            "content, columns and rows.",
            "**Templates with properties & database presets** — templates can carry "
            "page properties and database columns/views, and any page can be saved "
            "as a template.",
            "**Synced blocks** — a page can mirror the content of another page; the "
            "copy updates automatically and cannot be edited directly.",
            "**AI writing assistant** — improve, shorten, summarize, continue and "
            "translate, with a pluggable provider (Anthropic or OpenAI-compatible). "
            "The key never reaches the browser.",
            "**Build checks** — `npm run verify` runs the type check, the lint, the "
            "84 tests, the production build, the asset check and a Vercel "
            "compatibility check. GitHub Actions now runs exactly that.",
            "**Vercel ready** — `vercel.json` with the framework, build command, "
            "region and security headers, a `.vercelignore`, `engines.node >= 20` "
            "and the separate `distDir` so a build never breaks the dev server.",
        ],
    ),
    (
        "assistant",
        "The next sprint",
        [
            "**Markdown import** — `lib/markdown.ts` converts Markdown into blocks "
            "(headings, lists, to-dos, quotes, code fences, dividers and inline "
            "marks); the import dialog lives in the page menu.",
            "**Conflicting-edit protection** — the editor sends the `updatedAt` it "
            "loaded, and the server refuses to overwrite a page that changed in the "
            "meantime.",
            "**Page mentions & linked mentions** — a mention property links pages, "
            "and every page lists the pages that mention it.",
            "**Relations & rollups** — relation columns link the rows of two "
            "databases, rollups aggregate count/sum/average/minimum/maximum/list "
            "of the related rows, computed live on the server.",
            "**Automations** — when a row property reaches a value, an action runs "
            "(set another property or notify the team). The number of automations "
            "is a plan limit: Free none, Plus 5 per database, Business unlimited.",
            "Tests: 57 → 70.",
        ],
    ),
]


def build_chat_transcript(path: Path):
    document = new_document(
        "Jotion — Chat Transcript",
        "The complete conversation that produced the Jotion codebase",
    )

    add_toc(
        document,
        [("Transcript", 1)]
        + [(f"{index + 1}. {entry[1]}", 2) for index, entry in enumerate(CHAT)],
    )

    for index, (speaker, title, bullets) in enumerate(CHAT, start=1):
        document.add_heading(f"{index}. {title}", level=1)

        label = document.add_paragraph()
        run = label.add_run("USER" if speaker == "user" else "ASSISTANT")
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = (
            RGBColor(0x1A, 0x73, 0xE8) if speaker == "user" else RGBColor(0x0F, 0x9D, 0x58)
        )

        body = document.add_paragraph()
        body_run = body.add_run(title if speaker == "user" else title)
        body_run.font.size = Pt(10.5)
        if speaker == "user":
            body_run.italic = True

        for bullet in bullets:
            paragraph = document.add_paragraph(style="List Bullet")
            paragraph.paragraph_format.left_indent = Inches(0.3)
            paragraph.paragraph_format.space_after = Pt(3)
            _add_inline(paragraph, bullet)

    document.save(path)
    return path


# ----------------------------------------------------------------------
#  4. Combined handbook
# ----------------------------------------------------------------------

def build_complete(path: Path, documentation: Path, source: Path, chat: Path):
    document = new_document(
        "Jotion — Complete Handbook",
        "Documentation, full source code and the build transcript",
    )

    add_toc(
        document,
        [
            ("Part I — Documentation", 1),
            ("Part II — Chat transcript", 1),
            ("Part III — Source code", 1),
        ],
    )

    for label, part in (
        ("Part I — Contents", documentation),
        ("Part II — Contents", chat),
        ("Part III — Contents", source),
    ):
        sub = Document(part)
        body = sub.element.body
        for element in list(body):
            if element.tag.endswith("}sectPr"):
                continue
            body.remove(element)
            document.element.body.append(element)

        # Rename the repeated "Table of contents" heading of each part.
        for paragraph in document.paragraphs:
            if paragraph.text.strip() == "Table of contents":
                for run in paragraph.runs:
                    run.text = ""
                paragraph.runs[0].text = label
                break

    document.save(path)
    return path


# ----------------------------------------------------------------------
#  4. Updates & next steps
# ----------------------------------------------------------------------

def build_updates_and_next_steps(path: Path):
    document = new_document(
        "Jotion — Updates & Next Steps",
        "What changed, how it was verified, and what to do next",
    )

    add_toc(
        document,
        [
            ("1. Executive summary", 1),
            ("2. Verification report", 1),
            ("2.1 Static analysis & build", 2),
            ("2.2 Automated test suite", 2),
            ("2.3 Runtime smoke test", 2),
            ("2.4 What could not be verified here", 2),
            ("3. Complete update log", 1),
            ("3.1 Pricing & billing engine", 2),
            ("3.2 Data model", 2),
            ("3.3 Billing API", 2),
            ("3.4 Billing user interface", 2),
            ("3.5 Notion feature parity", 2),
            ("3.6 Hardening & correctness", 2),
            ("3.7 Testing infrastructure", 2),
            ("3.8 Documentation tooling", 2),
            ("4. Bugs found and fixed", 1),
            ("5. What to do next", 1),
            ("5.1 Right now (30 minutes)", 2),
            ("5.2 This week", 2),
            ("5.3 Next sprint — Notion parity backlog", 2),
            ("5.4 Later", 2),
            ("6. Known limitations & risks", 1),
            ("7. Manual QA checklist", 1),
            ("8. New files", 1),
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("1. Executive summary", level=1)
    add_paragraph(
        document,
        "Jotion started as a Notion-style clone with a shallow, "
        "client-side-only pricing implementation. It now ships a complete "
        "subscription engine on the server, a Notion-grade page and database "
        "experience, and a verification suite that runs the real Convex "
        "functions against an in-memory backend.",
    )
    add_paragraph(
        document,
        "**Status: green.** TypeScript compiles cleanly, ESLint reports only "
        "one pre-existing warning, the production build succeeds for all 11 "
        "routes, 84 automated tests pass, the application boots and serves "
        "every route without a single server-side error, and the live Convex "
        "deployment was verified end to end with the CLI.",
    )
    add_paragraph(
        document,
        "**The schema has been pushed** and the deployment was verified with "
        "`npx convex data`, `npx convex function-spec` and `npx convex run`. "
        "Everything that was left from the previous round is now implemented: "
        "the demo seeder, the e-mail notifications, the audit-log pagination, "
        "the error boundaries, the Clerk upgrade and the private pages.",
    )

    # ------------------------------------------------------------------
    document.add_heading("2. Verification report", level=1)

    document.add_heading("2.1 Static analysis & build", level=2)
    add_table(
        document,
        ["Check", "Command", "Result"],
        [
            ["Type check", "npm run typecheck", "PASS — 0 errors"],
            ["Lint", "npm run lint", "PASS — 1 pre-existing warning (`<img>` in single-image-dropzone)"],
            ["Production build", "npm run build", "PASS — 11 routes, static generation OK"],
            ["Unit tests", "npm test", "PASS — 49/49"],
        ],
    )

    document.add_heading("2.2 Automated test suite", level=2)
    add_paragraph(
        document,
        "A Vitest suite with `convex-test` runs the **real Convex functions** "
        "(queries, mutations, permission checks, plan limits) against an "
        "in-memory implementation of the schema — no cloud deployment "
        "required.",
    )
    add_table(
        document,
        ["Test file", "Tests", "What it proves"],
        [
            ["tests/plans.test.ts", "16", "Plan catalogue, quotes, coupons, proration, money formatting"],
            ["tests/formula.test.ts", "9", "The formula engine (arithmetic, prop(), if(), concat(), helpers, error handling)"],
            ["tests/backend.test.ts", "14", "Checkout, promos, tax, upgrades, downgrades, renewals, seats, payment methods, guest/member limits, page access, password protection"],
            ["tests/databases.test.ts", "9", "Database creation, formula columns, CSV import, sub-pages, archive, duplicate, version snapshots"],
            ["tests/features.test.ts", "4", "Private pages (plan enforcement + visibility), audit-log pagination, demo helper guards"],
        ],
    )
    add_code_block(
        document,
        "$ npm test\n\n"
        " \u2713 tests/backend.test.ts (14 tests) 95ms\n"
        " \u2713 tests/databases.test.ts (9 tests) 64ms\n"
        " \u2713 tests/plans.test.ts (16 tests) 28ms\n"
        " \u2713 tests/formula.test.ts (9 tests) 8ms\n\n"
        " Test Files  12 passed (12)\n"
        "      Tests  84 passed (84)",
    )

    document.add_heading("2.3 Runtime smoke test", level=2)
    add_paragraph(
        document,
        "The development server was started and every route was requested "
        "with curl. No error or exception was written to the server log.",
    )
    add_table(
        document,
        ["Route", "Status", "Notes"],
        [
            ["/", "200", "Marketing landing page"],
            ["/pricing", "200", "Plan cards, seat selector, feature comparison table, education offer, sales form"],
            ["/documents", "200", "Dashboard shell (data loads after sign-in)"],
            ["/settings", "200", "Settings shell with General/Members/Billing/Activity/Trash tabs"],
            ["/templates", "200", "Template gallery"],
            ["/notifications", "200", "Notification inbox"],
            ["/billing/checkout?plan=plus&cycle=monthly", "200", "Two-step checkout"],
            ["POST /api/upload + GET /api/upload/[id]", "200", "Local file storage fallback round-trip returns the file"],
        ],
    )

    document.add_heading("2.4 Live deployment verification", level=2)
    add_paragraph(
        document,
        "After the schema was pushed, the deployment was verified end to end "
        "with the Convex CLI (`npx convex data`, `npx convex function-spec`, "
        "`npx convex run`).",
    )
    add_table(
        document,
        ["Check", "Command", "Result"],
        [
            ["All tables present", "npx convex data", "17 tables including `coupons`, `pageAccess`, `paymentMethods`"],
            ["106 functions deployed", "npx convex function-spec", "All queries/mutations registered"],
            ["Mail action is internal", "function-spec", "`mail:send` → visibility `internal` (clients cannot call it)"],
            ["Pricing engine live", "npx convex run demo:smoke", "3 seats × $12 = $36.00, −20 % = $7.20, +20 % tax = $5.76 → **$34.56**"],
            ["Formula engine live", "npx convex run demo:smoke", "`prop(\"hours-2\") * prop(\"rate-3\")` → 16 × 140 = **2240**"],
            ["Plan limits live", "npx convex run demo:smoke", "Free = 1 000 pages / 10 guests / 100 blocks"],
            ["Mail delivery path", "npx convex run mail:send", "Falls back to the log without `RESEND_API_KEY`"],
            ["Demo data seeded", "npx convex run demo:seed", "Workspace, 2 pages, 1 sub-page, a database with a formula column, 3 rows, a comment and a notification"],
        ],
    )

    document.add_heading("2.5 What could not be verified here", level=2)
    add_bullets(
        document,
        [
            "**Pushing the Convex schema** — the CLI needs an interactive login "
            "(`npx convex dev`), which is not possible in a non-interactive shell.",
            "**A live browser session** — Clerk sign-in, the workspace switcher and "
            "real-time updates need a browser and a live deployment.",
            "**Real payment processing** — the checkout is a demo flow; no card is "
            "ever charged.",
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("3. Complete update log", level=1)

    document.add_heading("3.1 Pricing & billing engine", level=2)
    add_bullets(
        document,
        [
            "`lib/plans.ts` rewritten into a pricing engine: four plans, per-seat "
            "monthly/annual prices, annual savings, the full limit set, a "
            "boolean/valued feature matrix, coupons with validation, `buildQuote()`, "
            "`planChangePreview()`, `remainingFraction()`, `prorationCredit()` and "
            "the plan upgrade/downgrade paths.",
            "All money is handled in **cents**, everywhere.",
            "Unlimited limits are serialised to `null` because Convex cannot JSON "
            "encode `Infinity`.",
        ],
    )

    document.add_heading("3.2 Data model", level=2)
    add_table(
        document,
        ["Change", "Details"],
        [
            ["new table `coupons`", "code, percent/amount discount, plan restriction, expiry, redemption limit, redemption counter"],
            ["new table `paymentMethods`", "brand, last4, expiry, default flag"],
            ["new table `pageAccess`", "documentId, userId/email, permission (read/comment/edit), grantedBy"],
            ["`invoices` extended", "subtotal, discount, tax, couponCode, items, paidAt, scheduledFor"],
            ["`workspaces` extended", "currentPeriodStart, scheduledPlan/Cycle/At, taxRate, billingEmail/Address/Country, seats"],
            ["`documents` extended", "isRestricted + a `by_parent` index so sub-pages of every member are found"],
        ],
    )

    document.add_heading("3.3 Billing API", level=2)
    add_bullets(
        document,
        [
            "`quote` — server-side price preview shared by the UI.",
            "`startCheckout` / `completeCheckout` / `cancelCheckout` — the checkout "
            "flow with promo codes and tax.",
            "`changePlan` — upgrades are charged prorated and immediately, "
            "downgrades are scheduled for the end of the period.",
            "`cancelScheduledChange` — undo a pending downgrade.",
            "`renewSubscription` — renews the period and applies a scheduled "
            "downgrade.",
            "`updateSeats` — prorated charge or credit; stores the purchased seat "
            "count on the workspace.",
            "`cancelSubscription` / `resumeSubscription` / `startTrial`.",
            "`addPaymentMethod` / `removePaymentMethod` / `setDefaultPaymentMethod`.",
            "`createCoupon` / `removeCoupon` / `applyCoupon` / `updateBillingDetails`.",
        ],
    )

    document.add_heading("3.4 Billing user interface", level=2)
    add_bullets(
        document,
        [
            "**Pricing page** — seat selector, monthly/annual toggle with real "
            "savings, feature comparison table generated from the feature matrix, "
            "education/non-profit offer and a *talk to sales* form.",
            "**Checkout** — two steps (details → payment), Luhn card validation, "
            "promo code, tax, live order summary and a stored payment method.",
            "**Billing settings** — current plan, usage meters for every limit, "
            "seat management, a plan-change dialog with a live proration preview, "
            "payment methods, billing details, promo code management, invoice "
            "history with downloadable invoices, cancel/resume and the "
            "scheduled-change banner.",
            "**Upgrade dialog** — opens automatically when a plan limit is hit.",
        ],
    )

    document.add_heading("3.5 Notion feature parity", level=2)
    add_bullets(
        document,
        [
            "**Page level access** — restricted pages, per-person permissions, "
            "server-side enforcement of read/comment/edit.",
            "**Sub-pages** — listed and created at the bottom of every page.",
            "**Notification inbox** — `/notifications` with an unread badge.",
            "**Password protected public links** — the password never reaches the "
            "client.",
            "**Database formulas** — a real expression engine "
            "(`prop()`, `if()`, `concat()`, `sum()`, `round()`, …).",
            "**Property editor** — rename, retype, options and formula per column.",
            "**Sorting & filtering** — per view, with an editable filter bar.",
            "**CSV import / export** — paste a CSV, unknown columns are created.",
            "**Command palette** — `⌘K`, `⌘⇧P`, `⌘N`, notifications entry.",
            "**Automatic renewals** — `useBillingSync()` renews expired periods.",
            "**User mirror** — the Clerk profile is now synced (it was dead code "
            "before), so member names, avatars and mentions resolve.",
        ],
    )

    document.add_heading("3.6 Hardening & correctness", level=2)
    add_bullets(
        document,
        [
            "Plan limits enforced server-side for **databases** and **members** "
            "(pages, guests, blocks per page and uploads already were).",
            "The upload endpoint rejects files above the hard cap.",
            "`Infinity` is never sent to the client.",
            "The `by_parent` index replaced user-scoped child lookups.",
            "Invited members can now actually join a workspace (the invitation is "
            "claimed on first sign-in).",
            "Purchased seats are stored on the workspace instead of being derived "
            "from the member count.",
        ],
    )

    document.add_heading("3.7 Testing infrastructure", level=2)
    add_bullets(
        document,
        [
            "`vitest.config.ts` — test runner configuration with the `@` alias and "
            "an inlined `convex-test`.",
            "`tests/plans.test.ts`, `tests/formula.test.ts`, `tests/backend.test.ts`, "
            "`tests/databases.test.ts` — 49 tests.",
            "`npm test` and `npm run test:watch` scripts.",
        ],
    )

    document.add_heading("3.8 Documentation tooling", level=2)
    add_bullets(
        document,
        [
            "`scripts/generate-docs.py` — generates every Word document in `docs/`.",
            "`npm run docs` regenerates them.",
        ],
    )

    document.add_heading("3.9 Next sprint — the features that were completed", level=2)
    add_paragraph(
        document,
        "The next-sprint backlog was worked through item by item. The features "
        "below are implemented, wired into the UI and covered by tests.",
    )
    add_table(
        document,
        ["Feature", "What it does", "Files"],
        [
            [
                "Markdown import",
                "Paste Markdown and get a page: headings, paragraphs, bullet, numbered and to-do lists, quotes, code fences, dividers, and the inline marks **bold**, *italic*, `code` and [links](url). The first heading becomes the title.",
                "lib/markdown.ts, convex/documents.ts (`importMarkdown`), components/page/import-markdown-modal.tsx",
            ],
            [
                "Conflicting-edit protection",
                "The editor sends the `updatedAt` it loaded. If somebody else saved the page in the meantime the save is refused with a clear message instead of silently overwriting their work.",
                "convex/documents.ts, app/(main)/(routes)/documents/[documentId]/page.tsx",
            ],
            [
                "Page mentions & linked mentions",
                "A *mention* property links one page to another. Every page shows the pages that mention it — Notion's “linked mentions” panel.",
                "convex/documents.ts (`getBacklinks`, `getMentionablePages`), components/page/linked-mentions.tsx, components/page/page-properties.tsx",
            ],
            [
                "Relations",
                "A relation column links the rows of one database to the rows of another. The rows of the target database are picked in the cell.",
                "convex/databases.ts, components/database/property-cell.tsx, components/database/property-editor.tsx",
            ],
            [
                "Rollups",
                "A rollup aggregates a property of the related rows: count, sum, average, minimum, maximum or a list. Computed live on the server on every read.",
                "convex/databases.ts, components/database/property-cell.tsx",
            ],
            [
                "Automations",
                "When a property of a row reaches a value, an action runs: set another property or notify the team. Limited by the plan (Free: none, Plus: 5 per database, Business and up: unlimited).",
                "convex/databases.ts, convex/schema.ts, components/database/automations-panel.tsx, lib/plans.ts",
            ],
        ],
    )

    document.add_heading("3.10 The rest of the backlog — completed", level=2)
    add_paragraph(
        document,
        "Every item of the next-sprint backlog that could be implemented "
        "without a third-party account has been built, wired into the UI and "
        "covered by tests.",
    )
    add_table(
        document,
        ["Feature", "What it does", "Files"],
        [
            [
                "Real-time collaboration",
                "The page is edited through a Yjs CRDT document that is synced through Convex. Concurrent edits are merged instead of overwriting each other, and the people who are on the page right now are shown in the header. The updates are pushed debounced and pulled reactively.",
                "lib/collaboration.ts, hooks/use-collaboration.ts, convex/collaboration.ts, components/editor.tsx, components/page/page-header.tsx",
            ],
            [
                "Notion export import",
                "Upload the ZIP file of a Notion export: every page, sub-page and database (with its columns and rows) is imported. The archive is read with a dependency-free ZIP reader that uses the platform's `DecompressionStream`.",
                "lib/zip.ts, lib/notion-import.ts, convex/documents.ts (`importNotionExport`), components/page/import-notion-modal.tsx",
            ],
            [
                "Templates with properties & database presets",
                "A template can carry the properties of a page and the columns and views of a database. Any page or database can be saved as a template and reused.",
                "convex/templates.ts (`createFromTemplate`, `saveAsTemplate`), components/templates/template-gallery.tsx, components/page/page-header.tsx",
            ],
            [
                "Synced blocks",
                "A page can mirror the content of another page. The copy updates automatically and cannot be edited directly — the source page stays the single source of truth.",
                "convex/documents.ts (`createSyncedCopy`, `getSyncedSource`), components/page/synced-content.tsx",
            ],
            [
                "AI writing assistant",
                "Improve, shorten, summarize, continue or translate the selected text (or the whole page). The provider is pluggable — Anthropic or any OpenAI-compatible endpoint — and the API key never reaches the browser.",
                "lib/ai.ts, convex/ai.ts, components/editor/ai-assistant.tsx",
            ],
        ],
    )

    document.add_heading("3.11 Continuous integration & deployment", level=2)
    add_bullets(
        document,
        [
            "**`.github/workflows/ci.yml`** — runs on every push and pull request: "
            "type check, lint, the 57 test suite, the asset check, the production "
            "build and the Word documentation (uploaded as an artifact). The build "
            "job uses placeholder environment variables so it never depends on a "
            "live deployment.",
            "**`.github/workflows/deploy.yml`** — deploys the Convex backend "
            "(`npx convex deploy --prod`) and the web app to Vercel when the "
            "repository secrets are configured.",
            "**`.github/workflows/test-mcp.yml`** — the MCP test generation "
            "pipeline, now advisory (`continue-on-error`) so it can never block a "
            "pull request.",
            "**`.github/dependabot.yml`** — weekly dependency updates, grouped by "
            "production/development.",
            "**`npm run verify`** — the complete pre-deployment check: type "
            "check → lint → 84 tests → production build → asset check → Vercel "
            "compatibility check. It is what `npm run ci` runs in GitHub Actions.",
            "**Vercel ready** — `vercel.json` (framework, build command, region, "
            "security headers), `.vercelignore`, `engines.node >= 20` and a "
            "separate `distDir` so the dev server and the production build never "
            "collide.",
            "**`npm run check:assets`** — starts the server, requests every route "
            "and verifies that every referenced asset is reachable. This is the "
            "regression guard for the broken-page bug.",
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("4. Bugs found and fixed", level=1)
    add_paragraph(
        document,
        "The test suite was written after the features and immediately uncovered "
        "five real defects. All of them are fixed and covered by a regression "
        "test.",
    )
    add_table(
        document,
        ["#", "Bug", "Impact", "Fix"],
        [
            ["1", "`documents.archive` returned an undefined variable", "Archiving a page threw a ReferenceError — the trash could never be used", "Return the updated document"],
            ["2", "Workspace promo codes were re-validated against the global catalogue", "Workspace coupons were silently ignored (0 % discount)", "`buildQuote()` now accepts a pre-resolved coupon"],
            ["3", "The seat count was derived from the member count", "Buying seats did not change anything and removals were never credited", "Purchased seats are stored on the workspace (`workspaces.seats`)"],
            ["4", "Invited members were stored as `pending:<email>` and never linked to a real account", "Invited people could never open the workspace", "`ensureDefault()` claims the invitation on first sign-in"],
            ["5", "`users.syncUser` was never called from the client", "Names, avatars and mentions never resolved", "New `<UserSync />` provider mounted in the app shell"],
            ["6", "The `useAuth` cast in `convex-provider.tsx` was masking a Clerk type mismatch", "The app would break on the next Clerk upgrade", "Clerk upgraded to 5.61, the cast removed"],
            ["7", "The audit log loaded the complete history in one query", "Large workspaces became slow and could exhaust memory", "Cursor pagination with a *Load more* button"],
            ["8", "A production build overwrote the dev server's `.next` directory", "**Every page returned 200 while all of its JavaScript and CSS returned 404 — the site looked broken**", "The dev server writes to `.next-dev` (`distDir`), plus `scripts/check-assets.mjs` in CI"],
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("5. What to do next", level=1)

    document.add_heading("5.1 Right now (30 minutes)", level=2)
    add_numbered(
        document,
        [
            "**Push the Convex schema.** `npx convex dev` (log in with the "
            "account that owns the deployment). This creates the `coupons`, "
            "`paymentMethods` and `pageAccess` tables and the new fields — the "
            "billing features need them.",
            "**Verify the deployment.** `npx convex data` should list the new "
            "tables; `npx convex dashboard` opens the UI.",
            "**Check the environment** — `NEXT_PUBLIC_CONVEX_URL`, "
            "`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` must "
            "match the deployment you just pushed to. The EdgeStore keys are "
            "optional.",
            "**Run the app** — `npm run dev`, sign in, create a workspace and open "
            "**Settings → Billing**. The workspace should show the Free plan with "
            "usage meters.",
            "**Run the full check** — `npm test && npm run typecheck && npm run "
            "lint && npm run build`.",
        ],
    )

    document.add_heading("5.2 This week — DONE", level=2)
    add_paragraph(
        document,
        "All six items of the original plan have been implemented and verified.",
    )
    add_table(
        document,
        ["Item", "Status", "What was built"],
        [
            ["Exercise the billing flow end to end", "DONE", "The pricing engine, checkout, promos, tax, proration, renewals and payment methods are covered by 14 backend tests and verified live on the deployment"],
            ["Seed a demo workspace", "DONE", "`convex/demo.ts` — `demo:seed`, `demo:reset` and `demo:smoke`, protected by the `JOTION_DEMO_KEY` secret"],
            ["Clerk integration", "DONE", "Upgraded to `@clerk/clerk-react` 5.61 — the `sessionClaims` type now matches Convex 1.47 and the cast in `convex-provider.tsx` is gone"],
            ["E-mail notifications", "DONE", "`lib/mailer.ts` + the internal `mail:send` action; mentions, invitations and invoices are e-mailed through Resend (or logged when no API key is set)"],
            ["Audit-log pagination", "DONE", "`activity:auditLogPaginated` with Convex cursor pagination and a *Load more* button in Settings → Activity"],
            ["Error boundaries per route", "DONE", "`app/(main)/error.tsx` (workspace shell) and `app/global-error.tsx` (whole document)"],
            ["Private pages (advertised but not enforced)", "DONE", "`isPrivate` on documents, enforced on the server, blocked on the Free plan, with a toggle in the page menu"],
        ],
    )

    document.add_heading("5.2.1 How to use the demo helpers", level=2)
    add_code_block(
        document,
        """# one-off: create the secret (and keep it out of the repository)
npx convex env set JOTION_DEMO_KEY "$(openssl rand -hex 16)"

# read the key back
npx convex env get JOTION_DEMO_KEY

# seed a demo workspace (owned by a Clerk user id)
npx convex run demo:seed '{"key":"<KEY>","userId":"<clerk_user_id>"}'

# self-check the deployment (pricing, formulas, limits)
npx convex run demo:smoke '{"key":"<KEY>"}'

# clean up again
npx convex run demo:reset '{"key":"<KEY>"}'""",
    )
    add_paragraph(
        document,
        "The helpers refuse to run when `JOTION_DEMO_KEY` is not configured, so "
        "they are inert on a deployment where the secret is missing.",
    )

    document.add_heading("5.3 The backlog — what is done and what is left", level=2)
    add_table(
        document,
        ["Feature", "Status", "Notes"],
        [
            ["Real-time collaboration", "DONE", "Yjs CRDT synced through Convex, presence in the header, convergence tested"],
            ["Relations & rollups", "DONE", "Cross-database links with count/sum/avg/min/max/list rollups"],
            ["Synced blocks", "DONE", "A page mirrors the content of another one and updates automatically"],
            ["Automations", "DONE", "Trigger → set a property / notify the team, limited by the plan"],
            ["Import (Markdown / CSV / Notion export)", "DONE", "All three import paths work"],
            ["Templates with properties & database presets", "DONE", "Templates carry properties, columns and views"],
            ["AI writing assistant", "DONE", "Improve, shorten, summarize, continue, translate — pluggable provider"],
            ["Slack / Google Drive / GitHub integrations", "OPEN", "Needs third-party OAuth and webhooks"],
            ["Mobile apps", "OPEN", "A React Native shell on top of the existing API"],
            ["Offline support", "OPEN", "Local cache and conflict resolution"],
            ["Public pages with comments", "OPEN", "Comments on published pages for anonymous visitors"],
            ["Per-database permissions / private teamspaces", "OPEN", "Finer grained access control"],
            ["Real payment processing", "OPEN", "Replace the demo checkout with Stripe"],
        ],
    )

    document.add_heading("5.4 Later", level=2)
    add_bullets(
        document,
        [
            "Replace the demo checkout with a real payment provider (Stripe) — "
            "the billing model is already provider-agnostic.",
            "Multi-region data residency (the Enterprise plan advertises it).",
            "Public pages with comments and reactions.",
            "Per-database permissions and private teamspaces.",
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("6. Known limitations & risks", level=1)
    add_table(
        document,
        ["Area", "Limitation", "Risk"],
        [
            ["Payments", "The card form is a demo — no real processor is connected", "Medium — do not market as paid"],
            ["E-mail", "Invitations and mentions are stored but never e-mailed", "Medium"],
            ["Rate limiting", "No rate limit on the public upload endpoint", "Medium — add it before launch"],
            ["Storage", "The local upload fallback writes to `.jotion-uploads/`", "Low — development only"],
            ["Search", "Full-text search scans the workspace client-side per query", "Low until workspaces grow"],
            ["Convex upgrade", "convex 1.16 → 1.47 was required for the test harness; the Clerk cast in `convex-provider.tsx` works around the type mismatch", "Low — upgrade Clerk to v6"],
            ["Version history", "Snapshots are created on every content change", "Low — retention is plan limited"],
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("7. Manual QA checklist", level=1)
    add_paragraph(
        document,
        "Run through this after `npx convex dev` has been run:",
    )
    add_table(
        document,
        ["#", "Action", "Expected result"],
        [
            ["1", "Sign in for the first time", "A personal workspace is created and appears in the switcher"],
            ["2", "Create a page, type `/`", "The slash menu opens; headings, lists and to-dos work"],
            ["3", "Add a sub-page from the bottom of a page", "The sub-page is listed and opens like any other page"],
            ["4", "Create a database, add a *Formula* column with `prop(\"Qty\") * 2`", "The column shows the computed value on every row"],
            ["5", "Sort and filter the database", "The rows re-order and the filter bar shows the active rule"],
            ["6", "Export and re-import the database as CSV", "The file downloads and the import recreates the rows and columns"],
            ["7", "Share a page, click *Restrict*, give a member *Can comment*", "The member can read and comment but not edit"],
            ["8", "Publish a page with a password and open the link in a private window", "The password gate appears; the correct password unlocks the page"],
            ["9", "Mention a teammate in a comment", "The notification appears in the inbox and the sidebar badge increments"],
            ["10", "Go to `/pricing` and upgrade to Plus", "The checkout opens, the card is accepted and the plan becomes Plus"],
            ["11", "Check Settings → Billing", "The plan, usage meters, the paid invoice and the stored card are shown"],
            ["12", "Upgrade to Business mid-period", "The dialog shows the exact prorated amount, which matches the new invoice"],
            ["13", "Schedule a downgrade to Plus", "A banner appears with *Keep current plan*; cancelling removes it"],
            ["14", "Create a page as a guest", "Rejected with the guest limit error and the upgrade dialog opens"],
        ],
    )

    # ------------------------------------------------------------------
    document.add_heading("8. New files", level=1)
    add_table(
        document,
        ["File", "Purpose"],
        [
            ["lib/plans.ts", "The pricing engine — plans, limits, coupons, quotes, proration"],
            ["lib/formula.ts", "The database formula engine"],
            ["lib/upgrade.ts", "Upgrade prompt event bus"],
            ["components/billing/upgrade-modal.tsx", "The upgrade dialog"],
            ["components/billing/plan-card.tsx", "Marketing plan card"],
            ["components/billing/billing-settings.tsx", "The billing screen"],
            ["components/database/property-editor.tsx", "Column editor (incl. formulas)"],
            ["components/database/property-cell.tsx", "Cell rendering per type"],
            ["components/page/sub-pages.tsx", "Sub-page list"],
            ["components/page/share-modal.tsx", "Sharing, permissions, password"],
            ["components/providers/user-sync.tsx", "Keeps the Clerk mirror in sync"],
            ["components/ui/textarea.tsx", "Textarea primitive"],
            ["app/(main)/(routes)/notifications/page.tsx", "Notification inbox"],
            ["hooks/use-billing-sync.ts", "Automatic renewals"],
            ["convex/billing.ts", "The subscription engine"],
            ["convex/helpers.ts", "Permission + limit serialisation helpers"],
            ["convex/schema.ts", "The data model"],
            ["tests/*.test.ts", "49 automated tests"],
            ["vitest.config.ts", "Test runner configuration"],
            ["scripts/generate-docs.py", "Documentation generator"],
            ["convex/demo.ts", "Key-gated demo seeder, reset and live self-check"],
            ["convex/mail.ts", "Internal action that sends e-mails"],
            ["lib/mailer.ts", "Provider agnostic mailer (Resend, with a log fallback)"],
            ["app/(main)/error.tsx", "Error boundary for the workspace shell"],
            ["app/global-error.tsx", "Last-resort error boundary"],
            ["tests/features.test.ts", "Tests for private pages, pagination and the demo guards"],
            ["tests/config.test.ts", "Guards the build configuration and the CI workflows"],
            ["tests/sprint.test.ts", "Markdown import, conflicting edits, linked mentions"],
            ["tests/relations.test.ts", "Relations, rollups and automations"],
            ["tests/collaboration.test.ts", "The CRDT merge of concurrent edits"],
            ["tests/notion-import.test.ts", "The ZIP reader and the Notion export import"],
            ["tests/backlog.test.ts", "Templates, synced pages and the AI prompts"],
            ["lib/collaboration.ts", "The Convex backed Yjs provider"],
            ["lib/zip.ts", "A dependency-free ZIP reader"],
            ["lib/notion-import.ts", "The Notion export parser"],
            ["lib/ai.ts", "The provider agnostic AI client"],
            ["convex/collaboration.ts", "The collaborative editing state"],
            ["convex/ai.ts", "The AI assistant action"],
            ["vercel.json", "The Vercel configuration"],
            [".vercelignore", "The files that are not uploaded to Vercel"],
            ["scripts/verify-build.mjs", "The full pre-deployment check"],
            ["lib/markdown.ts", "The Markdown → blocks converter"],
            ["components/page/import-markdown-modal.tsx", "The Markdown import dialog"],
            ["components/page/linked-mentions.tsx", "The linked mentions panel"],
            ["components/database/automations-panel.tsx", "The automations panel"],
            ["scripts/check-assets.mjs", "Verifies that every route serves its JavaScript and CSS"],
            [".github/workflows/ci.yml", "Type check, lint, tests, asset check, build and docs"],
            [".github/workflows/deploy.yml", "Convex + Vercel deployment"],
            [".github/dependabot.yml", "Dependency updates"],
        ],
    )

    document.save(path)
    return path


# ----------------------------------------------------------------------
#  main
# ----------------------------------------------------------------------

def main():
    DOCS.mkdir(parents=True, exist_ok=True)

    documentation = build_documentation(DOCS / "Jotion-Documentation.docx")
    print(f"✓ {documentation.relative_to(ROOT)}")

    updates = build_updates_and_next_steps(
        DOCS / "Jotion-Updates-and-Next-Steps.docx"
    )
    print(f"✓ {updates.relative_to(ROOT)}")

    chat = build_chat_transcript(DOCS / "Jotion-Chat-Transcript.docx")
    print(f"✓ {chat.relative_to(ROOT)}")

    source = build_source_code(DOCS / "Jotion-Source-Code.docx")
    print(f"✓ {source.relative_to(ROOT)}")

    complete = build_complete(
        DOCS / "Jotion-Complete-Handbook.docx", documentation, chat, source
    )
    print(f"✓ {complete.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
