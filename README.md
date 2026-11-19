# RTM — Requirements Traceability Matrix

Web app for a team RTM. Built on the RTM.xlsm template: same 28 fields, dropdown lists,
status rules and the **Traceability Check** formula. UI: EPAM UUI (Loveship).

## What it does
- **RTM table**: search, filters (status, release, traceability), sorting, click a row to edit.
- **Editor**: all fields grouped (Core, Traceability, Design, Governance, Verification),
  live Traceability Check, ID uniqueness, allowed status transitions + gates.
- **History**: every change is logged (who, when, field from → to).
- **Dashboard**: coverage %, gaps, design gaps, failed tests, breakdowns, "needs attention" list.
- **Excel**: import your RTM.xlsm/xlsx (matched by header names), export to .xlsx.
- **Team mode**: Supabase database, email sign-in link, live updates for everyone.

## Run locally
    npm install
    npm run dev        # http://localhost:5173
    npm test

Without Supabase keys it runs in **local demo mode** (data stays in your browser).

## Team setup (once)
1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → URL Configuration → add your GitHub Pages URL to Redirect URLs.
4. Project Settings → API → copy `Project URL` and `anon public` key.
5. Local: copy `.env.example` to `.env.local` and fill both values.

## Deploy to GitHub Pages
1. Create an empty repo on GitHub and push this folder to `main`.
2. Repo → Settings → Secrets and variables → Actions → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Repo → Settings → Pages → Source: **GitHub Actions**.
4. Every push to `main` runs tests, builds and publishes.

## Files
- `src/model.ts` — fields, lists, Traceability Check, status rules (tested in `model.test.ts`)
- `src/store.ts` — Supabase / local data, history, realtime
- `src/excel.ts` — import / export
- `supabase/schema.sql` — tables + row-level security
