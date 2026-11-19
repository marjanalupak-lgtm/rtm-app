# RTM tree — Requirements Traceability Matrix

Web app for a team RTM. Built on the RTM.xlsm template: same 28 fields, dropdown lists,
status rules and the **Traceability Check** formula. UI: EPAM UUI (Loveship).

## What it does
- **Trash**: deleting a project moves it to trash (restorable, data kept). Permanent delete only from trash, after typing the project name; the database refuses to hard-delete projects not in trash.
- **Projects**: one RTM per project/client. Only project members see it (owners manage settings + members).
- **Settings (per project, owners edit)**: ID prefix/digits, every dropdown list, field labels/visibility/required/table columns, custom fields, traceability rules on/off, status workflow matrix.
- **Tree**: hierarchy Business → Stakeholder → Functional / Non-functional / Transition, built from the
  Parent Requirement field (one or more parent IDs, comma-separated). Flags requirements with no parent,
  wrong-level links and cycles. The form has a "Link parent requirement" picker and shows parents/children.
- **Attachments & links** per requirement: links (Jira, Confluence, Figma…) and files up to 50 MB.
  Files are saved to the uploader's Google Drive (`RTM/Attachments`) and shared read-only with project members.
  Removing an attachment from a requirement does not delete an already saved file (it stays in Drive);
  deleting a project forever also deletes its attachment files owned by you.
- **RTM table**: search, filters (status, release, traceability), sorting, click a row to edit.
- **Editor**: all fields grouped (Core, Traceability, Design, Governance, Verification),
  live Traceability Check, ID uniqueness, allowed status transitions + gates.
- **History**: every change is logged (who, when, field from → to).
- **Dashboard**: coverage %, gaps, design gaps, failed tests, breakdowns, "needs attention" list.
- **Excel**: import your RTM.xlsm/xlsx (matched by header names), export to .xlsx.
- **Google Drive storage**: sign in with Google, projects are Sheets in your Drive, share with colleagues via Google; changes from others appear within ~20 s.

## Run locally
    npm install
    npm run dev        # http://localhost:5173
    npm test

Without `VITE_GOOGLE_CLIENT_ID` it runs in **local demo mode** (data stays in your browser).

## Where data lives (Google Drive)
Each project is a **Google Sheet in the signed-in user's Google Drive** (folder "RTM"), with sheets
`Requirements`, `History` and `Meta`. The app runs only in the browser and talks directly to Google.
There is no app server or database. Sharing = Google Drive sharing (Editor / Viewer).
The app uses the `drive.file` scope: it can only see files it created or that the user opened with it.

## Google Cloud setup (already done for this deployment)
- Project `rtm-app`: Drive API, Sheets API, Picker API enabled.
- OAuth consent screen "RTM" (External). While in *Testing*, add users under Google Auth Platform → Audience → Test users.
- OAuth Web client with origins `https://marjanalupak-lgtm.github.io` and `http://localhost:5174`.
- Picker API key restricted to those sites and to the Picker API.
- Public IDs live in `.env.production` (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`).

## Deploy to GitHub Pages
Every push to `main` runs tests, builds and publishes (Settings → Pages → Source: GitHub Actions).

## Files
- `src/model.ts` — fields, lists, Traceability Check, status rules (tested in `model.test.ts`)
- `src/google.ts` — Google sign-in, Drive/Sheets REST, Picker
- `src/store.ts` — Google Sheets / local data, history, change polling
- `src/excel.ts` — import / export
- `public/privacy.html` — privacy policy (linked from the Google consent screen)
